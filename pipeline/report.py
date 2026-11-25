"""Informe exploratorio (fase 3): HTML autónomo con gráficos SVG generados sin dependencias.

Uso: python3 -m pipeline.report  →  docs/exploratorio.html
No es la web final: sirve para revisar patrones y detectar errores.
"""
from __future__ import annotations

import csv
import datetime as dt
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLEAN, DERIVED, OUT = ROOT / "data" / "clean", ROOT / "data" / "derived", ROOT / "docs" / "exploratorio.html"
D = dt.date.fromisoformat
INICIO = dt.date(1978, 12, 29)
# Colores provisionales (la identidad definitiva se decide en la fase 4).
PARTIDO = {"UCD": "#2f9e6e", "PSOE": "#d6453d", "PP": "#2a78d6"}
GRIS = "#9a9890"


def esc(s):
    return html.escape(str(s))


def read(name):
    with open(CLEAN / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def j(name):
    return json.loads((DERIVED / f"{name}.json").read_text())


class Plot:
    """Lienzo SVG mínimo con escalas lineales."""

    def __init__(self, w, h, x0, x1, y0, y1, m=(16, 16, 34, 44)):
        self.w, self.h, self.m = w, h, m  # m = top, right, bottom, left
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1
        self.parts = []

    def X(self, v):
        t, r, b, l = self.m
        return l + (v - self.x0) / (self.x1 - self.x0) * (self.w - l - r)

    def Y(self, v):
        t, r, b, l = self.m
        return self.h - b - (v - self.y0) / (self.y1 - self.y0) * (self.h - t - b)

    def add(self, s):
        self.parts.append(s)

    def yaxis(self, ticks, fmt=lambda v: f"{v:g}"):
        t, r, b, l = self.m
        for v in ticks:
            y = self.Y(v)
            self.add(f'<line x1="{l}" x2="{self.w - r}" y1="{y:.1f}" y2="{y:.1f}" class="grid"/>'
                     f'<text x="{l - 6}" y="{y + 4:.1f}" class="tick" text-anchor="end">{fmt(v)}</text>')

    def xticks(self, ticks):
        for v, lab in ticks:
            x = self.X(v)
            self.add(f'<text x="{x:.1f}" y="{self.h - self.m[2] + 16}" class="tick" text-anchor="middle">{esc(lab)}</text>')

    def svg(self, title=""):
        return (f'<svg viewBox="0 0 {self.w} {self.h}" role="img" aria-label="{esc(title)}">'
                + "".join(self.parts) + "</svg>")


def fecha_num(d):
    return (d - INICIO).days


def color_gob(g):
    return PARTIDO.get(g["partidos"].split(";")[0], GRIS)


def anio_ticks(a=1980, b=2026, paso=5):
    return [(fecha_num(dt.date(y, 1, 1)), str(y)) for y in range(a, b + 1, paso)]


# ----------------------------------------------------------------------------- gráficos
def g_timeline(serie, gobs, legs, rdl):
    n = len(serie)
    ymax = 16
    p = Plot(1100, 340, 0, n, 0, ymax)
    corte = D(serie[-1]["fecha"])
    for g in gobs:
        a = max(D(g["fecha_inicio"]), INICIO)
        b = D(g["fecha_fin"]) if g["fecha_fin"] else corte
        p.add(f'<rect x="{p.X(fecha_num(a)):.1f}" y="{p.m[0]}" width="{p.X(fecha_num(b)) - p.X(fecha_num(a)):.1f}" '
              f'height="10" fill="{color_gob(g)}" opacity=".85"><title>{esc(g["gobierno_id"])}</title></rect>')
    for l in legs:
        if l["fecha_disolucion"]:
            nxt = next((x for x in legs if int(x["legislatura"]) == int(l["legislatura"]) + 1), None)
            a, b = D(l["fecha_disolucion"]), min(D(nxt["fecha_constitucion"]), corte)
            p.add(f'<rect x="{p.X(fecha_num(a)):.1f}" y="{p.Y(ymax):.1f}" width="{max(p.X(fecha_num(b)) - p.X(fecha_num(a)), 1.5):.1f}" '
                  f'height="{p.Y(0) - p.Y(ymax):.1f}" class="band"><title>Cortes disueltas {a} → {b}</title></rect>')
    p.yaxis(range(0, ymax + 1, 4))
    pts = " ".join(f"{p.X(i):.1f},{p.Y(int(r['m30'])):.1f}" for i, r in enumerate(serie))
    p.add(f'<polygon points="{p.X(0):.1f},{p.Y(0):.1f} {pts} {p.X(n - 1):.1f},{p.Y(0):.1f}" class="area"/>')
    p.add(f'<polyline points="{pts}" class="line"/>')
    top = max(serie, key=lambda r: (int(r["m30"]), r["fecha"]))
    i = serie.index(top)
    p.add(f'<circle cx="{p.X(i):.1f}" cy="{p.Y(int(top["m30"])):.1f}" r="4" class="dot"/>'
          f'<text x="{p.X(i) - 8:.1f}" y="{p.Y(int(top["m30"])) + 4:.1f}" class="lab" text-anchor="end">'
          f'Máximo: {top["m30"]} RDL en 30 días ({top["fecha"]})</text>')
    p.xticks(anio_ticks())
    return p.svg("RDL aprobados en los últimos 30 días")


def g_anual(rdl, corte):
    import collections
    c = collections.Counter(D(r["fecha_aprobacion"]).year for r in rdl)
    c[1979] += c.pop(1978, 0)
    anios = list(range(1979, corte.year + 1))
    p = Plot(1100, 260, 1978.4, corte.year + 0.6, 0, 50)
    p.yaxis(range(0, 51, 10))
    bw = p.X(1) - p.X(0) - 3
    for y in anios:
        v = c.get(y, 0)
        cls = "bar inc" if y == corte.year else "bar"
        p.add(f'<rect x="{p.X(y) - bw / 2:.1f}" y="{p.Y(v):.1f}" width="{bw:.1f}" height="{p.Y(0) - p.Y(v):.1f}" '
              f'class="{cls}" rx="2"><title>{y}: {v} RDL{" (año en curso)" if y == corte.year else ""}</title></rect>')
    p.xticks([(y, str(y)) for y in range(1980, corte.year + 1, 5)])
    return p.svg("RDL por año natural")


def g_comparacion(comp, gobs):
    by = {g["gobierno_id"]: g for g in gobs}
    rows = sorted(comp["gobierno"], key=lambda m: -m["media_anualizada"])
    h = 26 * len(rows) + 40
    p = Plot(760, h, 0, 35, 0, 1, m=(10, 60, 26, 120))
    for v in range(0, 36, 5):
        x = p.X(v)
        p.add(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="10" y2="{h - 26}" class="grid"/>'
              f'<text x="{x:.1f}" y="{h - 10}" class="tick" text-anchor="middle">{v}</text>')
    for i, m in enumerate(rows):
        y = 14 + i * 26
        g = by[m["id"]]
        corto = m["dias_exposicion"] < 365
        p.add(f'<text x="114" y="{y + 13}" class="tick" text-anchor="end">{esc(m["id"])}</text>'
              f'<rect x="{p.X(0):.1f}" y="{y}" width="{p.X(m["media_anualizada"]) - p.X(0):.1f}" height="18" rx="2" '
              f'fill="{color_gob(g)}" opacity="{.45 if corto else 1}"><title>{esc(m["id"])}: {m["media_anualizada"]:.1f} RDL/año '
              f'({m["n"]} en {m["dias_exposicion"]} días)</title></rect>'
              f'<text x="{p.X(m["media_anualizada"]) + 5:.1f}" y="{y + 13}" class="lab">{m["media_anualizada"]:.1f}'
              f'{" · <365 días" if corto else ""}</text>')
    return p.svg("RDL anualizados por gobierno")


def g_acumuladas(perf, gobs):
    by = {g["gobierno_id"]: g for g in gobs}
    xmax = 1800
    p = Plot(1100, 380, 0, xmax, 0, 100, m=(16, 120, 34, 44))
    p.yaxis(range(0, 101, 20))
    for pf in perf:
        if pf["parcial_antes_de_1978"]:
            continue
        a = pf["acumulado"][:xmax]
        pts = " ".join(f"{p.X(i):.1f},{p.Y(v):.1f}" for i, v in enumerate(a) if i % 3 == 0 or i == len(a) - 1)
        hl = pf["gobierno_id"] in ("sanchez_3", "aznar_1", "sanchez_2", "rajoy_1", "gonzalez_2")
        p.add(f'<polyline points="{pts}" fill="none" stroke="{color_gob(by[pf["gobierno_id"]])}" '
              f'stroke-width="{2 if hl else 1.2}" opacity="{1 if hl else .45}"><title>{esc(pf["gobierno_id"])}: '
              f'{a[-1]} RDL en {len(a)} días</title></polyline>')
        if hl:
            p.add(f'<text x="{p.X(len(a) - 1) + 5:.1f}" y="{p.Y(a[-1]) + 4:.1f}" class="lab">{esc(pf["gobierno_id"])}</text>')
    p.xticks([(d, f"día {d}") for d in (0, 365, 730, 1095, 1461)])
    return p.svg("RDL acumulados desde el primer día de cada gobierno")


def g_heatmap(perf):
    rows = [pf for pf in perf if not pf["parcial_antes_de_1978"]]
    ncol = max(len(pf["por_mes_de_mandato"]) for pf in rows)
    cw, rh, left = 15, 18, 110
    w, h = left + ncol * cw + 20, 30 + rh * len(rows)
    out = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Mapa de calor por mes de mandato">']
    vmax = 9
    for i, pf in enumerate(rows):
        y = 6 + i * rh
        out.append(f'<text x="{left - 6}" y="{y + 12}" class="tick" text-anchor="end">{esc(pf["gobierno_id"])}</text>')
        for k, v in enumerate(pf["por_mes_de_mandato"]):
            op = 0.06 if v == 0 else 0.2 + 0.8 * min(v, vmax) / vmax
            out.append(f'<rect x="{left + k * cw}" y="{y}" width="{cw - 2}" height="{rh - 2}" rx="2" class="cell" '
                       f'fill-opacity="{op:.2f}"><title>{esc(pf["gobierno_id"])} · mes {k + 1}: {v} RDL</title></rect>')
    for k in range(0, ncol, 12):
        out.append(f'<text x="{left + k * cw + 6}" y="{h - 6}" class="tick" text-anchor="middle">{k}</text>')
    out.append("</svg>")
    return "".join(out)


def g_fin_mandato(fm):
    p = Plot(1100, 380, -365, 120, 0, 50, m=(16, 150, 34, 44))
    p.yaxis(range(0, 51, 10))
    p.add(f'<rect x="{p.X(0):.1f}" y="{p.Y(50):.1f}" width="{p.X(54) - p.X(0):.1f}" height="{p.Y(0) - p.Y(50):.1f}" class="band"/>')
    p.add(f'<line x1="{p.X(0):.1f}" x2="{p.X(0):.1f}" y1="{p.Y(50):.1f}" y2="{p.Y(0):.1f}" class="zero"/>'
          f'<text x="{p.X(2):.1f}" y="{p.Y(48):.1f}" class="lab">disolución (día 0) → ~54 días hasta elecciones</text>')
    for c in fm:
        if c["legislatura_corta"]:
            continue
        curva = c["curva_desde_menos365"]
        actual = c["en_curso"]
        pts = " ".join(f"{p.X(k - 365):.1f},{p.Y(v):.1f}" for k, v in enumerate(curva))
        p.add(f'<polyline points="{pts}" fill="none" stroke="{"#d6453d" if actual else GRIS}" '
              f'stroke-width="{2.5 if actual else 1.2}" opacity="{1 if actual else .6}"><title>{esc(c["ciclo_id"])} '
              f'({esc(c["gobierno_saliente"])})</title></polyline>')
        k = len(curva) - 1
        if actual or c["fecha_disolucion"] in ("2019-03-05", "1982-08-31"):
            p.add(f'<text x="{p.X(k - 365) + 5:.1f}" y="{p.Y(curva[-1]) + 4:.1f}" class="lab">'
                  f'{c["fecha_disolucion"][:4]} {esc(c["gobierno_saliente"])}</text>')
    p.xticks([(d, f"{d:+d}" if d else "0") for d in (-365, -270, -180, -90, 0, 60, 120)])
    return p.svg("RDL acumulados alrededor de la disolución")


def g_fin_barras(fm):
    rows = [c for c in fm if not c["legislatura_corta"]]
    h = 30 * len(rows) + 50
    p = Plot(760, h, 0, 11, 0, 1, m=(24, 40, 26, 170))
    for v in range(0, 12, 2):
        x = p.X(v)
        p.add(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="20" y2="{h - 26}" class="grid"/>'
              f'<text x="{x:.1f}" y="{h - 10}" class="tick" text-anchor="middle">{v}</text>')
    p.add('<text x="170" y="14" class="lab">RDL por 30 días · ■ media de la legislatura  ■ Cortes disueltas</text>')
    for i, c in enumerate(rows):
        y = 26 + i * 30
        p.add(f'<text x="164" y="{y + 15}" class="tick" text-anchor="end">{c["fecha_disolucion"]} {esc(c["gobierno_saliente"])}</text>')
        for k, (v, cls) in enumerate(((c["legislatura_tasa30"], "b1"), (c["disueltas_tasa30"], "b2"))):
            p.add(f'<rect x="{p.X(0):.1f}" y="{y + k * 11}" width="{max(p.X(v or 0) - p.X(0), 1):.1f}" height="9" rx="2" class="{cls}">'
                  f'<title>{"legislatura" if k == 0 else "Cortes disueltas"}: {v}</title></rect>')
        p.add(f'<text x="{p.X(max(c["legislatura_tasa30"], c["disueltas_tasa30"])) + 5:.1f}" y="{y + 15}" class="lab">'
              f'{c["disueltas_n"]} RDL en {c["disueltas_dias"]} d · ×{c["ratio_disueltas_vs_legislatura"]:.2f}</text>')
    return p.svg("Ritmo con Cortes disueltas frente a la media de la legislatura")


def g_resultados(res):
    rows = res["anio"]
    p = Plot(1100, 280, 1978.4, 2026.6, 0, 50)
    p.yaxis(range(0, 51, 10))
    bw = p.X(1) - p.X(0) - 3
    capas = (("conv_no", "Convalidado", "s1"), ("conv_si", "Convalidado y tramitado como PL", "s2"),
             ("derogado", "Derogado", "s3"), ("pendiente", "Pendiente", "s4"))
    for r in rows:
        y = int(r["id"])
        vals = {"conv_no": r.get("convalidado", 0) - r.get("tram_si", 0) + (r.get("tram_si", 0) - min(r.get("tram_si", 0), r.get("convalidado", 0))),
                "conv_si": min(r.get("tram_si", 0), r.get("convalidado", 0)),
                "derogado": r.get("derogado", 0), "pendiente": r.get("pendiente", 0) + r.get("desconocido", 0)}
        base = 0
        for k, lab, cls in capas:
            v = vals[k]
            if v:
                p.add(f'<rect x="{p.X(y) - bw / 2:.1f}" y="{p.Y(base + v):.1f}" width="{bw:.1f}" '
                      f'height="{p.Y(base) - p.Y(base + v) - 1:.1f}" class="{cls}"><title>{y} · {lab}: {v}</title></rect>')
            base += v
    p.xticks([(y, str(y)) for y in range(1980, 2027, 5)])
    ley = "".join(f'<span class="key {c}"></span>{esc(l)} ' for _, l, c in capas)
    return f'<p class="legend">{ley}</p>' + p.svg("Resultado parlamentario por año de aprobación")


def g_produccion(prod):
    rows = prod["anio"]
    p = Plot(1100, 260, 1978.4, 2026.6, 0, 100)
    p.yaxis(range(0, 101, 25), fmt=lambda v: f"{v:g} %")
    pts = " ".join(f"{p.X(r['anio']):.1f},{p.Y(r['pct_rdl']):.1f}" for r in rows)
    p.add(f'<polyline points="{pts}" class="line"/>')
    pts2 = " ".join(f"{p.X(r['anio']):.1f},{p.Y(r['pct_rdl_sin_derivadas']):.1f}" for r in rows)
    p.add(f'<polyline points="{pts2}" class="line2"/>')
    for r in rows:
        p.add(f'<circle cx="{p.X(r["anio"]):.1f}" cy="{p.Y(r["pct_rdl"]):.1f}" r="3" class="dot"><title>{r["anio"]}: '
              f'{r["pct_rdl"]} % ({r["rdl"]} RDL de {r["total"]} normas con rango de ley; '
              f'{r["leyes_derivadas_de_rdl"]} leyes derivadas de RDL){" — año en curso" if r["anio_incompleto"] else ""}</title></circle>')
    p.xticks([(y, str(y)) for y in range(1980, 2027, 5)])
    return ('<p class="legend"><span class="key s1"></span>RDL / (leyes + LO + RDLeg + RDL) '
            '<span class="key dash"></span>Sin contar leyes derivadas de RDL</p>' + p.svg("Peso de los RDL"))


IZQ = {"sanchez_3", "zapatero_1", "gonzalez_4"}  # etiquetas a la izquierda para evitar solapes


def g_dispersion(may, gobs):
    by = {g["gobierno_id"]: g for g in gobs}
    p = Plot(760, 420, 20, 62, 0, 35, m=(16, 70, 40, 44))
    p.yaxis(range(0, 36, 5))
    for v in range(20, 61, 10):
        p.add(f'<text x="{p.X(v):.1f}" y="{420 - 18}" class="tick" text-anchor="middle">{v} %</text>')
    p.add(f'<line x1="{p.X(50.29):.1f}" x2="{p.X(50.29):.1f}" y1="16" y2="{p.Y(0):.1f}" class="zero"/>'
          f'<text x="{p.X(50.29) + 4:.1f}" y="28" class="lab">mayoría absoluta (176)</text>')
    for pt in may["puntos"]:
        if pt["dias"] < 365:
            continue
        g = by[pt["gobierno_id"]]
        x, y = p.X(pt["pct_escanos"]), p.Y(pt["media_anualizada"])
        shape = (f'<rect x="{x - 5:.1f}" y="{y - 5:.1f}" width="10" height="10" fill="{color_gob(g)}" class="ring"/>'
                 if pt["tipo"] == "coalicion" else f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5.5" fill="{color_gob(g)}" class="ring"/>')
        izq = pt["gobierno_id"] in IZQ
        lab = (f'<text x="{x - 8:.1f}" y="{y + 4:.1f}" class="lab" text-anchor="end">' if izq
               else f'<text x="{x + 8:.1f}" y="{y + 4:.1f}" class="lab">') + esc(pt["gobierno_id"]) + "</text>"
        p.add(f'<g><title>{esc(pt["gobierno_id"])}: {pt["pct_escanos"]} % escaños, {pt["media_anualizada"]} RDL/año</title>'
              f'{shape}{lab}</g>')
    return p.svg("Escaños del Gobierno y RDL anualizados")


CSS = """
:root{--bg:#fcfcfb;--fg:#1b1b1a;--soft:#5c5b57;--grid:#e6e5e0;--band:#00000010;--acc:#2a78d6}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#efeee9;--soft:#b5b4ad;--grid:#2e2e2c;--band:#ffffff14;--acc:#5a9cef}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:1120px;margin:0 auto;padding:16px}
h1{font-size:26px;margin:.2em 0}h2{font-size:19px;margin:2em 0 .3em}p{max-width:75ch;color:var(--soft)}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--soft);font-size:11px}.lab{fill:var(--fg);font-size:11px}
.area{fill:var(--acc);opacity:.18}.line{fill:none;stroke:var(--acc);stroke-width:1.5}.line2{fill:none;stroke:var(--soft);stroke-width:1.5;stroke-dasharray:4 3}
.dot{fill:var(--acc)}.band{fill:var(--band)}.zero{stroke:var(--soft);stroke-dasharray:3 3}
.bar{fill:var(--acc)}.bar.inc{fill:var(--acc);opacity:.5}.cell{fill:var(--acc)}
.s1{fill:#9db8d9;background:#9db8d9}.s2{fill:#2a78d6;background:#2a78d6}.s3{fill:#e34948;background:#e34948}.s4{fill:#eda100;background:#eda100}
.b1{fill:#9a9890}.b2{fill:#d6453d}.ring{stroke:var(--bg);stroke-width:2}
.key{display:inline-block;width:12px;height:12px;border-radius:2px;margin:0 4px 0 12px;vertical-align:-1px}.key.dash{background:none;border-top:2px dashed var(--soft);height:0;width:18px}
.legend{font-size:13px}table{border-collapse:collapse;font-size:12.5px;margin:8px 0;font-variant-numeric:tabular-nums}
td,th{padding:3px 8px;border-bottom:1px solid var(--grid);text-align:right}th:first-child,td:first-child{text-align:left}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}
.kpi{border:1px solid var(--grid);border-radius:8px;padding:10px 12px}.kpi b{display:block;font-size:24px}.kpi span{color:var(--soft);font-size:12.5px}
"""


def tabla(rows, cols):
    th = "".join(f"<th>{esc(c[1])}</th>" for c in cols)
    trs = "".join("<tr>" + "".join(f"<td>{esc(r.get(c[0]) if r.get(c[0]) is not None else '—')}</td>" for c in cols) + "</tr>"
                  for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def build():
    serie, gobs, legs, rdl = read("serie_diaria.csv"), read("gobiernos.csv"), read("legislaturas.csv"), read("rdl.csv")
    comp, perf, fm, res, prod, may, dest = (j(n) for n in ("comparacion", "perfiles", "fin_de_mandato", "resultados",
                                                           "produccion", "mayorias", "destacados"))
    corte = D(dest["corte"])
    kpi = lambda v, t: f'<div class="kpi"><b>{esc(v)}</b><span>{esc(t)}</span></div>'  # noqa: E731
    gmax = dest["gobierno_max_anualizada"]
    gmax_365 = max((m for m in comp["gobierno"] if m["dias_exposicion"] >= 365), key=lambda m: m["media_anualizada"])
    body = [
        "<h1>Decreto-ley · análisis exploratorio (fase 3)</h1>",
        f"<p>Corte de datos: {corte}. Documento de trabajo para revisar patrones y posibles errores; no es la web final. "
        "Colores provisionales por partido del presidente. Pasa el cursor sobre las marcas para ver valores.</p>",
        '<div class="kpis">', kpi(dest["total"], "RDL desde el 29/12/1978"),
        kpi(dest["media_anual_historica"], "media anual histórica"),
        kpi(dest["ultimos_30d"], "en los últimos 30 días"), kpi(dest["ultimos_365d"], "en los últimos 365 días"),
        kpi(f'{dest["record_30d"]["valor"]}', f'récord en 30 días (hasta {dest["record_30d"]["fecha_fin"]})'),
        kpi(f'{gmax_365["media_anualizada"]:.1f}', f'máx. anualizado ({gmax_365["id"]}; mandatos ≥ 1 año)'),
        "</div>",
        "<h2>A. Timeline · RDL en los últimos 30 días</h2><p>Franja superior: gobiernos (color del partido del presidente). "
        "Bandas grises: Cortes disueltas.</p>", g_timeline(serie, gobs, legs, rdl),
        "<h2>RDL por año natural</h2><p>El año en curso aparece atenuado (incompleto).</p>", g_anual(rdl, corte),
        "<h2>B. Comparación entre gobiernos · RDL por año de mandato efectivo</h2>"
        f"<p>El de mayor intensidad bruta es {esc(gmax['id'])} ({gmax['valor']:.1f}), pero con sólo 92 días de exposición "
        "(Cortes disueltas y en funciones); los mandatos de menos de un año aparecen atenuados.</p>",
        g_comparacion(comp, gobs),
        tabla(comp["gobierno"], [("id", "Gobierno"), ("n", "RDL"), ("dias_exposicion", "Días"), ("media_semanal", "Media sem."),
                                 ("media_mensual", "Media mes"), ("media_anualizada", "Anualizada"), ("max_semana", "Máx. semana"),
                                 ("max_mes", "Máx. mes"), ("max_30d", "Máx. 30 d"), ("pct_semanas_sin_rdl", "% semanas sin"),
                                 ("pct_meses_sin_rdl", "% meses sin"), ("dias_entre_aprobaciones_media", "Días entre fechas")]),
        "<h3>Por presidente</h3>",
        tabla(comp["presidente"], [("etiqueta", "Presidente"), ("n", "RDL"), ("dias_exposicion", "Días"),
                                   ("media_anualizada", "Anualizada"), ("max_mes", "Máx. mes"), ("max_30d", "Máx. 30 d"),
                                   ("pct_meses_sin_rdl", "% meses sin")]),
        "<h2>C. Perfil temporal · acumulado desde el día 0 de cada gobierno</h2>", g_acumuladas(perf, gobs),
        "<h2>Mapa de calor · RDL por mes de mandato</h2><p>Columnas = meses transcurridos desde el inicio (no se prolongan "
        "las series de gobiernos terminados).</p>", g_heatmap(perf),
        "<h2>Fin de mandato · acumulado alineado en la disolución</h2><p>Se cuentan los RDL desde 365 días antes de la "
        "disolución. En rojo, el ciclo en curso (2026). Se omiten los ciclos con legislatura de menos de 180 días.</p>",
        g_fin_mandato(fm), g_fin_barras(fm),
        tabla(fm, [("fecha_disolucion", "Disolución"), ("gobierno_saliente", "Gobierno"), ("legislatura_tasa30", "Legislatura /30 d"),
                   ("previos90_n", "90 d previos"), ("disueltas_n", "Disueltas (n)"), ("disueltas_dias", "días"),
                   ("disueltas_tasa30", "/30 d"), ("igual_tiempo_n", f"Primeros {fm[-1]['igual_tiempo_dias']} d"),
                   ("funciones_n", "En funciones tras elecciones"), ("ratio_disueltas_vs_legislatura", "Ratio")]),
        "<h2>D. ¿Qué sucede después? · resultado por año de aprobación</h2>", g_resultados(res),
        tabla(res["gobierno"], [("id", "Gobierno"), ("n", "RDL"), ("convalidado", "Convalidados"), ("derogado", "Derogados"),
                                ("pendiente", "Pendientes"), ("pct_derogado", "% derogados*"), ("tram_si", "Tramitados PL"),
                                ("pct_tramitado_pl", "% tramitados**"), ("pl_aprobado", "PL aprobados"), ("pl_caducado", "PL caducados")]),
        "<p>* sobre convalidados + derogados. ** sobre RDL con decisión de tramitación conocida.</p>",
        "<h2>E. Gobernar por decreto · peso de los RDL en las normas con rango de ley</h2>", g_produccion(prod),
        "<h2>F. Mayoría parlamentaria y decreto-ley</h2><p>Escaños de los partidos del Gobierno al inicio de la legislatura "
        "en que se forma (sin apoyos externos). Círculo = monocolor; cuadrado = coalición. Gobiernos con ≥ 365 días.</p>",
        g_dispersion(may, gobs),
        tabla([{"grupo": f"{k} = {kk}", **vv} for k, v in may["agregados"].items() for kk, vv in v.items()],
              [("grupo", "Grupo"), ("gobiernos", "Gobiernos"), ("n", "RDL"), ("dias", "Días"),
               ("media_anualizada_ponderada", "RDL/año (ponderado)")]),
        "<p>Asociación descriptiva con 16 gobiernos; sólo dos coaliciones, ambas del mismo presidente y en un periodo "
        "con pandemia y crisis energética. No permite conclusiones causales.</p>",
    ]
    OUT.write_text(f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" '
                   f'content="width=device-width,initial-scale=1"><title>Decreto-ley · exploratorio</title>'
                   f'<style>{CSS}</style></head><body>{"".join(body)}</body></html>', encoding="utf-8")
    return OUT


if __name__ == "__main__":
    print(build())
