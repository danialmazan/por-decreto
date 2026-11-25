"""Fuentes del Congreso de los Diputados."""
from __future__ import annotations

import html
import json
import re
import urllib.parse

from pipeline.http import fetch

INI_URL = ("https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=2"
           "&p_p_state=normal&p_p_mode=view&p_p_resource_id=filtrarListado&p_p_cacheability=cacheLevelPage")
DIP_URL = ("https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2"
           "&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage")
EST_URL = "https://app.congreso.es/est_leyes/do/get?v={}&action=load"
EXP_URL = ("https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0"
           "&p_p_state=normal&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura={leg}"
           "&_iniciativas_id={exp}")

ROMANOS = ["C", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"]


def iniciativas(legislatura: int, tipo: int, mode: str | None = None) -> list[dict]:
    """Todas las iniciativas de un tipo (130 RDL, 121 proyecto de ley) en una legislatura."""
    items: list[dict] = []
    page, total = 1, None
    while total is None or len(items) < total:
        data = {"_iniciativas_legislatura": legislatura, "_iniciativas_tipo": tipo, "_iniciativas_paginaActual": page}
        raw = fetch("congreso_iniciativas", INI_URL, data=data, ext="json",
                    name=f"L{legislatura:02d}_T{tipo}_p{page:03d}", mode=mode)
        d = json.loads(raw)
        total = int(d.get("iniciativas_encontradas") or 0)
        lote = list((d.get("lista_iniciativas") or {}).values())
        if not lote:
            break
        items += lote
        page += 1
        if page > 200:
            raise RuntimeError("Paginación descontrolada en iniciativas del Congreso")
    for it in items:
        it["_legislatura"] = legislatura
        # El detalle del expediente exige la legislatura en romanos («C» = Constituyente).
        it["url_expediente"] = EXP_URL.format(leg=ROMANOS[legislatura], exp=urllib.parse.quote(it.get("id_iniciativa", ""), safe=""))
    if total and len(items) != total:
        raise RuntimeError(f"L{legislatura} T{tipo}: {len(items)} de {total} iniciativas")
    return items


def diputados(legislatura: int, mode: str | None = None) -> list[dict]:
    data = {"_diputadomodule_idLegislatura": legislatura, "_diputadomodule_genero": "0",
            "_diputadomodule_grupo": "all", "_diputadomodule_tipo": "2", "_diputadomodule_nombre": "",
            "_diputadomodule_apellidos": "", "_diputadomodule_formacion": "all",
            "_diputadomodule_filtroProvincias": "[]", "_diputadomodule_nombreCircunscripcion": ""}
    raw = fetch("congreso_diputados", DIP_URL, data=data, ext="json", name=f"L{legislatura:02d}", mode=mode)
    return json.loads(raw).get("data", [])


def est_leyes(anio: int, mode: str | None = None) -> dict[str, list[str]]:
    """Listado oficial anual por tipo de norma (app est_leyes). Claves normalizadas."""
    page = html.unescape(fetch("congreso_est_leyes", EST_URL.format(anio), name=str(anio), mode=mode))
    parts = re.split(r'<li class="type"><span>([^<]+)</span>', page)
    out: dict[str, list[str]] = {}
    for i in range(1, len(parts), 2):
        k = parts[i].upper()
        clave = ("lo" if "ORGÁNICA" in k else "ley" if "ORDINARIA" in k else
                 "rdleg" if "LEGISLATIV" in k else "rdl" if "DECRETOS" in k and "LEY" in k else None)
        if clave:
            out[clave] = re.findall(r'class="file"><a[^>]*>([^<]+)</a>', parts[i + 1])
    return out
