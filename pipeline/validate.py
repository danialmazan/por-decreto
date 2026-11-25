"""Controles automáticos de calidad. Errores bloquean la publicación; avisos se documentan."""
from __future__ import annotations

import collections
import datetime as dt
import re

D = dt.date.fromisoformat
CONV_OK = {"convalidado", "derogado", "pendiente", "desconocido", "otro"}
TRAM_OK = {"si", "no", "pendiente", "desconocido"}
# Huecos de numeración aceptados tras revisión manual (clave: año → números ausentes y motivo).
HUECOS_ACEPTADOS: dict[int, dict[int, str]] = {}


def run(rdl, normas, gobs, legs, ciclos, dups, cg, corte, serie=None):
    E, W, I = [], [], {}
    err = lambda c, m: E.append({"control": c, "detalle": m})  # noqa: E731
    warn = lambda c, m: W.append({"control": c, "detalle": m})  # noqa: E731

    # 1. Duplicados
    ids = collections.Counter(r["id"] for r in rdl)
    keys = collections.Counter((r["numero"], r["anio"]) for r in rdl)
    for k, n in ids.items():
        if n > 1:
            err("duplicado_id", k)
    for k, n in keys.items():
        if n > 1:
            err("duplicado_numero", f"{k[0]}/{k[1]}")
    for d in dups:
        warn("duplicado_en_fuente_descartado", f"RDL {d['clave']}: {d['id_descartado']} (se conserva {d['id_conservado']})")

    # 2. Continuidad de la numeración anual
    por_anio = collections.defaultdict(set)
    for r in rdl:
        por_anio[r["anio"]].add(r["numero"])
    for y, nums in sorted(por_anio.items()):
        start = 50 if y == 1978 else 1
        falt = sorted(set(range(start, max(nums) + 1)) - nums)
        falt = [n for n in falt if n not in HUECOS_ACEPTADOS.get(y, {})]
        if falt:
            err("numeracion_discontinua", f"{y}: faltan {falt}")
    I["rdl_por_anio_numeracion"] = {y: len(n) for y, n in sorted(por_anio.items())}

    # 3. Contraste con est_leyes (Congreso)
    est = cg["est_leyes"]
    rango_map = {"rdl": "rdl", "ley": "ley", "ley_organica": "lo", "rdleg": "rdleg"}
    cnt = collections.Counter((n["rango"], n["anio"]) for n in normas)
    contraste = []
    for y in sorted(int(k) for k in est):
        if not est[str(y)]:
            continue
        for rango, clave in rango_map.items():
            c, b = len(est[str(y)].get(clave, [])), cnt[(rango, y)]
            contraste.append({"anio": y, "rango": rango, "boe": b, "congreso": c})
            if c != b:
                (err if rango == "rdl" else warn)("contraste_est_leyes", f"{y} {rango}: BOE {b} / Congreso {c}")
    I["contraste_est_leyes"] = contraste

    # 4. Fechas y asignaciones
    g_by = {g["gobierno_id"]: g for g in gobs}
    for r in rdl:
        fa = D(r["fecha_aprobacion"])
        if fa < dt.date(1978, 12, 29) or fa > corte:
            err("fecha_fuera_de_rango", f"{r['numero']}/{r['anio']} {fa}")
        if fa.year != r["anio"]:
            err("anio_numeracion_distinto_de_fecha", f"{r['numero']}/{r['anio']} {fa}")
        if r["fecha_publicacion"] and D(r["fecha_publicacion"]) < fa:
            err("publicacion_anterior_a_aprobacion", f"{r['numero']}/{r['anio']}")
        g = g_by.get(r["gobierno_id"])
        if not g:
            err("sin_gobierno", f"{r['numero']}/{r['anio']}")
        elif fa < D(g["fecha_inicio"]) or (g["fecha_fin"] and fa > D(g["fecha_fin"])):
            err("fecha_fuera_de_gobierno", f"{r['numero']}/{r['anio']} {fa} {g['gobierno_id']}")
        if r["convalidacion"] not in CONV_OK:
            err("convalidacion_invalida", f"{r['numero']}/{r['anio']}: {r['convalidacion']}")
        if r["tramitado_pl"] not in TRAM_OK:
            err("tramitacion_invalida", f"{r['numero']}/{r['anio']}: {r['tramitado_pl']}")
    retrasos = [(r["numero"], r["anio"], r["dias_hasta_publicacion"]) for r in rdl
                if r["dias_hasta_publicacion"] is not None and r["dias_hasta_publicacion"] > 7]
    for n, y, d in retrasos:
        warn("publicacion_tardia", f"{n}/{y}: {d} días entre aprobación y publicación")
    I["dias_hasta_publicacion"] = dict(collections.Counter(
        r["dias_hasta_publicacion"] for r in rdl if r["dias_hasta_publicacion"] is not None))

    # 5. Gobiernos: continuidad y escaños
    for a, b in zip(gobs, gobs[1:]):
        if D(a["fecha_fin"]) + dt.timedelta(days=1) != D(b["fecha_inicio"]):
            err("gobiernos_no_contiguos", f"{a['gobierno_id']} → {b['gobierno_id']}")
    for g in gobs:
        if g["diputados_registrados_ref"] != 350:
            warn("registro_diputados_distinto_350",
                 f"{g['gobierno_id']}: {g['diputados_registrados_ref']} diputados de alta el {g['fecha_ref_escanos']}")
        if g["rd_nombramiento"] and not g["rd_verificado"]:
            err("rd_nombramiento_no_verificado", g["gobierno_id"])
    for l in legs:
        if l["legislatura"] > 0 and not (l.get("fecha_elecciones") and l.get("fecha_constitucion")):
            err("legislatura_sin_fechas", l["nombre"])
    for c in ciclos:
        if not D(c["fecha_disolucion"]) < D(c["fecha_elecciones"]) < D(c["fecha_constitucion_cortes"]):
            err("ciclo_fechas_incoherentes", c["ciclo_id"])

    # 6. Cruce con el Congreso
    sin_exp = [r for r in rdl if not r["expediente_congreso"]]
    for r in sin_exp:
        (warn if r["convalidacion"] in ("pendiente", "convalidado", "derogado") else err)(
            "rdl_sin_expediente_congreso", f"{r['numero']}/{r['anio']} ({r['fecha_aprobacion']}, {r['convalidacion']})")
    boe_keys = {(r["numero"], r["anio"]) for r in rdl}
    rx = re.compile(r"Real\s+Decreto[\s-]*Ley\s+(\d+)/(\d{4})|^Real\s+Decreto\s+(\d+)/(\d{4})", re.I)
    for it in cg["rdl"]:
        m = rx.search(it["titulo"])
        if not m:
            err("expediente_congreso_sin_numero", it["titulo"][:90])
            continue
        n, y = int(m.group(1) or m.group(3)), int(m.group(2) or m.group(4))
        if (n, y) not in boe_keys and (y > 1978 or (y == 1978 and n >= 50)):
            err("expediente_congreso_sin_rdl_boe", f"{n}/{y} {it['id_iniciativa']} L{it['_legislatura']}")
    for r in rdl:
        for f in filter(None, r["flags"].split(";")):
            if f in ("discrepancia_boe_congreso", "tramitacion_deducida_de_pl", "tramitado_sin_pl_localizado", "pl_localizado_sin_tramitacion_en_rdl",
                     "aprobado_en_dia_de_cambio_de_gobierno", "fecha_titulo_distinta_de_fecha_disposicion",
                     "ambito_no_estatal", "rango_no_rdl", "sin_xml_boe") or f.startswith("resultado_"):
                warn(f, f"{r['numero']}/{r['anio']} {r['id']}")

    # 7. Serie diaria: ceros explícitos, sin huecos, suma = total
    if serie is not None:
        fechas = [D(x["fecha"]) for x in serie]
        if any((b - a).days != 1 for a, b in zip(fechas, fechas[1:])):
            err("serie_con_huecos", "días no consecutivos")
        if sum(x["n"] for x in serie) != len(rdl):
            err("serie_suma_distinta", f"{sum(x['n'] for x in serie)} ≠ {len(rdl)}")
        for x in serie:
            if x["m30_seg"] > x["m30"]:
                err("ventana_segmento_incoherente", x["fecha"])
        I["serie"] = {"dias": len(serie), "dias_con_rdl": sum(1 for x in serie if x["n"]),
                      "max_dia": max(x["n"] for x in serie), "max_m30": max(x["m30"] for x in serie)}

    # 8. Resúmenes
    I["convalidacion"] = dict(collections.Counter(r["convalidacion"] for r in rdl))
    I["tramitado_pl"] = dict(collections.Counter(r["tramitado_pl"] for r in rdl))
    I["resultado_pl"] = dict(collections.Counter(r["resultado_pl"] for r in rdl if r["resultado_pl"]))
    I["fase"] = dict(collections.Counter(r["fase"] for r in rdl))
    I["por_gobierno"] = dict(collections.Counter(r["gobierno_id"] for r in rdl))
    I["leyes_derivadas_identificadas"] = sum(1 for n in normas if n["deriva_de_rdl"])
    I["pl_aprobados_procedentes_de_rdl"] = sum(1 for r in rdl if r["resultado_pl"] == "aprobado")
    con_res = [r["fecha_aprobacion"] for r in rdl if r["convalidacion"] in ("convalidado", "derogado")]
    I["cobertura"] = {
        "listado_boe_hasta": corte.isoformat(),
        "resultado_parlamentario_hasta": max(con_res) if con_res else None,
        "est_leyes_hasta": max(int(k) for k, v in est.items() if v),
    }
    return {"errores": E, "avisos": W, "info": I}


def summary(audit) -> str:
    E, W, I = audit["errores"], audit["avisos"], audit["info"]
    lines = [f"ERRORES: {len(E)}   AVISOS: {len(W)}"]
    for e in E[:40]:
        lines.append(f"  ✗ {e['control']}: {e['detalle']}")
    c = collections.Counter(w["control"] for w in W)
    lines.append("  avisos por control: " + ", ".join(f"{k}={v}" for k, v in c.most_common()))
    for k in ("convalidacion", "tramitado_pl", "resultado_pl", "fase", "cobertura"):
        lines.append(f"  {k}: {I.get(k)}")
    lines.append(f"  leyes derivadas identificadas: {I['leyes_derivadas_identificadas']} de "
                 f"{I['pl_aprobados_procedentes_de_rdl']} PL aprobados procedentes de RDL")
    return "\n".join(lines)
