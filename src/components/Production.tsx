import { useRef, useState } from "react";
import { partyVar, type Datos, type ProdFila } from "../data";
import { dec1, useLang, useT } from "../i18n";
import { rel, Section, Seg, Tooltip, useWidth, type Tip, Compartir } from "./ui";
import { Glosario } from "./Explainer";

const RANGOS = ["rdl", "ley", "ley_organica", "rdleg"] as const;

export function Production({ datos }: { datos: Datos }) {
  const t = useT();
  const [deriv, setDeriv] = useState<"con" | "sin">("con");
  const [grupo, setGrupo] = useState<"presidente" | "gobierno" | "legislatura">("presidente");
  const pctDe = (f: ProdFila) => (deriv === "sin" ? f.pct_rdl_sin_derivadas : f.pct_rdl);
  return (
    <Section id="decreto" title={t.prodTitulo} lede={t.prodLede}>
      <div className="legend">{RANGOS.map((r) => <span key={r}><i className={`sw r-${r}`} />{t.rangos[r]}&nbsp;&nbsp;</span>)}</div>
      <Composicion filas={datos.produccion.anio} />
      <Glosario terminos={["decreto_ley", "ley", "ley_organica", "rdleg"]} />
      <div className="head-row" style={{ marginTop: 28 }}>
        <h3 className="sub" style={{ margin: 0 }}>{t.prodPct}</h3>
        <Seg label={t.prodPct} value={deriv} onChange={setDeriv} options={[["con", t.conDerivadas], ["sin", t.sinDerivadas]]} />
      </div>
      <Proporcion filas={datos.produccion.anio} pct={pctDe} />
      <div className="head-row" style={{ marginTop: 28 }}>
        <h3 className="sub" style={{ margin: 0 }}>{t.prodPct}</h3>
        <Seg label={t.prodPct} value={grupo} onChange={setGrupo} options={[["presidente", t.grupos.presidente], ["gobierno", t.grupos.gobierno], ["legislatura", t.grupos.legislatura]]} />
      </div>
      <PorGrupo datos={datos} grupo={grupo} pct={pctDe} />
      <p className="note">{t.prodNota}</p>
    </Section>
  );
}

function Composicion({ filas }: { filas: ProdFila[] }) {
  const l = useLang(), t = useT();
  const [modo, setModo] = useState<"n" | "pct">("n");
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const H = 240, m = { t: 10, r: 8, b: 24, l: 36 };
  const ymax = modo === "pct" ? 100 : Math.ceil(Math.max(...filas.map((f) => f.total)) / 20) * 20;
  const ticks = modo === "pct" ? [0, 25, 50, 75, 100] : Array.from({ length: ymax / 40 + 1 }, (_, i) => i * 40);
  const Y = (v: number) => H - m.b - (v / ymax) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / filas.length;
  return (
    <>
    <div className="controls"><Seg label={t.prodTitulo} value={modo} onChange={setModo} options={[["n", t.numero], ["pct", t.porcentaje]]} /></div>
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.prodTitulo}>
          {ticks.map((v) => <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v}{modo === "pct" ? " %" : ""}</text></g>)}
          {filas.map((f, i) => {
            let acc = 0; const x = m.l + i * bw;
            return (
              <g key={f.anio} onPointerMove={(e) => {
                const [px, py] = rel(e, svgRef.current!);
                setTip({ x: px, y: py, content: <><div className="tt-h">{f.anio}{f.anio_incompleto ? ` (${t.incompleto})` : ""}</div>
                  {RANGOS.map((r) => <div key={r} className="row"><span>{t.rangos[r]}</span><b>{f[r]}</b></div>)}
                  <div className="row"><span>{t.prodPct}</span><b>{f.pct_rdl !== null ? `${dec1(f.pct_rdl, l)} %` : "—"}</b></div></> });
              }}>
                <rect x={x} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent" />
                {RANGOS.map((r) => { const v = modo === "pct" ? (100 * f[r]) / f.total : f[r]; if (!v) return null; const el = <rect key={r} x={x + 1} y={Y(acc + v)} width={Math.max(bw - 2, 1)} height={Math.max(Y(acc) - Y(acc + v) - 1, 0.5)} className={`sw r-${r}`} />; acc += v; return el; })}
                {f.anio_incompleto && <rect className="inc-mark" x={x + 1} y={Y(acc)} width={Math.max(bw - 2, 1)} height={Y(0) - Y(acc)} />}
                {f.anio! % 5 === 0 && <text className="tick" x={x + bw / 2} y={H - 8} textAnchor="middle">{f.anio}</text>}
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

function Proporcion({ filas, pct }: { filas: ProdFila[]; pct: (f: ProdFila) => number | null }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const H = 220, m = { t: 10, r: 10, b: 24, l: 40 };
  const X = (i: number) => m.l + (i + 0.5) * ((W - m.l - m.r) / filas.length);
  const Y = (v: number) => H - m.b - (v / 100) * (H - m.t - m.b);
  const pts = filas.map((f, i) => [X(i), Y(pct(f) ?? 0)] as const);
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.prodPct} onPointerMove={(e) => {
          const [px, py] = rel(e, svgRef.current!);
          const i = Math.max(0, Math.min(filas.length - 1, Math.round((px - m.l) / ((W - m.l - m.r) / filas.length) - 0.5)));
          const f = filas[i];
          setTip({ x: px, y: py, content: <><b>{f.anio}</b>: {pct(f) !== null ? `${dec1(pct(f)!, l)} %` : "—"}<br /><span className="soft">{f.rdl} / {f.total}{f.anio_incompleto ? ` · ${t.incompleto}` : ""}</span></> });
        }}>
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v} %</text></g>)}
          <path className="trace" d={`M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`} />
          {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} className={filas[i].anio_incompleto ? "dot inc" : "dot"} />)}
          {filas.map((f, i) => f.anio! % 5 === 0 && <text key={i} className="tick" x={X(i)} y={H - 8} textAnchor="middle">{f.anio}</text>)}
        </svg>
      )}
      <Compartir />
      <Tooltip tip={tip} width={W} />
    </div>
  );
}

function PorGrupo({ datos, grupo, pct }: { datos: Datos; grupo: "presidente" | "gobierno" | "legislatura"; pct: (f: ProdFila) => number | null }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const filas = datos.produccion[grupo].filter((f) => f.total >= 20)
    .sort((a, b) => (grupo === "legislatura" ? Number(a.id) - Number(b.id) : orden(a) - orden(b)));
  function orden(f: ProdFila) {
    const g = grupo === "gobierno" ? datos.govById(String(f.id)) : datos.govs.find((x) => x.presidente_id === f.id);
    return g?.iniDia ?? 0;
  }
  const nombre = (f: ProdFila) => grupo === "gobierno" ? datos.govById(String(f.id))?.nombre ?? f.id
    : grupo === "presidente" ? (datos.govs.find((x) => x.presidente_id === f.id)?.nombre.replace(/ [IVX]+$/, "") ?? f.id)
    : t.legNombre(datos.legislaturas.find((x) => String(x.n) === String(f.id))?.nombre ?? String(f.id));
  const color = (f: ProdFila) => grupo === "legislatura" ? "var(--trace)"
    : partyVar((grupo === "gobierno" ? datos.govById(String(f.id)) : datos.govs.find((x) => x.presidente_id === f.id))?.partidos[0] ?? "");
  const rh = 24, H = filas.length * rh + 22, l0 = W < 600 ? 104 : 150, r0 = 52;
  const X = (v: number) => l0 + (v / 100) * (W - l0 - r0);
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.prodPct}>
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line className="grid" x1={X(v)} x2={X(v)} y1={0} y2={H - 18} /><text className="tick" x={X(v)} y={H - 4} textAnchor="middle">{v} %</text></g>)}
          {filas.map((f, i) => {
            const y = i * rh + 2, v = pct(f) ?? 0;
            return (
              <g key={f.id} onPointerMove={(e) => {
                const [px, py] = rel(e, svgRef.current!);
                setTip({ x: px, y: py, content: <><b>{nombre(f)}</b><br />{RANGOS.map((r) => <div key={r} className="row"><span>{t.rangos[r]}</span><b>{f[r]}</b></div>)}</> });
              }}>
                <rect x={0} y={y - 2} width={W} height={rh} fill="transparent" />
                <text className="tick" x={l0 - 8} y={y + 12} textAnchor="end">{nombre(f)}</text>
                <rect x={l0} y={y} width={Math.max(X(v) - l0, 1)} height={16} rx={2} fill={color(f)} />
                <text className="lab" x={X(v) + 5} y={y + 12}>{dec1(v, l)} %</text>
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
