import { useMemo, useRef, useState } from "react";
import { cumulative } from "../lib/agg";
import { toDay } from "../lib/time";
import type { Datos } from "../data";
import { fmtDia, useLang, useT } from "../i18n";
import { rel, Section, Seg, Tooltip, useQuery, useWidth, type Tip, Compartir } from "./ui";

type Origen = "disolucion" | "anuncio";

interface Curva { id: string; anio: string; gob: string; actual: boolean; curva: number[]; elec: number; origen: number }

export function useCiclos(datos: Datos, origen: Origen, xmax: number): Curva[] {
  return useMemo(() => datos.ciclos.map((c) => {
    const d0 = toDay(origen === "anuncio" ? c.anuncio : c.disolucion);
    const ng = c.nuevo_gobierno ? toDay(c.nuevo_gobierno) - 1 : undefined;
    const elec = toDay(c.elecciones);
    return {
      id: c.id, anio: c.disolucion.slice(0, 4), gob: datos.govById(c.saliente)?.nombre ?? c.saliente,
      actual: !c.nuevo_gobierno && datos.corte < elec, curva: cumulative(datos.serie, d0, xmax, ng), elec: elec - d0, origen: d0,
    };
  }), [datos, origen, xmax]);
}

export function EndOfTerm({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [origen, setOrigen] = useQuery<Origen>("origen", "disolucion", ["disolucion", "anuncio"]);
  const xmax = origen === "anuncio" ? 150 : 120;
  const C = useCiclos(datos, origen, xmax);
  const cur = C.find((c) => c.actual);
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [k, setK] = useState<number | null>(null);
  const [near, setNear] = useState<string | null>(null);

  const H = W < 600 ? 300 : 360, m = { t: 16, r: W < 600 ? 60 : 90, b: 30, l: 30 };
  const ymax = Math.max(20, Math.ceil(Math.max(...C.map((c) => c.curva.at(-1) ?? 0)) / 5) * 5);
  const X = (d: number) => m.l + (d / xmax) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - (v / ymax) * (H - m.t - m.b);

  let frase = "";
  if (cur) {
    const kk = cur.curva.length - 1;
    const prev = C.filter((c) => !c.actual).map((c) => ({ c, v: c.curva[Math.min(kk, c.curva.length - 1)] })).sort((a, b) => b.v - a.v);
    const quien = prev.filter((x) => x.v === prev[0].v).map((x) => `${x.c.anio}, ${x.c.gob}`).join("; ");
    frase = t.finTxt(kk + 1, t.finDesde[origen](fmtDia(cur.origen, l)), cur.curva[kk], prev[0].v, quien);
  }

  function onMove(e: React.PointerEvent) {
    const [x, y] = rel(e, svgRef.current!);
    const kk = Math.max(0, Math.min(xmax, Math.round(((x - m.l) / (W - m.l - m.r)) * xmax)));
    const vals = C.filter((c) => kk < c.curva.length).map((c) => ({ c, v: c.curva[kk] })).sort((a, b) => b.v - a.v);
    if (!vals.length) return;
    const nb = vals.reduce((a, b) => (Math.abs(Y(b.v) - y) < Math.abs(Y(a.v) - y) ? b : a));
    setK(kk); setNear(nb.c.id);
    const top = vals.slice(0, 6);
    if (!top.includes(nb)) top.push(nb);
    setTip({ x, y: Math.min(y, H * 0.35), content: <>
      <div className="tt-h">{t.finTip[origen](kk)}</div>
      {top.map(({ c, v }) => <div key={c.id} className={`row${c.actual ? " now" : ""}${c === nb.c ? " near" : ""}`}><span>{c.anio} · {c.gob}</span><b>{v}</b></div>)}
      {vals.length > top.length && <div className="more">{t.masCiclos(vals.length - top.length)}</div>}
    </> });
  }

  const ticks = W < 600 ? [0, 60, 120] : origen === "anuncio" ? [0, 30, 60, 90, 120, 150] : [0, 30, 60, 90, 120];
  return (
    <Section id="disolucion" title={t.finTitulo[origen]} lede={frase}
      actions={<Seg label={t.finTitulo[origen]} value={origen} onChange={setOrigen} options={[["disolucion", t.finSeg.disolucion], ["anuncio", t.finSeg.anuncio]]} />}>
      <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setK(null); setNear(null); }}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.finTitulo[origen]} onPointerMove={onMove}>
            {Array.from({ length: ymax / 5 + 1 }, (_, i) => i * 5).map((v) => (
              <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>
            ))}
            {ticks.map((d) => <text key={d} className="tick" x={X(d)} y={H - 10} textAnchor={d === 0 ? "start" : "middle"}>{d === 0 ? t.finEje[origen] : t.dia(d)}</text>)}
            {cur && cur.elec <= xmax && <>
              <line className="elecline" x1={X(cur.elec)} x2={X(cur.elec)} y1={m.t} y2={H - m.b} />
              {W >= 600 && <text className="tick" x={X(cur.elec) + 4} y={H - m.b - 6}>{t.elecciones(cur.elec)}</text>}
            </>}
            {[...C].sort((a, b) => Number(a.actual) - Number(b.actual)).map((c) => (
              <g key={c.id}>
                <path className={`cur${c.actual ? " now" : ""}${near === c.id && !c.actual ? " hover" : ""}`}
                  d={c.curva.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("")} />
                {!c.actual && c.elec < c.curva.length && <circle className="elec" cx={X(c.elec)} cy={Y(c.curva[c.elec])} r={2.5} />}
              </g>
            ))}
            {cur && <>
              <circle className="pen" cx={X(cur.curva.length - 1)} cy={Y(cur.curva.at(-1)!)} r={5} />
              <text className="lab strong" x={X(cur.curva.length - 1) + 9} y={Y(cur.curva.at(-1)!) + 4}>{cur.anio}: {cur.curva.at(-1)}</text>
            </>}
            {k !== null && <line className="cross" x1={X(k)} x2={X(k)} y1={m.t} y2={H - m.b} />}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      <p className="note">{t.finNota[origen]}</p>
    </Section>
  );
}
