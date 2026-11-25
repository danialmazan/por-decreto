/**
 * Imagen PNG de un gráfico para compartir: título, opciones activas, el SVG tal como se ve,
 * su leyenda y el enlace a la web. Si el navegador puede compartir archivos, abre el menú
 * del sistema; si no, descarga el PNG.
 */
import fontUrl from "@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?url";

const FAMILIA = '"Schibsted Grotesk Variable", system-ui, sans-serif';
const ORIGEN = "https://danielalmazan.com";
// Propiedades que dependen del CSS de la página y hay que copiar al SVG exportado.
const PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linejoin", "stroke-linecap",
  "opacity", "font-size", "font-weight", "font-family", "font-variant-numeric", "paint-order", "visibility", "display", "r"];

let fuente: Promise<string> | null = null;
/** La fuente en base64, para que el SVG convertido en imagen la use (no ve las fuentes de la página). */
function fuenteBase64() {
  fuente ??= fetch(fontUrl).then((r) => r.blob()).then((b) => new Promise<string>((ok) => {
    const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b);
  })).catch(() => "");
  return fuente;
}

function copiarEstilos(orig: Element, copia: Element) {
  const cs = getComputedStyle(orig);
  (copia as SVGElement).setAttribute("style", PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  for (let i = 0; i < orig.children.length; i++) copiarEstilos(orig.children[i], copia.children[i]);
}

async function svgAImagen(svg: SVGSVGElement, w: number, h: number) {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  copiarEstilos(svg, copia);
  copia.querySelectorAll(".cross").forEach((n) => n.remove());
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copia.setAttribute("width", String(w));
  copia.setAttribute("height", String(h));
  const f = await fuenteBase64();
  if (f) {
    const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
    st.textContent = `@font-face{font-family:"Schibsted Grotesk Variable";font-weight:400 900;src:url(${f}) format("woff2")}`;
    copia.prepend(st);
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Parte un texto en líneas que caben en `max` píxeles. */
function lineas(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  const out: string[] = []; let cur = "";
  for (const p of texto.split(" ")) {
    const prueba = cur ? `${cur} ${p}` : p;
    if (ctx.measureText(prueba).width > max && cur) { out.push(cur); cur = p; } else cur = prueba;
  }
  if (cur) out.push(cur);
  return out;
}

/** Elementos de la leyenda HTML (muestras de color y textos) tras el gráfico. */
function leyenda(chart: Element) {
  const items: ({ color: string; ancho: number; alto: number; radio: number } | string)[] = [];
  // La leyenda puede ir justo antes o justo después del gráfico.
  const els: Element[] = [];
  let prev = chart.previousElementSibling;
  if (prev?.classList.contains("controls")) prev = prev.previousElementSibling;
  if (prev?.classList.contains("legend")) els.push(prev);
  for (let el = chart.nextElementSibling; el?.classList.contains("legend"); el = el.nextElementSibling) els.push(el);
  for (const el of els) {
    if (items.length) items.push("\n");
    const recorrer = (nodo: Node) => nodo.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) { const s = n.textContent?.trim(); if (s) items.push(s); }
      else if (n instanceof HTMLElement && n.getClientRects().length) {
        if (n.tagName === "I") {
          // Muestra con su forma real (círculo, cuadrado redondeado o barra fina).
          const cs = getComputedStyle(n), ancho = Math.min(12, n.offsetWidth || 12), alto = Math.min(12, n.offsetHeight || 12);
          const r = cs.borderTopLeftRadius, radio = r.endsWith("%") ? (parseFloat(r) / 100) * Math.min(ancho, alto) * 2 : parseFloat(r) || 0;
          items.push({ color: cs.backgroundColor, ancho, alto, radio: Math.min(radio, Math.min(ancho, alto) / 2) });
        }
        else recorrer(n);
      }
    });
    recorrer(el);
  }
  return items;
}

export interface Contexto { titulo: string; subtitulo: string; marca: string; fuente: string; seccion: string; lang: "es" | "en" }

/** Título y opciones activas (botones segmentados y desplegables cambiados) del bloque que contiene el gráfico. */
export function contexto(chart: Element, tituloFijo?: string) {
  const bloque = chart.closest("section.sec, .hero") ?? document.body;
  const antes = (el: Element) => !!(el.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING);
  const sub = [...bloque.querySelectorAll("h3.sub")].filter(antes).at(-1)?.textContent ?? "";
  const opciones = [...bloque.querySelectorAll<HTMLElement>(".seg button[aria-pressed='true'], select")].filter(antes).map((el) =>
    el instanceof HTMLSelectElement ? (el.selectedIndex > 0 ? el.selectedOptions[0]?.textContent ?? "" : "") : el.textContent ?? "").filter(Boolean);
  return {
    titulo: tituloFijo ?? bloque.querySelector(".sec-t")?.textContent ?? document.title,
    subtitulo: [sub, ...opciones].filter(Boolean).join(" · "),
    seccion: bloque.id || "",
  };
}

export async function compartirGrafico(chart: HTMLElement, c: Contexto) {
  const svg = chart.querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) return;
  await document.fonts?.ready;
  const r = svg.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
  const img = await svgAImagen(svg, w, h);
  const s = 2, pad = w < 600 ? 20 : 32, ancho = w + pad * 2, max = w;
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--bg").trim() || "#fff", ink = css.getPropertyValue("--ink").trim(), muted = css.getPropertyValue("--muted").trim();
  const hair = css.getPropertyValue("--hair").trim(), acento = css.getPropertyValue("--hl").trim();

  // Medición previa con un lienzo auxiliar para saber el alto total.
  const m = document.createElement("canvas").getContext("2d")!;
  const fT = `800 ${w < 600 ? 20 : 24}px ${FAMILIA}`, fS = `400 14px ${FAMILIA}`, fL = `400 13px ${FAMILIA}`;
  m.font = fT; const lt = lineas(m, c.titulo, max);
  m.font = fS; const ls = c.subtitulo ? lineas(m, c.subtitulo, max) : [];
  const ley = leyenda(chart);
  // Leyenda: se coloca en líneas como texto corrido.
  m.font = fL;
  const filasLey: { x: number; item: (typeof ley)[number] }[][] = [];
  let fila: { x: number; item: (typeof ley)[number] }[] = [], x = 0;
  for (const it of ley) {
    if (it === "\n") { filasLey.push(fila); fila = []; x = 0; continue; }
    const wi = typeof it === "string" ? m.measureText(it).width + 6 : it.ancho + 5;
    if (x + wi > max && fila.length) { filasLey.push(fila); fila = []; x = 0; }
    fila.push({ x, item: it }); x += wi;
  }
  if (fila.length) filasLey.push(fila);
  // Nota que explica algo del propio gráfico (p. ej., el asterisco de Suárez).
  const nota = chart.nextElementSibling?.classList.contains("img-note") ? chart.nextElementSibling.textContent ?? "" : "";
  m.font = `400 12px ${FAMILIA}`; const ln = nota ? lineas(m, nota, max) : [];
  const hN = ln.length * 17;
  // Pie: marca y enlace en una línea si caben; si no, el enlace debajo.
  const base = import.meta.env.BASE_URL + (c.lang === "en" ? "en/" : "");
  const visible = `danielalmazan.com${base}`.replace(/\/$/, "");
  m.font = `700 14px ${FAMILIA}`; const wMarca = m.measureText(c.marca).width;
  m.font = `600 14px ${FAMILIA}`; const juntos = wMarca + m.measureText(visible).width + 32 <= w;
  const hT = lt.length * (w < 600 ? 24 : 29), hS = ls.length * 20, hL = filasLey.length * 20;
  const alto = pad + 4 + hT + (hS ? 6 + hS : 0) + 18 + h + (hL ? 12 + hL : 0) + (hN ? 10 + hN : 0) + 24 + 44 + (juntos ? 0 : 20) + pad / 2;

  const cv = document.createElement("canvas");
  cv.width = ancho * s; cv.height = alto * s;
  const ctx = cv.getContext("2d")!;
  ctx.scale(s, s);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = acento; ctx.fillRect(0, 0, ancho, 4);
  let y = pad + 4;
  ctx.textBaseline = "top";
  ctx.font = fT; ctx.fillStyle = ink;
  for (const t of lt) { ctx.fillText(t, pad, y); y += w < 600 ? 24 : 29; }
  if (ls.length) { y += 6; ctx.font = fS; ctx.fillStyle = muted; for (const t of ls) { ctx.fillText(t, pad, y); y += 20; } }
  y += 18;
  ctx.drawImage(img, pad, y, w, h);
  y += h;
  if (filasLey.length) {
    y += 12; ctx.font = fL;
    for (const f of filasLey) {
      for (const { x: fx, item } of f) {
        if (typeof item === "string") { ctx.fillStyle = muted; ctx.fillText(item, pad + fx, y + 2); }
        else {
          ctx.fillStyle = item.color; ctx.beginPath();
          ctx.roundRect(pad + fx, y + 3 + (12 - item.alto) / 2, item.ancho, item.alto, item.radio); ctx.fill();
        }
      }
      y += 20;
    }
  }
  if (ln.length) { y += 10; ctx.font = `400 12px ${FAMILIA}`; ctx.fillStyle = muted; for (const t of ln) { ctx.fillText(t, pad, y); y += 17; } }
  y += 24;
  ctx.fillStyle = hair; ctx.fillRect(pad, y, w, 1);
  y += 14;
  ctx.font = `700 14px ${FAMILIA}`; ctx.fillStyle = ink;
  ctx.fillText(c.marca, pad, y);
  ctx.font = `600 14px ${FAMILIA}`; ctx.fillStyle = acento;
  if (juntos) { ctx.textAlign = "right"; ctx.fillText(visible, pad + w, y); ctx.textAlign = "left"; }
  else { y += 20; ctx.fillText(visible, pad, y); }
  ctx.font = `400 12px ${FAMILIA}`; ctx.fillStyle = muted;
  ctx.fillText(c.fuente, pad, y + 20);

  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
  if (!blob) return;
  const nombre = `por-decreto-${c.seccion || "grafico"}.png`;
  const file = new File([blob], nombre, { type: "image/png" });
  const enlace = `${ORIGEN}${base}${location.search}${c.seccion ? `#${c.seccion}` : ""}`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: c.titulo, text: `${c.titulo} · ${enlace}` }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
