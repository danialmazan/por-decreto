import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Gov } from "../data";
import { fmtMesAnio, PARTIDO, useLang, useT, type Lang, type Textos } from "../i18n";
import { compartirGrafico, contexto } from "../lib/share";

/** Ancho disponible de un contenedor (se actualiza al redimensionar). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    setW(Math.round(ref.current.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Estado sincronizado con la query de la URL (vistas compartibles; se conserva al cambiar de idioma). */
export function useQuery<T extends string>(key: string, def: T, allowed?: readonly string[]): [T, (v: T) => void] {
  const read = () => {
    const v = new URLSearchParams(location.search).get(key);
    return (v && (!allowed || allowed.includes(v)) ? v : def) as T;
  };
  const [v, setV] = useState<T>(read);
  const set = useCallback((nv: T) => {
    setV(nv);
    const q = new URLSearchParams(location.search);
    if (nv === def) q.delete(key); else q.set(key, nv);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? `?${s}` : "") + location.hash);
    window.dispatchEvent(new Event("querychange"));
  }, [key, def]);
  return [v, set];
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  );
}

export interface Tip { x: number; y: number; content: ReactNode }
/** Tooltip posicionado dentro del contenedor del gráfico, sin salirse por los lados. */
export function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(200);
  useEffect(() => { if (ref.current) setW(ref.current.offsetWidth); });
  if (!tip) return null;
  const left = Math.max(0, Math.min(width - w, tip.x + 12));
  return <div ref={ref} className="tt" role="status" style={{ left, top: tip.y + 14 }}>{tip.content}</div>;
}

export function periodoGov(g: Gov, l: Lang, t: Textos) {
  const meses = Math.round((g.finDia - g.iniDia + 1) / 30.4375);
  return `${fmtMesAnio(g.iniDia, l)} – ${g.enCurso ? t.hoy : fmtMesAnio(g.finDia, l)} (${t.meses(meses)})`;
}
export const partidosGov = (g: Gov) => g.partidos.map((p) => PARTIDO[p] ?? p).join(" + ");

export function GovCard({ g, l, t, extra }: { g: Gov; l: Lang; t: Textos; extra?: ReactNode }) {
  return (
    <>
      <b>{g.nombre}</b> <span className="soft">· {partidosGov(g)}</span>
      <br />{periodoGov(g, l, t)}
      {extra}
    </>
  );
}

/** Capítulo numerado: agrupa varias secciones bajo un título común. */
export function Chapter({ id, n, title, intro, children }: { id: string; n: number; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="chapter" aria-labelledby={`${id}-t`}>
      <header className="chap-h">
        <span className="chap-n" aria-hidden="true">{n}</span>
        <div><h2 id={`${id}-t`}>{title}</h2><p>{intro}</p></div>
      </header>
      {children}
    </section>
  );
}

export function Section({ id, title, lede, actions, children, className }: {
  id: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`sec${className ? ` ${className}` : ""}`}>
      <div className="head-row">
        <h3 className="sec-t">{title}</h3>
        {actions}
      </div>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </section>
  );
}

/** Posición del puntero relativa a un elemento. */
export const rel = (e: React.PointerEvent | PointerEvent, el: Element) => {
  const r = el.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top] as const;
};

/** Botón para compartir el gráfico que lo contiene como PNG (título, opciones activas, leyenda y enlace). */
export function Compartir({ titulo }: { titulo?: string }) {
  const t = useT(), l = useLang();
  const ref = useRef<HTMLButtonElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState(titulo ?? "");
  useEffect(() => { const c = ref.current?.closest(".chart"); if (c) setNombre(contexto(c, titulo).titulo); }, [titulo]);
  async function go() {
    const chart = ref.current?.closest<HTMLElement>(".chart");
    if (!chart || ocupado) return;
    setOcupado(true);
    try { await compartirGrafico(chart, { ...contexto(chart, titulo), marca: t.titulo, fuente: t.fuenteImg, lang: l }); }
    catch (e) { console.error(e); }
    finally { setOcupado(false); }
  }
  return (
    <button ref={ref} type="button" className="share" onClick={go} aria-label={t.compartirAria(nombre)} disabled={ocupado}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8v5h10V8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {ocupado ? t.compartiendo : t.compartir}
    </button>
  );
}
