"""Métricas y agregaciones precalculadas a partir de data/clean/.

Salida: data/derived/*.json (y CSV de las tablas principales).

Definiciones clave (ver docs/METODOLOGIA.md):
- Exposición: días naturales efectivos del mandato dentro de [29/12/1978, corte], ambos incluidos,
  menos los días excluidos por el usuario (análisis de sensibilidad).
- Media semanal/mensual/anualizada = n / (días / 7 | 30,4375 | 365,25).
- Máximo en semana ISO / mes natural: sólo cuenta RDL del propio grupo, aunque la semana o el mes
  estén cortados por un cambio de mandato.
- % de semanas / meses sin RDL: sólo semanas ISO y meses naturales *completos* dentro del mandato.
- Máximo en ventana de 30 días: ventanas que terminan dentro del mandato, contando sólo RDL del grupo.
- Tiempo entre aprobaciones: diferencia en días entre fechas de aprobación distintas consecutivas.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLEAN, DERIVED = ROOT / "data" / "clean", ROOT / "data" / "derived"
INICIO = dt.date(1978, 12, 29)
D = dt.date.fromisoformat


def read(name):
    with open(CLEAN / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def rnd(v, k):
    """Redondeo convencional (mitad hacia arriba), igual que en la web; round() de Python redondea al par."""
    import math
    f = 10 ** k
    return math.floor(v * f + 0.5 + 1e-9) / f


def dias(a, b):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)


# ------------------------------------------------------------------ métricas de un grupo
def metricas_grupo(intervalos, fechas_rdl, excluir=frozenset()):
    """intervalos: [(inicio, fin)] fechas incluidas; fechas_rdl: fechas de aprobación de los RDL del grupo."""
    dias_set = {d for a, b in intervalos for d in dias(a, b)} - set(excluir)
    fechas = sorted(f for f in fechas_rdl if f in dias_set)
    n, exp = len(fechas), len(dias_set)
    if exp == 0:
        return None
    cnt = collections.Counter(fechas)
    # semanas ISO y meses naturales
    sem_dias, mes_dias = collections.defaultdict(int), collections.defaultdict(int)
    for d in dias_set:
        sem_dias[d.isocalendar()[:2]] += 1
        mes_dias[(d.year, d.month)] += 1
    sem_n = collections.Counter(f.isocalendar()[:2] for f in fechas)
    mes_n = collections.Counter((f.year, f.month) for f in fechas)
    sem_completas = [k for k, v in sem_dias.items() if v == 7]
    mes_completos = [k for k, v in mes_dias.items() if v == _dias_mes(*k)]
    # ventana 30 días (terminando dentro del grupo, contando sólo RDL del grupo)
    orden = sorted(dias_set)
    best30, best30_fin = 0, None
    for d in orden:
        lo = d - dt.timedelta(days=29)
        v = sum(c for f, c in cnt.items() if lo <= f <= d)
        if v > best30:
            best30, best30_fin = v, d
    distintas = sorted(set(fechas))
    # Sólo huecos dentro de un mismo tramo continuo (no entre mandatos separados de un mismo partido).
    tramo = {d: i for i, (a, b) in enumerate(sorted(intervalos)) for d in distintas if a <= d <= b}
    gaps = [(b - a).days for a, b in zip(distintas, distintas[1:]) if tramo.get(a) == tramo.get(b)
            or _contiguos(intervalos, a, b)]
    max_sem = max(sem_n.items(), key=lambda kv: kv[1]) if sem_n else (None, 0)
    max_mes = max(mes_n.items(), key=lambda kv: kv[1]) if mes_n else (None, 0)
    return {
        "n": n, "dias_exposicion": exp,
        "media_semanal": rnd(n / (exp / 7), 4),
        "media_mensual": rnd(n / (exp / 30.4375), 4),
        "media_anualizada": rnd(n / (exp / 365.25), 3),
        "max_semana": max_sem[1], "max_semana_id": f"{max_sem[0][0]}-W{max_sem[0][1]:02d}" if max_sem[0] else None,
        "max_mes": max_mes[1], "max_mes_id": f"{max_mes[0][0]}-{max_mes[0][1]:02d}" if max_mes[0] else None,
        "max_30d": best30, "max_30d_fin": best30_fin.isoformat() if best30_fin else None,
        "semanas_completas": len(sem_completas),
        "pct_semanas_sin_rdl": rnd(100 * sum(1 for k in sem_completas if not sem_n.get(k)) / len(sem_completas), 1)
        if sem_completas else None,
        "meses_completos": len(mes_completos),
        "pct_meses_sin_rdl": rnd(100 * sum(1 for k in mes_completos if not mes_n.get(k)) / len(mes_completos), 1)
        if mes_completos else None,
        "dias_entre_aprobaciones_media": rnd(statistics.mean(gaps), 1) if gaps else None,
        "dias_entre_aprobaciones_mediana": statistics.median(gaps) if gaps else None,
        "dias_con_rdl": len(distintas),
    }


def _contiguos(intervalos, a, b):
    """True si entre a y b no hay ningún día fuera de los intervalos (tramos consecutivos sin hueco)."""
    ivs = sorted(intervalos)
    for (x0, x1), (y0, y1) in zip(ivs, ivs[1:]):
        if a <= x1 and y0 <= b and (y0 - x1).days > 1:
            return False
    return True


def _dias_mes(y, m):
    return ((dt.date(y + (m == 12), m % 12 + 1, 1)) - dt.date(y, m, 1)).days


# ------------------------------------------------------------------ construcción
def cargar(corte):
    rdl = read("rdl.csv")
    gobs = read("gobiernos.csv")
    for g in gobs:
        g["_ini"] = max(D(g["fecha_inicio"]), INICIO)
        g["_fin"] = min(D(g["fecha_fin"]), corte) if g["fecha_fin"] else corte
    return rdl, gobs, read("legislaturas.csv"), read("ciclos_electorales.csv"), read("normas_rango_ley.csv")


def grupos(rdl, gobs, legs, corte):
    """Devuelve {tipo: {clave: (etiqueta, intervalos, fechas)}} para gobierno, presidente, partido y legislatura."""
    out = {"gobierno": {}, "presidente": {}, "partido": {}, "legislatura": {}}
    for g in gobs:
        f = [D(r["fecha_aprobacion"]) for r in rdl if r["gobierno_id"] == g["gobierno_id"]]
        out["gobierno"][g["gobierno_id"]] = (g["gobierno_id"], [(g["_ini"], g["_fin"])], f)
    for pid in dict.fromkeys(g["presidente_id"] for g in gobs):
        gg = [g for g in gobs if g["presidente_id"] == pid]
        f = [D(r["fecha_aprobacion"]) for r in rdl if r["presidente_id"] == pid]
        out["presidente"][pid] = (gg[0]["presidente"], [(g["_ini"], g["_fin"]) for g in gg], f)
    # Partido: se atribuye al partido del presidente (formación principal); las coaliciones se agrupan aparte.
    for g in gobs:
        p = g["partidos"].split(";")[0]
        lab = p
        cur = out["partido"].setdefault(lab, (lab, [], []))
        cur[1].append((g["_ini"], g["_fin"]))
        cur[2].extend(D(r["fecha_aprobacion"]) for r in rdl if r["gobierno_id"] == g["gobierno_id"])
    for l in legs:
        n = int(l["legislatura"])
        a = max(D(l["fecha_constitucion"]), INICIO) if l["fecha_constitucion"] else INICIO
        if a > corte:
            continue
        b = min(D(l["fecha_fin"]), corte) if l["fecha_fin"] else corte
        f = [D(r["fecha_aprobacion"]) for r in rdl if int(r["legislatura"]) == n]
        out["legislatura"][str(n)] = (l["nombre"], [(a, b)], f)
    return out


def tabla_comparacion(rdl, gobs, legs, corte, excluir=frozenset()):
    out = {}
    for tipo, gr in grupos(rdl, gobs, legs, corte).items():
        out[tipo] = []
        for k, (lab, ivs, fechas) in gr.items():
            m = metricas_grupo(ivs, fechas, excluir)
            if m:
                out[tipo].append({"id": k, "etiqueta": lab, **m})
    return out


def perfiles(rdl, gobs, corte):
    """Curvas acumuladas por día desde el inicio de cada gobierno y mapa de calor por mes de mandato."""
    out = []
    for g in gobs:
        f = sorted(D(r["fecha_aprobacion"]) for r in rdl if r["gobierno_id"] == g["gobierno_id"])
        ini = D(g["fecha_inicio"])
        dur = (g["_fin"] - ini).days + 1
        acum, c, j = [], 0, 0
        for k in range(dur):
            d = ini + dt.timedelta(days=k)
            while j < len(f) and f[j] <= d:
                c += 1
                j += 1
            acum.append(c)
        meses = collections.Counter(((d - ini).days // 30.4375).__int__() for d in f)
        n_meses = int((dur - 1) // 30.4375) + 1
        # Hitos a igualdad de tiempo; sin valor si el mandato no llegó a durarlos o empezó antes de la serie.
        hitos = {h: (acum[h - 1] if dur >= h and ini >= INICIO else None) for h in (100, 182, 365, 730, 1095, 1400, 1461)}
        out.append({"gobierno_id": g["gobierno_id"], "inicio": g["fecha_inicio"], "dias": dur,
                    "parcial_antes_de_1978": ini < INICIO, "en_curso": g["fecha_fin"] == "",
                    "acumulado": acum, "por_mes_de_mandato": [meses.get(i, 0) for i in range(n_meses)],
                    "acumulado_en_hitos": hitos})
    return out


def fin_de_mandato(rdl, ciclos, legs, corte):
    f = sorted(D(r["fecha_aprobacion"]) for r in rdl)

    def cuenta(a, b):  # [a, b)
        b = min(b, corte + dt.timedelta(days=1))
        return sum(1 for d in f if a <= d < b), max((b - a).days, 0)

    def tasa(t):
        return rnd(t[0] / t[1] * 30, 3) if t[1] > 0 else None

    actual = max(ciclos, key=lambda c: c["fecha_disolucion"])
    n_actual = (min(corte, D(actual["fecha_elecciones"]) - dt.timedelta(days=1)) - D(actual["fecha_disolucion"])).days + 1
    out = []
    for c in ciclos:
        ds, el = D(c["fecha_disolucion"]), D(c["fecha_elecciones"])
        li = D(c["fecha_inicio_legislatura_saliente"]) if c["fecha_inicio_legislatura_saliente"] else INICIO
        li = max(li, INICIO)
        ng = D(c["fecha_toma_posesion_nuevo_gobierno"]) if c["fecha_toma_posesion_nuevo_gobierno"] else None
        leg = cuenta(li, ds)
        dis = cuenta(ds, el)
        fun = cuenta(el, ng) if ng else (None, None)
        igual = cuenta(ds, ds + dt.timedelta(days=n_actual))
        curva = []
        for k in range(-365, 121):
            d = ds + dt.timedelta(days=k)
            if d > corte:
                break
            curva.append(sum(1 for x in f if ds - dt.timedelta(days=365) <= x <= d))
        out.append({
            **{k: c[k] for k in ("ciclo_id", "fecha_disolucion", "fecha_elecciones", "gobierno_saliente",
                                 "gobierno_entrante", "fecha_toma_posesion_nuevo_gobierno")},
            "en_curso": c is actual and corte < el,
            "legislatura_dias": leg[1], "legislatura_n": leg[0], "legislatura_tasa30": tasa(leg),
            "legislatura_corta": leg[1] < 180,
            "previos90_n": cuenta(ds - dt.timedelta(days=90), ds)[0],
            "previos90_tasa30": tasa(cuenta(ds - dt.timedelta(days=90), ds)),
            "disueltas_n": dis[0], "disueltas_dias": dis[1], "disueltas_tasa30": tasa(dis),
            "funciones_n": fun[0], "funciones_dias": fun[1], "funciones_tasa30": tasa(fun) if fun[1] else None,
            "igual_tiempo_dias": n_actual, "igual_tiempo_n": igual[0],
            "ratio_disueltas_vs_legislatura": rnd(tasa(dis) / tasa(leg), 3) if tasa(leg) else None,
            "curva_desde_menos365": curva,
        })
    return out


def resultados(rdl):
    por = {"anio": collections.defaultdict(collections.Counter), "gobierno": collections.defaultdict(collections.Counter),
           "presidente": collections.defaultdict(collections.Counter)}
    for r in rdl:
        for tipo, k in (("anio", r["anio"] if r["anio"] != "1978" else "1979"), ("gobierno", r["gobierno_id"]),
                        ("presidente", r["presidente_id"])):
            c = por[tipo][k]
            c["n"] += 1
            c[r["convalidacion"]] += 1
            c["tram_" + r["tramitado_pl"]] += 1
            if r["resultado_pl"]:
                c["pl_" + r["resultado_pl"]] += 1
    out = {}
    for tipo, d in por.items():
        out[tipo] = []
        for k, c in sorted(d.items()):
            decididos = c["convalidado"] + c["derogado"]
            tram_dec = c["tram_si"] + c["tram_no"]
            out[tipo].append({"id": k, **dict(c),
                              "pct_convalidado": rnd(100 * c["convalidado"] / decididos, 1) if decididos else None,
                              "pct_derogado": rnd(100 * c["derogado"] / decididos, 1) if decididos else None,
                              "pct_tramitado_pl": rnd(100 * c["tram_si"] / tram_dec, 1) if tram_dec else None,
                              "denominador_convalidacion": decididos, "denominador_tramitacion": tram_dec})
    return out


def produccion(normas, rdl, gobs, corte):
    por_anio = collections.defaultdict(collections.Counter)
    for n in normas:
        por_anio[int(n["anio"])][n["rango"]] += 1
        if n["deriva_de_rdl"]:
            por_anio[int(n["anio"])]["leyes_derivadas_de_rdl"] += 1
    out = []
    for y in sorted(por_anio):
        if y < 1979:
            continue
        c = por_anio[y]
        total = c["ley"] + c["ley_organica"] + c["rdleg"] + c["rdl"]
        out.append({"anio": y, **{k: c[k] for k in ("ley", "ley_organica", "rdleg", "rdl", "leyes_derivadas_de_rdl")},
                    "total": total, "pct_rdl": rnd(100 * c["rdl"] / total, 1) if total else None,
                    "pct_rdl_sin_derivadas": rnd(100 * c["rdl"] / (total - c["leyes_derivadas_de_rdl"]), 1)
                    if total - c["leyes_derivadas_de_rdl"] else None,
                    "anio_incompleto": y == corte.year})
    # Por gobierno, presidente y legislatura (por fecha de aprobación de cada norma)
    legs = read("legislaturas.csv")
    por = {"gobierno": collections.defaultdict(collections.Counter), "presidente": collections.defaultdict(collections.Counter),
           "legislatura": collections.defaultdict(collections.Counter)}
    for n in normas:
        d = D(n["fecha_aprobacion"])
        if d < INICIO or d > corte:
            continue
        g = next((g for g in reversed(gobs) if D(g["fecha_inicio"]) <= d), None)
        l = next((l for l in reversed(legs) if l["fecha_constitucion"] and D(l["fecha_constitucion"]) <= d), None)
        for tipo, k in (("gobierno", g and g["gobierno_id"]), ("presidente", g and g["presidente_id"]), ("legislatura", l and l["legislatura"])):
            if k is None:
                continue
            por[tipo][k][n["rango"]] += 1
            if n["deriva_de_rdl"]:
                por[tipo][k]["leyes_derivadas_de_rdl"] += 1
    res = {"anio": out}
    for tipo, d in por.items():
        res[tipo] = []
        for k, c in d.items():
            total = c["ley"] + c["ley_organica"] + c["rdleg"] + c["rdl"]
            res[tipo].append({"id": k, **{x: c[x] for x in ("ley", "ley_organica", "rdleg", "rdl", "leyes_derivadas_de_rdl")},
                              "total": total, "pct_rdl": rnd(100 * c["rdl"] / total, 1) if total else None,
                              "pct_rdl_sin_derivadas": rnd(100 * c["rdl"] / (total - c["leyes_derivadas_de_rdl"]), 1)
                              if total - c["leyes_derivadas_de_rdl"] else None})
    return res


def mayorias(comp_gob, gobs):
    by = {g["gobierno_id"]: g for g in gobs}
    puntos = []
    for m in comp_gob:
        g = by[m["id"]]
        puntos.append({"gobierno_id": m["id"], "pct_escanos": float(g["pct_escanos"]),
                       "mayoria_absoluta": g["mayoria_absoluta"] == "True", "tipo": g["tipo"],
                       "media_anualizada": m["media_anualizada"], "dias": m["dias_exposicion"], "n": m["n"]})
    agg = {}
    for clave, f in (("mayoria_absoluta", lambda p: "si" if p["mayoria_absoluta"] else "no"),
                     ("tipo", lambda p: p["tipo"])):
        grp = collections.defaultdict(lambda: [0, 0, 0])
        for p in puntos:
            x = grp[f(p)]
            x[0] += p["n"]
            x[1] += p["dias"]
            x[2] += 1
        agg[clave] = {k: {"n": v[0], "dias": v[1], "gobiernos": v[2],
                          "media_anualizada_ponderada": rnd(v[0] / (v[1] / 365.25), 2)} for k, v in grp.items()}
    return {"puntos": puntos, "agregados": agg}


def destacados(rdl, serie, comp, corte):
    f = [D(r["fecha_aprobacion"]) for r in rdl]
    anios = (corte - INICIO).days / 365.25
    rec = max(serie, key=lambda x: (int(x["m30"]), x["fecha"]))
    gob = max(comp["gobierno"], key=lambda m: m["media_anualizada"])
    return {
        "total": len(f), "media_anual_historica": rnd(len(f) / anios, 2),
        "ultimos_30d": sum(1 for d in f if corte - dt.timedelta(days=29) <= d <= corte),
        "ultimos_365d": sum(1 for d in f if corte - dt.timedelta(days=364) <= d <= corte),
        "gobierno_max_anualizada": {"id": gob["id"], "valor": gob["media_anualizada"]},
        "record_30d": {"valor": int(rec["m30"]), "fecha_fin": rec["fecha"],
                       "empates": sum(1 for x in serie if int(x["m30"]) == int(rec["m30"]))},
        "record_dia": max(collections.Counter(f).values()),
        "corte": corte.isoformat(),
    }


def build(corte):
    rdl, gobs, legs, ciclos, normas = cargar(corte)
    serie = read("serie_diaria.csv")
    comp = tabla_comparacion(rdl, gobs, legs, corte)
    out = {
        "comparacion": comp,
        "perfiles": perfiles(rdl, gobs, corte),
        "fin_de_mandato": fin_de_mandato(rdl, ciclos, legs, corte),
        "resultados": resultados(rdl),
        "produccion": produccion(normas, rdl, gobs, corte),
        "mayorias": mayorias(comp["gobierno"], gobs),
        "destacados": destacados(rdl, serie, comp, corte),
    }
    DERIVED.mkdir(parents=True, exist_ok=True)
    for k, v in out.items():
        (DERIVED / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False, indent=1, default=str))
    for tipo, rows in comp.items():
        with open(DERIVED / f"comparacion_{tipo}.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    return out


if __name__ == "__main__":
    import sys
    corte = D(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today()
    o = build(corte)
    print(json.dumps(o["destacados"], ensure_ascii=False, indent=1))
