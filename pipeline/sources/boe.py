"""Fuentes del BOE: buscador de legislación, buscador del diario y XML por documento."""
from __future__ import annotations

import datetime as dt
import html
import re
import urllib.parse
import xml.etree.ElementTree as ET

from pipeline.http import fetch

LEG_URL = "https://www.boe.es/buscar/legislacion_ava.php"
BOE_URL = "https://www.boe.es/buscar/boe.php"
XML_URL = "https://www.boe.es/diario_boe/xml.php?id={}"

RANGOS = {"1320": "rdl", "1300": "ley", "1290": "lo", "1310": "rdleg", "1340": "rd"}
MESES = {m: i + 1 for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}

RX_ITEM = re.compile(r'<li class="resultado-busqueda">(.*?)</li>\s*</ul>', re.S)
RX_DEM = re.compile(r'class="linea-dem">(.*?)\(BOE (\d+) de (\d\d)/(\d\d)/(\d{4})\)', re.S)
RX_FECHA_TXT = re.compile(r"(\d{1,2})\s+(?:de\s+)?(" + "|".join(MESES) + r")\s+(?:de\s+)?(\d{4})", re.I)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def _parse_results(page: str) -> list[dict]:
    page = html.unescape(page)
    rows = []
    for b in RX_ITEM.findall(page):
        m_id = re.search(r"BOE-A-\d{4}-\d+", b)
        m_ti = re.search(r"</p>\s*<p>(.*?)</p>", b, re.S)
        m_dem = RX_DEM.search(b)
        if not (m_id and m_ti):
            continue
        rows.append({
            "id": m_id.group(0),
            "titulo": _clean(m_ti.group(1)),
            "departamento": _clean(m_dem.group(1)) if m_dem else None,
            "boe_numero": int(m_dem.group(2)) if m_dem else None,
            "fecha_publicacion": (f"{m_dem.group(5)}-{m_dem.group(4)}-{m_dem.group(3)}" if m_dem else None),
        })
    return rows


def _total_hits(page: str) -> int | None:
    m = re.search(r"([\d\.]+)\s+(?:documentos|resultados)", html.unescape(page))
    return int(m.group(1).replace(".", "")) if m else None


def listado(rango: str, desde: str, hasta: str, mode: str | None = None) -> list[dict]:
    """Normas estatales de un rango con fecha de aprobación en [desde, hasta]. Divide por tramos."""
    d0, d1 = dt.date.fromisoformat(desde), dt.date.fromisoformat(hasta)
    out: list[dict] = []
    a = d0
    while a <= d1:
        b = min(dt.date(a.year + 7, 12, 31), d1)
        params = [("campo[0]", "ID_SRC"), ("dato[0]", "1"), ("operador[0]", "and"),
                  ("campo[4]", "ID_RNGS"), ("dato[4]", rango), ("operador[4]", "and"),
                  ("campo[12]", "FAP"), ("dato[12][0]", a.isoformat()), ("dato[12][1]", b.isoformat()),
                  ("page_hits", "2000"), ("sort_field[0]", "FPU"), ("sort_order[0]", "asc"), ("accion", "Buscar")]
        page = fetch("boe_listado", LEG_URL + "?" + urllib.parse.urlencode(params), mode=mode)
        rows = _parse_results(page)
        if len(rows) >= 2000:
            raise RuntimeError(f"Tramo {a}–{b} del rango {rango} alcanza el límite de página")
        out += rows
        a = b + dt.timedelta(days=1)
    return out


def buscar_diario(titulo: str, desde: str, hasta: str, secciones=("1", "2"), mode: str | None = None) -> list[dict]:
    """Buscador del diario BOE por palabras del título (incluye Sección II: nombramientos y ceses)."""
    params = [("campo[0]", "ORIS")] + [(f"dato[0][{s}]", s) for s in secciones] + [
        ("operador[0]", "and"), ("campo[1]", "TITULOS"), ("dato[1]", titulo), ("operador[1]", "and"),
        ("operador[6]", "and"), ("campo[6]", "FPU"), ("dato[6][0]", desde), ("dato[6][1]", hasta),
        ("page_hits", "2000"), ("sort_field[0]", "FPU"), ("sort_order[0]", "asc"), ("accion", "Buscar")]
    return _parse_results(fetch("boe_diario", BOE_URL + "?" + urllib.parse.urlencode(params), mode=mode))


def documento(boe_id: str, mode: str | None = None, con_texto: bool = False) -> dict:
    """Metadatos, referencias posteriores y (opcional) texto de un documento del BOE."""
    raw = fetch("boe_xml", XML_URL.format(boe_id), ext="xml", name=boe_id, mode=mode)
    root = ET.fromstring(raw.encode("utf-8"))
    md = root.find("metadatos")
    g = lambda k: (md.findtext(k) or "").strip() or None  # noqa: E731
    iso = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) == 8 else None  # noqa: E731
    refs = []
    for kind in ("anteriores", "posteriores"):
        for r in root.iterfind(f"analisis/referencias/{kind}/*"):
            p = r.find("palabra")
            refs.append({
                "tipo": kind[:-2],
                "referencia": r.get("referencia"),
                "codigo": p.get("codigo") if p is not None else None,
                "palabra": _clean(p.text or "") if p is not None else None,
                "texto": _clean(r.findtext("texto") or ""),
            })
    rango = md.find("rango")
    out = {
        "id": g("identificador"),
        "rango_codigo": rango.get("codigo") if rango is not None else None,
        "ambito": g("origen_legislativo"),
        "departamento": g("departamento"),
        "numero_oficial": g("numero_oficial"),
        "titulo": g("titulo"),
        "fecha_disposicion": iso(g("fecha_disposicion")),
        "fecha_publicacion": iso(g("fecha_publicacion")),
        "fecha_vigencia": iso(g("fecha_vigencia")),
        "estatus_derogacion": g("estatus_derogacion"),
        "fecha_derogacion": iso(g("fecha_derogacion")),
        "url_pdf": g("url_pdf"),
        "url_eli": g("url_eli"),
        "fecha_actualizacion": root.get("fecha_actualizacion"),
        "referencias": refs,
    }
    if con_texto:
        t = root.find("texto")
        out["texto"] = _clean(ET.tostring(t, encoding="unicode")) if t is not None else ""
    return out


def fecha_en_texto(texto: str) -> str | None:
    """Primera fecha «D de mes de AAAA» de un texto, en ISO."""
    m = RX_FECHA_TXT.search(texto or "")
    if not m:
        return None
    return dt.date(int(m.group(3)), MESES[m.group(2).lower()], int(m.group(1))).isoformat()


RX_TITULO = re.compile(
    r"^(?P<rango>Real\s+Decreto[\s-]*[Ll]ey|Real\s+Decreto\s+Legislativo|Ley\s+Orgánica|Ley)\s+"
    r"(?P<num>\d+)/(?P<anio>\d{4})(?:\s*\(rectificad[oa]\))?,?\s*de\s+(?P<dia>\d{1,2})\s+(?:de\s+)?(?P<mes>[a-záéíóú]+)",
    re.I)


def parse_titulo(titulo: str) -> dict | None:
    """Número, año y fecha de aprobación a partir del título oficial."""
    m = RX_TITULO.match(titulo or "")
    if not m:
        return None
    anio, mes = int(m.group("anio")), MESES.get(m.group("mes").lower())
    if not mes:
        return None
    try:
        fecha = dt.date(anio, mes, int(m.group("dia")))
    except ValueError:
        return None
    return {"numero": int(m.group("num")), "anio": anio, "fecha": fecha.isoformat()}
