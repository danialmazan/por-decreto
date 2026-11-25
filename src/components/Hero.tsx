import { useMemo } from "react";
import { lectura, rolling } from "../lib/agg";
import type { Datos } from "../data";
import { dec1, fmtDia, useLang, useT } from "../i18n";

export function Hero({ datos }: { datos: Datos }) {
  const l = useLang(), t = useT();
  const m30 = useMemo(() => rolling(datos.serie, 30).map((b) => b.value), [datos]);
  const L = lectura(m30);
  const total = datos.serie.n.reduce((a, b) => a + b, 0);
  const anios = (datos.corte - datos.serie.d0 + 1) / 365.25;
  const gov = datos.govs[datos.govs.length - 1];
  const cg = datos.comparacion.gobierno.find((c) => c.id === gov.id);
  const pill = L.tipo === "record" ? t.record : L.tipo === "top" ? t.top(L.top) : t.percentil(L.pct);
  return (
    <div className="reading">
      <span className="big" aria-describedby="lectura-txt">{L.hoy}</span>
      <div className="what" id="lectura-txt">
        {t.lectura}
        <ul className="facts">
          <li>{t.hasta(fmtDia(datos.corte, l))}</li>
          {cg && <li><b>{t.conGob(cg.n, gov.nombre, dec1(cg.media_anualizada, l))}</b></li>}
          <li>{t.desde1978(total, dec1(total / anios, l))}</li>
        </ul>
        <span className="flag">{pill}</span>
      </div>
    </div>
  );
}
