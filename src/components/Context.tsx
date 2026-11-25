import { useCallback, useEffect, useMemo, useState } from "react";
import { isoWeek } from "../lib/time";
import type { Datos, Evento } from "../data";
import { dec1, fmtDia, useLang, useT } from "../i18n";
import { Section } from "./ui";

type Ev = Datos["eventos"][number];

/** Periodos excluidos (análisis de sensibilidad), compartidos por todas las secciones vía URL (?excl=id1,id2). */
export function useExclusion(datos: Datos) {
  const read = () => (new URLSearchParams(location.search).get("excl") ?? "").split(",").filter((id) => datos.eventos.some((e) => e.id === id));
  const [ids, setIds] = useState<string[]>(read);
  useEffect(() => { const f = () => setIds(read()); addEventListener("querychange", f); return () => removeEventListener("querychange", f); });
  const set = useCallback((nv: string[]) => {
    const q = new URLSearchParams(location.search);
    if (nv.length) q.set("excl", nv.join(",")); else q.delete("excl");
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? `?${s}` : "") + location.hash);
    setIds(nv);
    window.dispatchEvent(new Event("querychange"));
  }, []);
  const evs = datos.eventos.filter((e) => ids.includes(e.id));
  const excluir = evs.length ? (d: number) => evs.some((e) => d >= e.ini && d <= e.finDia) : undefined;
  return { ids, set, excluir, evs };
}

/**
 * Intensidad durante un acontecimiento frente a los 12 meses anteriores.
 * Ventana medida: el propio periodo; si dura menos de 60 días (catástrofes), los 60 días desde su inicio,
 * porque la respuesta normativa llega después del episodio.
 */
export interface Impacto { n: number; dias: number; ratio: number | null; maxSemana: number; relevante: boolean; ventana60: boolean }
export const UMBRAL_RATIO = 1.25;
export function impacto(datos: Datos, e: Ev): Impacto {
  const { d0, n } = datos.serie, val = (d: number) => n[d - d0] ?? 0;
  const ventana60 = e.finDia - e.ini + 1 < 60;
  const a = e.ini, b = Math.min(ventana60 ? e.ini + 59 : e.finDia, datos.corte);
  let tot = 0; const sem = new Map<string, number>();
  for (let d = a; d <= b; d++) { const v = val(d); tot += v; if (v) { const k = isoWeek(d).join("-"); sem.set(k, (sem.get(k) ?? 0) + v); } }
  const dias = b - a + 1;
  const p0 = Math.max(a - 365, d0), p1 = a - 1;
  let prev = 0; for (let d = p0; d <= p1; d++) prev += val(d);
  const base = p1 - p0 + 1 >= 90 ? prev / (p1 - p0 + 1) : null;
  const ratio = base ? (tot / dias) / base : null;
  return { n: tot, dias, ratio, maxSemana: Math.max(0, ...sem.values()), ventana60, relevante: ratio !== null && ratio >= UMBRAL_RATIO && tot >= 3 };
}
export function useImpactos(datos: Datos) {
  return useMemo(() => new Map(datos.eventos.map((e) => [e.id, impacto(datos, e)])), [datos]);
}

export const nombreEv = (e: Evento, l: string) => (l === "en" ? e.nombre_en : e.nombre_es);
export const textoEv = (e: Evento, l: string) => (l === "en" ? e.explicacion_en : e.explicacion_es);

export function ExclusionPicker({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const { ids, set, evs } = useExclusion(datos);
  const [abierto, setAbierto] = useState(false);
  const toggle = (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <div className="excl">
      <div className="aviso" role="note">
        <b>{t.excluirTitulo}</b> {t.excluirAviso}
        <div className="aviso-acc">
          <button type="button" className="link" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? t.excluirOcultar : t.excluirAbrir}</button>
          {ids.length > 0 && <span className="soft">{t.excluidosLista(evs.map((e) => nombreEv(e, l)).join(", "))}</span>}
          {ids.length > 0 && <button type="button" className="link" onClick={() => set([])}>{t.excluirQuitar}</button>}
        </div>
      </div>
      {abierto && (
        <div className="chips">
          {datos.eventos.map((e) => (
            <button key={e.id} type="button" className="chip" aria-pressed={ids.includes(e.id)} onClick={() => toggle(e.id)}>
              {nombreEv(e, l)}{!/\d{4}/.test(nombreEv(e, l)) && <span className="soft"> {e.inicio.slice(0, 4)}{e.fin && e.fin.slice(0, 4) !== e.inicio.slice(0, 4) ? `–${e.fin.slice(2, 4)}` : !e.fin ? "–" : ""}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContextSection({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const imp = useImpactos(datos);
  const rel_ = datos.eventos.filter((e) => imp.get(e.id)!.relevante);
  const otros = datos.eventos.filter((e) => !imp.get(e.id)!.relevante);
  const item = (e: Ev) => {
    const i = imp.get(e.id)!;
    const dur = i.dias < 60 ? t.diasN(i.dias) : t.mesesN(Math.round(i.dias / 30.4375));
    return (
      <li key={e.id} className={`ev ${e.categoria}${i.relevante ? " rel" : ""}`}>
        <div className="ev-fechas">{fmtDia(e.ini, l)} – {e.fin ? fmtDia(e.finDia, l) : t.sinFin}</div>
        <div className="ev-nombre">{nombreEv(e, l)}</div>
        <div className="ev-cifra"><b>{t.nRdl(i.n)}</b> {t.enDur(dur)}{i.ventana60 ? ` ${t.desdeInicio}` : ""}
          {i.ratio !== null && <> · <b>×{dec1(i.ratio, l)}</b> {t.frenteAnterior}</>}
          {i.maxSemana > 1 && <> · {t.maxSemanaN(i.maxSemana)}</>}</div>
        <div className="soft">{textoEv(e, l)}</div>
        <details><summary>{t.ctxFuente}</summary><p className="note">{e.fuente}</p><p className="note">{e.justificacion}</p></details>
      </li>
    );
  };
  return (
    <Section id="contexto" title={t.ctxTitulo} lede={t.ctxLede}>
      <ol className="eventos">{rel_.map(item)}</ol>
      {otros.length > 0 && (
        <details className="otros-ev">
          <summary>{t.otrosEv(otros.length)}</summary>
          <p className="note">{t.otrosEvNota}</p>
          <ol className="eventos">{otros.map(item)}</ol>
        </details>
      )}
    </Section>
  );
}
