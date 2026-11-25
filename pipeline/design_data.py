"""Exporta un subconjunto de datos reales para las maquetas de diseño (docs/diseno/data.js)."""
import collections
import csv
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLEAN, DERIVED = ROOT / "data" / "clean", ROOT / "data" / "derived"
OUT = ROOT / "docs" / "diseno" / "data.js"
ROM = {"1": "I", "2": "II", "3": "III", "4": "IV"}
NOMBRE = {"suarez": "Suárez", "calvo_sotelo": "Calvo-Sotelo", "gonzalez": "González", "aznar": "Aznar",
          "zapatero": "Zapatero", "rajoy": "Rajoy", "sanchez": "Sánchez"}


def read(n):
    with open(CLEAN / n, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def etiqueta(gid):
    base, _, num = gid.rpartition("_")
    if base and num in ROM:
        return f"{NOMBRE[base]} {ROM[num]}"
    return NOMBRE.get(gid, gid)


def main():
    serie = read("serie_diaria.csv")
    gobs = read("gobiernos.csv")
    legs = read("legislaturas.csv")
    rdl = read("rdl.csv")
    comp = json.loads((DERIVED / "comparacion.json").read_text())
    fm = json.loads((DERIVED / "fin_de_mandato.json").read_text())
    dest = json.loads((DERIVED / "destacados.json").read_text())
    corte = dt.date.fromisoformat(dest["corte"])
    anual = collections.Counter(int(r["fecha_aprobacion"][:4]) for r in rdl)
    anual[1979] += anual.pop(1978, 0)
    semanas = collections.Counter(dt.date.fromisoformat(r["fecha_aprobacion"]).isocalendar()[:2] for r in rdl)
    disol = []
    for l in legs:
        if l["fecha_disolucion"]:
            nxt = next(x for x in legs if int(x["legislatura"]) == int(l["legislatura"]) + 1)
            disol.append([l["fecha_disolucion"], min(nxt["fecha_constitucion"], dest["corte"]), nxt["fecha_elecciones"]])
    ciclos = read("ciclos_electorales.csv")
    fechas = sorted(dt.date.fromisoformat(r["fecha_aprobacion"]) for r in rdl)
    desde0 = []
    for c in ciclos:
        ng = dt.date.fromisoformat(c["fecha_toma_posesion_nuevo_gobierno"]) if c["fecha_toma_posesion_nuevo_gobierno"] else None
        el = dt.date.fromisoformat(c["fecha_elecciones"])
        item = {"id": c["ciclo_id"], "disolucion": c["fecha_disolucion"], "anuncio": c["fecha_anuncio"],
                "tipo_anuncio": c["tipo_anuncio"], "anio": c["fecha_disolucion"][:4], "gob": etiqueta(c["gobierno_saliente"]),
                "actual": ng is None and corte < el, "curvas": {}, "elecciones_dia": {}}
        for origen in ("disolucion", "anuncio"):
            d0 = dt.date.fromisoformat(c[f"fecha_{origen}"])
            fin = min(corte, d0 + dt.timedelta(days=180))
            if ng:
                fin = min(fin, ng - dt.timedelta(days=1))
            curva, k = [], 0
            while d0 + dt.timedelta(days=k) <= fin:
                curva.append(sum(1 for f in fechas if d0 <= f <= d0 + dt.timedelta(days=k)))
                k += 1
            item["curvas"][origen] = curva
            item["elecciones_dia"][origen] = (el - d0).days
        desde0.append(item)
    ultimos = sorted(rdl, key=lambda r: (r["fecha_aprobacion"], int(r["numero"])))[-8:][::-1]
    data = {
        "inicio": serie[0]["fecha"], "corte": dest["corte"],
        "m30": [int(x["m30"]) for x in serie],
        "anual": [[y, anual.get(y, 0)] for y in range(1979, corte.year + 1)],
        "semanas": [[y, w, n] for (y, w), n in sorted(semanas.items())],
        "gobiernos": [{"id": g["gobierno_id"], "nombre": etiqueta(g["gobierno_id"]), "partido": g["partidos"].split(";")[0],
                       "partidos": g["partidos"].split(";"), "inicio": max(g["fecha_inicio"], serie[0]["fecha"]),
                       "fin": g["fecha_fin"] or dest["corte"]} for g in gobs],
        "disoluciones": disol,
        "destacados": dest,
        "comparacion": [{"id": m["id"], "nombre": etiqueta(m["id"]), "anual": m["media_anualizada"], "n": m["n"],
                         "dias": m["dias_exposicion"], "max30": m["max_30d"]} for m in comp["gobierno"]],
        "fin": [{"id": c["ciclo_id"], "anio": c["fecha_disolucion"][:4], "gob": etiqueta(c["gobierno_saliente"]),
                 "curva": c["curva_desde_menos365"], "dis_n": c["disueltas_n"], "dis_dias": c["disueltas_dias"],
                 "leg30": c["legislatura_tasa30"], "dis30": c["disueltas_tasa30"], "igual_n": c["igual_tiempo_n"],
                 "igual_dias": c["igual_tiempo_dias"], "actual": c["en_curso"], "corta": c["legislatura_corta"]}
                for c in fm],
        "desde_disolucion": desde0,
        "ultimos": [{"num": f'{r["numero"]}/{r["anio"]}', "fecha": r["fecha_aprobacion"],
                     "titulo": r["titulo"].split(", ", 2)[-1].rstrip("."), "estado": r["convalidacion"],
                     "url": r["url_boe"]} for r in ultimos],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.DL = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
