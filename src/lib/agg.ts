import { isoWeek, isoWeekStart, monthStart, nextMonthStart, toDay, ymd } from "./time";

export type Agg = "dia" | "semana" | "mes" | "anio" | "m7" | "m30" | "m365";
export const ROLLING: Record<string, number> = { m7: 7, m30: 30, m365: 365 };
export const isRolling = (a: Agg) => a in ROLLING;

/** Serie diaria: n[i] = RDL aprobados el día d0 + i (ceros explícitos). */
export interface Daily { d0: number; n: number[] }

export interface Bin { start: number; end: number; value: number; complete: boolean }

/** Aplica una máscara (p. ej. un Gobierno): los días fuera cuentan 0. */
export function masked(s: Daily, keep?: (day: number) => boolean): Daily {
  if (!keep) return s;
  return { d0: s.d0, n: s.n.map((v, i) => (keep(s.d0 + i) ? v : 0)) };
}

/**
 * Ventana móvil de N días: valor en el día d = suma de [d-(N-1), d].
 * `complete` es falso si la ventana empieza antes del primer día de la serie.
 */
export function rolling(s: Daily, N: number): Bin[] {
  const out: Bin[] = [];
  let acc = 0;
  for (let i = 0; i < s.n.length; i++) {
    acc += s.n[i];
    if (i >= N) acc -= s.n[i - N];
    out.push({ start: s.d0 + i - N + 1, end: s.d0 + i, value: acc, complete: i >= N - 1 });
  }
  return out;
}

/** Periodos naturales. `complete` es falso si el periodo está cortado por el inicio o el final de la serie. */
export function natural(s: Daily, agg: "dia" | "semana" | "mes" | "anio"): Bin[] {
  const first = s.d0, last = s.d0 + s.n.length - 1;
  const out: Bin[] = [];
  const push = (a: number, b: number) => {
    let v = 0;
    for (let d = Math.max(a, first); d <= Math.min(b, last); d++) v += s.n[d - first];
    out.push({ start: a, end: b, value: v, complete: a >= first && b <= last });
  };
  if (agg === "dia") return s.n.map((v, i) => ({ start: first + i, end: first + i, value: v, complete: true }));
  if (agg === "semana") {
    let [y, w] = isoWeek(first);
    for (let a = isoWeekStart(y, w); a <= last; a += 7) push(a, a + 6);
    return out;
  }
  if (agg === "mes") {
    let [y, m] = ymd(first);
    for (let a = monthStart(y, m); a <= last; ) {
      const b = nextMonthStart(y, m);
      push(a, b - 1);
      a = b; m = m === 12 ? 1 : m + 1; if (m === 1) y++;
    }
    return out;
  }
  for (let y = ymd(first)[0]; toDay(`${y}-01-01`) <= last; y++) push(toDay(`${y}-01-01`), toDay(`${y}-12-31`));
  return out;
}

export function aggregate(s: Daily, agg: Agg): Bin[] {
  return isRolling(agg) ? rolling(s, ROLLING[agg]) : natural(s, agg as "dia" | "semana" | "mes" | "anio");
}

export function maxBin(bins: Bin[]): Bin | undefined {
  let best: Bin | undefined;
  for (const b of bins) if (!best || b.value > best.value || (b.value === best.value && b.end > best.end)) best = b;
  return best;
}

/** Lectura del contador: récord, top N de episodios o percentil (episodios = picos separados > 30 días). */
export function lectura(m30: number[]) {
  const n = m30.length, hoy = m30[n - 1], max = Math.max(...m30);
  const idx = [...m30.keys()].sort((a, b) => m30[b] - m30[a]);
  const picos: number[] = [];
  for (const i of idx) { if (picos.length >= 60) break; if (picos.every((p) => Math.abs(p - i) > 30)) picos.push(i); }
  const top = picos.filter((i) => m30[i] > hoy && i < n - 31).length + 1;
  const pct = Math.floor((100 * m30.filter((x) => x < hoy).length) / n);
  const tipo: "record" | "top" | "percentil" = hoy >= max && hoy > 0 ? "record" : top <= 10 ? "top" : "percentil";
  return { hoy, tipo, top, pct };
}

/** Acumulado desde el día `d0` (incluido) durante `dias` días o hasta `hasta` (incluido). */
export function cumulative(s: Daily, d0: number, dias: number, hasta?: number): number[] {
  const out: number[] = [];
  let acc = 0;
  const fin = Math.min(d0 + dias, hasta ?? Infinity, s.d0 + s.n.length - 1);
  for (let d = d0; d <= fin; d++) { acc += s.n[d - s.d0] ?? 0; out.push(acc); }
  return out;
}
