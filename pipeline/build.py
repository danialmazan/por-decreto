"""Construcción de las tablas limpias a partir de data/interim/ y data/manual/.

Uso:
  python3 -m pipeline.build --fetch      # recoge (incremental, con caché) y construye
  python3 -m pipeline.build              # construye y valida con lo que hay en data/interim
  Opciones: --corte=AAAA-MM-DD (fecha de corte), --full (re-descarga todos los XML del BOE)
Sale con código 1 si hay errores de validación.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

from pipeline import validate
from pipeline.sources import boe as boe_src
from pipeline.sources.boe import MESES, fecha_en_texto, parse_titulo

ROOT = Path(__file__).resolve().parents[1]
INTERIM, MANUAL, CLEAN = ROOT / "data" / "interim", ROOT / "data" / "manual", ROOT / "data" / "clean"
INICIO = dt.date(1978, 12, 29)
DIAS_PENDIENTE = 90  # sin resultado y aprobado hace menos de esto → «pendiente»; si no, «desconocido»
RX_RDL_CG = re.compile(r"Real\s+Decreto[\s-]*Ley\s+(\d+)/(\d{4})", re.I)
RX_RDL_ERRATA = re.compile(r"^Real\s+Decreto\s+(\d+)/(\d{4})", re.I)
RX_PROCEDENTE = re.compile(r"procedente del Real\s+Decreto[\s-]*ley\s+(\d+)/(\d{4})", re.I)
D = dt.date.fromisoformat
ESCANOS_CONGRESO = 350  # fijo desde 1977 (RDL 20/1977 y LOREG art. 162)


def load(name):
    return json.loads((INTERIM / name).read_text())


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(name, rows, fields):
    CLEAN.mkdir(parents=True, exist_ok=True)
    with open(CLEAN / name, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


# ---------------------------------------------------------------- legislaturas y ciclos
_MES = "(?:" + "|".join(MESES) + ")"
RX_CELEBRA = re.compile(r"se\s+celebrar[áa]n\s+el\s+(?:domingo|día)\s+(\d{1,2})\s+de\s+(" + _MES + r")"
                        r"(?:\s+de\s+(\d{4}))?", re.I)
RX_CONSTITUTIVA = re.compile(r"se\s+reunir[áa]n,?\s+(?:para\s+sus\s+respectivas\s+|en\s+)sesiones\s+constitutivas,?\s+el\s+"
                             r"(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|día)\s+(\d{1,2})\s+de\s+(" + _MES +
                             r")(?:\s+de\s+(\d{4}))?", re.I)


def _fecha_rd(m, ref: dt.date) -> str | None:
    """Fecha D de MES [de AAAA]; sin año, la primera posterior a `ref`."""
    if not m:
        return None
    d, mes = int(m.group(1)), MESES[m.group(2).lower()]
    y = int(m.group(3)) if m.group(3) else ref.year
    f = dt.date(y, mes, d)
    if not m.group(3) and f < ref:
        f = dt.date(y + 1, mes, d)
    return f.isoformat()


def build_legislaturas(inst):
    """Legislaturas 0..N a partir de los RD de disolución y convocatoria (+ complemento curado y documentado)."""
    dis = sorted(inst["disoluciones"], key=lambda r: r["fecha_disposicion"])
    legs = [{"legislatura": 0}]
    for r in dis:
        txt = r["texto"]
        cur = legs[-1]
        cur["fecha_disolucion_rd"] = r["fecha_disposicion"]
        efecto = D(r["fecha_publicacion"])
        if re.search(r"entrar[áa] en vigor el d[íi]a siguiente", txt, re.I) or not txt:
            efecto += dt.timedelta(days=1)  # 1979 y 1982: «entrará en vigor el día siguiente al de su publicación»
        cur["fecha_disolucion"] = efecto.isoformat()
        cur["rd_disolucion"] = r["id"]
        ref = D(r["fecha_disposicion"])
        f_el = _fecha_rd(RX_CELEBRA.search(txt), ref)
        f_co = _fecha_rd(RX_CONSTITUTIVA.search(txt), D(f_el) if f_el else ref)
        legs.append({"legislatura": cur["legislatura"] + 1, "fecha_elecciones": f_el, "fecha_constitucion": f_co,
                     "fuente_fechas": r["id"] if f_el and f_co else None})
    for c in read_csv(MANUAL / "legislaturas_complemento.csv"):
        l = legs[int(c["legislatura"])]
        if l.get(c["campo"]) and l[c["campo"]] != c["valor"]:
            raise ValueError(f"Complemento contradice al BOE: {c}")
        l[c["campo"]] = c["valor"]
        l["fuente_fechas"] = ";".join(filter(None, [l.get("fuente_fechas"), c["fuente"]]))
    romanos = ["Constituyente", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
               "XIII", "XIV", "XV", "XVI", "XVII"]
    for i, l in enumerate(legs):
        l["nombre"] = romanos[l["legislatura"]]
        nxt = legs[i + 1] if i + 1 < len(legs) else None
        l["fecha_fin"] = (D(nxt["fecha_constitucion"]) - dt.timedelta(days=1)).isoformat() if nxt and nxt["fecha_constitucion"] else None
    return legs


def build_gobiernos(manual, legs, inst, diputados, partidos, corte):
    pres_rd = {r["id"]: r for r in inst["presidentes"]}
    elecciones = sorted(D(l["fecha_elecciones"]) for l in legs if l.get("fecha_elecciones"))
    regex = {p["partido"]: re.compile(p["regex_formacion"], re.I) for p in partidos}
    out = []
    for i, g in enumerate(manual):
        ini = D(g["fecha_inicio"])
        fin = D(manual[i + 1]["fecha_inicio"]) - dt.timedelta(days=1) if i + 1 < len(manual) else None
        if g["rd_nombramiento"]:
            rd = pres_rd.get(g["rd_nombramiento"])
            g["_rd_ok"] = bool(rd) and (parse_rd_fecha(rd["titulo"]) == g["fecha_inicio"])
        # En funciones: desde las primeras elecciones posteriores al inicio y anteriores al fin.
        el = [e for e in elecciones if ini < e <= (fin or corte)]
        funciones = el[0].isoformat() if el else None
        if g.get("inicio_funciones_manual"):
            funciones = g["inicio_funciones_manual"]  # p. ej. dimisión; fuente en fuente_funciones
        partidos_g = g["partidos"].split(";")
        esc = seats(diputados[str(int(g["legislatura_formacion"]))], partidos_g, regex)
        total = ESCANOS_CONGRESO
        gob = sum(esc[p] for p in partidos_g)
        out.append({
            **{k: v for k, v in g.items() if not k.startswith("_")},
            "fecha_fin": fin.isoformat() if fin else None,
            "en_curso": fin is None,
            "inicio_funciones": funciones,
            "tipo": "coalicion" if len(partidos_g) > 1 else "monocolor",
            "escanos_gobierno": gob,
            "escanos_por_partido": ";".join(f"{p}:{esc[p]}" for p in partidos_g),
            "escanos_total": total,
            "pct_escanos": round(100 * gob / total, 2) if total else None,
            "mayoria_absoluta": gob >= total // 2 + 1 if total else None,
            "distancia_mayoria": gob - (total // 2 + 1) if total else None,
            "rd_verificado": g.get("_rd_ok"),
            "diputados_registrados_ref": esc["_total"], "fecha_ref_escanos": esc["_fecha"],
        })
    return out


def parse_rd_fecha(titulo):
    m = re.match(r"Real Decreto \d+/(\d{4}),\s*de\s+(\d+)\s+de\s+(\w+)", titulo)
    if not m:
        return None
    return dt.date(int(m.group(1)), MESES[m.group(3).lower()], int(m.group(2))).isoformat()


def seats(dips, partidos_g, regex):
    """Escaños por candidatura al inicio de la legislatura: diputados de alta el día de máxima ocupación
    dentro de los 60 días posteriores a la primera alta."""
    P = lambda s: dt.datetime.strptime(s, "%d/%m/%Y").date() if s else None  # noqa: E731
    altas = sorted(P(x["fchAlta"]) for x in dips if x.get("fchAlta"))
    best = None
    for k in range(60):
        day = altas[0] + dt.timedelta(days=k)
        act = [x for x in dips if P(x["fchAlta"]) <= day and (not x.get("fchBaja") or P(x["fchBaja"]) > day)]
        if best is None or len(act) > len(best[1]):
            best = (day, act)
    day, act = best
    out = collections.Counter()
    for x in act:
        for p in partidos_g:
            if regex[p].search(x["formacion"] or ""):
                out[p] += 1
                break
    out["_total"] = len(act)
    out["_fecha"] = day.isoformat()
    return out


# ---------------------------------------------------------------- RDL
def norm_resultado(s):
    s = re.sub(r"\s+", " ", (s or "").strip().lower())
    if not s:
        return None
    if s.startswith("convalidado y tramitado"):
        return ("convalidado", "si")
    if s.startswith("convalidado"):
        return ("convalidado", "no")
    if s.startswith("derogado"):
        return ("derogado", "no")
    return ("otro:" + s, "desconocido")


def norm_resultado_pl(s):
    s = re.sub(r"\s+", " ", (s or "").strip().lower())
    m = re.search(r"(\d\d/\d\d/\d{4})", s)
    fecha = dt.datetime.strptime(m.group(1), "%d/%m/%Y").date().isoformat() if m else None
    for k, v in (("aprobado", "aprobado"), ("caducad", "caducado"), ("subsumid", "subsumido"),
                 ("retirad", "retirado"), ("rechazad", "rechazado"), ("decaid", "decaido")):
        if k in s:
            return v, fecha
    return ("en_tramitacion" if not s else "otro:" + s), fecha


def es_resolucion_congreso(ref_id):
    """¿El documento referido es una resolución del Congreso de los Diputados (o de las Cortes)?"""
    if not ref_id:
        return False
    try:
        d = boe_src.documento(ref_id)
    except Exception:  # sin red ni caché: no se puede confirmar
        return None
    dep = (d.get("departamento") or "") + " " + (d.get("titulo") or "")
    return bool(re.search(r"Congreso de los Diputados|Cortes Generales", dep))


def boe_resultado(doc, verificar=es_resolucion_congreso):
    conv, derog = [], []
    for r in doc["referencias"]:
        if r["tipo"] != "posterior":
            continue
        txt = (r["palabra"] or "") + " " + (r["texto"] or "")
        if r["codigo"] in ("300", "301") or "convalidaci" in txt.lower():
            conv.append(fecha_en_texto(r["texto"]))
        elif r["codigo"] == "210" and re.match(r"^,?\s*por\s+(la\s+)?Resoluci[oó]n", r["texto"] or "", re.I) \
                and verificar(r["referencia"]) is not False:
            derog.append(fecha_en_texto(r["texto"]))
    if derog:
        return "derogado", min(d for d in derog if d) if any(derog) else None
    if conv:
        return "convalidado", min(d for d in conv if d) if any(conv) else None
    return None, None


def build_rdl(listados, docs, cg, legs, gobs, corte):
    # Congreso: RDL (tipo 130) y PL procedentes de RDL (tipo 121)
    cg_rdl = collections.defaultdict(list)
    for it in cg["rdl"]:
        m = RX_RDL_CG.search(it["titulo"]) or RX_RDL_ERRATA.search(it["titulo"])
        if m:
            cg_rdl[(int(m.group(1)), int(m.group(2)))].append(it)
    cg_pl = pl_por_rdl(cg, listados)

    rows, dups = [], []
    vistos = {}
    for r in sorted(listados["1320"], key=lambda r: r["id"]):
        t = parse_titulo(r["titulo"])
        if not t:
            raise ValueError(f"No se pudo interpretar el título: {r}")
        key = (t["numero"], t["anio"])
        if key in vistos:
            dups.append({"clave": f"{key[0]}/{key[1]}", "id_conservado": vistos[key], "id_descartado": r["id"]})
            continue
        vistos[key] = r["id"]
        doc = docs.get(r["id"], {})
        flags = []
        fa = t["fecha"]
        if doc.get("fecha_disposicion") and doc["fecha_disposicion"] != fa:
            flags.append("fecha_titulo_distinta_de_fecha_disposicion")
        if not doc:
            flags.append("sin_xml_boe")
        fp = doc.get("fecha_publicacion") or r["fecha_publicacion"]
        dpub = (D(fp) - D(fa)).days if fp else None
        if dpub is not None and dpub > 7:
            flags.append("publicacion_tardia")
        if fa == INICIO.isoformat():
            flags.append("frontera_entrada_en_vigor_ce")
        if doc and doc.get("ambito") not in (None, "Estatal"):
            flags.append("ambito_no_estatal")
        if doc and doc.get("rango_codigo") not in (None, "1320"):
            flags.append("rango_no_rdl")

        # Resultado parlamentario
        exps = sorted(cg_rdl.get(key, []), key=lambda it: it["_legislatura"])
        res_cg = [norm_resultado(it.get("resultado_tram")) for it in exps]
        res_cg_final = next((x for x in reversed(res_cg) if x and not x[0].startswith("otro:trasladado")), None) \
            or next((x for x in res_cg if x), None)
        res_boe, fecha_boe = boe_resultado(doc) if doc else (None, None)
        edad = (corte - D(fa)).days
        if res_cg_final:
            conv, tram = res_cg_final
            fuente = "congreso+boe" if res_boe == conv else "congreso"
            if res_boe and res_boe != conv:
                flags.append("discrepancia_boe_congreso")
        elif res_boe:
            conv, fuente = res_boe, "boe"
            tram = "no" if res_boe == "derogado" else ("pendiente" if edad <= DIAS_PENDIENTE else "desconocido")
        else:
            conv = "pendiente" if edad <= DIAS_PENDIENTE else "desconocido"
            tram = "pendiente" if edad <= DIAS_PENDIENTE else "desconocido"
            fuente = None
        if conv.startswith("otro:"):
            flags.append("resultado_" + re.sub(r"\W+", "_", conv[5:])[:40])
            conv = "otro"
        if conv == "convalidado" and tram == "no" and edad <= DIAS_PENDIENTE and not res_cg_final:
            tram = "pendiente"
        pls = [p for p, _ in cg_pl.get(key, [])]
        metodo_pl = cg_pl[key][-1][1] if pls else None
        res_pl, fecha_pl = (norm_resultado_pl(pls[-1].get("resultado_tram")) if pls else (None, None))
        if tram == "si" and not pls:
            flags.append("tramitado_sin_pl_localizado")
        if pls and tram != "si" and metodo_pl == "titulo_procedente" and conv == "convalidado":
            # Un PL «procedente del Real Decreto-ley» prueba la tramitación aunque el expediente no lo diga.
            flags.append("tramitacion_deducida_de_pl")
            tram = "si"

        rows.append({
            "id": r["id"], "numero": t["numero"], "anio": t["anio"],
            "titulo": doc.get("titulo") or r["titulo"],
            "fecha_aprobacion": fa, "fecha_publicacion": fp, "dias_hasta_publicacion": dpub,
            "departamento": doc.get("departamento") or r["departamento"],
            "url_boe": f"https://www.boe.es/buscar/doc.php?id={r['id']}",
            "url_eli": doc.get("url_eli"),
            "expediente_congreso": ";".join(it["id_iniciativa"] for it in exps) or None,
            "legislatura_expediente": ";".join(str(it["_legislatura"]) for it in exps) or None,
            "url_expediente": exps[-1]["url_expediente"] if exps else None,
            "convalidacion": conv, "fecha_convalidacion": fecha_boe, "fuente_convalidacion": fuente,
            "resultado_boe": res_boe,
            "tramitado_pl": tram,
            "expediente_pl": ";".join(p["id_iniciativa"] for p in pls) or None,
            "resultado_pl": res_pl, "fecha_resultado_pl": fecha_pl, "metodo_pl": metodo_pl,
            "vigencia_derogada": doc.get("estatus_derogacion"),
            "flags": flags,
        })
    assign(rows, legs, gobs)
    for r in rows:
        r["flags"] = ";".join(r["flags"])
    return rows, dups


def pl_por_rdl(cg, listados):
    """Proyectos de ley (tipo 121) que tramitan un RDL convalidado.

    1) Título con «procedente del Real Decreto-ley N/AAAA» (método fiable, habitual desde la III Legislatura).
    2) Para RDL marcados «convalidado y tramitado» sin PL del tipo 1: PL de la misma legislatura presentado
       entre 0 y 60 días después de la aprobación del RDL con título equivalente (similitud ≥ 0,55).
    """
    out = collections.defaultdict(list)
    for it in cg["pl"]:
        m = RX_PROCEDENTE.search(it["titulo"])
        if m:
            out[(int(m.group(1)), int(m.group(2)))].append((it, "titulo_procedente"))
    tramitados = collections.defaultdict(set)
    for it in cg["rdl"]:
        m = RX_RDL_CG.search(it["titulo"]) or RX_RDL_ERRATA.search(it["titulo"])
        if m and (norm_resultado(it.get("resultado_tram")) or ("", ""))[1] == "si":
            tramitados[(int(m.group(1)), int(m.group(2)))].add(it["_legislatura"])
    titulos = {}
    for r in listados["1320"]:
        t = parse_titulo(r["titulo"])
        if t:
            titulos.setdefault((t["numero"], t["anio"]), (r["titulo"], D(t["fecha"])))
    usados = {id(p) for v in out.values() for p, _ in v}
    for key, legs_ in tramitados.items():
        if key in out or key not in titulos:
            continue
        titulo, fa = titulos[key]
        obj = norm_txt(re.sub(r"^Real Decreto-ley \d+/\d{4},?\s*de\s+\d+\s+(?:de\s+)?\w+,?\s*", "", titulo, flags=re.I))
        best = None
        for p in cg["pl"]:
            if p["_legislatura"] not in legs_ or id(p) in usados or not p.get("fecha_presentado"):
                continue
            fp = dt.datetime.strptime(p["fecha_presentado"], "%d/%m/%Y").date()
            if not 0 <= (fp - fa).days <= 60:
                continue
            s_ = sim(obj, norm_txt(p["titulo"]))
            if best is None or s_ > best[0]:
                best = (s_, p)
        if best and best[0] >= 0.55:
            out[key].append((best[1], f"similitud_titulo:{best[0]:.2f}"))
            usados.add(id(best[1]))
    return out


def contexto(d, legs, gobs):
    """Gobierno, legislatura temporal, Cortes disueltas (sí/no) y Gobierno en funciones (sí/no) en una fecha.

    Cortes disueltas: desde la entrada en vigor del RD de disolución hasta la constitución de las nuevas Cortes.
    En funciones: desde las elecciones (art. 101 CE) o la dimisión hasta el nombramiento del nuevo presidente.
    """
    gob = next((g for g in reversed(gobs) if D(g["fecha_inicio"]) <= d), None)
    leg = next((l for l in reversed(legs) if l.get("fecha_constitucion") and D(l["fecha_constitucion"]) <= d), legs[0])
    disueltas = False
    for l in legs:
        if l.get("fecha_disolucion"):
            nxt = next((x for x in legs if x["legislatura"] == l["legislatura"] + 1), None)
            if D(l["fecha_disolucion"]) <= d < D(nxt["fecha_constitucion"]):
                disueltas = True
    funciones = bool(gob and gob.get("inicio_funciones") and D(gob["inicio_funciones"]) <= d)
    return gob, leg, disueltas, funciones


def fase_y_contexto(d, legs, gobs):
    """Fase única con prioridad: en_funciones > cortes_disueltas > ordinaria."""
    gob, leg, disueltas, funciones = contexto(d, legs, gobs)
    fase = "en_funciones" if funciones else "cortes_disueltas" if disueltas else "ordinaria"
    return gob, leg, fase


def assign(rows, legs, gobs):
    for r in rows:
        d = D(r["fecha_aprobacion"])
        gob, leg, disueltas, funciones = contexto(d, legs, gobs)
        fase = "en_funciones" if funciones else "cortes_disueltas" if disueltas else "ordinaria"
        r["cortes_disueltas"], r["gobierno_en_funciones"] = disueltas, funciones
        r["gobierno_id"] = gob["gobierno_id"] if gob else None
        r["presidente_id"] = gob["presidente_id"] if gob else None
        r["presidente"] = gob["presidente"] if gob else None
        r["partidos_gobierno"] = gob["partidos"] if gob else None
        r["legislatura"] = leg["legislatura"]
        r["fase"] = fase
        if gob and (D(gob["fecha_inicio"]) == d or (gob.get("fecha_fin") and D(gob["fecha_fin"]) == d)):
            r["flags"].append("aprobado_en_dia_de_cambio_de_gobierno")
        r["organo_convalidacion"] = None
        if r.get("fecha_convalidacion"):
            fc = D(r["fecha_convalidacion"])
            for l in legs:
                nxt = next((x for x in legs if x["legislatura"] == l["legislatura"] + 1), None)
                if l.get("fecha_disolucion") and nxt and nxt.get("fecha_constitucion") and \
                        D(l["fecha_disolucion"]) <= fc < D(nxt["fecha_constitucion"]):
                    r["organo_convalidacion"] = "diputacion_permanente"


# ---------------------------------------------------------------- normas con rango de ley
def build_normas(listados, rdl_rows, cg):
    rango_n = {"1300": "ley", "1290": "ley_organica", "1310": "rdleg", "1320": "rdl"}
    rows, vistos = [], set()
    for code, lista in listados.items():
        for r in sorted(lista, key=lambda r: r["id"]):
            t = parse_titulo(r["titulo"])
            if not t:
                continue
            k = (code, t["numero"], t["anio"])
            if k in vistos:
                continue
            vistos.add(k)
            rows.append({"id": r["id"], "rango": rango_n[code], "numero": t["numero"], "anio": t["anio"],
                         "fecha_aprobacion": t["fecha"], "titulo": r["titulo"], "deriva_de_rdl": None,
                         "metodo_derivacion": None})
    # Leyes derivadas de la tramitación de un RDL como proyecto de ley: casamiento por título
    leyes = [r for r in rows if r["rango"] in ("ley", "ley_organica")]
    rdl_by_key = {(r["numero"], r["anio"]): r for r in rdl_rows}
    for key, lst in pl_por_rdl(cg, listados).items():
        it = lst[-1][0]
        res, fecha = norm_resultado_pl(it.get("resultado_tram"))
        rdl = rdl_by_key.get(key)
        if res != "aprobado" or not rdl:
            continue
        objeto = norm_txt(re.sub(r"\(procedente.*$", "", re.sub(r"^Proyecto de Ley( Orgánica)?\s+", "", it["titulo"], flags=re.I), flags=re.I))
        anio_rdl = key[1]
        best = None
        for ley in leyes:
            if fecha and abs((D(ley["fecha_aprobacion"]) - D(fecha)).days) > 120:
                continue
            if not fecha and not (anio_rdl <= ley["anio"] <= anio_rdl + 3):
                continue
            s = sim(objeto, norm_txt(re.sub(r"^Ley( Orgánica)? \d+/\d{4},\s*de\s+\d+\s+de\s+\w+,?\s*", "", ley["titulo"])))
            if best is None or s > best[0]:
                best = (s, ley)
        if best and best[0] >= 0.55 and not best[1]["deriva_de_rdl"]:
            best[1]["deriva_de_rdl"] = rdl["id"]
            best[1]["metodo_derivacion"] = f"titulo_pl_congreso:{best[0]:.2f}"
            rdl["ley_derivada_id"] = best[1]["id"]
    return rows


STOP = set("de la el los las y en por que del se a o para con al su sus sobre determinadas diversas medidas urgentes".split())


def norm_txt(s):
    s = re.sub(r"[^\wáéíóúüñ ]+", " ", (s or "").lower())
    return [w for w in s.split() if w not in STOP and len(w) > 2]


def sim(a, b):
    A, B = set(a), set(b)
    return len(A & B) / max(1, min(len(A), len(B))) if A and B else 0.0


# ---------------------------------------------------------------- ciclos electorales
def build_ciclos(legs, gobs):
    out = []
    for l in legs:
        if not l.get("fecha_disolucion"):
            continue
        nxt = next(x for x in legs if x["legislatura"] == l["legislatura"] + 1)
        el = D(nxt["fecha_elecciones"])
        saliente = next((g for g in reversed(gobs) if D(g["fecha_inicio"]) <= D(l["fecha_disolucion"])), None)
        nuevo = next((g for g in gobs if D(g["fecha_inicio"]) > el), None)
        out.append({
            "ciclo_id": l["fecha_disolucion"][:4] + ("b" if l["fecha_disolucion"] == "2019-09-24" else ""),
            "legislatura_saliente": l["legislatura"], "rd_disolucion": l["rd_disolucion"],
            "fecha_disolucion_rd": l["fecha_disolucion_rd"], "fecha_disolucion": l["fecha_disolucion"],
            "fecha_elecciones": nxt["fecha_elecciones"], "fecha_constitucion_cortes": nxt["fecha_constitucion"],
            "gobierno_saliente": saliente["gobierno_id"] if saliente else None,
            "gobierno_entrante": nuevo["gobierno_id"] if nuevo else None,
            "fecha_toma_posesion_nuevo_gobierno": nuevo["fecha_inicio"] if nuevo else None,
            "fecha_inicio_legislatura_saliente": l.get("fecha_constitucion"),
        })
    anuncios = {a["fecha_disolucion"]: a for a in read_csv(MANUAL / "anuncios_electorales.csv")}
    for c in out:  # id legible y único + anuncio (tabla curada con fuente)
        c["ciclo_id"] = "disolucion_" + c["fecha_disolucion"]
        a = anuncios.get(c["fecha_disolucion"])
        if not a:
            raise ValueError(f"Falta el anuncio del ciclo {c['ciclo_id']} en anuncios_electorales.csv")
        if not D(a["fecha_anuncio"]) <= D(c["fecha_disolucion_rd"]):
            raise ValueError(f"Anuncio posterior al RD de disolución: {a}")
        c.update({"fecha_anuncio": a["fecha_anuncio"], "tipo_anuncio": a["tipo"], "fuente_anuncio": a["fuente"]})
    return out


# ---------------------------------------------------------------- main
RDL_FIELDS = ["id", "numero", "anio", "titulo", "fecha_aprobacion", "fecha_publicacion", "dias_hasta_publicacion",
              "departamento", "gobierno_id", "presidente_id", "presidente", "partidos_gobierno", "legislatura", "fase",
              "cortes_disueltas", "gobierno_en_funciones",
              "url_boe", "url_eli", "expediente_congreso", "legislatura_expediente", "url_expediente",
              "convalidacion", "fecha_convalidacion", "organo_convalidacion", "fuente_convalidacion", "resultado_boe",
              "tramitado_pl", "expediente_pl", "metodo_pl", "resultado_pl", "fecha_resultado_pl", "ley_derivada_id",
              "vigencia_derogada", "flags"]


def build(corte: dt.date) -> dict:
    listados, docs = load("boe_listados.json"), load("boe_docs.json")
    inst, cg = load("boe_institucional.json"), load("congreso.json")
    partidos = read_csv(MANUAL / "partidos.csv")
    legs = build_legislaturas(inst)
    gobs = build_gobiernos(read_csv(MANUAL / "gobiernos.csv"), legs, inst, cg["diputados"], partidos, corte)
    rdl, dups = build_rdl(listados, docs, cg, legs, gobs, corte)
    normas = build_normas(listados, rdl, cg)
    ciclos = build_ciclos(legs, gobs)

    write_csv("rdl.csv", rdl, RDL_FIELDS)
    from pipeline import series
    seg = lambda d: contexto(d, legs, gobs)[0]["gobierno_id"]  # noqa: E731
    serie = series.serie_diaria([r["fecha_aprobacion"] for r in rdl], INICIO, corte, segmento=seg)
    for row in serie:
        _, _, dis, fun = contexto(D(row["fecha"]), legs, gobs)
        row["gobierno_id"] = row.pop("segmento")
        row["cortes_disueltas"], row["gobierno_en_funciones"] = dis, fun
    write_csv("serie_diaria.csv", serie, list(serie[0].keys()))
    write_csv("gobiernos.csv", gobs, ["gobierno_id", "presidente", "presidente_id", "partidos", "tipo",
                                      "legislatura_formacion", "fecha_inicio", "fecha_fin", "en_curso",
                                      "inicio_funciones", "escanos_gobierno", "escanos_por_partido", "escanos_total",
                                      "pct_escanos", "mayoria_absoluta", "distancia_mayoria", "diputados_registrados_ref",
                                      "fecha_ref_escanos", "rd_nombramiento", "rd_verificado", "fuente_inicio",
                                      "fuente_funciones", "nota"])
    write_csv("legislaturas.csv", legs, ["legislatura", "nombre", "fecha_elecciones", "fecha_constitucion",
                                         "fecha_disolucion_rd", "fecha_disolucion", "rd_disolucion", "fecha_fin",
                                         "fuente_fechas"])
    write_csv("ciclos_electorales.csv", ciclos, list(ciclos[0].keys()))
    write_csv("normas_rango_ley.csv", normas, ["id", "rango", "numero", "anio", "fecha_aprobacion", "titulo",
                                                "deriva_de_rdl", "metodo_derivacion"])
    write_csv("rdl_duplicados_descartados.csv", dups, ["clave", "id_conservado", "id_descartado"])
    audit = validate.run(rdl, normas, gobs, legs, ciclos, dups, cg, corte, serie)
    meta = {"generado": dt.datetime.now().isoformat(timespec="seconds"), "corte": corte.isoformat(),
            "n_rdl": len(rdl), "ultimo_rdl": max(r["fecha_aprobacion"] for r in rdl)}
    (ROOT / "data" / "audit.json").write_text(json.dumps({"meta": meta, **audit}, ensure_ascii=False, indent=1))
    return audit


def main(argv):
    corte = dt.date.today()
    for a in argv:
        if a.startswith("--corte="):
            corte = D(a.split("=", 1)[1])
    if "--fetch" in argv:
        from pipeline import collect
        collect.main(full="--full" in argv, hoy=corte)
    audit = build(corte)
    print(validate.summary(audit))
    sys.exit(1 if audit["errores"] else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
