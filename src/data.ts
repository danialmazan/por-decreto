import { useEffect, useState } from "react";
import type { Daily } from "./lib/agg";
import { toDay } from "./lib/time";

export interface Meta { inicio: string; corte: string; generado: string; n_rdl: number; cobertura: Record<string, string | number> }
export interface Gobierno {
  id: string; nombre: string; presidente: string; presidente_id: string; partidos: string[];
  inicio: string; fin: string | null; inicio_funciones: string | null; tipo: "monocolor" | "coalicion";
  legislatura: number; escanos: number; escanos_por_partido: string; pct_escanos: number; mayoria_absoluta: boolean;
  rd_nombramiento: string | null;
}
export interface Legislatura { n: number; nombre: string; elecciones: string | null; constitucion: string | null; disolucion: string | null; fin: string | null }
export interface Ciclo {
  id: string; disolucion: string; disolucion_rd: string; rd: string; anuncio: string; tipo_anuncio: string; fuente_anuncio: string;
  elecciones: string; constitucion: string; saliente: string; entrante: string | null; nuevo_gobierno: string | null;
}
export interface Metricas {
  id: string; etiqueta: string; n: number; dias_exposicion: number; media_semanal: number; media_mensual: number;
  media_anualizada: number; max_semana: number; max_semana_id: string | null; max_mes: number; max_mes_id: string | null;
  max_30d: number; max_30d_fin: string | null; semanas_completas: number; pct_semanas_sin_rdl: number | null;
  meses_completos: number; pct_meses_sin_rdl: number | null; dias_entre_aprobaciones_media: number | null;
  dias_entre_aprobaciones_mediana: number | null; dias_con_rdl: number;
}
export type Comparacion = Record<"gobierno" | "presidente" | "partido" | "legislatura", Metricas[]>;
export interface Rdl {
  id: string; numero: number; anio: number; fecha: string; publicacion: string; gobierno: string; convalidacion: string;
  fecha_convalidacion: string | null; tramitado_pl: string; resultado_pl: string | null; expediente: string | null;
  legislatura_expediente: number | null; fase: string; titulo: string; dia: number;
}

export interface Evento {
  id: string; categoria: string; nombre_es: string; nombre_en: string; inicio: string; fin: string | null;
  explicacion_es: string; explicacion_en: string; fuente: string; justificacion: string;
}
export interface ProdFila { id: string | number; anio?: number; ley: number; ley_organica: number; rdleg: number; rdl: number; leyes_derivadas_de_rdl: number; total: number; pct_rdl: number | null; pct_rdl_sin_derivadas: number | null; anio_incompleto?: boolean }
export type Produccion = Record<"anio" | "gobierno" | "presidente" | "legislatura", ProdFila[]>;

/** Gobierno con fechas como número de día. `finDia` del Gobierno en curso = fecha de corte. */
export interface Gov extends Gobierno { iniDia: number; finDia: number; serieIni: number; enCurso: boolean }

export interface Datos {
  meta: Meta; serie: Daily; govs: Gov[]; legislaturas: Legislatura[]; ciclos: Ciclo[]; comparacion: Comparacion;
  eventos: (Evento & { ini: number; finDia: number })[]; produccion: Produccion;
  corte: number; govAt: (d: number) => Gov | undefined; govById: (id: string) => Gov | undefined;
}

const url = (f: string) => `${import.meta.env.BASE_URL}data/${f}`;
const get = <T,>(f: string): Promise<T> => fetch(url(f)).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });

export async function cargar(): Promise<Datos> {
  const [meta, serie, gobiernos, legislaturas, ciclos, comparacion, eventos, produccion] = await Promise.all([
    get<Meta>("meta.json"), get<{ inicio: string; n: number[] }>("serie.json"), get<Gobierno[]>("gobiernos.json"),
    get<Legislatura[]>("legislaturas.json"), get<Ciclo[]>("ciclos.json"), get<Comparacion>("comparacion.json"),
    get<Evento[]>("eventos.json"), get<Produccion>("produccion.json"),
  ]);
  const d0 = toDay(serie.inicio), corte = toDay(meta.corte);
  const govs: Gov[] = gobiernos.map((g, i) => {
    const iniDia = toDay(g.inicio);
    const finDia = g.fin ? toDay(g.fin) : corte;
    return { ...g, iniDia, finDia, serieIni: Math.max(iniDia, d0), enCurso: !g.fin || i === gobiernos.length - 1 && finDia >= corte };
  });
  const govAt = (d: number) => govs.find((g) => g.iniDia <= d && d <= g.finDia);
  const govById = (id: string) => govs.find((g) => g.id === id);
  const ev = eventos.map((e) => ({ ...e, ini: Math.max(toDay(e.inicio), d0), finDia: e.fin ? Math.min(toDay(e.fin), corte) : corte }));
  return { meta, serie: { d0, n: serie.n }, govs, legislaturas, ciclos, comparacion, eventos: ev, produccion, corte, govAt, govById };
}

let rdlCache: Promise<Rdl[]> | null = null;
/** Lista completa de RDL (carga diferida: sólo se pide al consultar un periodo). */
export function cargarRdl(): Promise<Rdl[]> {
  rdlCache ??= get<{ cols: string[]; rows: unknown[][] }>("rdl.json").then(({ cols, rows }) =>
    rows.map((r) => { const o = Object.fromEntries(cols.map((c, i) => [c, r[i]])) as unknown as Rdl; o.dia = toDay(o.fecha); return o; }));
  return rdlCache;
}

export function useDatos() {
  const [st, set] = useState<{ datos?: Datos; error?: string }>({});
  useEffect(() => { cargar().then((datos) => set({ datos }), (e) => set({ error: String(e) })); }, []);
  return st;
}

const ROMANOS = ["C", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
export const urlBoe = (id: string) => `https://www.boe.es/buscar/doc.php?id=${id}`;
export const urlCongreso = (exp: string, leg: number) =>
  `https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=${ROMANOS[leg]}&_iniciativas_id=${encodeURIComponent(exp)}`;
export const partyVar = (p: string) => `var(--p-${p.toLowerCase()})`;
