import { useMemo, useRef, useState } from "react";
import { metricasGrupo } from "../lib/metrics";
import { partyVar, type Datos } from "../data";
import { dec1, useLang, useT } from "../i18n";
import { ExclusionPicker, useExclusion } from "./Context";
import { GovCard, rel, Section, Tooltip, useWidth, type Tip, Compartir } from "./ui";

const IZQ = new Set(["sanchez_3", "zapatero_1", "gonzalez_4"]);
/** Desplazamiento vertical de etiquetas para puntos casi coincidentes. */
const DY: Record<string, number> = { aznar_1: -9, sanchez_2: 12 };

export function Majority({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const { excluir, ids } = useExclusion(datos);
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const puntos = useMemo(() => datos.govs.map((g) => {
    const m = metricasGrupo(datos.serie, [[g.serieIni, g.finDia]], excluir);
    return { g, m };
  }).filter((p) => p.m && p.m.dias_exposicion >= 365), [datos, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = (["si", "no", "monocolor", "coalicion"] as const).map((k) => {
    const ps = puntos.filter((p) => (k === "si" ? p.g.mayoria_absoluta : k === "no" ? !p.g.mayoria_absoluta : p.g.tipo === k));
    const n = ps.reduce((s, p) => s + p.m!.n, 0), d = ps.reduce((s, p) => s + p.m!.dias_exposicion, 0);
    return { k, gobiernos: ps.length, media: d ? n / (d / 365.25) : 0 };
  });

  const H = W < 600 ? 340 : 420, m = { t: 16, r: W < 600 ? 30 : 80, b: 40, l: 40 };
  const xmin = 70, xmax = 215, ymax = Math.ceil(Math.max(...puntos.map((p) => p.m!.media_anualizada)) / 5) * 5 + 5;
  const X = (v: number) => m.l + ((v - xmin) / (xmax - xmin)) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - (v / ymax) * (H - m.t - m.b);
  const mayoria = 176;
  const colocadas: { x: number; y: number; w: number }[] = [];
  return (
    <Section id="mayorias" title={t.mayTitulo} lede={t.mayLede}>
      <ExclusionPicker datos={datos} />
      <div className="kpis">
        {grupos.map((g) => <div key={g.k} className="kpi"><b>{dec1(g.media, l)} <small>{t.rdlAnio}</small></b><span>{t.mayGrupos[g.k]} · {t.gobiernos_n(g.gobiernos)}</span></div>)}
      </div>
      <p className="note kpi-note">{t.mayMedia}</p>
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.mayTitulo}>
            {Array.from({ length: ymax / 5 + 1 }, (_, i) => i * 5).map((v) => <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
            {[80, 100, 120, 140, 160, 180, 200].map((v) => <text key={v} className="tick" x={X(v)} y={H - m.b + 16} textAnchor="middle">{v}</text>)}
            <text className="tick" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">{t.mayX}</text>
            <text className="tick" x={m.l} y={m.t - 4}>{t.mayY}</text>
            <line className="elecline" x1={X(mayoria)} x2={X(mayoria)} y1={m.t} y2={H - m.b} />
            {X(mayoria) + 4 + t.mayoria.length * 5.8 > W
              ? <text className="tick" x={X(mayoria) - 4} y={m.t + 10} textAnchor="end">{t.mayoria}</text>
              : <text className="tick" x={X(mayoria) + 4} y={m.t + 10}>{t.mayoria}</text>}
            {(() => { colocadas.length = 0; return null; })()}
            {[...puntos].sort((a, b) => b.m!.media_anualizada - a.m!.media_anualizada).map(({ g, m: mm }) => {
              const x = X(g.escanos), y = Y(mm!.media_anualizada);
              // Evita solapes: si la etiqueta choca con otra ya colocada, se omite (el nombre sigue en el tooltip)
              const lw = g.nombre.length * 6.2, izq = (IZQ.has(g.id) && W >= 600) || x + 10 + lw > W;
              const lx = izq ? x - 10 - lw : x + 10, ly = y + 4 + (DY[g.id] ?? 0);
              const choca = colocadas.some((c) => Math.abs(c.y - ly) < 12 && lx < c.x + c.w && c.x < lx + lw);
              if (!choca) colocadas.push({ x: lx, y: ly, w: lw });
              return (
                <g key={g.id} onPointerMove={(e) => {
                  const [px, py] = rel(e, svgRef.current!);
                  setTip({ x: px, y: py, content: <GovCard g={g} l={l} t={t} extra={<><br />{g.escanos} {t.diputados} ({dec1(g.pct_escanos, l)} %) · {g.tipo === "coalicion" ? t.coalicion : t.monocolor}<br /><b>{dec1(mm!.media_anualizada, l)}</b> {t.ind.media_anualizada.toLowerCase()} ({mm!.n} · {mm!.dias_exposicion} d)</>} /> });
                }}>
                  {g.tipo === "coalicion"
                    ? <rect x={x - 6} y={y - 6} width={12} height={12} fill={partyVar(g.partidos[0])} className="ring" />
                    : <circle cx={x} cy={y} r={6.5} fill={partyVar(g.partidos[0])} className="ring" />}
                  {!choca && <text className="lab" x={izq ? x - 10 : x + 10} y={ly} textAnchor={izq ? "end" : "start"}>{g.nombre}</text>}
                  <circle cx={x} cy={y} r={16} fill="transparent" />
                </g>
              );
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      <div className="legend"><i className="dotk" />{t.monocolor} <i className="sqk" />{t.coalicion}</div>
    </Section>
  );
}
