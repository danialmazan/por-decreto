/** Fechas como número de día (días desde 1970-01-01, UTC). Evita husos horarios y cambios de hora. */
export const DAY_MS = 86_400_000;

export const toDay = (iso: string): number => Math.round(Date.parse(iso + "T00:00:00Z") / DAY_MS);
export const fromDay = (d: number): string => new Date(d * DAY_MS).toISOString().slice(0, 10);
export const ymd = (d: number) => { const x = new Date(d * DAY_MS); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()] as const; };
/** 0 = lunes … 6 = domingo */
export const weekday = (d: number) => (new Date(d * DAY_MS).getUTCDay() + 6) % 7;

/** Lunes (número de día) de la semana ISO `w` del año ISO `y`. */
export function isoWeekStart(y: number, w: number): number {
  const jan4 = toDay(`${y}-01-04`);
  return jan4 - weekday(jan4) + (w - 1) * 7;
}
/** [año ISO, semana ISO] de un día. */
export function isoWeek(d: number): [number, number] {
  const thursday = d - weekday(d) + 3;
  const y = ymd(thursday)[0];
  return [y, Math.floor((thursday - isoWeekStart(y, 1)) / 7) + 1];
}
export const weeksInIsoYear = (y: number) => (isoWeekStart(y + 1, 1) - isoWeekStart(y, 1)) / 7;
export const monthStart = (y: number, m: number) => toDay(`${y}-${String(m).padStart(2, "0")}-01`);
export const nextMonthStart = (y: number, m: number) => (m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1));
