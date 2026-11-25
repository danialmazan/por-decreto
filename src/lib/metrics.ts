import type { Daily } from "./agg";
import { isoWeek, monthStart, nextMonthStart, ymd } from "./time";

/**
 * Misma definición que pipeline/metrics.py (fuente de referencia; los tests comparan ambas).
 * intervalos: tramos [inicio, fin] en número de día, ambos incluidos. `excluir` quita días de la exposición
 * y los RDL aprobados en ellos (análisis de sensibilidad).
 */
export interface Met {
  n: number; dias_exposicion: number; media_semanal: number; media_mensual: number; media_anualizada: number;
  max_semana: number; max_mes: number; max_30d: number; pct_semanas_sin_rdl: number | null; pct_meses_sin_rdl: number | null;
  dias_entre_aprobaciones_media: number | null;
}

export function metricasGrupo(serie: Daily, intervalos: [number, number][], excluir?: (d: number) => boolean): Met | null {
  const dias: number[] = [];
  for (const [a, b] of [...intervalos].sort((x, y) => x[0] - y[0]))
    for (let d = Math.max(a, serie.d0); d <= Math.min(b, serie.d0 + serie.n.length - 1); d++) if (!excluir?.(d)) dias.push(d);
  if (!dias.length) return null;
  const val = (d: number) => serie.n[d - serie.d0] ?? 0;
  const enGrupo = new Set(dias);
  const semDias = new Map<string, number>(), mesDias = new Map<string, number>(), semN = new Map<string, number>(), mesN = new Map<string, number>();
  let n = 0;
  for (const d of dias) {
    const [y, w] = isoWeek(d), [yy, mm] = ymd(d), ks = `${y}-${w}`, km = `${yy}-${mm}`;
    semDias.set(ks, (semDias.get(ks) ?? 0) + 1); mesDias.set(km, (mesDias.get(km) ?? 0) + 1);
    const v = val(d);
    if (v) { n += v; semN.set(ks, (semN.get(ks) ?? 0) + v); mesN.set(km, (mesN.get(km) ?? 0) + v); }
  }
  const semCompletas = [...semDias].filter(([, c]) => c === 7).map(([k]) => k);
  const mesCompletos = [...mesDias].filter(([k, c]) => { const [y, m] = k.split("-").map(Number); return c === nextMonthStart(y, m) - monthStart(y, m); }).map(([k]) => k);
  // Máximo en ventana de 30 días que termina dentro del grupo, contando sólo RDL del grupo
  let max30 = 0, acc = 0;
  const cola: number[] = [];
  for (let d = dias[0] - 29; d <= dias[dias.length - 1]; d++) {
    const v = enGrupo.has(d) ? val(d) : 0;
    cola.push(v); acc += v;
    if (cola.length > 30) acc -= cola.shift()!;
    if (enGrupo.has(d)) max30 = Math.max(max30, acc);
  }
  // Huecos entre fechas de aprobación distintas, sólo dentro de tramos sin días ajenos al grupo entre medias
  const fechas = dias.filter((d) => val(d) > 0);
  const gaps: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    const a = fechas[i - 1], b = fechas[i];
    let contiguo = intervalos.every(([, x1]) => intervalos.every(([y0]) => !(a <= x1 && y0 <= b && y0 - x1 > 1)));
    // Un periodo excluido entre dos aprobaciones también corta el tramo (no se mide el hueco a través de él)
    if (contiguo && excluir) for (let d = a + 1; d < b; d++) if (excluir(d)) { contiguo = false; break; }
    if (contiguo) gaps.push(b - a);
  }
  const exp = dias.length, r = (v: number, k: number) => Math.round(v * 10 ** k) / 10 ** k;
  return {
    n, dias_exposicion: exp,
    media_semanal: r(n / (exp / 7), 4), media_mensual: r(n / (exp / 30.4375), 4), media_anualizada: r(n / (exp / 365.25), 3),
    max_semana: Math.max(0, ...semN.values()), max_mes: Math.max(0, ...mesN.values()), max_30d: max30,
    pct_semanas_sin_rdl: semCompletas.length ? r((100 * semCompletas.filter((k) => !semN.get(k)).length) / semCompletas.length, 1) : null,
    pct_meses_sin_rdl: mesCompletos.length ? r((100 * mesCompletos.filter((k) => !mesN.get(k)).length) / mesCompletos.length, 1) : null,
    dias_entre_aprobaciones_media: gaps.length ? r(gaps.reduce((s, x) => s + x, 0) / gaps.length, 1) : null,
  };
}
