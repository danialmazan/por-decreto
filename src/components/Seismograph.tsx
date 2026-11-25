import { useMemo, useRef, useState } from "react";
import { aggregate, isRolling, masked, maxBin, ROLLING, rolling, type Agg, type Bin } from "../lib/agg";
import { fromDay, isoWeek, toDay, ymd } from "../lib/time";
import { partyVar, type Datos, type Gov } from "../data";
import { fmtDia, fmtMesAnio, fmtMesCorto, useLang, useT, type Lang, type Textos } from "../i18n";
import { GovCard, rel, Seg, Tooltip, useQuery, useWidth, type Tip, Compartir } from "./ui";
import { RdlList, type Seleccion } from "./RdlList";
import { useImpactos } from "./Context";

const AGGS: Agg[] = ["m30", "m365", "mes", "anio"];

export function periodoLabel(b: Bin, agg: Agg, l: Lang, t: Textos) {
  if (isRolling(agg) || agg === "dia") return agg === "dia" ? fmtDia(b.start, l) : `${fmtDia(b.start, l)} – ${fmtDia(b.end, l)}`;
  if (agg === "semana") return t.semanaDe(isoWeek(b.start)[1], fmtDia(b.start, l), fmtDia(b.end, l));
  if (agg === "mes") return fmtMesAnio(b.start, l);
  return String(ymd(b.start)[0]);
}

/** Filtro por grupo: id de Gobierno, «pres:<id>» o «part:<siglas>». */
export function filtroGob(f: string): ((g: Gov | undefined) => boolean) | undefined {
  if (!f) return undefined;
  if (f.startsWith("pres:")) return (g) => g?.presidente_id === f.slice(5);
  if (f.startsWith("part:")) return (g) => g?.partidos[0] === f.slice(5);
  return (g) => g?.id === f;
}

/** Escala Y con pasos enteros: devuelve [máximo, paso]. */
function niceMax(v: number): [number, number] {
  const step = [1, 2, 5, 10, 20, 50].find((s) => Math.max(v, 4) / s <= 5) ?? 100;
  return [Math.max(Math.ceil(v / step), 1) * step, step];
}

function yearTicks(a: number, b: number, w: number, l: Lang): [number, string][] {
  const span = (b - a) / 365.25, [ya] = ymd(a), [yb] = ymd(b);
  const px = w / Math.max(span, 0.1);
  if (span > 2) {
    const step = [1, 2, 5, 10].find((s) => px * s >= 46) ?? 10;
    const out: [number, string][] = [];
    for (let y = Math.ceil(ya / step) * step; y <= yb; y += step) out.push([toDay(`${y}-01-01`), String(y)]);
    return out.filter(([d]) => d >= a);
  }
  const out: [number, string][] = [];
  const stepM = px / 12 >= 40 ? 1 : px / 12 >= 20 ? 3 : 6;
  let [y, m] = ymd(a);
  for (let k = 0; k < 400; k++) {
    const d = toDay(`${y}-${String(m).padStart(2, "0")}-01`);
    if (d > b) break;
    if (d >= a && (m - 1) % stepM === 0) out.push([d, m === 1 ? String(y) : fmtMesCorto(d, l).split(" ")[0]]);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function Seismograph({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [agg, setAgg] = useQuery<Agg>("agr", "m30", AGGS);
  const [gob, setGob] = useQuery<string>("gob", "");
  const [desde, setDesde] = useQuery<string>("desde", "");
  const [hasta, setHasta] = useQuery<string>("hasta", "");
  const d0 = datos.serie.d0, d1 = datos.corte;
  const [view, setView] = useState<[number, number]>(() => [
    desde ? Math.max(d0, toDay(desde)) : d0, hasta ? Math.min(d1, toDay(hasta)) : d1]);
  const commitView = (v: [number, number]) => {
    setView(v);
    setDesde(v[0] <= d0 ? "" : fromDay(v[0]));
    setHasta(v[1] >= d1 ? "" : fromDay(v[1]));
  };
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [ctx, setCtx] = useQuery<string>("ctx", "", ["", "1"]);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);

  const keep = useMemo(() => filtroGob(gob), [gob]);
  const serie = useMemo(() => masked(datos.serie, keep ? (d) => keep(datos.govAt(d)) : undefined), [datos, keep]);
  const bins = useMemo(() => aggregate(serie, agg), [serie, agg]);
  const rolling_ = isRolling(agg);

  const H = W < 600 ? 300 : 380, m = { t: 30, r: 14, b: 26, l: 34 };
  const [a, b] = view;
  const X = (d: number) => m.l + ((d - a) / (b + 1 - a)) * (W - m.l - m.r);
  const visibles = useMemo(() => bins.filter((x) => x.end >= a && x.start <= b), [bins, a, b]);
  const top = maxBin(visibles.filter((x) => x.complete || rolling_));
  const [ymax, ystep] = niceMax(Math.max(top?.value ?? 0, ...visibles.map((x) => x.value)));
  const Y = (v: number) => H - m.b - (v / ymax) * (H - m.t - m.b);

  // Capa de datos (memorizada: sólo cambia con datos, vista o tamaño)
  const capa = useMemo(() => {
    if (!W) return null;
    if (rolling_) {
      const pts: string[] = [];
      let px = -1, best = 0;
      for (const x of visibles) {
        const p = Math.round(X(x.end + 0.5));
        if (p !== px && px >= 0) { pts.push(`${px},${Y(best).toFixed(1)}`); best = 0; }
        px = p; best = Math.max(best, x.value);
      }
      if (px >= 0) pts.push(`${px},${Y(best).toFixed(1)}`);
      if (!pts.length) return null;
      const x0 = pts[0].split(",")[0], x1 = pts[pts.length - 1].split(",")[0];
      return (
        <>
          <path className="area" d={`M${x0},${Y(0)}L${pts.join("L")}L${x1},${Y(0)}Z`} />
          <path className="trace" d={`M${pts.join("L")}`} />
        </>
      );
    }
    let full = "", part = "";
    for (const x of visibles) {
      if (!x.value) continue;
      const x0 = X(Math.max(x.start, a)), x1 = X(Math.min(x.end, b) + 1);
      const gap = x1 - x0 > 4 ? 1 : 0;
      const r = `M${(x0 + gap).toFixed(1)},${Y(0)}V${Y(x.value).toFixed(1)}H${Math.max(x1 - gap, x0 + gap + 0.8).toFixed(1)}V${Y(0)}Z`;
      if (x.complete) full += r; else part += r;
    }
    return <><path className="bars" d={full} /><path className="bars partial" d={part} /></>;
  }, [visibles, W, H, a, b, ymax, rolling_]); // eslint-disable-line react-hooks/exhaustive-deps

  const binAt = (d: number) => {
    let lo = 0, hi = bins.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (bins[mid].end < d) lo = mid + 1; else hi = mid; }
    return bins[lo];
  };
  const dayFromX = (px: number) => Math.max(a, Math.min(b, Math.floor(a + ((px - m.l) / (W - m.l - m.r)) * (b + 1 - a))));

  function showTip(d: number, x: number, y: number) {
    const bin = binAt(d);
    if (!bin) return;
    const g = datos.govAt(Math.min(bin.end, d1));
    const lab = periodoLabel(bin, agg, l, t);
    const html = rolling_ ? t.tipMovil(bin.value, ROLLING[agg], fmtDia(bin.end, l)) : t.tipNatural(bin.value, lab);
    setTip({ x, y, content: <>
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {!bin.complete && <><br /><span className="soft">{t.incompleto}</span></>}
      {g && <><br /><span className="soft">{g.nombre}</span></>}
    </> });
  }
  function onMove(e: React.PointerEvent) {
    const [x, y] = rel(e, svgRef.current!);
    if (y < m.t - 2 || x < m.l) return;
    const d = dayFromX(x);
    setHover(d); showTip(d, x, Math.min(y, H * 0.45));
  }
  function select(d: number) {
    const bin = binAt(d);
    if (!bin) return;
    setSel({ start: Math.max(bin.start, d0), end: Math.min(bin.end, d1), label: periodoLabel(bin, agg, l, t), keep });
  }
  function onKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 7 : 1;
    let d = hover ?? b;
    if (e.key === "ArrowLeft") d -= step; else if (e.key === "ArrowRight") d += step;
    else if (e.key === "Enter" || e.key === " ") { select(d); e.preventDefault(); return; } else return;
    e.preventDefault();
    d = Math.max(a, Math.min(b, d)); setHover(d); showTip(d, X(d), 40);
  }

  const bandas = datos.legislaturas.filter((x) => x.disolucion).map((x) => {
    const nxt = datos.legislaturas.find((y) => y.n === x.n + 1);
    return [toDay(x.disolucion!), Math.min(nxt?.constitucion ? toDay(nxt.constitucion) : d1, d1)] as const;
  });
  const hoverBin = hover !== null ? binAt(hover) : null;
  const yt = Array.from({ length: ymax / ystep + 1 }, (_, i) => i * ystep);
  const selOpts = (
    <>
      <option value="">{t.todos}</option>
      <optgroup label={t.grupos.presidente}>
        {[...new Map(datos.govs.map((g) => [g.presidente_id, g])).values()].map((g) => <option key={g.presidente_id} value={`pres:${g.presidente_id}`}>{g.presidente}</option>)}
      </optgroup>
      <optgroup label={t.grupos.gobierno}>{datos.govs.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</optgroup>
      <optgroup label={t.grupos.partido}>{["UCD", "PSOE", "PP"].map((p) => <option key={p} value={`part:${p}`}>{p}</option>)}</optgroup>
    </>
  );

  return (
    <div className="seismo">
      <div className="controls">
        <Seg label={t.agrTitulo} value={agg} onChange={(v) => { setAgg(v); setSel(null); }}
          options={AGGS.map((k) => [k, t.agr[k]])} />
        <div className="selects">
          <label><span className="vh">{t.filtro}</span>
            <select value={gob} onChange={(e) => { setGob(e.target.value); setSel(null); }}>{selOpts}</select></label>
          <label><span className="vh">{t.irA}</span>
            <select value="" onChange={(e) => { const g = datos.govById(e.target.value); if (g) commitView([Math.max(d0, g.serieIni - 30), Math.min(d1, g.finDia + 30)]); }}>
              <option value="">{t.irA}</option>
              {datos.govs.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select></label>
          <label className="inline check"><input type="checkbox" checked={ctx === "1"} onChange={(e) => setCtx(e.target.checked ? "1" : "")} /> {t.ctxMostrar}</label>
          {(a > d0 || b < d1) && <button type="button" className="link" onClick={() => commitView([d0, d1])}>{t.todaSerie}</button>}
        </div>
      </div>
      <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setHover(null); }}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.sismoTitulo} tabIndex={0} onKeyDown={onKey}
            onPointerMove={onMove} onClick={(e) => { const [x, y] = rel(e as unknown as React.PointerEvent, svgRef.current!); if (y > m.t) select(dayFromX(x)); }}>
            {bandas.map(([p, q], i) => q >= a && p <= b && (
              <rect key={i} className="band" x={X(Math.max(p, a))} y={m.t} width={Math.max(X(Math.min(q, b) + 1) - X(Math.max(p, a)), 1.5)} height={H - m.t - m.b} />
            ))}
            {ctx === "1" && <Eventos datos={datos} X={X} a={a} b={b} y0={m.t} y1={H - m.b} setTip={setTip} />}
            {yt.map((v) => <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
            {yearTicks(a, b, W - m.l - m.r, l).map(([d, s]) => <text key={d} className="tick" x={X(d)} y={H - 8} textAnchor="middle">{s}</text>)}
            {capa}
            {sel && sel.end >= a && sel.start <= b && (
              <rect className="selband" x={X(Math.max(sel.start, a))} y={m.t} width={Math.max(X(Math.min(sel.end, b) + 1) - X(Math.max(sel.start, a)), 2)} height={H - m.t - m.b} />
            )}
            {top && top.value > 0 && (
              <g className="maxmark">
                <circle cx={X((Math.max(top.start, a) + Math.min(top.end, b)) / 2 + (rolling_ ? 0 : 0.5))} cy={Y(top.value)} r={4} />
              </g>
            )}
            {rolling_ && b === d1 && <circle className="pen" cx={X(d1 + 0.5)} cy={Y(bins[bins.length - 1].value)} r={6} />}
            {hoverBin && <line className="cross" x1={X(hover! + 0.5)} x2={X(hover! + 0.5)} y1={m.t} y2={H - m.b} />}
            <GovStrip datos={datos} X={X} a={a} b={b} keep={keep} setTip={setTip} l={l} t={t} />
          </svg>
        )}
        <Compartir titulo={t.sismoImg} />
        <Tooltip tip={tip} width={W} />
      </div>
      <p className="note">{top && top.value > 0 ? `${t.maximo(t.nRdl(top.value), periodoLabel(top, agg, l, t))} ` : ""}{t.pulsa}</p>
      <Minimap datos={datos} view={view} setView={setView} commit={commitView} />
      {sel && <RdlList datos={datos} sel={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

/** Bandas de contexto (acontecimientos) con su nombre; las etiquetas se reparten en filas para no solaparse. */
function Eventos({ datos, X, a, b, y0, y1, setTip }: {
  datos: Datos; X: (d: number) => number; a: number; b: number; y0: number; y1: number; setTip: (t: Tip | null) => void;
}) {
  const l = useLang(), t = useT();
  const imp = useImpactos(datos);
  // Sólo los acontecimientos con aumento claro del ritmo (ver sección de acontecimientos)
  const vis = datos.eventos.filter((e) => e.finDia >= a && e.ini <= b && imp.get(e.id)?.relevante);
  const filas: number[] = [];
  return (
    <g className="eventos-g">
      {vis.map((e) => {
        const x0 = X(Math.max(e.ini, a)), x1 = Math.max(X(Math.min(e.finDia, b) + 1), x0 + 2);
        const nombre = l === "en" ? e.nombre_en : e.nombre_es, w = nombre.length * 5.4 + 6;
        // La etiqueta no sale del gráfico: cerca del borde derecho se alinea a la derecha de la banda.
        const lx = Math.max(X(a), Math.min(x0, X(b + 1) - w));
        let fila = filas.findIndex((fin) => fin < lx);
        if (fila < 0) { fila = filas.length; filas.push(0); }
        filas[fila] = lx + w;
        const show = (ev: React.PointerEvent) => {
          const [x, y] = rel(ev, (ev.currentTarget as SVGElement).ownerSVGElement!);
          setTip({ x, y, content: <><b>{nombre}</b><br />{fmtDia(e.ini, l)} – {e.fin ? fmtDia(e.finDia, l) : t.sinFin}<br /><span className="soft">{l === "en" ? e.explicacion_en : e.explicacion_es}</span></> });
          ev.stopPropagation();
        };
        return (
          <g key={e.id} className={`ev-band ${e.categoria}`} onPointerMove={show}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
            <text x={lx + 3} y={y0 + 11 + fila * 12}>{nombre}</text>
          </g>
        );
      })}
    </g>
  );
}

function GovStrip({ datos, X, a, b, keep, setTip, l, t }: {
  datos: Datos; X: (d: number) => number; a: number; b: number; keep?: (g: Gov | undefined) => boolean;
  setTip: (t: Tip | null) => void; l: Lang; t: Textos;
}) {
  const [on, setOn] = useState<string | null>(null);
  return (
    <g className="govstrip">
      {datos.govs.filter((g) => g.finDia >= a && g.serieIni <= b).map((g) => {
        const x0 = X(Math.max(g.serieIni, a)), x1 = X(Math.min(g.finDia, b) + 1), w = Math.max(x1 - x0 - 1, 1);
        const show = (e: React.PointerEvent | React.FocusEvent) => {
          setOn(g.id);
          const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
          const x = "clientX" in e ? rel(e as React.PointerEvent, svg)[0] : x0;
          setTip({ x, y: 16, content: <GovCard g={g} l={l} t={t} /> });
          e.stopPropagation();
        };
        return (
          <g key={g.id} opacity={keep && !keep(g) ? 0.25 : 1}>
            <rect x={x0} y={4} width={w} height={8} rx={1} fill={partyVar(g.partidos[0])} className={on === g.id ? "gov on" : "gov"} />
            {w > g.nombre.length * 5.6 + 8 && <text className="gl" x={x0 + 2} y={24}>{g.nombre}</text>}
            <rect x={x0} y={0} width={Math.max(w, 4)} height={28} fill="transparent" tabIndex={0} role="button" aria-label={`${g.nombre}: ${g.presidente}`}
              onPointerMove={show} onFocus={show} onPointerLeave={() => { setOn(null); setTip(null); }} onBlur={() => { setOn(null); setTip(null); }} />
          </g>
        );
      })}
    </g>
  );
}

/** Barra de rango: arrastra para elegir un periodo, mueve la ventana o ajusta sus bordes. */
function Minimap({ datos, view, setView, commit }: {
  datos: Datos; view: [number, number]; setView: (v: [number, number]) => void; commit: (v: [number, number]) => void;
}) {
  const t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const d0 = datos.serie.d0, d1 = datos.corte, H = 46, m = { l: 34, r: 14 };
  const X = (d: number) => m.l + ((d - d0) / (d1 + 1 - d0)) * (W - m.l - m.r);
  const D = (x: number) => Math.round(d0 + ((x - m.l) / (W - m.l - m.r)) * (d1 + 1 - d0));
  const r365 = useMemo(() => rolling(datos.serie, 365), [datos]);
  const path = useMemo(() => {
    if (!W) return "";
    const vmax = Math.max(...r365.map((x) => x.value));
    const pts: string[] = [];
    for (let i = 0; i < r365.length; i += 7) pts.push(`${X(r365[i].end).toFixed(1)},${(H - 4 - (r365[i].value / vmax) * (H - 12)).toFixed(1)}`);
    return `M${X(d0)},${H - 4}L${pts.join("L")}L${X(d1)},${H - 4}Z`;
  }, [W, r365]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<{ mode: "new" | "move" | "l" | "r"; x0: number; v0: [number, number] } | null>(null);
  const cur = useRef(view);
  cur.current = view;
  const last = useRef(view);  // último rango calculado durante el arrastre (no depende de que haya re-render)
  const clamp = (p: number, q: number): [number, number] => {
    const span = Math.max(q - p, 30);
    if (p < d0) { p = d0; q = Math.max(q, p + span); }
    if (q > d1) { q = d1; p = Math.min(p, q - span); }
    return [Math.max(d0, p), Math.min(d1, Math.max(q, p + 30))];
  };
  const down = (e: React.PointerEvent) => {
    const [x] = rel(e, svgRef.current!);
    const [p, q] = cur.current, xp = X(p), xq = X(q);
    const completa = q - p > 0.9 * (d1 - d0);  // con la vista casi completa, arrastrar crea un periodo nuevo
    const mode = completa ? "new" : Math.abs(x - xp) < 8 ? "l" : Math.abs(x - xq) < 8 ? "r" : x > xp && x < xq ? "move" : "new";
    drag.current = { mode, x0: x, v0: mode === "new" ? [D(x), D(x)] : [p, q] };
    last.current = [p, q];
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const g = drag.current; if (!g) return;
    const [x] = rel(e, svgRef.current!), dd = D(x) - D(g.x0);
    let v: [number, number];
    if (g.mode === "move") v = clamp(g.v0[0] + dd, g.v0[1] + dd);
    else if (g.mode === "l") v = clamp(Math.min(g.v0[0] + dd, g.v0[1] - 30), g.v0[1]);
    else if (g.mode === "r") v = clamp(g.v0[0], Math.max(g.v0[1] + dd, g.v0[0] + 30));
    else { const p = Math.min(g.v0[0], D(x)), q = Math.max(g.v0[0], D(x)); v = clamp(p, q); }
    last.current = v;
    setView(v);
  };
  const up = () => { if (drag.current) { drag.current = null; commit(last.current); } };
  const [p, q] = view;
  return (
    <div className="minimap" ref={ref}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} aria-label={t.rango} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {datos.govs.map((g) => <rect key={g.id} x={X(g.serieIni)} y={0} width={Math.max(X(g.finDia + 1) - X(g.serieIni) - 1, 1)} height={4} fill={partyVar(g.partidos[0])} />)}
          <path className="mini" d={path} />
          <rect className="shade" x={m.l} y={0} width={Math.max(X(p) - m.l, 0)} height={H} />
          <rect className="shade" x={X(q + 1)} y={0} width={Math.max(W - m.r - X(q + 1), 0)} height={H} />
          <rect className="win" x={X(p)} y={1} width={Math.max(X(q + 1) - X(p), 2)} height={H - 2} rx={3} />
          <rect className="handle" x={X(p) - 3} y={H / 2 - 9} width={6} height={18} rx={2} />
          <rect className="handle" x={X(q + 1) - 3} y={H / 2 - 9} width={6} height={18} rx={2} />
        </svg>
      )}
    </div>
  );
}

export function useHoyM30(datos: Datos) {
  return useMemo(() => rolling(datos.serie, 30).map((b) => b.value), [datos]);
}
export const _test = { niceMax, yearTicks };
