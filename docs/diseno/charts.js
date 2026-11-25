/* Gráficos de las maquetas. Vanilla JS + SVG; los colores salen de variables CSS de la página. */
(function () {
  const DL = window.DL;
  const NS = "http://www.w3.org/2000/svg";
  const DAY = 864e5;
  const t0 = Date.parse(DL.inicio + "T00:00:00Z");
  const dayOf = (iso) => Math.round((Date.parse(iso + "T00:00:00Z") - t0) / DAY);
  const isoOf = (i) => new Date(t0 + i * DAY).toISOString().slice(0, 10);
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const fmt = (iso) => { const [y, m, d] = iso.split("-"); return `${+d} ${MES[+m - 1]} ${y}`; };
  const mesAnio = (iso) => { const [y, m] = iso.split("-"); return `${MESL[+m - 1]} ${y}`; };
  const dec1 = (v) => Number(v).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const govAt = (i) => DL.gobiernos.find((g) => dayOf(g.inicio) <= i && i <= dayOf(g.fin));
  const govById = (id) => DL.gobiernos.find((g) => g.id === id);
  const partyVar = (p) => `var(--p-${p.toLowerCase()})`;
  const PARTIDO = { UCD: "UCD", PSOE: "PSOE", PP: "PP", UP: "Unidas Podemos", SUMAR: "Sumar" };
  const enCurso = (g) => g.fin === DL.corte;

  /** «junio 2021 – mayo 2024 (35 meses)»; el Gobierno en curso termina en «hoy». */
  function periodo(g) {
    const ini = g.id === "suarez_2" ? "1977-07-04" : g.inicio;  // inicio real; la serie empieza en 1978
    const meses = Math.round((dayOf(g.fin) - dayOf(ini) + 1) / 30.4375);
    return `${mesAnio(ini)} – ${enCurso(g) ? "hoy" : mesAnio(g.fin)} (${meses} ${meses === 1 ? "mes" : "meses"})`;
  }
  function govCard(g, extra = "") {
    return `<b>${g.nombre}</b> <span>· ${g.partidos.map((p) => PARTIDO[p] || p).join(" + ")}</span><br>${periodo(g)}${extra}`;
  }

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function svgIn(host, w, h, label) {
    host.querySelectorAll("svg").forEach((s) => s.remove());
    const s = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": label });
    host.prepend(s);
    return s;
  }
  function tooltip(host) {
    let t = host.querySelector(".tt");
    if (!t) { t = document.createElement("div"); t.className = "tt"; t.hidden = true; host.appendChild(t); }
    return t;
  }
  function place(tt, host, x, y) {
    const r = host.getBoundingClientRect(), w = tt.offsetWidth || 200;
    tt.style.left = Math.max(0, Math.min(r.width - w, x + 12)) + "px";
    tt.style.top = Math.max(0, y + 14) + "px";
  }
  const local = (host, e) => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const width = (host) => Math.max(320, Math.min(1200, host.clientWidth || 800));

  /* ---------------------------------------------------------------- timeline (sismógrafo) */
  function timeline(host, mode = "m30") {
    const W = width(host), H = W < 600 ? 300 : 360;
    const m = { t: 30, r: 12, b: 26, l: 30 };
    const s = svgIn(host, W, H, "Decretos-leyes a lo largo del tiempo");
    const n = DL.m30.length;
    const X = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
    const ymax = mode === "m30" ? 16 : 50;
    const Y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);
    const tt = tooltip(host);
    for (const [a, b] of DL.disoluciones)
      el("rect", { x: X(dayOf(a)), y: m.t, width: Math.max(X(dayOf(b)) - X(dayOf(a)), 1.5), height: H - m.t - m.b, class: "band" }, s);
    for (let v = 0; v <= ymax; v += ymax / 4) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" }, s);
      const t = el("text", { x: m.l - 6, y: Y(v) + 4, class: "tick", "text-anchor": "end" }, s); t.textContent = v;
    }
    const step = W < 600 ? 10 : 5;
    for (let y = 1980; y <= 2026; y += step) {
      const t = el("text", { x: X(dayOf(`${y}-01-01`)), y: H - 8, class: "tick", "text-anchor": "middle" }, s); t.textContent = y;
    }
    if (mode === "m30") {
      const k = Math.max(1, Math.floor(n / (W * 1.5)));
      const pts = [];
      for (let i = 0; i < n; i += k) pts.push(`${X(i).toFixed(1)},${Y(Math.max(...DL.m30.slice(i, i + k))).toFixed(1)}`);
      pts.push(`${X(n - 1).toFixed(1)},${Y(DL.m30[n - 1]).toFixed(1)}`);
      el("path", { d: `M${X(0)},${Y(0)}L${pts.join("L")}L${X(n - 1)},${Y(0)}Z`, class: "area" }, s);
      el("path", { d: `M${pts.join("L")}`, class: "trace" }, s);
      el("circle", { cx: X(n - 1), cy: Y(DL.m30[n - 1]), r: 6, class: "rec" }, s);
    } else {
      const bw = (W - m.l - m.r) / DL.anual.length - 2;
      for (const [y, v] of DL.anual) {
        const x = X(dayOf(`${y}-07-01`));
        el("rect", { x: x - bw / 2, y: Y(v), width: bw, height: Y(0) - Y(v), rx: 2, class: y === +DL.corte.slice(0, 4) ? "bar partial" : "bar" }, s);
      }
    }
    // cursor + tooltip sobre el área de datos
    const cross = el("line", { y1: m.t, y2: H - m.b, class: "cross", visibility: "hidden" }, s);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t, fill: "transparent" }, s);
    hit.addEventListener("pointermove", (e) => {
      const r = s.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      const g = govAt(i), iso = isoOf(i);
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      if (mode === "m30") tt.innerHTML = `<b>${DL.m30[i]}</b> decretos-leyes en los 30 días hasta el ${fmt(iso)}<br><span>${g ? g.nombre : ""}</span>`;
      else { const y = +iso.slice(0, 4), v = (DL.anual.find((a) => a[0] === y) || [0, 0])[1]; tt.innerHTML = `<b>${v}</b> en ${y}${y === +DL.corte.slice(0, 4) ? ` (hasta el ${fmt(DL.corte)})` : ""}<br><span>${g ? g.nombre : ""}</span>`; }
      tt.hidden = false;
      const [lx] = local(host, e); place(tt, host, lx, 28);
    });
    hit.addEventListener("pointerleave", () => { tt.hidden = true; cross.setAttribute("visibility", "hidden"); });
    // franja de Gobiernos con tarjeta al pasar el cursor o enfocar con el teclado
    for (const g of DL.gobiernos) {
      const a = X(dayOf(g.inicio)), b = X(dayOf(g.fin));
      const band = el("rect", { x: a, y: 4, width: Math.max(b - a - 1, 1), height: 8, fill: partyVar(g.partido), rx: 1, class: "gov" }, s);
      if (b - a > g.nombre.length * 5.6 + 8) { const t = el("text", { x: a + 2, y: 24, class: "gl" }, s); t.textContent = g.nombre; }
      const zone = el("rect", { x: a, y: 0, width: Math.max(b - a - 1, 4), height: 28, fill: "transparent", tabindex: 0, role: "button", "aria-label": `${g.nombre}: ${periodo(g)}` }, s);
      const show = (e) => {
        band.classList.add("on"); tt.innerHTML = govCard(g); tt.hidden = false;
        const lx = e && e.clientX ? local(host, e)[0] : (a / W) * host.clientWidth; place(tt, host, lx, 18);
      };
      const hide = () => { band.classList.remove("on"); tt.hidden = true; };
      zone.addEventListener("pointermove", show); zone.addEventListener("focus", show);
      zone.addEventListener("pointerleave", hide); zone.addEventListener("blur", hide);
    }
  }

  /* ---------------------------------------------------------------- fin de mandato: desde el día 0 */
  function finMandato(host, origen = "disolucion") {
    const W = width(host), H = W < 600 ? 300 : 360, m = { t: 16, r: W < 600 ? 60 : 90, b: 30, l: 30 };
    const s = svgIn(host, W, H, origen === "anuncio" ? "Decretos-leyes acumulados desde el anuncio electoral" : "Decretos-leyes acumulados desde la disolución de las Cortes");
    const xmax = origen === "anuncio" ? 150 : 120;
    const C = DL.desde_disolucion.map((c) => ({ ...c, curva: c.curvas[origen].slice(0, xmax + 1), elecciones_dia: c.elecciones_dia[origen] }));
    const ymax = Math.max(20, Math.ceil(Math.max(...C.map((c) => c.curva.at(-1))) / 5) * 5);
    const ORIG = origen === "anuncio" ? "anuncio" : "disolución";
    const X = (k) => m.l + (k / xmax) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / ymax) * (H - m.t - m.b);
    const tt = tooltip(host);
    for (let v = 0; v <= ymax; v += 5) {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" }, s);
      const t = el("text", { x: m.l - 6, y: Y(v) + 4, class: "tick", "text-anchor": "end" }, s); t.textContent = v;
    }
    for (const k of W < 600 ? [0, 60, 120] : origen === "anuncio" ? [0, 30, 60, 90, 120, 150] : [0, 30, 60, 90, 120]) {
      const t = el("text", { x: X(k), y: H - 10, class: "tick", "text-anchor": k === 0 ? "start" : "middle" }, s);
      t.textContent = k === 0 ? ORIG : `día ${k}`;
    }
    const cur = C.find((c) => c.actual);
    if (cur) {
      el("line", { x1: X(cur.elecciones_dia), x2: X(cur.elecciones_dia), y1: m.t, y2: H - m.b, class: "elecline" }, s);
      if (W >= 600) {
        const e = el("text", { x: X(cur.elecciones_dia) + 4, y: H - m.b - 6, class: "tick" }, s);
        e.textContent = `elecciones (día ${cur.elecciones_dia})`;
      }
    }
    const orden = [...C].sort((a, b) => a.actual - b.actual);
    const paths = new Map();
    for (const c of orden) {
      const d = c.curva.map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      paths.set(c.id, el("path", { d, class: c.actual ? "cur now" : "cur" }, s));
      if (!c.actual && c.elecciones_dia < c.curva.length)
        el("circle", { cx: X(c.elecciones_dia), cy: Y(c.curva[c.elecciones_dia]), r: 2.5, class: "elec" }, s);
    }
    if (cur) {
      const k = cur.curva.length - 1;
      el("circle", { cx: X(k), cy: Y(cur.curva[k]), r: 5, class: "rec" }, s);
      const t = el("text", { x: X(k) + 9, y: Y(cur.curva[k]) + 4, class: "lab strong" }, s);
      t.textContent = `${cur.anio}: ${cur.curva[k]}`;
    }
    const cross = el("line", { y1: m.t, y2: H - m.b, class: "cross", visibility: "hidden" }, s);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, s);
    hit.addEventListener("pointermove", (e) => {
      const r = s.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      const k = Math.max(0, Math.min(xmax, Math.round(((px - m.l) / (W - m.l - m.r)) * xmax)));
      const vals = C.filter((c) => k < c.curva.length).map((c) => ({ c, v: c.curva[k] })).sort((a, b) => b.v - a.v);
      if (!vals.length) return;
      const near = vals.reduce((a, b) => (Math.abs(Y(b.v) - py) < Math.abs(Y(a.v) - py) ? b : a));
      paths.forEach((p, id) => p.classList.toggle("hover", id === near.c.id && !near.c.actual));
      cross.setAttribute("x1", X(k)); cross.setAttribute("x2", X(k)); cross.setAttribute("visibility", "visible");
      const top = vals.slice(0, 6);
      if (!top.includes(near)) top.push(near);
      const fila = ({ c, v }) => `<div class="row${c.actual ? " now" : ""}${c === near.c ? " near" : ""}"><span>${c.anio} · ${c.gob}</span><b>${v}</b></div>`;
      tt.innerHTML = `<div class="tt-h">${k === 0 ? `Día del ${ORIG}` : `Día ${k} tras ${origen === "anuncio" ? "el anuncio" : "la disolución"}`}</div>${top.map(fila).join("")}` +
        (vals.length > top.length ? `<div class="more">y ${vals.length - top.length} ciclos más</div>` : "");
      tt.hidden = false;
      const [lx, ly] = local(host, e); place(tt, host, lx, Math.min(ly, H * 0.35));
    });
    hit.addEventListener("pointerleave", () => { tt.hidden = true; cross.setAttribute("visibility", "hidden"); paths.forEach((p) => p.classList.remove("hover")); });
  }

  /* ---------------------------------------------------------------- intensidad por Gobierno */
  function govBars(host, orden = "intensidad") {
    const rows = DL.comparacion.filter((c) => c.dias >= 365)
      .sort(orden === "cronologico" ? (a, b) => govById(a.id).inicio.localeCompare(govById(b.id).inicio) : (a, b) => b.anual - a.anual);
    const W = width(host), rh = 26, H = rows.length * rh + 24, l = W < 600 ? 92 : 120, r = 46;
    const s = svgIn(host, W, H, "Decretos-leyes por año de mandato");
    const X = (v) => l + (v / 30) * (W - l - r);
    const tt = tooltip(host);
    for (let v = 0; v <= 30; v += 10) {
      el("line", { x1: X(v), x2: X(v), y1: 0, y2: H - 18, class: "grid" }, s);
      const t = el("text", { x: X(v), y: H - 4, class: "tick", "text-anchor": "middle" }, s); t.textContent = v;
    }
    rows.forEach((c, i) => {
      const g = govById(c.id), y = i * rh + 4;
      const a = el("text", { x: l - 8, y: y + 13, class: "tick", "text-anchor": "end" }, s); a.textContent = c.nombre;
      const bar = el("rect", { x: X(0), y, width: X(c.anual) - X(0), height: 17, rx: 2, fill: partyVar(g.partido), class: "gbar" }, s);
      const b = el("text", { x: X(c.anual) + 5, y: y + 13, class: "lab" }, s); b.textContent = dec1(c.anual);
      const zone = el("rect", { x: 0, y: y - 4, width: W, height: rh, fill: "transparent" }, s);
      zone.addEventListener("pointermove", (e) => {
        bar.classList.add("on");
        tt.innerHTML = govCard(g, `<br>${c.n} decretos-leyes · ${dec1(c.anual)} al año`);
        tt.hidden = false; const [lx, ly] = local(host, e); place(tt, host, lx, ly);
      });
      zone.addEventListener("pointerleave", () => { bar.classList.remove("on"); tt.hidden = true; });
    });
  }

  /* ---------------------------------------------------------------- calendario semanal (paleta de calor) */
  function isoWeekStart(y, w) {  // lunes de la semana ISO w del año y
    const j4 = Date.UTC(y, 0, 4), dow = (new Date(j4).getUTCDay() + 6) % 7;
    return new Date(j4 - dow * DAY + (w - 1) * 7 * DAY);
  }
  const weeksIn = (y) => Math.round((isoWeekStart(y + 1, 1) - isoWeekStart(y, 1)) / (7 * DAY));
  function calendar(host) {
    const W = width(host), years = [], corte = Date.parse(DL.corte + "T00:00:00Z");
    for (let y = 1979; y <= +DL.corte.slice(0, 4); y++) years.push(y);
    const l = 34, gap = 1, cw = (W - l - 6) / 53 - gap, ch = Math.max(4, Math.min(9, cw)), H = years.length * (ch + gap) + 6;
    const s = svgIn(host, W, H, "Calendario semanal de decretos-leyes desde 1979");
    const map = new Map(DL.semanas.map(([y, w, n]) => [y * 100 + w, n]));
    const tt = tooltip(host);
    years.forEach((y, r) => {
      const yy = r * (ch + gap) + 3;
      if (y % 5 === 0) { const t = el("text", { x: l - 8, y: yy + ch, class: "tick", "text-anchor": "end" }, s); t.textContent = y; }
      const gy = govAt(Math.max(0, dayOf(`${y}-07-01`)));
      el("rect", { x: l - 5, y: yy, width: 3, height: ch, fill: gy ? partyVar(gy.partido) : "none" }, s);
      for (let w = 1; w <= weeksIn(y); w++) {
        const ini = isoWeekStart(y, w);
        if (ini.getTime() > corte) break;  // semanas que aún no existen: no se dibujan
        const i0 = ini.toISOString().slice(0, 10), fin = new Date(ini.getTime() + 6 * DAY).toISOString().slice(0, 10);
        const g = govAt(Math.min(Math.max(dayOf(i0) + 3, 0), DL.m30.length - 1));
        const n = map.get(y * 100 + w) || 0;
        const c = el("rect", { x: l + (w - 1) * (cw + gap), y: yy, width: cw, height: ch, rx: 1, class: n ? `wk h${Math.min(n, 5)}` : "wk" }, s);
        c.dataset.k = `${n}|${i0}|${fin}|${g ? g.id : ""}|${w}`;
      }
    });
    s.addEventListener("pointermove", (e) => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k) { tt.hidden = true; return; }
      const [n, a, b, gid, w] = k.split("|"), g = govById(gid);
      const que = n === "0" ? "Ningún decreto-ley" : `${n} decreto${n === "1" ? "-ley" : "s-leyes"}`;
      tt.innerHTML = `<b>${que}</b><br>Semana ${w} · ${fmt(a)} – ${fmt(b)}<br><span>${g ? `${g.nombre} · ${g.partidos.map((p) => PARTIDO[p] || p).join(" + ")}` : ""}</span>`;
      tt.hidden = false; const [lx, ly] = local(host, e); place(tt, host, lx, ly);
    });
    s.addEventListener("pointerleave", () => (tt.hidden = true));
  }

  /* ---------------------------------------------------------------- top 10 semanas */
  function topWeeks(host, n = 10) {
    const all = DL.semanas.map(([y, w, c]) => ({ y, w, c, ini: isoWeekStart(y, w) })).sort((a, b) => b.c - a.c || b.ini - a.ini);
    const corteV = all[n - 1].c, rows = all.filter((x) => x.c > corteV).concat(all.filter((x) => x.c === corteV)).slice(0, n);
    const empatadas = all.filter((x) => x.c === corteV).length - rows.filter((x) => x.c === corteV).length;
    const W = width(host), rh = 30, H = rows.length * rh + 8, l = W < 600 ? 150 : 210, r = 30;
    const s = svgIn(host, W, H, "Las 10 semanas con más decretos-leyes");
    const vmax = Math.max(...rows.map((x) => x.c));
    const X = (v) => l + (v / vmax) * (W - l - r);
    const tt = tooltip(host);
    rows.forEach((x, i) => {
      const y = i * rh + 4, a = x.ini.toISOString().slice(0, 10), b = new Date(x.ini.getTime() + 6 * DAY).toISOString().slice(0, 10);
      const g = govAt(Math.min(Math.max(dayOf(a) + 3, 0), DL.m30.length - 1));
      const rank = rows.findIndex((z) => z.c === x.c) + 1;
      const t1 = el("text", { x: 0, y: y + 12, class: "lab" }, s); t1.textContent = `${rank}. ${fmt(a)}`;
      const t2 = el("text", { x: 0, y: y + 25, class: "tick" }, s); t2.textContent = g ? g.nombre : "";
      const bar = el("rect", { x: l, y: y + 3, width: X(x.c) - l, height: 18, rx: 2, fill: g ? partyVar(g.partido) : "var(--muted)", class: "gbar" }, s);
      const v = el("text", { x: X(x.c) + 6, y: y + 17, class: "lab strong" }, s); v.textContent = x.c;
      const zone = el("rect", { x: 0, y, width: W, height: rh, fill: "transparent" }, s);
      zone.addEventListener("pointermove", (e) => {
        bar.classList.add("on");
        tt.innerHTML = `<b>${x.c} decretos-leyes</b><br>Semana ${x.w} · ${fmt(a)} – ${fmt(b)}${g ? `<br>${govCard(g)}` : ""}`;
        tt.hidden = false; const [lx, ly] = local(host, e); place(tt, host, lx, ly);
      });
      zone.addEventListener("pointerleave", () => { bar.classList.remove("on"); tt.hidden = true; });
    });
    return { empatadas, valor: corteV };
  }

  /* ---------------------------------------------------------------- lecturas y textos */
  function lectura() {
    const v = DL.m30, n = v.length, hoy = v[n - 1], max = Math.max(...v);
    // Episodios: picos separados por más de 30 días, para que el «top» compare episodios y no días sueltos.
    const idx = [...v.keys()].sort((a, b) => v[b] - v[a]), picos = [];
    for (const i of idx) { if (picos.length >= 60) break; if (picos.every((p) => Math.abs(p - i) > 30)) picos.push(i); }
    const top = picos.filter((i) => v[i] > hoy && i < n - 31).length + 1;
    const pct = Math.floor((100 * v.filter((x) => x < hoy).length) / n);
    const pill = hoy >= max && hoy > 0 ? "Récord desde 1978" : top <= 10 ? `Top ${top} desde 1978` : `Percentil ${pct}`;
    return { hoy, pill, top, pct };
  }

  function frases(origen = "disolucion") {
    const cur = DL.desde_disolucion.find((c) => c.actual);
    const prev = DL.desde_disolucion.filter((c) => !c.actual);
    const curva = (c) => c.curvas[origen];
    const k = cur ? curva(cur).length - 1 : 0;
    const igual = prev.map((c) => ({ c, v: curva(c)[Math.min(k, curva(c).length - 1)] })).sort((a, b) => b.v - a.v);
    const desde = origen === "anuncio" ? `el anuncio electoral (${cur ? fmt(cur.anuncio) : ""})` : `la disolución de las Cortes (${cur ? fmt(cur.disolucion) : ""})`;
    const gob = DL.gobiernos.at(-1), cg = DL.comparacion.find((c) => c.id === gob.id);
    return {
      gobierno: `${cg.n} con ${gob.nombre} (${dec1(cg.anual)} al año)`,
      fin: cur ? `En los ${k + 1} días desde ${desde} se han aprobado ${curva(cur)[k]} decretos-leyes. ` +
        `En el mismo número de días, el máximo anterior era de ${igual[0].v} (${igual.filter((x) => x.v === igual[0].v).map((x) => `${x.c.anio}, ${x.c.gob}`).join("; ")}).` : "",
    };
  }

  function wireControls() {
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
      const root = document.documentElement, dark = root.dataset.theme === "dark";
      root.dataset.theme = dark ? "light" : "dark";
      b.setAttribute("aria-pressed", String(!dark));
      try { localStorage.setItem("tema", root.dataset.theme); } catch (e) { /* sin almacenamiento */ }
    }));
    document.querySelectorAll("[data-seg]").forEach((grp) => grp.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      grp.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      grp.dispatchEvent(new CustomEvent("seg", { detail: b.dataset.v }));
    }));
  }

  window.Charts = { timeline, finMandato, govBars, calendar, topWeeks, lectura, frases, wireControls, fmt, dec1, periodo };
})();
