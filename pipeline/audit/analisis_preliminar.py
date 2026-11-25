"""Análisis preliminar de la auditoría (fase 1).

Lee las descargas guardadas en data/raw/audit_2026-11-25/ y produce:
  1. Contraste anual BOE ↔ Congreso (est_leyes) por rango.
  2. Cruce norma a norma BOE ↔ Congreso (iniciativas tipo 130).
  3. Tasas de RDL alrededor de cada disolución de las Cortes («fin de mandato»).

Uso:  python3 -I pipeline/audit/analisis_preliminar.py data/raw/audit_2026-11-25 [fecha_corte]

Las fechas de toma de posesión de los nuevos gobiernos son provisionales
(se sustituirán por las de los RD de nombramiento del BOE en la fase 2).
"""
import collections
import datetime as dt
import json
import re
import statistics
import sys
from pathlib import Path

MESES = {m: i + 1 for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}
RX_RDL = re.compile(r"Real\s+Decreto[\s-]*[Ll]ey\s+(\d+)/(\d{4})(?:,?\s*de\s+(\d+)\s+(?:de\s+)?(\w+))?", re.I)
RX_RDL_ERRATA = re.compile(r"Real\s+Decreto\s+(\d+)/(\d{4})", re.I)  # p. ej. «REAL DECRETO 5/1988» en el Congreso

# (elecciones previas, disolución, elecciones, toma de posesión del nuevo Gobierno [provisional], presidente)
CICLOS = [
    ("1979-03-01", "1982-08-27", "1982-10-28", "1982-12-03", "Calvo-Sotelo"),
    ("1982-10-28", "1986-04-22", "1986-06-22", "1986-07-26", "González"),
    ("1986-06-22", "1989-09-01", "1989-10-29", "1989-12-07", "González"),
    ("1989-10-29", "1993-04-12", "1993-06-06", "1993-07-14", "González"),
    ("1993-06-06", "1996-01-08", "1996-03-03", "1996-05-06", "González"),
    ("1996-03-03", "2000-01-17", "2000-03-12", "2000-04-28", "Aznar"),
    ("2000-03-12", "2004-01-19", "2004-03-14", "2004-04-18", "Aznar"),
    ("2004-03-14", "2008-01-14", "2008-03-09", "2008-04-14", "Zapatero"),
    ("2008-03-09", "2011-09-26", "2011-11-20", "2011-12-22", "Zapatero"),
    ("2011-11-20", "2015-10-26", "2015-12-20", "2016-11-04", "Rajoy"),
    ("2015-12-20", "2016-05-03", "2016-06-26", "2016-11-04", "Rajoy (en funciones)"),
    ("2016-06-26", "2019-03-04", "2019-04-28", "2020-01-13", "Sánchez"),
    ("2019-04-28", "2019-09-24", "2019-11-10", "2020-01-13", "Sánchez (en funciones)"),
    ("2019-11-10", "2023-05-29", "2023-07-23", "2023-11-21", "Sánchez"),
    ("2023-07-23", "2026-10-05", "2026-11-29", None, "Sánchez"),
]


def rdl_boe(boe):
    """Devuelve {(num, año): (id, fecha_aprobación)} y la lista de duplicados."""
    out, dups = {}, collections.defaultdict(list)
    for row in boe["1320"]:
        m = RX_RDL.match(row["titulo"] or "")
        if not m:
            raise ValueError(f"Título sin parsear: {row}")
        k = (int(m.group(1)), int(m.group(2)))
        dups[k].append(row["id"])
        if k in out:
            continue
        fecha = dt.date(int(m.group(2)), MESES[m.group(4).lower()], int(m.group(3)))
        out[k] = (row["id"], fecha)
    return out, {k: v for k, v in dups.items() if len(v) > 1}


def contraste_anual(boe, est):
    pats = {"RDL": ("1320", r"Real Decreto-ley \d+/(\d{4})", ("DECRETOS-LEYES", "DECRETOS LEYES")),
            "Ley": ("1300", r"Ley \d+/(\d{4})", ("ORDINARIAS",)),
            "LO": ("1290", r"Ley Orgánica \d+/(\d{4})", ("ORGÁNICAS",)),
            "RDLeg": ("1310", r"Real Decreto Legislativo \d+/(\d{4})", ("LEGISLATIV",))}
    filas = []
    for y in range(1979, 2026):
        fila = {"anio": y}
        for k, (rng, pat, claves) in pats.items():
            ids = {}
            for r in boe[rng]:
                m = re.match(pat, r["titulo"] or "", re.I)
                if m and int(m.group(1)) == y:
                    ids.setdefault(re.match(r"[^,]+", r["titulo"]).group(0).lower(), r["id"])
            cg = next((len(v) for s, v in est[str(y)].items() if any(c in s for c in claves)), 0)
            fila[k] = (len(ids), cg)
        filas.append(fila)
    return filas


def cruce_congreso(rdl, cg):
    C = collections.defaultdict(list)
    for leg, items in cg.items():
        for i in items:
            m = RX_RDL.search(i["titulo"]) or RX_RDL_ERRATA.search(i["titulo"])
            if m:
                C[(int(m.group(1)), int(m.group(2)))].append((int(leg), i["resultado_tram"], i["id_iniciativa"]))
    boe_keys = set(rdl)
    return {
        "casados": len(boe_keys & set(C)),
        "boe_sin_congreso": sorted(boe_keys - set(C)),
        "congreso_sin_boe": sorted(set(C) - boe_keys),
        "resultados": collections.Counter(v[0][1].strip().lower() for k, v in C.items() if k in boe_keys),
    }


def fin_de_mandato(fechas, corte):
    D = dt.date.fromisoformat
    fin = corte + dt.timedelta(days=1)

    def tasa(a, b):
        b = min(b, fin)
        n = sum(1 for d in fechas if a <= d < b)
        dias = (b - a).days
        return n, (n / dias * 30 if dias > 0 else float("nan")), dias

    filas = []
    for pe, ds, el, ng, pres in CICLOS:
        pe, ds, el = D(pe), D(ds), D(el)
        filas.append({
            "disolucion": ds, "presidente": pres,
            "legislatura": tasa(pe, ds),
            "previos_90": tasa(ds - dt.timedelta(days=90), ds),
            "disueltas": tasa(ds, el),
            "en_funciones": tasa(el, D(ng)) if ng else None,
        })
    return filas


def main():
    base = Path(sys.argv[1])
    corte = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date(2026, 11, 25)
    boe = json.loads((base / "boe_listado_rango_ley.json").read_text())
    est = json.loads((base / "congreso_est_leyes.json").read_text())
    cg = json.loads((base / "congreso_rdl_tipo130.json").read_text())

    rdl, dups = rdl_boe(boe)
    print(f"## RDL en el BOE desde 29/12/1978: {len(boe['1320'])} filas, {len(rdl)} únicos; duplicados: {dups}")
    por_anio = collections.Counter(y for _, y in rdl)
    print("Por año:", dict(sorted(por_anio.items())))

    print("\n## Contraste anual BOE/Congreso (sólo discrepancias)")
    for f in contraste_anual(boe, est):
        dif = {k: v for k, v in f.items() if k != "anio" and v[0] != v[1]}
        if dif:
            print(f["anio"], dif)

    print("\n## Cruce norma a norma BOE ↔ Congreso (tipo 130)")
    c = cruce_congreso(rdl, cg)
    print("casados", c["casados"], "| BOE sin Congreso", c["boe_sin_congreso"])
    print("Congreso sin BOE (preconstitucionales):", len(c["congreso_sin_boe"]),
          "años", sorted({y for _, y in c["congreso_sin_boe"]}))
    print("resultado_tram:", c["resultados"].most_common())

    print("\n## Fin de mandato (RDL por 30 días)")
    fechas = [f for _, f in rdl.values()]
    filas = fin_de_mandato(fechas, corte)
    print("| Disolución | Presidente | Legislatura | 90 d previos | Disolución→elecciones | Elecciones→nuevo Gob. | Ratio |")
    print("|---|---|---|---|---|---|---|")
    ratios = []
    for f in filas:
        L, P, Dz, F = f["legislatura"], f["previos_90"], f["disueltas"], f["en_funciones"]
        r = Dz[1] / L[1] if L[1] else float("nan")
        if F is not None:
            ratios.append(r)
        fs = f"{F[0]} ({F[1]:.2f})" if F else "—"
        print(f"| {f['disolucion']:%d/%m/%Y} | {f['presidente']} | {L[1]:.2f} | {P[0]} ({P[1]:.2f}) | "
              f"{Dz[0]} en {Dz[2]} d ({Dz[1]:.2f}) | {fs} | ×{r:.2f} |")
    print(f"\nMediana del ratio (ciclos cerrados): ×{statistics.median(ratios):.2f}; "
          f"ciclos con ratio > 1: {sum(r > 1 for r in ratios)}/{len(ratios)}")


if __name__ == "__main__":
    main()
