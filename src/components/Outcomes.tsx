import { useEffect, useMemo, useRef, useState } from "react";
import { cargarRdl, type Datos, type Rdl } from "../data";
import { dec1, int, useLang, useT } from "../i18n";
import { ymd } from "../lib/time";
import { GovCard, rel, Section, Seg, Tooltip, useWidth, type Tip, Compartir } from "./ui";
import { Glosario } from "./Explainer";

const CAPAS = ["conv_no", "conv_si", "derogado", "pendiente"] as const;
type Capa = typeof CAPAS[number];
const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);  // sólo la inicial (conserva «PL»)
const capa = (r: Rdl): Capa => r.convalidacion === "derogado" ? "derogado" : r.convalidacion === "convalidado" ? (r.tramitado_pl === "si" ? "conv_si" : "conv_no") : "pendiente";

export function Outcomes({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [rdl, setRdl] = useState<Rdl[] | null>(null);
  useEffect(() => { cargarRdl().then(setRdl); }, []);
  if (!rdl) return <Section id="despues" title={t.resTitulo} lede={t.resLede}><p className="loading">{t.cargando}</p></Section>;
  const conv = rdl.filter((r) => r.convalidacion === "convalidado").length;
  const der = rdl.filter((r) => r.convalidacion === "derogado").length;
  const pend = rdl.length - conv - der;
  const tramSi = rdl.filter((r) => r.tramitado_pl === "si").length, tramNo = rdl.filter((r) => r.tramitado_pl === "no").length;
  const pct = (a: number, b: number) => dec1((100 * a) / b, l);
  return (
    <Section id="despues" title={t.resTitulo} lede={t.resLede}>
      <div className="kpis">
        <div className="kpi"><b>{pct(conv, conv + der)} %</b><span>{t.resKpi.conv} · {t.resDen(conv + der)}</span></div>
        <div className="kpi"><b>{der}</b><span>{t.resKpi.derog} ({pct(der, conv + der)} %)</span></div>
        <div className="kpi"><b>{pend}</b><span>{t.resKpi.pend}</span></div>
        <div className="kpi"><b>{pct(tramSi, tramSi + tramNo)} %</b><span>{t.resKpi.tram} · {t.resDenTram(tramSi + tramNo)}</span></div>
      </div>
      <Flujo rdl={rdl} />
      <Glosario terminos={["aprobado", "convalidado", "derogado", "pendiente", "tramitado", "ley_aprobada", "caducado", "subsumido", "en_tramitacion"]} />
      <h3 className="sub">{t.resAnual}</h3>
      <p className="lede">{t.resAnualLede}</p>
      <Anual rdl={rdl} corteAnio={ymd(datos.corte)[0]} />
      <Glosario terminos={["convalidado", "tramitado", "derogado", "pendiente"]} />
      <h3 className="sub">{t.resPorGob}</h3>
      <PorGobierno datos={datos} rdl={rdl} />
      <Glosario terminos={["convalidado", "tramitado", "derogado", "pendiente"]} />
    </Section>
  );
}

/** Diagrama de flujo: aprobación → decisión de convalidación → tramitación como PL → resultado del PL. */
function Flujo({ rdl }: { rdl: Rdl[] }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cnt = (f: (r: Rdl) => boolean) => rdl.filter(f).length;
  const conv = (r: Rdl) => r.convalidacion === "convalidado";
  const tram = (r: Rdl) => conv(r) && r.tramitado_pl === "si";
  const res = (k: string) => (r: Rdl) => tram(r) && (r.resultado_pl ?? "en_tramitacion") === k;
  const cols: { k: string; n: number; f: (r: Rdl) => boolean; from?: string }[][] = [
    [{ k: "aprobados", n: rdl.length, f: () => true }],
    [{ k: "convalidados", n: cnt(conv), f: conv, from: "aprobados" }, { k: "derogados", n: cnt((r) => r.convalidacion === "derogado"), f: (r) => r.convalidacion === "derogado", from: "aprobados" },
      { k: "pendientes", n: cnt((r) => !["convalidado", "derogado"].includes(r.convalidacion)), f: (r) => !["convalidado", "derogado"].includes(r.convalidacion), from: "aprobados" }],
    [{ k: "tramitados", n: cnt(tram), f: tram, from: "convalidados" }, { k: "noTramitados", n: cnt((r) => conv(r) && r.tramitado_pl !== "si"), f: (r) => conv(r) && r.tramitado_pl !== "si", from: "convalidados" }],
    [{ k: "aprobada", n: cnt(res("aprobado")), f: res("aprobado"), from: "tramitados" }, { k: "caducado", n: cnt(res("caducado")), f: res("caducado"), from: "tramitados" },
      { k: "subsumido", n: cnt(res("subsumido")), f: res("subsumido"), from: "tramitados" }, { k: "enCurso", n: cnt(res("en_tramitacion")), f: res("en_tramitacion"), from: "tramitados" }],
  ];
  const narrow = W < 600, H = 280, padY = 14, gapN = 10, colW = 14;
  const scale = (H - 2 * padY - gapN * 3) / rdl.length;
  const xs = cols.map((_, i) => 4 + i * ((W - 8 - 150) / 3));
  const pos = new Map<string, { x: number; y: number; h: number; used: number }>();
  cols.forEach((c, i) => {
    // Cada columna se alinea con el nodo del que procede (para que los flujos sean horizontales)
    let y = i === 0 ? padY : (pos.get(c[0].from!)?.y ?? padY);
    for (const nodo of c) { pos.set(nodo.k, { x: xs[i], y, h: Math.max(nodo.n * scale, nodo.n ? 1.5 : 0), used: 0 }); y += nodo.n * scale + gapN; }
  });
  const links = cols.slice(1).flat().filter((n) => n.n).map((n) => {
    const a = pos.get(n.from!)!, b = pos.get(n.k)!, h = n.n * scale, y0 = a.y + a.used;
    a.used += h;
    const x0 = a.x + colW, x1 = b.x, mx = (x0 + x1) / 2;
    return { k: n.k, n: n.n, d: `M${x0},${y0}C${mx},${y0} ${mx},${b.y} ${x1},${b.y}L${x1},${b.y + h}C${mx},${b.y + h} ${mx},${y0 + h} ${x0},${y0 + h}Z` };
  });
  if (narrow) {
    // En móvil: una barra apilada por etapa, con sus cifras debajo (el diagrama de flujo no cabe con etiquetas legibles).
    const etapas = [cols[1], cols[2], cols[3]];
    return (
      <div className="flujo-movil" ref={ref}>
        {etapas.map((c, i) => {
          const tot = c.reduce((s2, x) => s2 + x.n, 0);
          return (
            <div key={i} className="etapa">
              <div className="etapa-t">{i === 0 ? `${int(rdl.length, l)} ${minus(t.flujo.aprobados)}` : `${int(tot, l)} ${minus(t.flujo[c[0].from!])}`}</div>
              <div className="barra">{c.filter((x) => x.n).map((x) => <span key={x.k} className={`node ${x.k}`} style={{ flexGrow: x.n }} />)}</div>
              <ul>{c.map((x) => <li key={x.k}><i className={`node ${x.k}`} /><b>{int(x.n, l)}</b> {t.flujo[x.k]}</li>)}</ul>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="chart flujo" ref={ref} onPointerLeave={() => setTip(null)}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.resTitulo}>
          {links.map((lk) => <path key={lk.k} d={lk.d} className={`link ${lk.k}`} onPointerMove={(e) => { const [x, y] = rel(e, svgRef.current!); setTip({ x, y, content: <><b>{int(lk.n, l)}</b> · {t.flujo[lk.k]}</> }); }} />)}
          {cols.flat().map((n) => {
            const p = pos.get(n.k)!;
            if (!n.n) return null;
            return (
              <g key={n.k}>
                <rect x={p.x} y={p.y} width={colW} height={p.h} rx={2} className={`node ${n.k}`} />
                <text className="lab" x={p.x + colW + 6} y={p.y + Math.min(p.h / 2, 14) + 4}><tspan className="strong">{int(n.n, l)}</tspan> {t.flujo[n.k]}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Compartir />
      <Tooltip tip={tip} width={W} />
    </div>
  );
}

function Leyenda() {
  const t = useT();
  return <div className="legend">{CAPAS.map((c) => <span key={c}><i className={`sw ${c}`} />{t.capas[c]}&nbsp;&nbsp;</span>)}</div>;
}

function Anual({ rdl, corteAnio }: { rdl: Rdl[]; corteAnio: number }) {
  const l = useLang(), t = useT();
  const [modo, setModo] = useState<"n" | "pct">("n");
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const filas = useMemo(() => {
    const m = new Map<number, Record<Capa, number>>();
    for (const r of rdl) {
      const y = Math.max(r.anio, 1979);  // el RDL 50/1978 (29/12/1978) se agrupa con 1979
      const o = m.get(y) ?? { conv_no: 0, conv_si: 0, derogado: 0, pendiente: 0 };
      o[capa(r)]++; m.set(y, o);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rdl]);
  const H = 260, mg = { t: 10, r: 8, b: 24, l: 40 };
  const tot = (o: Record<Capa, number>) => CAPAS.reduce((s, c) => s + o[c], 0);
  const ymax = modo === "pct" ? 100 : Math.ceil(Math.max(...filas.map(([, o]) => tot(o))) / 10) * 10;
  const Y = (v: number) => H - mg.b - (v / ymax) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / filas.length;
  return (
    <>
      <div className="controls"><Seg label={t.resAnual} value={modo} onChange={setModo} options={[["n", t.numero], ["pct", t.porcentaje]]} /><Leyenda /></div>
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.resAnual}>
            {Array.from({ length: (modo === "pct" ? 4 : ymax / 10) + 1 }, (_, i) => i * (modo === "pct" ? 25 : 10)).map((v) => <g key={v}><line className="grid" x1={mg.l} x2={W - mg.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={mg.l - 6} y={Y(v) + 4} textAnchor="end">{v}{modo === "pct" ? " %" : ""}</text></g>)}
            {filas.map(([y, o], i) => {
              const total = tot(o); let acc = 0;
              const x = mg.l + i * bw;
              return (
                <g key={y} onPointerMove={(e) => {
                  const [px, py] = rel(e, svgRef.current!);
                  setTip({ x: px, y: py, content: <><div className="tt-h">{y}{y === corteAnio ? ` (${t.incompleto})` : ""}</div>{CAPAS.map((c) => <div key={c} className="row"><span>{t.capas[c]}</span><b>{o[c]}</b></div>)}</> });
                }}>
                  <rect x={x} y={mg.t} width={bw} height={H - mg.t - mg.b} fill="transparent" />
                  {CAPAS.map((c) => {
                    const v = modo === "pct" ? (100 * o[c]) / total : o[c];
                    if (!v) return null;
                    const r = <rect key={c} x={x + 1} y={Y(acc + v)} width={Math.max(bw - 2, 1)} height={Math.max(Y(acc) - Y(acc + v) - 1, 0.5)} className={`sw ${c}`} />;
                    acc += v; return r;
                  })}
                  {y === corteAnio && <rect className="inc-mark" x={x + 1} y={Y(acc)} width={Math.max(bw - 2, 1)} height={Y(0) - Y(acc)} />}
                  {(y % 5 === 0) && <text className="tick" x={x + bw / 2} y={H - 8} textAnchor="middle">{y}</text>}
                </g>
              );
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      <p className="note">{l === "es" ? "Porcentajes sobre todos los decretos-leyes del año; los pendientes se muestran aparte." : "Shares over all decree-laws of the year; pending ones are shown separately."}</p>
    </>
  );
}

function PorGobierno({ datos, rdl }: { datos: Datos; rdl: Rdl[] }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const filas = datos.govs.map((g) => {
    const o: Record<Capa, number> = { conv_no: 0, conv_si: 0, derogado: 0, pendiente: 0 };
    for (const r of rdl) if (r.gobierno === g.id) o[capa(r)]++;
    return { g, o, n: CAPAS.reduce((s, c) => s + o[c], 0) };
  });
  const rh = 24, H = filas.length * rh + 6, l0 = W < 600 ? 88 : 110, r0 = 40;
  const X = (p: number) => l0 + (p / 100) * (W - l0 - r0);
  return (
    <>
      <Leyenda />
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.resPorGob}>
            {filas.map(({ g, o, n }, i) => {
              let acc = 0; const y = i * rh + 3;
              return (
                <g key={g.id} onPointerMove={(e) => {
                  const [px, py] = rel(e, svgRef.current!);
                  setTip({ x: px, y: py, content: <><GovCard g={g} l={l} t={t} /><br />{CAPAS.map((c) => <div key={c} className="row"><span>{t.capas[c]}</span><b>{o[c]}</b></div>)}</> });
                }}>
                  <rect x={0} y={y - 3} width={W} height={rh} fill="transparent" />
                  <text className="tick" x={l0 - 8} y={y + 12} textAnchor="end">{g.nombre}</text>
                  {CAPAS.map((c) => { const p = (100 * o[c]) / n; if (!p) return null; const r = <rect key={c} x={X(acc)} y={y} width={Math.max(X(acc + p) - X(acc) - 1, 0.5)} height={16} className={`sw ${c}`} />; acc += p; return r; })}
                  <text className="tick" x={W - r0 + 6} y={y + 12}>{n}</text>
                </g>
              );
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
    </>
  );
}
