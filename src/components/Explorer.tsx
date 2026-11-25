import { useEffect, useMemo, useState } from "react";
import { cargarRdl, urlBoe, urlCongreso, type Datos, type Rdl } from "../data";
import { fmtDia, useLang, useT } from "../i18n";
import { toDay } from "../lib/time";
import { Section } from "./ui";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Explorer({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const [rdl, setRdl] = useState<Rdl[] | null>(null);
  const [q, setQ] = useState(""), [desde, setDesde] = useState(""), [hasta, setHasta] = useState("");
  const [gob, setGob] = useState(""), [res, setRes] = useState(""), [n, setN] = useState(50);
  useEffect(() => { cargarRdl().then(setRdl); }, []);
  const filas = useMemo(() => {
    if (!rdl) return [];
    const qq = norm(q.trim());
    return rdl.filter((r) => (!qq || norm(r.titulo).includes(qq) || `${r.numero}/${r.anio}` === qq)
      && (!desde || r.dia >= toDay(desde)) && (!hasta || r.dia <= toDay(hasta))
      && (!gob || r.gobierno === gob || datos.govById(r.gobierno)?.presidente_id === gob.replace("pres:", ""))
      && (!res || (res === "tramitado" ? r.tramitado_pl === "si" : r.convalidacion === res)))
      .sort((a, b) => b.dia - a.dia || b.numero - a.numero);
  }, [rdl, q, desde, hasta, gob, res, datos]);
  // Resultados plegados por defecto; se despliegan en cuanto el usuario filtra o busca.
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { setN(50); if (q || desde || hasta || gob || res) setAbierto(true); }, [q, desde, hasta, gob, res]);

  function descargar() {
    const cols = ["id", "numero", "anio", "fecha", "publicacion", "gobierno", "convalidacion", "fecha_convalidacion", "tramitado_pl", "resultado_pl", "titulo"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...filas.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "decretos-leyes-seleccion.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <Section id="explorador" title={t.expTitulo} lede={t.expLede}>
      <div className="filtros">
        <label className="grow"><span className="vh">{t.buscar}</span><input type="search" placeholder={t.buscar} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>{t.desdeF} <input type="date" value={desde} min={datos.meta.inicio} max={datos.meta.corte} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>{t.hastaF} <input type="date" value={hasta} min={datos.meta.inicio} max={datos.meta.corte} onChange={(e) => setHasta(e.target.value)} /></label>
        <label><span className="vh">{t.filtro}</span>
          <select value={gob} onChange={(e) => setGob(e.target.value)}>
            <option value="">{t.todos}</option>
            <optgroup label={t.grupos.presidente}>{[...new Map(datos.govs.map((g) => [g.presidente_id, g])).values()].map((g) => <option key={g.presidente_id} value={`pres:${g.presidente_id}`}>{g.presidente}</option>)}</optgroup>
            <optgroup label={t.grupos.gobierno}>{datos.govs.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</optgroup>
          </select></label>
        <label><span className="vh">{t.resultado}</span>
          <select value={res} onChange={(e) => setRes(e.target.value)}>
            <option value="">{t.resultado}: {t.todos2}</option>
            {["convalidado", "derogado", "pendiente"].map((k) => <option key={k} value={k}>{t.estado[k]}</option>)}
            <option value="tramitado">{t.tramitado}</option>
          </select></label>
      </div>
      <div className="rdl-head"><h3>{rdl ? t.resultados_n(filas.length) : t.cargando}</h3>{filas.length > 0 && <button type="button" className="link" onClick={descargar}>{t.descargaFiltro}</button>}</div>
      <details open={abierto} onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)} className="resultados">
      <summary>{t.verResultados(filas.length)}</summary>
      <ol className="rdl-list plain">
        {filas.slice(0, n).map((r) => {
          const g = datos.govById(r.gobierno);
          return (
            <li key={r.id}>
              <div className="rdl-t"><b>RDL {r.numero}/{r.anio}</b> · {fmtDia(r.dia, l)}{g ? ` · ${g.nombre}` : ""}</div>
              <div className="rdl-title">{r.titulo.replace(/^Real Decreto-ley \d+\/\d{4},? de [^,]+, /i, "")}</div>
              <div className="rdl-meta">
                <span className={`estado ${r.convalidacion}`}>{t.estado[r.convalidacion] ?? r.convalidacion}</span>
                {r.tramitado_pl === "si" && <span className="estado">{t.tramitado}</span>}
                <a href={urlBoe(r.id)} target="_blank" rel="noopener">{t.boe}</a>
                {r.expediente && r.legislatura_expediente !== null && <a href={urlCongreso(r.expediente, r.legislatura_expediente)} target="_blank" rel="noopener">{t.congreso}</a>}
              </div>
            </li>
          );
        })}
      </ol>
      {filas.length > n && <button type="button" className="link" onClick={() => setN(n + 100)}>{t.masResultados}</button>}
      </details>
    </Section>
  );
}
