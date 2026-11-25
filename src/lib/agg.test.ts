import { describe, expect, it } from "vitest";
import { aggregate, cumulative, lectura, masked, natural, rolling } from "./agg";
import { fromDay, isoWeek, isoWeekStart, toDay, weeksInIsoYear } from "./time";

const serie = (inicio: string, n: number[]) => ({ d0: toDay(inicio), n });

describe("tiempo", () => {
  it("semanas ISO", () => {
    expect(isoWeek(toDay("2024-03-01"))).toEqual([2024, 9]);
    expect(isoWeek(toDay("2021-01-03"))).toEqual([2020, 53]);
    expect(fromDay(isoWeekStart(2020, 53))).toBe("2020-12-28");
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2021)).toBe(52);
  });
});

describe("agregaciones", () => {
  // 2024 es bisiesto: del 28/02 al 01/03 hay 3 días
  const s = serie("2024-02-28", [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]);
  it("ventana de 30 días = día y 29 anteriores", () => {
    const r = rolling(s, 30);
    expect(r[29].value).toBe(6);          // 28/02–28/03
    expect(r[30].value).toBe(10);         // 29/02–29/03: sale el 28/02 (1), entra el 29/03 (5)
    expect(r[28].complete).toBe(false);
    expect(r[29].complete).toBe(true);
  });
  it("meses naturales con año bisiesto y completitud", () => {
    const m = natural(s, "mes");
    expect(m.map((b) => b.value)).toEqual([3, 8]);
    expect(m[0].complete).toBe(false);    // febrero empieza antes de la serie
    expect(fromDay(m[0].end)).toBe("2024-02-29");
  });
  it("semanas ISO naturales", () => {
    const w = aggregate(s, "semana");
    expect(fromDay(w[0].start)).toBe("2024-02-26");
    expect(w[0].value).toBe(6);
  });
  it("la máscara no atribuye RDL de otro grupo", () => {
    const f = masked(s, (d) => d >= toDay("2024-03-01"));
    expect(rolling(f, 30)[30].value).toBe(8);
  });
  it("acumulado", () => {
    expect(cumulative(s, toDay("2024-02-29"), 2)).toEqual([2, 5, 5]);
  });
});

describe("lectura", () => {
  it("récord, top y percentil", () => {
    expect(lectura([1, 5, 2, 9]).tipo).toBe("record");
    const base = Array(200).fill(0);
    base[10] = 9; base[80] = 7;
    expect(lectura([...base, 8]).tipo).toBe("top");
    expect(lectura([...base, 8]).top).toBe(2);
  });
});
