import { useMemo, useRef, useState } from "react";
import { partyVar, type Datos, type Metricas } from "../data";
import { dec1, fmtMesAnio, int, useLang, useT } from "../i18n";
import { GovCard, rel, Section, Seg, Tooltip, useQuery, useWidth, type Tip, Compartir } from "./ui";
import { ExclusionPicker, useExclusion } from "./Context";
import { metricasGrupo } from "../lib/metrics";
import { toDay } from "../lib/time";

type Grupo = "presidente" | "gobierno" | "partido" | "legislatura";
const INDICADORES = ["media_anualizada", "n", "media_mensual", "media_semanal", "max_semana", "max_mes", "max_30d",
  "pct_semanas_sin_rdl", "pct_meses_sin_rdl", "dias_entre_aprobaciones_media"] as const;
type Ind = typeof INDICADORES[number] | "cronologico";
const DECIMALES = new Set(["media_anualizada", "media_mensual", "media_semanal", "pct_semanas_sin_rdl", "pct_meses_sin_rdl", "dias_entre_aprobaciones_media"]);

export function Comparison({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [grupo, setGrupo] = useQuery<Grupo>("comp", "gobierno", ["presidente", "gobierno", "partido", "legislatura"]);
  const [orden, setOrden] = useQuery<Ind>("orden", "media_anualizada", [...INDICADORES, "cronologico"]);
  const [cortos, setCortos] = useState(false);
  const [ref, W] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [on, setOn] = useState<string | null>(null);

  const inicio = (m: Metricas) => {
    if (grupo === "gobierno") return datos.govById(m.id)?.iniDia ?? 0;
    if (grupo === "presidente") return Math.min(...datos.govs.filter((g) => g.presidente_id === m.id).map((g) => g.iniDia));
    if (grupo === "partido") return Math.min(...datos.govs.filter((g) => g.partidos[0] === m.id).map((g) => g.iniDia));
    return Number(m.id);
  };
  const color = (m: Metricas) => {
    if (grupo === "gobierno") return partyVar(datos.govById(m.id)!.partidos[0]);
    if (grupo === "presidente") return partyVar(datos.govs.find((g) => g.presidente_id === m.id)!.partidos[0]);
    if (grupo === "partido") return partyVar(m.id);
    return "var(--trace)";
  };
  const { excluir, ids } = useExclusion(datos);
  // Con periodos excluidos, las métricas se recalculan en el navegador (misma definición que el pipeline, ver tests).
  const base = useMemo(() => {
    if (!excluir) return datos.comparacion[grupo];
    const tramos = (m: Metricas): [number, number][] => {
      if (grupo === "gobierno") { const g = datos.govById(m.id)!; return [[g.serieIni, g.finDia]]; }
      if (grupo === "presidente") return datos.govs.filter((g) => g.presidente_id === m.id).map((g) => [g.serieIni, g.finDia]);
      if (grupo === "partido") return datos.govs.filter((g) => g.partidos[0] === m.id).map((g) => [g.serieIni, g.finDia]);
      const lg = datos.legislaturas.find((x) => String(x.n) === m.id)!;
      return [[Math.max(lg.constitucion ? toDay(lg.constitucion) : datos.serie.d0, datos.serie.d0), lg.fin ? Math.min(toDay(lg.fin), datos.corte) : datos.corte]];
    };
    return datos.comparacion[grupo].flatMap((m) => {
      const r = metricasGrupo(datos.serie, tramos(m), excluir);
      return r ? [{ ...m, ...r }] : [];
    });
  }, [datos, grupo, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  // En pantallas estrechas, los presidentes se muestran por su apellido (el nombre completo sigue en el tooltip).
  const nombre = (m: Metricas) => (grupo === "legislatura" ? t.legNombre(m.etiqueta)
    : grupo === "presidente" && W < 600 ? (datos.govs.find((g) => g.presidente_id === m.id)?.nombre.replace(/ [IVX]+$/, "") ?? m.etiqueta) : m.etiqueta);
  const ind = orden === "cronologico" ? "media_anualizada" : orden;
  const rows = base.filter((m) => cortos || m.dias_exposicion >= 365)
    .sort(orden === "cronologico" ? (a, b) => inicio(a) - inicio(b) : (a, b) => ((b[ind] ?? -1) as number) - ((a[ind] ?? -1) as number));
  const fmt = (k: string, v: number | null) => (v === null || v === undefined ? "—" : DECIMALES.has(k) ? dec1(v, l) : int(v, l));
  const vmax = Math.max(...rows.map((r) => (r[ind] ?? 0) as number), 1);
  const etiqueta = (m: Metricas) => `${fmt(ind, (m[ind] ?? 0) as number)}${m.dias_exposicion < 365 ? ` · ${t.corto}` : ""}`;
  // Margen derecho según la etiqueta más larga (12 px ≈ 6,6 px por carácter), para que no se corte.
  const rh = 26, H = rows.length * rh + 22, l0 = W < 600 ? 112 : 168, r0 = Math.max(48, ...rows.map((m) => etiqueta(m).length * 6.6 + 10));
  const X = (v: number) => l0 + (v / vmax) * (W - l0 - r0);

  function card(m: Metricas) {
    const v = `${int(m.n, l)} · ${dec1(m.media_anualizada, l)} ${t.ind.media_anualizada.toLowerCase()}`;
    if (grupo === "gobierno") { const g = datos.govById(m.id)!; return <GovCard g={g} l={l} t={t} extra={<><br />{v}</>} />; }
    const govs = grupo === "presidente" ? datos.govs.filter((g) => g.presidente_id === m.id) : grupo === "partido" ? datos.govs.filter((g) => g.partidos[0] === m.id) : [];
    return <><b>{nombre(m)}</b>{govs.length > 0 && <><br /><span className="soft">{govs.map((g) => g.nombre).join(", ")}</span></>}
      {govs.length > 0 && grupo === "presidente" && <><br />{fmtMesAnio(govs[0].iniDia, l)} – {govs.at(-1)!.enCurso ? t.hoy : fmtMesAnio(govs.at(-1)!.finDia, l)}</>}
      <br />{v}</>;
  }

  return (
    <Section id="gobiernos" title={t.compTitulo} lede={<>{t.compLede}{grupo === "partido" && ` ${t.partidoNota}`}</>}
      actions={<Seg label={t.compTitulo} value={grupo} onChange={setGrupo} options={(["presidente", "gobierno", "partido", "legislatura"] as Grupo[]).map((g) => [g, t.grupos[g]])} />}>
      <div className="controls">
        <label className="inline">{t.ordenar}{" "}
          <select value={orden} onChange={(e) => setOrden(e.target.value as Ind)}>
            {INDICADORES.map((k) => <option key={k} value={k}>{t.ind[k]}</option>)}
            <option value="cronologico">{t.cronologico}</option>
          </select>
        </label>
        <label className="inline check"><input type="checkbox" checked={cortos} onChange={(e) => setCortos(e.target.checked)} /> {t.cortos}</label>
      </div>
      <ExclusionPicker datos={datos} />
      <div className="chart" ref={ref} onPointerLeave={() => { setTip(null); setOn(null); }}>
        {W > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.compTitulo}: ${t.ind[ind]}`}>
            {rows.map((m, i) => {
              const y = i * rh + 2, v = (m[ind] ?? 0) as number, corto = m.dias_exposicion < 365;
              return (
                <g key={m.id} onPointerMove={(e) => { setOn(m.id); const [x, yy] = rel(e, svgRef.current!); setTip({ x, y: yy, content: card(m) }); }}>
                  <rect x={0} y={y - 2} width={W} height={rh} fill="transparent" />
                  <text className="tick" x={l0 - 8} y={y + 13} textAnchor="end">{nombre(m)}</text>
                  <rect x={l0} y={y} width={Math.max(X(v) - l0, 1)} height={17} rx={2} fill={color(m)} opacity={corto ? 0.45 : 1} className={on === m.id ? "gbar on" : "gbar"} />
                  <text className="lab" x={X(v) + 5} y={y + 13}>{etiqueta(m)}</text>
                </g>
              );
            })}
          </svg>
        )}
        <Compartir />
        <Tooltip tip={tip} width={W} />
      </div>
      <details className="table-wrap">
        <summary>{t.verTabla}</summary>
        <table>
          <thead><tr><th>{t.grupos[grupo]}</th>{["n", "dias_exposicion", ...INDICADORES.filter((k) => k !== "n")].map((k) => <th key={k}>{t.ind[k]}</th>)}</tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id}><td>{nombre(m)}</td>{["n", "dias_exposicion", ...INDICADORES.filter((k) => k !== "n")].map((k) => <td key={k}>{fmt(k, (m as unknown as Record<string, number | null>)[k])}</td>)}</tr>
          ))}</tbody>
        </table>
      </details>
    </Section>
  );
}
