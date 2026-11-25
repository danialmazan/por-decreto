import { useEffect, useState } from "react";
import { cargarRdl, urlBoe, urlCongreso, type Datos, type Gov, type Rdl } from "../data";
import { fmtDia, useLang, useT } from "../i18n";

export interface Seleccion { start: number; end: number; label: string; keep?: (g: Gov | undefined) => boolean }

/** Lista de los decretos-leyes de un periodo, con enlaces al BOE y al expediente del Congreso. */
export function RdlList({ datos, sel, onClose }: { datos: Datos; sel: Seleccion; onClose: () => void }) {
  const l = useLang(), t = useT();
  const [rdl, setRdl] = useState<Rdl[] | null>(null);
  useEffect(() => { cargarRdl().then(setRdl); }, []);
  const filas = (rdl ?? []).filter((r) => r.dia >= sel.start && r.dia <= sel.end && (!sel.keep || sel.keep(datos.govById(r.gobierno))))
    .sort((a, b) => b.dia - a.dia || b.numero - a.numero);
  return (
    <div className="rdl-list" aria-live="polite">
      <div className="rdl-head">
        <h3>{rdl ? t.lista(filas.length, sel.label) : t.cargando}</h3>
        <button type="button" className="link" onClick={onClose}>{t.cerrar}</button>
      </div>
      <ol>
        {filas.slice(0, 300).map((r) => {
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
    </div>
  );
}
