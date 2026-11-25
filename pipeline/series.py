"""Serie diaria completa (con ceros explícitos) y ventanas móviles.

Ventana móvil de N días en el día d = RDL aprobados en [d-(N-1), d] (el día seleccionado y los N-1 anteriores).
Con `segmento`, la ventana sólo cuenta RDL del mismo segmento (p. ej. gobierno) que el día d, para no
atribuir a un gobierno decretos de otro cuando la ventana atraviesa un cambio de mandato.
"""
from __future__ import annotations

import collections
import datetime as dt
from typing import Callable, Iterable


def dias(inicio: dt.date, fin: dt.date) -> Iterable[dt.date]:
    d = inicio
    while d <= fin:
        yield d
        d += dt.timedelta(days=1)


def serie_diaria(fechas: Iterable[str], inicio: dt.date, fin: dt.date,
                 segmento: Callable[[dt.date], str] | None = None, ventanas=(7, 30, 365)) -> list[dict]:
    cnt = collections.Counter(dt.date.fromisoformat(f) for f in fechas)
    out, hist = [], []
    for d in dias(inicio, fin):
        n = cnt.get(d, 0)
        seg = segmento(d) if segmento else None
        hist.append((d, n, seg))
        iso = d.isocalendar()
        row = {"fecha": d.isoformat(), "n": n, "iso_anio": iso[0], "iso_semana": iso[1],
               "segmento": seg}
        for w in ventanas:
            lo = d - dt.timedelta(days=w - 1)
            vals = [x for x in hist[-w:] if x[0] >= lo]
            row[f"m{w}"] = sum(x[1] for x in vals)
            if segmento:
                row[f"m{w}_seg"] = sum(x[1] for x in vals if x[2] == seg)
            row[f"m{w}_completa"] = lo >= inicio  # la ventana no empieza antes de la serie
        out.append(row)
    return out
