"""Exporta los datos que consume la web a public/data/ (JSON compactos + CSV descargables).

La web calcula en el navegador las agregaciones temporales a partir de la serie diaria; las métricas
de comparación entre Gobiernos se toman de pipeline/metrics.py (fuente única, validada y testeada).
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import shutil
from pathlib import Path

from pipeline.design_data import etiqueta

ROOT = Path(__file__).resolve().parents[1]
CLEAN, DERIVED, OUT = ROOT / "data" / "clean", ROOT / "data" / "derived", ROOT / "public" / "data"
INICIO_REAL = {"suarez_2": "1977-07-04"}


def read(name):
    with open(CLEAN / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def num(v, cast=int):
    return cast(v) if v not in ("", None) else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    audit = json.loads((ROOT / "data" / "audit.json").read_text())
    serie = read("serie_diaria.csv")
    dest = json.loads((DERIVED / "destacados.json").read_text())
    dump("meta.json", {"inicio": serie[0]["fecha"], "corte": dest["corte"], "generado": audit["meta"]["generado"],
                       "cobertura": audit["info"]["cobertura"], "n_rdl": audit["meta"]["n_rdl"]})
    dump("serie.json", {"inicio": serie[0]["fecha"], "n": [int(x["n"]) for x in serie]})
    dump("gobiernos.json", [{
        "id": g["gobierno_id"], "nombre": etiqueta(g["gobierno_id"]), "presidente": g["presidente"],
        "presidente_id": g["presidente_id"], "partidos": g["partidos"].split(";"),
        "inicio": INICIO_REAL.get(g["gobierno_id"], g["fecha_inicio"]), "fin": g["fecha_fin"] or None,
        "inicio_funciones": g["inicio_funciones"] or None, "tipo": g["tipo"],
        "legislatura": int(g["legislatura_formacion"]), "escanos": int(g["escanos_gobierno"]),
        "escanos_por_partido": g["escanos_por_partido"], "pct_escanos": float(g["pct_escanos"]),
        "mayoria_absoluta": g["mayoria_absoluta"] == "True", "rd_nombramiento": g["rd_nombramiento"] or None,
    } for g in read("gobiernos.csv")])
    dump("legislaturas.json", [{
        "n": int(l["legislatura"]), "nombre": l["nombre"], "elecciones": l["fecha_elecciones"] or None,
        "constitucion": l["fecha_constitucion"] or None, "disolucion": l["fecha_disolucion"] or None,
        "fin": l["fecha_fin"] or None,
    } for l in read("legislaturas.csv")])
    dump("ciclos.json", [{
        "id": c["ciclo_id"], "disolucion": c["fecha_disolucion"], "disolucion_rd": c["fecha_disolucion_rd"],
        "rd": c["rd_disolucion"], "anuncio": c["fecha_anuncio"], "tipo_anuncio": c["tipo_anuncio"],
        "fuente_anuncio": c["fuente_anuncio"], "elecciones": c["fecha_elecciones"],
        "constitucion": c["fecha_constitucion_cortes"], "saliente": c["gobierno_saliente"],
        "entrante": c["gobierno_entrante"] or None, "nuevo_gobierno": c["fecha_toma_posesion_nuevo_gobierno"] or None,
    } for c in read("ciclos_electorales.csv")])
    comp = json.loads((DERIVED / "comparacion.json").read_text())
    for rows in comp.values():
        for r in rows:
            r["etiqueta"] = etiqueta(r["id"]) if r["id"] in {g["gobierno_id"] for g in read("gobiernos.csv")} else r["etiqueta"]
    dump("comparacion.json", comp)
    cols = ["id", "numero", "anio", "fecha", "publicacion", "gobierno", "convalidacion", "fecha_convalidacion",
            "tramitado_pl", "resultado_pl", "expediente", "legislatura_expediente", "fase", "titulo"]
    rows = []
    for r in read("rdl.csv"):
        rows.append([r["id"], int(r["numero"]), int(r["anio"]), r["fecha_aprobacion"], r["fecha_publicacion"],
                     r["gobierno_id"], r["convalidacion"], r["fecha_convalidacion"] or None, r["tramitado_pl"],
                     r["resultado_pl"] or None, (r["expediente_congreso"] or "").split(";")[-1] or None,
                     num((r["legislatura_expediente"] or "").split(";")[-1]), r["fase"],
                     r["titulo"]])
    rows.sort(key=lambda x: (x[3], x[1]))
    dump("rdl.json", {"cols": cols, "rows": rows})
    # Acontecimientos: tabla curada + periodos largos de Gobierno en funciones (derivados del BOE)
    eventos = []
    for e in csv.DictReader(open(ROOT / "data" / "manual" / "eventos.csv", encoding="utf-8")):
        e["fin"] = e["fin"] or None
        eventos.append(e)
    gobs = read("gobiernos.csv")
    for g, nxt in zip(gobs, gobs[1:]):
        if g["inicio_funciones"]:
            a, b = g["inicio_funciones"], (dt.date.fromisoformat(nxt["fecha_inicio"]) - dt.timedelta(days=1)).isoformat()
            dias = (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days + 1
            if dias > 60:
                eventos.append({"id": f"funciones_{a[:4]}", "categoria": "politica",
                                "nombre_es": f"Gobierno en funciones ({a[:4]}–{b[:4]})" if a[:4] != b[:4] else f"Gobierno en funciones ({a[:4]})",
                                "nombre_en": f"Caretaker government ({a[:4]}–{b[:4]})" if a[:4] != b[:4] else f"Caretaker government ({a[:4]})",
                                "inicio": a, "fin": b,
                                "explicacion_es": f"{etiqueta(g['gobierno_id'])} en funciones durante {dias} días.",
                                "explicacion_en": f"{etiqueta(g['gobierno_id'])} acting as caretaker for {dias} days.",
                                "fuente": f"BOE (nombramiento: {nxt['rd_nombramiento']})",
                                "justificacion": "Desde las elecciones (art. 101 CE) hasta el nombramiento del nuevo presidente; se incluyen los periodos de más de 60 días."})
    eventos.sort(key=lambda e: e["inicio"])
    dump("eventos.json", eventos)
    dump("produccion.json", json.loads((DERIVED / "produccion.json").read_text()))
    dump("resultados.json", json.loads((DERIVED / "resultados.json").read_text()))
    shutil.copy(CLEAN / "rdl.csv", OUT / "decretos-leyes.csv")
    shutil.copy(CLEAN / "gobiernos.csv", OUT / "gobiernos.csv")
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:26} {p.stat().st_size:>8}")


if __name__ == "__main__":
    main()
