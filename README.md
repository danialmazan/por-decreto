# Por decreto

El decreto-ley en la democracia española: base de datos y web sobre el uso del real decreto-ley desde la entrada en vigor de la Constitución (29/12/1978).

## Web

Vite + React + TypeScript, sin librerías de gráficos (SVG propio). Español en `/` e inglés en `/en/`; las vistas se comparten por URL (`?agr=semana&gob=pres:rajoy&desde=2011-12-20&hasta=2016-10-29&origen=anuncio&comp=presidente&orden=max_30d`).

```bash
npm install
npm run data      # exporta data/clean + data/derived → public/data (JSON y CSV)
npm run dev       # http://127.0.0.1:5173/por-decreto/
npm run build     # dist/ (base configurable con BASE_PATH)
npm test          # vitest + unittest del pipeline
```

Secciones: sismógrafo (día, semana, mes, año y ventanas móviles de 7, 30 y 365 días; zoom con barra de rango; filtro por Gobierno, presidente o partido; lista de RDL del periodo pulsado), calendario semanal y diario con Top 10 de semanas, fin de mandato (desde la disolución o el anuncio), comparación ordenable, perfiles de mandato y método.

## Datos

```
pipeline/            Python 3.12, sólo biblioteca estándar
  sources/boe.py         buscador de legislación, buscador del diario y XML por documento del BOE
  sources/congreso.py    iniciativas (RDL tipo 130, PL tipo 121), diputados por legislatura, est_leyes
  http.py                descargas con caché (data/raw/cache, no versionada) y reintentos
  collect.py             recogida incremental → data/interim/*.json (versionado)
  build.py               tablas limpias → data/clean/*.csv + data/audit.json
  validate.py            controles automáticos (errores bloquean, avisos se documentan)
  series.py              serie diaria con ceros explícitos y ventanas móviles
  metrics.py             métricas por gobierno/presidente/partido/legislatura, fin de mandato, resultados, producción, mayorías
  report.py              informe exploratorio HTML con SVG (sin dependencias)
  audit/                 scripts de la auditoría inicial (fase 1)
data/manual/         datos curados con fuente por fila (gobiernos, partidos)
data/derived/        agregaciones JSON/CSV para la web
data/clean/          rdl.csv, gobiernos.csv, legislaturas.csv, ciclos_electorales.csv, normas_rango_ley.csv
docs/                AUDITORIA.md, METODOLOGIA.md, EXPLORATORIO.md, exploratorio.html
```

```bash
python3 -m pipeline.build --fetch     # recoge (incremental) y construye
python3 -m pipeline.build             # reconstruye desde data/interim sin red (salvo huecos de caché)
python3 -m pipeline.metrics            # agregaciones → data/derived/
python3 -m pipeline.report             # informe exploratorio → docs/exploratorio.html
python3 -m pipeline.export_web         # datos de la web → public/data/
python3 -m unittest discover -s pipeline/tests -t .
```

Variables: `DL_HTTP_MODE=cache|refresh|offline`, `DL_HTTP_DELAY` (segundos entre peticiones, por defecto 0,35).
