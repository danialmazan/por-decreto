import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metricasGrupo } from "./metrics";
import { toDay } from "./time";

/** Contraste con las métricas de referencia calculadas en Python (public/data/comparacion.json). */
const pub = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const serieJ = pub("serie.json"), govs = pub("gobiernos.json"), comp = pub("comparacion.json"), meta = pub("meta.json");
const serie = { d0: toDay(serieJ.inicio), n: serieJ.n as number[] };
const corte = toDay(meta.corte);
const tramo = (g: { inicio: string; fin: string | null }): [number, number] => [Math.max(toDay(g.inicio), serie.d0), g.fin ? toDay(g.fin) : corte];
const CAMPOS = ["n", "dias_exposicion", "media_anualizada", "max_semana", "max_mes", "max_30d", "pct_semanas_sin_rdl", "pct_meses_sin_rdl", "dias_entre_aprobaciones_media"];

describe("métricas TS = métricas Python", () => {
  it("por Gobierno", () => {
    for (const g of govs) {
      const ref = comp.gobierno.find((m: { id: string }) => m.id === g.id);
      const m = metricasGrupo(serie, [tramo(g)])!;
      for (const c of CAMPOS) expect([g.id, c, (m as unknown as Record<string, unknown>)[c]]).toEqual([g.id, c, ref[c]]);
    }
  });
  it("por presidente (tramos contiguos)", () => {
    for (const ref of comp.presidente) {
      const m = metricasGrupo(serie, govs.filter((g: { presidente_id: string }) => g.presidente_id === ref.id).map(tramo))!;
      for (const c of CAMPOS) expect([ref.id, c, (m as unknown as Record<string, unknown>)[c]]).toEqual([ref.id, c, ref[c]]);
    }
  });
  it("por partido (tramos no contiguos)", () => {
    for (const ref of comp.partido) {
      const m = metricasGrupo(serie, govs.filter((g: { partidos: string[] }) => g.partidos[0] === ref.id).map(tramo))!;
      for (const c of CAMPOS) expect([ref.id, c, (m as unknown as Record<string, unknown>)[c]]).toEqual([ref.id, c, ref[c]]);
    }
  });
  it("la exclusión reduce exposición y RDL", () => {
    const g = govs.find((x: { id: string }) => x.id === "sanchez_2");
    const covid = [toDay("2020-03-14"), toDay("2021-05-08")];
    const m = metricasGrupo(serie, [tramo(g)], (d) => d >= covid[0] && d <= covid[1])!;
    const base = metricasGrupo(serie, [tramo(g)])!;
    expect(m.dias_exposicion).toBe(base.dias_exposicion - (covid[1] - covid[0] + 1));
    expect(m.n).toBeLessThan(base.n);
  });
});
