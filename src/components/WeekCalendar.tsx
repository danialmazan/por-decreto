import { useMemo, useRef, useState } from "react";
import { isoWeek, isoWeekStart, toDay, weekday, weeksInIsoYear } from "../lib/time";
import { partyVar, type Datos, type Gov } from "../data";
import { fmtDia, useLang, useT } from "../i18n";
import { GovCard, partidosGov, rel, Tooltip, useWidth, type Tip, Compartir } from "./ui";

const heat = (n: number) => (n ? `h${Math.min(n, 5)}` : "");

/** Calendario de semanas ISO (filas = años). Pulsar un año abre su calendario diario. */
export function WeekCalendar({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [anio, setAnio] = useState<number | null>(null);
  const { d0, n } = datos.serie, corte = datos.corte;
  const semanas = useMemo(() => {
    const m = new Map<number, number>();
    n.forEach((v, i) => { if (v) { const [y, w] = isoWeek(d0 + i); m.set(y * 100 + w, (m.get(y * 100 + w) ?? 0) + v); } });
    return m;
  }, [d0, n]);
  const y0 = isoWeek(d0)[0], y1 = isoWeek(corte)[0];  // 1978: sólo la semana del 29/12
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const l0 = 38, gap = 1, cw = (W - l0 - 4) / 53 - gap, ch = Math.max(5, Math.min(10, cw)), H = years.length * (ch + gap) + 4;

  const cells = useMemo(() => {
    if (!W) return null;
    return years.map((y, r) => {
      const yy = r * (ch + gap) + 2;
      const g = datos.govAt(Math.min(Math.max(toDay(`${y}-07-01`), d0), corte)) ?? datos.govs[0];
      return (
        <g key={y} className="calrow" onClick={() => setAnio(anio === y ? null : y)}>
          {y % 5 === 0 && <text className="tick" x={l0 - 8} y={yy + ch} textAnchor="end">{y}</text>}
          <rect x={l0 - 5} y={yy} width={3} height={ch} fill={partyVar(g.partidos[0])} />
          {Array.from({ length: weeksInIsoYear(y) }, (_, k) => {
            const w = k + 1, ini = isoWeekStart(y, w);
            if (ini > corte || ini + 6 < d0) return null;  // semanas que aún no existen o anteriores a la serie
            const v = semanas.get(y * 100 + w) ?? 0;
            return <rect key={w} data-k={`${y}|${w}`} className={`wk ${heat(v)}${anio === y ? " sel" : ""}`} x={l0 + k * (cw + gap)} y={yy} width={cw} height={ch} rx={1} />;
          })}
        </g>
      );
    });
  }, [W, semanas, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMove(e: React.PointerEvent) {
    const k = (e.target as Element).getAttribute?.("data-k");
    if (!k) { setTip(null); return; }
    const [y, w] = k.split("|").map(Number), ini = isoWeekStart(y, w), v = semanas.get(y * 100 + w) ?? 0;
    const g = datos.govAt(Math.min(ini + 3, corte));
    const [x, yy] = rel(e, svgRef.current!);
    setTip({ x, y: yy, content: <>
      <b>{v ? t.nRdl(v) : t.ningun}</b><br />{t.semana} {w} · {fmtDia(ini, l)} – {fmtDia(ini + 6, l)}
      {g && <><br /><span className="soft">{g.nombre} · {partidosGov(g)}</span></>}
    </> });
  }

  return (
    <>
      <p className="lede">{t.calLede}</p>
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        {W > 0 && <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.calTitulo} onPointerMove={onMove}>{cells}</svg>}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      <div className="legend" aria-hidden="true">
        {t.sinRdl} <i className="wk" /> &nbsp;1 <i className="h1" /><i className="h2" /><i className="h3" /><i className="h4" /><i className="h5" /> 5 {t.oMas}
        <i className="party" style={{ background: "var(--p-ucd)" }} />UCD <i className="party" style={{ background: "var(--p-psoe)" }} />PSOE <i className="party" style={{ background: "var(--p-pp)" }} />PP
      </div>
      {anio !== null && <DailyYear datos={datos} anio={anio} onClose={() => setAnio(null)} />}
      <h3 className="sub">{t.topTitulo}</h3>
      <TopWeeks datos={datos} semanas={semanas} />
    </>
  );
}

/** Calendario diario completo de un año (filas = días de la semana), incluidos los días sin RDL. */
function DailyYear({ datos, anio, onClose }: { datos: Datos; anio: number; onClose: () => void }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const { d0, n } = datos.serie;
  const a = toDay(`${anio}-01-01`), b = Math.min(toDay(`${anio}-12-31`), datos.corte);
  const first = a - weekday(a), cols = Math.ceil((b - first + 1) / 7);
  const l0 = 18, gap = 2, cs = Math.max(6, Math.min(14, (W - l0) / cols - gap)), H = 7 * (cs + gap) + 4;
  const onMove = (e: React.PointerEvent) => {
    const k = (e.target as Element).getAttribute?.("data-d");
    if (!k) { setTip(null); return; }
    const d = Number(k), v = n[d - d0] ?? 0, g = datos.govAt(d);
    const [x, y] = rel(e, svgRef.current!);
    setTip({ x, y, content: <><b>{v ? t.nRdl(v) : t.ningun}</b><br />{fmtDia(d, l)}{g && <><br /><span className="soft">{g.nombre}</span></>}</> });
  };
  return (
    <div className="daily">
      <div className="rdl-head"><h3>{t.diario(anio)}</h3><button type="button" className="link" onClick={onClose}>{t.cerrar}</button></div>
      <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.diario(anio)} onPointerMove={onMove}>
            {t.dias.map((s, i) => i % 2 === 0 && <text key={i} className="tick" x={0} y={i * (cs + gap) + cs} >{s}</text>)}
            {Array.from({ length: b - a + 1 }, (_, i) => {
              const d = a + i, c = Math.floor((d - first) / 7), r = weekday(d), v = n[d - d0] ?? 0;
              return <rect key={d} data-d={d} className={`wk ${heat(v)}`} x={l0 + c * (cs + gap)} y={r * (cs + gap) + 2} width={cs} height={cs} rx={2} />;
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
    </div>
  );
}

function TopWeeks({ datos, semanas }: { datos: Datos; semanas: Map<number, number> }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [on, setOn] = useState<number | null>(null);
  const all = [...semanas.entries()].map(([k, c]) => ({ y: Math.floor(k / 100), w: k % 100, c, ini: isoWeekStart(Math.floor(k / 100), k % 100) }))
    .sort((a, b) => b.c - a.c || b.ini - a.ini);
  const corteV = all[9]?.c ?? 0;
  const rows = all.filter((x) => x.c > corteV).concat(all.filter((x) => x.c === corteV)).slice(0, 10);
  const empatadas = all.filter((x) => x.c === corteV).length - rows.filter((x) => x.c === corteV).length;
  const rh = 30, H = rows.length * rh + 4, l0 = W < 600 ? 172 : 210, r0 = 28;
  const vmax = Math.max(1, ...rows.map((x) => x.c));
  const X = (v: number) => l0 + (v / vmax) * (W - l0 - r0);
  return (
    <>
      <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setOn(null); }}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.topTitulo}>
            {rows.map((x, i) => {
              const y = i * rh + 2, g: Gov | undefined = datos.govAt(Math.min(x.ini + 3, datos.corte));
              const rank = rows.findIndex((z) => z.c === x.c) + 1;
              return (
                <g key={x.ini} onPointerMove={(e) => {
                  setOn(x.ini);
                  const [px, py] = rel(e, svgRef.current!);
                  setTip({ x: px, y: py, content: <><b>{t.nRdl(x.c)}</b><br />{t.semana} {x.w} · {fmtDia(x.ini, l)} – {fmtDia(x.ini + 6, l)}{g && <><br /><GovCard g={g} l={l} t={t} /></>}</> });
                }}>
                  <rect x={0} y={y} width={W} height={rh} fill="transparent" />
                  <text className="lab" x={0} y={y + 19}><tspan className="strong">{rank}. {g?.nombre}</tspan> – {fmtDia(x.ini, l)}</text>
                  <rect x={l0} y={y + 5} width={X(x.c) - l0} height={18} rx={2} fill={g ? partyVar(g.partidos[0]) : "var(--muted)"} className={on === x.ini ? "gbar on" : "gbar"} />
                  <text className="lab strong" x={X(x.c) + 6} y={y + 19}>{x.c}</text>
                </g>
              );
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      {empatadas > 0 && <p className="note">{t.empate(empatadas, corteV)}</p>}
    </>
  );
}
