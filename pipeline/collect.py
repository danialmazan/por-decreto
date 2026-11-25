"""Recogida de datos de las fuentes (con caché) y volcado a data/interim/.

data/interim/ guarda los datos *parseados* y versionados en git; es la base de la
actualización incremental: los documentos del BOE ya analizados no se vuelven a pedir
salvo que sean recientes (pueden recibir referencias de convalidación) o sigan pendientes.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

from pipeline.sources import boe, congreso

ROOT = Path(__file__).resolve().parents[1]
INTERIM = ROOT / "data" / "interim"
INICIO = "1978-12-29"
LEGISLATURAS = range(0, 16)  # 0 = Constituyente
RANGOS = ("1320", "1300", "1290", "1310")
REFRESCO_DIAS = 400  # documentos de RDL más recientes que esto se vuelven a consultar


def _load(name: str, default):
    p = INTERIM / name
    return json.loads(p.read_text()) if p.exists() else default


def _save(name: str, obj) -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    p = INTERIM / name
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True))
    tmp.replace(p)


def collect_listados(hoy: dt.date, mode=None) -> dict:
    out = {r: boe.listado(r, INICIO, hoy.isoformat(), mode=mode) for r in RANGOS}
    _save("boe_listados.json", out)
    return out


def collect_docs(listados: dict, hoy: dt.date, full: bool = False, mode=None) -> dict:
    docs = _load("boe_docs.json", {})
    limite = (hoy - dt.timedelta(days=REFRESCO_DIAS)).isoformat()
    ids = [r["id"] for r in listados["1320"]]
    for i, boe_id in enumerate(ids):
        prev = docs.get(boe_id)
        reciente = prev is None or (prev.get("fecha_disposicion") or "9999") >= limite
        pendiente = prev is not None and not any(
            ref["tipo"] == "posterior" and ref["codigo"] in ("300", "301", "210") for ref in prev["referencias"])
        if prev is None or full or reciente or pendiente:
            m = "refresh" if (prev is not None and mode != "offline") else mode
            try:
                docs[boe_id] = boe.documento(boe_id, mode=m)
            except Exception as e:  # conserva la versión anterior
                if prev is None:
                    raise
                print(f"  aviso: no se pudo refrescar {boe_id}: {e}")
        if i % 100 == 0:
            print(f"  XML BOE {i}/{len(ids)}")
            _save("boe_docs.json", docs)
    _save("boe_docs.json", docs)
    return docs


def collect_institucional(hoy: dt.date, mode=None) -> dict:
    """RD de disolución (con texto) y RD de nombramiento/cese del Presidente del Gobierno."""
    fin = hoy.isoformat()
    candidatos = {r["id"]: r for q in ("disolución Congreso", "disolución Cortes Generales")
                  for r in boe.buscar_diario(q, "1977-01-01", fin, secciones=("1",), mode=mode)}
    disol = [r for r in candidatos.values()
             if re.search(r"^Real Decreto \d+/\d{4}, de .*disolución (del Congreso de los Diputados y del Senado|de las Cortes Generales)",
                          r["titulo"])]
    disoluciones = []
    for r in disol:
        d = boe.documento(r["id"], mode=mode, con_texto=True)
        disoluciones.append({k: d[k] for k in ("id", "titulo", "fecha_disposicion", "fecha_publicacion")} | {"texto": d["texto"]})
    pres = [r for r in boe.buscar_diario("Presidente del Gobierno", "1977-01-01", fin, secciones=("2",), mode=mode)
            if re.search(r"(nombra Presidente del Gobierno a|cese de .* como Presidente del Gobierno\.?$|cese como Presidente del Gobierno)",
                         r["titulo"]) and not re.search(r"Gobierno (Vasco|de |Autónom)", r["titulo"])]
    out = {"disoluciones": disoluciones, "presidentes": pres}
    _save("boe_institucional.json", out)
    return out


def collect_congreso(hoy: dt.date, mode=None) -> dict:
    out = {"rdl": [], "pl": [], "diputados": {}, "est_leyes": {}}
    for leg in LEGISLATURAS:
        # La legislatura en curso se refresca siempre; las cerradas se toman de la caché.
        m = "refresh" if (leg == max(LEGISLATURAS) and mode != "offline") else mode
        out["rdl"] += congreso.iniciativas(leg, 130, mode=m)
        out["pl"] += congreso.iniciativas(leg, 121, mode=m)
        out["diputados"][str(leg)] = congreso.diputados(leg, mode=mode)
    for y in range(1979, hoy.year + 1):
        m = "refresh" if (y >= hoy.year - 1 and mode != "offline") else mode
        out["est_leyes"][str(y)] = congreso.est_leyes(y, mode=m)
    _save("congreso.json", out)
    return out


def main(full: bool = False, mode=None, hoy: dt.date | None = None) -> None:
    hoy = hoy or dt.date.today()
    print("Listados BOE…")
    m_list = "refresh" if mode != "offline" else mode
    listados = collect_listados(hoy, mode=m_list)
    print({k: len(v) for k, v in listados.items()})
    print("XML de RDL…")
    collect_docs(listados, hoy, full=full, mode=mode)
    print("Institucional…")
    inst = collect_institucional(hoy, mode=m_list)
    print(len(inst["disoluciones"]), "disoluciones;", len(inst["presidentes"]), "RD de presidentes")
    print("Congreso…")
    cg = collect_congreso(hoy, mode=mode)
    print(len(cg["rdl"]), "RDL;", len(cg["pl"]), "PL")


if __name__ == "__main__":
    import sys
    main(full="--full" in sys.argv, mode="offline" if "--offline" in sys.argv else None)
