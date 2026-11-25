import { useMemo, useRef, useState } from "react";
import { cumulative } from "../lib/agg";
import { partyVar, type Datos, type Gov } from "../data";
import { fmtDia, fmtMesAnio, useLang, useT, type Textos } from "../i18n";
import { rel, Section, Seg, Tooltip, useQuery, useWidth, type Tip, Compartir } from "./ui";

const MES = 30.4375;
const ANIO = 365.25;
const DASH = ["", "6 3", "2 3", "10 3 2 3"];

type Modo = "gobierno" | "presidente";
/** Un mandato: un Gobierno o la suma de los Gobiernos consecutivos de un presidente. */
interface Perfil { id: string; nombre: string; partido: string; ini: number; fin: number; enCurso: boolean; govs: Gov[]; acum: number[]; dur: number; parcial: boolean }

const apellido = (g: Gov) => g.nombre.replace(/ [IVX]+$/, "");

export function usePerfiles(datos: Datos, modo: Modo): Perfil[] {
  return useMemo(() => {
    const d0 = datos.serie.d0;
    // Los mandatos que empezaron antes de la serie (Suárez) se cuentan desde su inicio (29/12/1978) y se marcan con asterisco.
    const vivos = datos.govs.filter((g) => g.finDia >= d0);
    const grupos = modo === "gobierno"
      ? vivos.map((g) => [g])
      : [...new Set(vivos.map((g) => g.presidente_id))].map((pid) => vivos.filter((g) => g.presidente_id === pid));
    return grupos.map((gs) => {
      const parcial = gs[0].iniDia < d0;
      const ini = Math.max(gs[0].iniDia, d0), fin = gs[gs.length - 1].finDia;
      const nombre = modo === "gobierno" ? gs[0].nombre : apellido(gs[0]);
      return {
        id: modo === "gobierno" ? gs[0].id : gs[0].presidente_id, nombre: parcial ? `${nombre}*` : nombre,
        partido: gs[0].partidos[0], ini, fin, enCurso: gs[gs.length - 1].enCurso, govs: gs, parcial,
        acum: cumulative(datos.serie, ini, fin - ini), dur: fin - ini + 1,
      };
    });
  }, [datos, modo]);
}

/** «2 años y 3 meses de mandato» a partir del número de días transcurridos. */
export function tiempo(k: number, t: Textos) {
  const meses = Math.floor(k / MES);
  return t.tiempoMandato(Math.floor(meses / 12), meses % 12);
}

export function Profiles({ datos }: { datos: Datos }) {
  const t = useT();
  const [modo, setModo] = useQuery<Modo>("perfil", "gobierno", ["gobierno", "presidente"]);
  const perfiles = usePerfiles(datos, modo);
  const l = useLang();
  const parciales = perfiles.filter((p) => p.parcial).map((p) => p.nombre);
  const notaParcial = parciales.length ? t.perfParcial(parciales.join(", "), fmtDia(datos.serie.d0, l)) : null;
  const [selG, setSelG] = useState<string[]>(["sanchez_3", "sanchez_2", "rajoy_1", "aznar_1"]);
  // Por presidente: todos activos por defecto y sin límite (son pocos y no se confunden).
  const [selP, setSelP] = useState<string[] | null>(null);
  const todosP = perfiles.map((p) => p.id);
  const sel = (modo === "gobierno" ? selG : selP ?? todosP).filter((id) => perfiles.some((p) => p.id === id));
  const toggle = (id: string) => modo === "gobierno"
    ? setSelG((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? [...s.slice(1), id] : [...s, id]))
    : setSelP((s) => { const cur = s ?? todosP; return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; });
  const dash = (id: string) => {
    const p = perfiles.find((x) => x.id === id)!;
    const mismos = sel.filter((x) => perfiles.find((y) => y.id === x)?.partido === p.partido);
    return DASH[mismos.indexOf(id)] ?? "";
  };
  return (
    <Section id="perfiles" title={t.perfTitulo} lede={t.perfLede}
      actions={<Seg label={t.perfTitulo} value={modo} onChange={setModo} options={[["gobierno", t.perfPor.gobierno], ["presidente", t.perfPor.presidente]]} />}>
      <div className="chips" role="group" aria-label={t.perfTitulo}>
        {perfiles.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={sel.includes(p.id)} onClick={() => toggle(p.id)}>
            <i style={{ background: partyVar(p.partido) }} />{p.nombre}
          </button>
        ))}
      </div>
      <h3 className="sub">{t.perfAcum}</h3>
      <Acumulado perfiles={perfiles} sel={sel} dash={dash} />
      {notaParcial && <p className="note img-note">{notaParcial}</p>}
      <h3 className="sub">{t.perfCalor}</h3>
      <p className="lede">{t.perfCalorLede}</p>
      <Calor datos={datos} perfiles={perfiles} />
    </Section>
  );
}

/** Etiquetas al final de cada línea; si dos quedan cerca en horizontal y vertical, se separan 13 px. */
function etiquetasFinales(ps: Perfil[], X: (d: number) => number, Y: (v: number) => number) {
  const labs = ps.map((p) => ({ p, x: X(p.acum.length - 1) + 6, y: Y(p.acum.at(-1)!) + 4, w: p.nombre.length * 7 }))
    .sort((a, b) => b.y - a.y);
  const puestas: typeof labs = [];
  for (const e of labs) {
    while (puestas.some((o) => Math.abs(o.y - e.y) < 13 && e.x < o.x + o.w && o.x < e.x + e.w)) e.y -= 1;
    puestas.push(e);
  }
  return puestas;
}

function Acumulado({ perfiles, sel, dash }: { perfiles: Perfil[]; sel: string[]; dash: (id: string) => string }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [k, setK] = useState<number | null>(null);
  const xmax = Math.max(...perfiles.map((p) => p.dur));
  const ymaxRaw = Math.max(...perfiles.map((p) => p.acum.at(-1) ?? 0));
  const ystep = ymaxRaw > 120 ? 50 : 20, ymax = Math.ceil(ymaxRaw / ystep) * ystep;
  const H = W < 600 ? 300 : 360, m = { t: 12, r: W < 600 ? 80 : 110, b: 28, l: 36 };
  const X = (d: number) => m.l + (d / xmax) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - (v / ymax) * (H - m.t - m.b);
  // Eje X en años (o meses si el eje es corto); paso de años según el ancho disponible
  const anios = xmax / ANIO, pxAnio = (W - m.l - m.r) / anios;
  const paso = pxAnio >= 60 ? 1 : pxAnio >= 30 ? 2 : 4;
  const ticks: [number, string][] = anios < 2
    ? Array.from({ length: Math.floor(xmax / MES / 3) + 1 }, (_, i) => [Math.round(i * 3 * MES), i ? t.mesesN(i * 3) : "0"])
    : Array.from({ length: Math.floor(anios / paso) + 1 }, (_, i) => [Math.round(i * paso * ANIO), i ? t.anioN(i * paso) : "0"]);
  const path = (v: number[]) => {
    const every = Math.max(1, Math.floor(v.length / Math.max(W, 1)));
    const pts: string[] = [];
    for (let i = 0; i < v.length; i += every) pts.push(`${X(i).toFixed(1)},${Y(v[i]).toFixed(1)}`);
    pts.push(`${X(v.length - 1).toFixed(1)},${Y(v[v.length - 1]).toFixed(1)}`);
    return `M${pts.join("L")}`;
  };
  const ordered = [...perfiles].sort((a, b) => Number(sel.includes(a.id)) - Number(sel.includes(b.id)));
  function onMove(e: React.PointerEvent) {
    const [x, y] = rel(e, svgRef.current!);
    const kk = Math.max(0, Math.min(xmax - 1, Math.round(((x - m.l) / (W - m.l - m.r)) * xmax)));
    const vals = perfiles.filter((p) => kk < p.acum.length).map((p) => ({ p, v: p.acum[kk] })).sort((a, b) => b.v - a.v);
    const top = vals.filter((x2, i) => i < 5 || sel.includes(x2.p.id));
    setK(kk);
    setTip({ x, y: Math.min(y, H * 0.4), content: <>
      <div className="tt-h">{tiempo(kk, t)}</div>
      {top.map(({ p, v }) => <div key={p.id} className={`row${sel.includes(p.id) ? " near" : ""}`}><span>{vals.findIndex((z) => z.p === p) + 1}. {p.nombre} <span className="soft">({fmtMesAnio(p.ini + kk, l)})</span></span><b>{v}</b></div>)}
      {vals.length > top.length && <div className="more">+{vals.length - top.length}</div>}
    </> });
  }
  return (
    <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setK(null); }}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.perfAcum} onPointerMove={onMove}>
          {Array.from({ length: ymax / ystep + 1 }, (_, i) => i * ystep).map((v) => (
            <g key={v}><line className="grid" x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} /><text className="tick" x={m.l - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>
          ))}
          {ticks.map(([d, s]) => <text key={d} className="tick" x={X(d)} y={H - 8} textAnchor={d ? "middle" : "start"}>{s}</text>)}
          {ordered.map((p) => {
            const on = sel.includes(p.id);
            return <path key={p.id} d={path(p.acum)} fill="none" stroke={on ? partyVar(p.partido) : "var(--muted)"} strokeWidth={on ? 2.2 : 1}
              strokeDasharray={on ? dash(p.id) : undefined} opacity={on ? 1 : 0.3} />;
          })}
          {etiquetasFinales(perfiles.filter((p) => sel.includes(p.id)), X, Y).map(({ p, x, y }) => (
            <text key={p.id} className="lab strong" x={x} y={y}>{p.nombre}</text>
          ))}
          {k !== null && <line className="cross" x1={X(k)} x2={X(k)} y1={m.t} y2={H - m.b} />}
        </svg>
      )}
      <Compartir />
      <Tooltip tip={tip} width={W} />
    </div>
  );
}

function Calor({ datos, perfiles }: { datos: Datos; perfiles: Perfil[] }) {
  const l = useLang(), t = useT();
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const filas = useMemo(() => perfiles.map((p) => {
    const nm = Math.floor((p.dur - 1) / MES) + 1;
    const v = Array.from({ length: nm }, (_, k) => {
      const a = p.ini + Math.round(k * MES), b = Math.min(p.ini + Math.round((k + 1) * MES) - 1, p.fin);
      let s = 0; for (let d = a; d <= b; d++) s += datos.serie.n[d - datos.serie.d0] ?? 0;
      return { a, b, s };
    });
    return { p, v };
  }), [datos, perfiles]);
  const ncol = Math.max(...filas.map((f) => f.v.length));
  // Las casillas se estrechan hasta caber en el ancho (sin separación si quedan muy finas).
  const l0 = W < 600 ? 84 : 104, gap = (W - l0 - 4) / ncol >= 4 ? 1 : 0, cw = Math.max(0.5, (W - l0 - 4) / ncol - gap), ch = W < 600 ? 16 : 22, H = filas.length * (ch + 4) + 20;
  const paso = (cw + gap) * 12 > 40 ? 12 : (cw + gap) * 24 > 48 ? 24 : 48;
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setTip(null)}>
      {W > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.perfCalor} onPointerMove={(e) => {
          const k = (e.target as Element).getAttribute?.("data-k");
          if (!k) { setTip(null); return; }
          const [fi, ci] = k.split("|").map(Number), f = filas[fi], c = f.v[ci];
          const g = datos.govAt(c.a);
          const [x, y] = rel(e, svgRef.current!);
          setTip({ x, y, content: <><b>{c.s ? t.nRdl(c.s) : t.ningun}</b> · {t.mesN(ci + 1)}<br />{fmtDia(c.a, l)} – {fmtDia(c.b, l)}<br /><span className="soft">{f.p.nombre}{g && g.nombre !== f.p.nombre ? ` · ${g.nombre}` : ""}</span></> });
        }}>
          {filas.map((f, i) => {
            const y = i * (ch + 4);
            return (
              <g key={f.p.id}>
                <text className="tick" x={l0 - 8} y={y + ch / 2 + 4} textAnchor="end">{f.p.nombre}</text>
                {f.v.map((c, j) => <rect key={j} data-k={`${i}|${j}`} className={`wk${c.s ? ` h${Math.min(c.s, 5)}` : ""}`} x={l0 + j * (cw + gap)} y={y} width={cw} height={ch} rx={1.5} />)}
              </g>
            );
          })}
          {Array.from({ length: Math.floor(ncol / paso) + 1 }, (_, i) => i * paso).map((k) => (
            <text key={k} className="tick" x={l0 + k * (cw + gap)} y={H - 4} textAnchor={k ? "middle" : "start"}>{k ? t.anioN(k / 12) : "0"}</text>
          ))}
        </svg>
      )}
      <Compartir />
      <Tooltip tip={tip} width={W} />
    </div>
  );
}
