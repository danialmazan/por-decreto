# Auditoría de fuentes: decreto-ley en la democracia española

Fase 1, fecha de la auditoría: 25/11/2026. Todas las cifras salen de descargas reales guardadas en `data/raw/audit_2026-11-25/`. Se reproducen con:

```bash
python3 -I pipeline/audit/analisis_preliminar.py data/raw/audit_2026-11-25
```

Scripts de descarga: `pipeline/audit/fetch_boe_listado.py`, `fetch_congreso_rdl.py` y `fetch_congreso_estleyes.py`.

---

## 1. Fuentes evaluadas

### 1.1 BOE: buscador avanzado de legislación (lista maestra)
- **Endpoint:** `https://www.boe.es/buscar/legislacion_ava.php` (GET).
- **Parámetros clave:**
  - `campo[0]=ID_SRC&dato[0]=1`: ámbito estatal. Excluye autonómicos y europeos.
  - `campo[4]=ID_RNGS&dato[4]=<rango>`: `1320` Real Decreto-ley, `1300` Ley, `1290` Ley Orgánica, `1310` Real Decreto Legislativo y `1340` Real Decreto.
  - `campo[12]=FAP&dato[12][0]=AAAA-MM-DD&dato[12][1]=…`: **fecha de aprobación** (fecha de la disposición).
  - `page_hits=2000` y `sort_field[0]=FPU&sort_order[0]=asc`.
- **Cobertura:** incluye normas derogadas o sin vigencia, porque no se limita a la base consolidada. Va desde 1978 hasta el BOE del día.
- **Coste:** 3 tramos de fechas por rango, 12 peticiones en total para las cuatro categorías con rango de ley.
- **Limitaciones:**
  - Es HTML, así que hay que parsearlo, y el formato puede cambiar.
  - Algún título tiene variantes («8/1994 de 5 de agosto», «de 2 marzo»).
  - Hay un duplicado conocido: el RDL 16/1982 aparece como BOE-A-1982-23296 y -23818.

### 1.2 BOE: XML por documento
- **Endpoint:** `https://www.boe.es/diario_boe/xml.php?id=BOE-A-AAAA-NNNN`.
- **Qué aporta:**
  - `fecha_disposicion`, `fecha_publicacion`, `numero_oficial`, `rango`, `url_eli` y estado de vigencia (`estatus_derogacion`, `vigencia_agotada`).
  - `analisis/referencias/posteriores`, con el resultado parlamentario publicado:
    - código `300` / `301`: «SE PUBLICA Acuerdo de convalidación, por Resolución de …»;
    - código `210`: «SE DEROGA, por Resolución de …», que es la derogación en el trámite de convalidación.
- **Atención:** el código `210` también aparece cuando otra ley deroga después la norma, que es pérdida de vigencia y no derogación parlamentaria. Solo cuenta como derogación parlamentaria cuando el texto es «por Resolución», y se cruza siempre con el Congreso.
- **Comprobado en:** RDL 50/1978, 1/1979 (derogado el 06/02/1979), 2/1979, 11/1979, 19/1979, 4/2017 (derogado el 16/03/2017), 7/2023 (derogado el 10/01/2024) y 1/2024 (convalidado el 13/06/2024).
- **Coste:** unas 770 peticiones para la carga inicial. Después solo se piden las nuevas.

### 1.3 BOE: API de sumario diario
- **Endpoint:** `https://www.boe.es/datosabiertos/api/boe/sumario/AAAAMMDD` (JSON).
- Funciona desde 1979, pero reconstruir el histórico exigiría unas 17.000 peticiones, una por día. **Se descarta** para el histórico y tampoco hace falta para la actualización semanal (ver § 4).

### 1.4 BOE: API de legislación consolidada
- **Endpoint:** `https://www.boe.es/datosabiertos/api/legislacion-consolidada`.
- Solo contiene normas consolidadas. **Se descarta** como fuente principal, tal como pedía el encargo.

### 1.5 Congreso: búsqueda de iniciativas (resultado parlamentario)
- **Endpoint:** `POST https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=filtrarListado&p_p_cacheability=cacheLevelPage`.
- **Parámetros:** `_iniciativas_legislatura` (0 = Constituyente … 15 = XV), `_iniciativas_tipo` (`130` = Real Decreto-ley, `121` = Proyecto de ley) y `_iniciativas_paginaActual` (25 resultados por página).
- **Qué aporta:** `id_iniciativa` (expediente `130/xxxxxx`), `titulo`, `fecha_presentado`, `fecha_calificado` y `resultado_tram`. Este último toma los valores «Convalidado», «Convalidado y tramitado como proyecto de ley», «Derogado», «Trasladado al próximo Congreso» y «Tramitado por completo sin req. acuerdo…».
- **Cobertura:** desde la Constituyente hasta la XV. Unas 40 peticiones para el tipo 130.
- **Proyectos de ley derivados:** los del tipo 121 con «(procedente del Real Decreto-ley N/AAAA…)» en el título dan el resultado de la tramitación (aprobado con o sin modificaciones, caducado, subsumido). En las legislaturas VI y XIV hay 19 y 54 de estos PL, la misma cifra que los «convalidado y tramitado» del tipo 130 en cada legislatura.
- **Limitaciones:** el campo es de texto libre, con mayúsculas variables, y hay erratas en los títulos («Real Decreto Ley», «REAL DECRETO 5/1988»). Hay que normalizar y casar por (número, año).

### 1.6 Congreso: `app.congreso.es/est_leyes` (contraste oficial)
- **Endpoint:** `https://app.congreso.es/est_leyes/do/get?v=AAAA&action=load` (HTML).
- Lista oficial anual de leyes orgánicas, leyes ordinarias, reales decretos-leyes y reales decretos legislativos.
- **Cobertura:** 1979–2025. 2026 todavía no está.
- Los rótulos varían según el año: «REALES DECRETOS-LEYES» o «REALES DECRETOS LEYES», y «REALES DECRETOS-LEGISLATIVO».

### 1.7 Congreso: datos abiertos
- `https://www.congreso.es/webpublica/opendata/iniciativas/*.json` (ProyectosDeLey, IniciativasLegislativasAprobadas…).
- **Solo cubre la legislatura en curso (XV).** Sirve de complemento.

### 1.8 Gobiernos, legislaturas y elecciones
- **BOE (rango 1340):**
  - RD de disolución de las Cortes y convocatoria de elecciones. Están localizados los 14 desde 1986; los de 1979 y 1982 tienen otro título y hay que buscarlos aparte.
  - RD de nombramiento y cese del Presidente del Gobierno.
  - En la fase 2 serán la fuente de las fechas exactas de inicio, fin y periodos en funciones.
- **Ministerio del Interior (infoelectoral) y Congreso:** escaños por partido en cada elección.
- **La Moncloa:** contraste de la composición histórica de los gobiernos y de las coaliciones.

---

## 2. Prueba de extracción

- **RDL estatales desde el 29/12/1978:** 766 filas, **765 normas únicas**.
- **Por año de numeración:**

| Año | RDL |
|---|---|
| 1978 | 1 (el 50/1978, de 29/12) |
| 1979 | 22 |
| 1980 | 16 |
| 1981 | 19 |
| 1982 | 26 |
| 1983 | 9 |
| 1984 | 15 |
| 1985 | 8 |
| 1986 | 3 |
| 1987 | 7 |
| 1988 | 7 |
| 1989 | 7 |
| 1990 | 6 |
| 1991 | 5 |
| 1992 | 6 |
| 1993 | 22 |
| 1994 | 13 |
| 1995 | 12 |
| 1996 | 17 |
| 1997 | 29 |
| 1998 | 20 |
| 1999 | 22 |
| 2000 | 10 |
| 2001 | 16 |
| 2002 | 10 |
| 2003 | 7 |
| 2004 | 11 |
| 2005 | 16 |
| 2006 | 13 |
| 2007 | 11 |
| 2008 | 10 |
| 2009 | 14 |
| 2010 | 14 |
| 2011 | 20 |
| 2012 | 29 |
| 2013 | 17 |
| 2014 | 17 |
| 2015 | 12 |
| 2016 | 7 |
| 2017 | 21 |
| 2018 | 28 |
| 2019 | 18 |
| 2020 | 39 |
| 2021 | 32 |
| 2022 | 20 |
| 2023 | 8 |
| 2024 | 11 |
| 2025 | 17 |
| **2026** | **45** (hasta el 24/11, máximo de la serie) |

- **Otras normas con rango de ley:** el BOE devuelve 1.567 filas de leyes ordinarias, 397 de leyes orgánicas y 70 de RDLeg. Son filas, todavía sin deduplicar.
- **Fechas:** la fecha del título coincide con `fecha_disposicion`, que es la del Consejo de Ministros. La publicación suele ser al día siguiente. Excepciones ya detectadas:
  - El RDL 1/1979, de 8 de enero, se publicó el 26/01/1979.
  - El RDL 21/1979, de 29/12/1979, se publicó en 1980.
  - El RDL 27/2026, de 29/09, se publicó el 01/10.
  - El RDL 50/1978 es del 29/12/1978, el mismo día en que entra en vigor la Constitución. Es un caso de frontera, que se **incluye y se marca**.

## 3. Contraste de totales

### 3.1 BOE frente a `est_leyes` (1979–2025)
Una vez deduplicado por número, **los RDL coinciden en los 47 años**. Quedan estas discrepancias en otras categorías:

| Año | Categoría | BOE | Congreso | Hipótesis / acción |
|---|---|---|---|---|
| 1979 | RDLeg | 0 | 1 | Revisar: posible RDLeg de 1979 con otro rango en el BOE |
| 1980 | RDLeg | 3 | 1 | Revisar |
| 1984 | LO | 9 | 10 | Revisar: posible LO con rango distinto en el BOE |
| 1985 | Ley | 50 | 51 | Revisar |
| 1986 | RDLeg | 15 | 1 | `est_leyes` parece omitir los RDLeg de adaptación a la CEE. El BOE se toma como fuente principal |

### 3.2 Cruce norma a norma BOE ↔ Congreso (iniciativas tipo 130)
- **752 de 765 casan** por (número, año).
- **13 sin expediente todavía:** los RDL 33/2026–45/2026, aprobados con las Cortes ya disueltas. Su estado es **pendiente**.
- **56 están en el Congreso y no en el BOE:** son los RDL preconstitucionales de 1977–1978 de la legislatura Constituyente, y quedan excluidos.
- **Resultado parlamentario de los 752 casados:**
  - convalidado: 483;
  - convalidado y tramitado como proyecto de ley: 249;
  - derogado: 19;
  - trasladado al próximo Congreso: 1.
- **Derogados por legislatura:** Constituyente 1, VIII 1, XII 2, XIV 1, **XV 14**.

## 4. Actualización (diseño)
- **Cron semanal**, el lunes de madrugada, más ejecución manual:
  - Se repite la consulta del buscador del BOE para RDL con `FAP` en los últimos 60 días y se piden los XML de las normas nuevas.
  - Se refrescan contra el Congreso los RDL de los últimos 12 meses que siguen pendientes o sin tramitación cerrada.
- **Revisión mensual completa** de los listados (unas 12 peticiones) para detectar cambios retroactivos.
- **Publicación:** solo si pasan las validaciones. Si fallan, se conservan los últimos datos válidos.

## 5. Análisis preliminar: ¿muchos RDL al final del mandato?
La tasa se mide en RDL por cada 30 días.
- **Disolución → elecciones:** periodo con las Cortes disueltas.
- **Elecciones → nuevo Gobierno:** Gobierno en funciones. Las fechas de toma de posesión son provisionales y se fijarán con los RD de nombramiento del BOE en la fase 2.
- **Ratio:** tasa con las Cortes disueltas dividida entre la tasa media de la legislatura.

| Disolución | Presidente | Legislatura | 90 d previos | Disolución → elecciones | Elecciones → nuevo Gob. | Ratio |
|---|---|---|---|---|---|---|
| 27/08/1982 | Calvo-Sotelo | 1,44 | 1 (0,33) | 9 en 62 d (4,35) | 1 (0,83) | ×3,03 |
| 22/04/1986 | González | 0,92 | 1 (0,33) | 1 en 61 d (0,49) | 0 | ×0,53 |
| 01/09/1989 | González | 0,51 | 1 (0,33) | 0 en 58 d | 1 (0,77) | ×0,00 |
| 12/04/1993 | González | 0,55 | 3 (1,00) | 5 en 55 d (2,73) | 3 (2,37) | ×4,98 |
| 08/01/1996 | González | 1,21 | 3 (1,00) | 4 en 55 d (2,18) | 0 | ×1,81 |
| 17/01/2000 | Aznar | 1,80 | 7 (2,33) | 0 en 55 d | 0 | ×0,00 |
| 19/01/2004 | Aznar | 0,89 | 2 (0,67) | 0 en 55 d | 0 | ×0,00 |
| 14/01/2008 | Zapatero | 1,09 | 2 (0,67) | 1 en 55 d (0,55) | 0 | ×0,50 |
| 26/09/2011 | Zapatero | 1,18 | 7 (2,33) | 4 en 55 d (2,18) | 1 (0,94) | ×1,85 |
| 26/10/2015 | Rajoy | 1,59 | 2 (0,67) | 1 en 55 d (0,55) | 2 (0,19) | ×0,34 |
| 03/05/2016 | Rajoy (en funciones) | 0,22 | 1 (0,33) | 0 en 54 d | 1 (0,23) | ×0,00 |
| 04/03/2019 | Sánchez | 1,90 | **16 (5,33)** | 3 en 55 d (1,64) | 8 (0,92) | ×0,86 |
| 24/09/2019 | Sánchez (en funciones) | 0,20 | 1 (0,33) | 4 en 47 d (2,55) | 3 (1,41) | ×12,68 |
| 29/05/2023 | Sánchez | 2,27 | 3 (1,00) | 1 en 55 d (0,55) | 0 | ×0,24 |
| **05/10/2026** | **Sánchez** | 1,49 | 8 (2,67) | **18 en 52 d (10,38)** | — | **×6,98** |

**Lectura preliminar**, como asociación descriptiva:
1. **No es lo habitual.** En la mediana de los 14 ciclos cerrados, el ritmo con las Cortes disueltas es la mitad del de la legislatura (×0,52). En 7 de 14 disoluciones se aprobaron 0 o 1 RDL. Ritmos de unos 2–4 RDL al mes con las Cortes disueltas solo se dieron en 1982, 1993, 1996, 2011 y septiembre de 2019. Este último ratio es muy alto porque la legislatura previa duró apenas cinco meses.
2. **2026 no tiene precedentes en la serie:** 18 RDL entre la disolución (05/10) y el 25/11, más del doble que en cualquier ciclo anterior completo (el máximo previo fue 9, en 1982). Por tasa, son 10,4 al mes frente a 4,35 en 1982. Además, el 29/09, seis días antes de disolver, se aprobaron 4 RDL.
3. **En 2019 el patrón fue distinto:** la concentración se dio *antes* de la disolución (16 RDL en los 90 días previos), no después.
4. **Matiz institucional:** los RDL aprobados con las Cortes disueltas los convalida la Diputación Permanente del Congreso (art. 86.2 y 78 CE). Los 13 últimos aún no tienen expediente.
5. **Esto no clasifica el contenido de las normas** ni su motivación. En la web será la sección «Fin de mandato / Elecciones convocadas», con comparaciones a igualdad de días desde la disolución.

> **Actualización (fase 2).** La tabla anterior es preliminar. Con las fechas oficiales que ya están en `data/clean/ciclos_electorales.csv`, cambia lo siguiente:
> - **Fecha de disolución:** se toma la de entrada en vigor del RD. En 1982 fue el 31/08, no el 27/08. Con ello, el ciclo de 1982 pasa a 7 RDL con las Cortes disueltas, en lugar de 9, porque dos RDL se aprobaron el mismo día que el RD de disolución.
> - **Tomas de posesión:** salen de los RD de nombramiento del BOE.
> - **2026:** 18 RDL en 51 días (del 06/10 al 25/11), con un ratio de ×6,97.
> - **Mediana histórica del ratio:** ×0,53. Solo 5 de 14 ciclos superan ×1.

## 6. Dificultades metodológicas identificadas
1. Hay dos fuentes del resultado parlamentario (BOE y Congreso). El Congreso es la principal, el BOE sirve de contraste y las discrepancias se marcan.
2. «SE DEROGA» en el BOE es ambiguo: puede ser una derogación parlamentaria o una pérdida de vigencia posterior.
3. Los RDL aprobados con las Cortes disueltas o el Gobierno en funciones figuran en el expediente de la legislatura saliente. Se asignan al Gobierno por la fecha de aprobación.
4. Las fechas exactas de los gobiernos y los periodos en funciones requieren los RD de nombramiento y cese.
5. La composición parlamentaria cambia dentro de la legislatura. Se usan los escaños obtenidos en las elecciones y se documenta.
6. Hay divergencias en los RDLeg entre el BOE y `est_leyes`.
7. La serie empieza en el RDL 50/1978. Los RDL de la legislatura Constituyente anteriores al 29/12/1978 se excluyen.
8. Erratas y variantes en los títulos, tanto en el BOE como en el Congreso: se normaliza y se casa por (número, año), con validación de la fecha.
