# Metodología y diccionario de datos

Este documento sirve de base para la sección metodológica de la web y se mantiene junto al código. Cada cifra que aparezca en la web se calcula a partir de `data/clean/`.

## 1. Universo
- **Qué entra:** reales decretos-leyes **estatales** (rango BOE `1320`, ámbito estatal) aprobados desde el **29/12/1978**, día en que entra en vigor la Constitución. El RDL 50/1978, aprobado ese mismo día, se incluye y se marca (`frontera_entrada_en_vigor_ce`).
- **Qué no entra:** reales decretos ordinarios, reales decretos legislativos (solo cuentan como producción normativa), decretos-leyes autonómicos, correcciones de errores y duplicados.
- **Duplicados:** se identifican por (número, año). Se conserva el primer identificador del BOE y los descartados se listan en `rdl_duplicados_descartados.csv`. Ahora mismo solo hay uno: el RDL 16/1982.

## 2. Fechas
- **Fecha principal:** la fecha de aprobación, es decir, la fecha de la disposición, que coincide con la del Consejo de Ministros que figura en el título. Se comprueba contra `fecha_disposicion` del XML del BOE y, si no coincide, se marca `fecha_titulo_distinta_de_fecha_disposicion`. Hoy no hay ningún caso.
- **Días hasta publicación:** `fecha_publicacion − fecha_aprobacion`.
  - Lo habitual es 1 día.
  - Hay 59 casos de más de 7 días, casi todos entre 1979 y 1988.
- **Serie diaria:** cubre todos los días desde el 29/12/1978 hasta la fecha de corte, con ceros explícitos.
- **Ventana móvil de N días en el día d:** RDL aprobados en [d−(N−1), d].
  - `mN_completa` indica si la ventana empieza antes del inicio de la serie.
  - `mN_seg` cuenta solo los RDL del Gobierno vigente en d, para no atribuirle decretos de otro Gobierno cuando la ventana atraviesa un cambio de mandato.
- **Semanas:** ISO (de lunes a domingo, semana 1 la que contiene el primer jueves). Se tratan los años de 53 semanas y los bisiestos.

## 3. Gobiernos, legislaturas y fases
- **Gobierno:**
  - Cada nombramiento de presidente del Gobierno (RD del BOE, Sección II) abre un Gobierno nuevo, que dura hasta el día anterior al siguiente nombramiento.
  - Cada RD de nombramiento se verifica automáticamente contra el BOE (`rd_verificado`).
  - Excepción: Suárez II, anterior a la Constitución, del que solo se usa el tramo desde el 29/12/1978.
- **En funciones:**
  - Desde las elecciones generales (art. 101.1 CE) hasta el nombramiento del nuevo presidente.
  - Excepción documentada: Suárez, desde su dimisión del 29/01/1981 (fuente: La Moncloa).
  - Tras la moción de censura de 2018 no hay periodo en funciones: el cese de Rajoy y el nombramiento de Sánchez son del mismo día.
- **Legislatura:**
  - Va desde la constitución de las Cortes hasta el día anterior a la constitución de las siguientes, de modo que el periodo con las Cortes disueltas pertenece a la legislatura saliente, igual que en los expedientes del Congreso.
  - Las fechas de elecciones y de sesión constitutiva se extraen del propio RD de disolución y convocatoria.
  - Las que ese RD no fija (legislaturas Constituyente, I y II) están en `data/manual/legislaturas_complemento.csv`, con su fuente.
- **Cortes disueltas:**
  - Van desde la **entrada en vigor** del RD de disolución hasta la constitución de las nuevas Cortes. Es el mismo día de la publicación según la LOREG; en 1979 y 1982 fue el día siguiente, porque así lo dispone el propio RD.
  - Los RDL aprobados el mismo día que el RD de disolución, pero antes de su entrada en vigor, cuentan como legislatura ordinaria: es el caso de 1982.
- **Fase de cada RDL:** `en_funciones` > `cortes_disueltas` > `ordinaria`, en ese orden de prioridad. Además se publican los dos indicadores por separado (`cortes_disueltas`, `gobierno_en_funciones`).
- **Anuncio electoral** (`data/manual/anuncios_electorales.csv`): es una fecha de contexto, no normativa, así que se admiten fuentes secundarias, que se citan siempre. Se usa, por orden:
  1. el anuncio público del presidente;
  2. el comunicado del Rey sin candidato, en las disoluciones automáticas del art. 99.5 CE;
  3. si no hay un anuncio previo verificado, el Consejo de Ministros que acuerda la disolución, según el propio RD.

  El build comprueba que el anuncio no es posterior al RD.
- **Ciclos electorales** (`ciclos_electorales.csv`): uno por disolución, con las fechas de elecciones, de constitución de las nuevas Cortes y de toma de posesión del nuevo Gobierno, y con los Gobiernos saliente y entrante.

## 4. Escaños y mayorías
- **Fuente:** el registro oficial de diputados del Congreso por legislatura (formación electoral y fechas de alta y baja).
- **Cálculo:**
  - Se cuentan los escaños obtenidos por las **candidaturas** de los partidos del Gobierno al inicio de la legislatura en que se forma. Es el día de máxima ocupación dentro de los 60 días siguientes a la primera alta.
  - El patrón de cada partido está en `data/manual/partidos.csv`. Incluye las federaciones y las candidaturas conjuntas, como PSC-PSOE, PP-PAR o las confluencias de Unidas Podemos.
- **Mayoría absoluta:** 176 de 350 escaños. El tamaño del Congreso es fijo y no depende del número de diputados de alta en el día de referencia, que en 1989 y 1996 no llega a 350.
- **Apoyos externos:** los de investidura o legislatura **no** se incluyen en el indicador principal.
- **Limitación:** los escaños no se actualizan cuando un Gobierno sigue en funciones en una legislatura posterior (Rajoy en 2016 y Sánchez en 2019).

## 5. Resultado parlamentario
- **Convalidación (`convalidacion`):**
  - **Fuente principal:** el expediente del Congreso (iniciativas tipo 130, campo `resultado_tram`).
  - **Contraste:** las referencias posteriores del XML del BOE.
    - «Acuerdo de convalidación» (códigos 300/301): convalidado.
    - «SE DEROGA, por Resolución…» (código 210): derogado, **solo** si la resolución referida es del Congreso o de las Cortes. Así se distingue la derogación en el trámite de convalidación de la pérdida de vigencia posterior, que se recoge aparte en `vigencia_derogada`.
  - `fecha_convalidacion` es la fecha de la resolución que publica el acuerdo.
  - **Sin resultado en ninguna de las dos fuentes:** `pendiente` si el RDL se aprobó hace 90 días o menos y `desconocido` en caso contrario. Hoy no hay ningún `desconocido`.
- **Órgano (`organo_convalidacion`):** `diputacion_permanente` cuando la decisión cae dentro de un periodo de Cortes disueltas. Fuera de esos periodos no se deduce: el campo queda vacío.
- **Tramitación como proyecto de ley (`tramitado_pl`):**
  - Es una decisión independiente de la convalidación.
  - Se toma del `resultado_tram` del Congreso. Si existe un PL «procedente del Real Decreto-ley», se considera tramitado aunque el expediente del RDL no lo diga, y se marca `tramitacion_deducida_de_pl`.
- **Proyectos de ley (`expediente_pl`, `metodo_pl`):** se localizan de dos maneras.
  1. Por el título «procedente del Real Decreto-ley N/AAAA» (205 casos).
  2. Para las primeras legislaturas, cuyos títulos no lo indican: un PL de la misma legislatura, presentado entre 0 y 60 días después del RDL, con título equivalente (similitud ≥ 0,55; 35 casos).
  - Quedan 11 RDL tramitados sin PL localizado.
- **Leyes derivadas (`ley_derivada_id`, `normas_rango_ley.deriva_de_rdl`):** son las leyes aprobadas que proceden de esos PL. Se casan por título y por fecha del resultado del PL (104 de 106).
  - Sirven para evitar el doble conteo en los indicadores de *iniciativas legislativas distintas*.
  - El indicador principal de producción normativa (RDL / normas con rango de ley) cuenta **normas**, no iniciativas.
- **Denominadores:** los porcentajes de convalidación y derogación usan como denominador los RDL con decisión (convalidado + derogado). Los pendientes y desconocidos quedan fuera y se informan aparte. Los resultados se agrupan por la fecha de aprobación del RDL.

## 6. Controles automáticos (`pipeline/validate.py`)
- **Errores, que bloquean la publicación:**
  - duplicados;
  - huecos en la numeración anual;
  - diferencia en el total anual de RDL frente a `est_leyes`;
  - fechas fuera de rango o de su Gobierno;
  - RD de nombramiento no verificado;
  - Gobiernos no contiguos;
  - legislaturas sin fechas;
  - expedientes del Congreso sin RDL en el BOE;
  - RDL sin expediente y sin resultado;
  - serie diaria con huecos o cuya suma no coincide con el total.
- **Avisos, que se documentan:**
  - publicación tardía;
  - diferencias en leyes, LO o RDLeg frente a `est_leyes`;
  - PL sin localizar;
  - tramitación deducida;
  - registro de diputados distinto de 350;
  - RDL pendientes sin expediente.
- **Cobertura:** `data/audit.json → info.cobertura` recoge la fecha del listado del BOE, el último RDL con resultado parlamentario y el último año con estadística oficial del Congreso.

## 7. Diccionario: `data/clean/rdl.csv`
| Campo | Descripción |
|---|---|
| id | Identificador BOE (BOE-A-AAAA-NNNN) |
| numero, anio | Numeración oficial N/AAAA |
| titulo | Título oficial |
| fecha_aprobacion, fecha_publicacion, dias_hasta_publicacion | Ver § 2 |
| departamento | Departamento que firma, según el BOE |
| gobierno_id, presidente_id, presidente, partidos_gobierno | Gobierno que lo aprobó (ver § 3) |
| legislatura | Legislatura temporal (0 = Constituyente) |
| fase, cortes_disueltas, gobierno_en_funciones | Contexto institucional en la fecha de aprobación |
| url_boe, url_eli | Enlaces oficiales |
| expediente_congreso, legislatura_expediente, url_expediente | Expediente(s) tipo 130 |
| convalidacion, fecha_convalidacion, organo_convalidacion, fuente_convalidacion, resultado_boe | Ver § 5 |
| tramitado_pl, expediente_pl, metodo_pl, resultado_pl, fecha_resultado_pl, ley_derivada_id | Ver § 5 |
| vigencia_derogada | Estado de vigencia actual en el BOE (S/N). **No** es el resultado de la convalidación |
| flags | Incidencias de calidad, separadas por «;» |

Otras tablas:
- `gobiernos.csv`
- `legislaturas.csv`
- `ciclos_electorales.csv`
- `normas_rango_ley.csv`
- `serie_diaria.csv`, con los campos `n`, `m7`, `m30`, `m365`, sus variantes `_seg` y `_completa`, `iso_anio`, `iso_semana`, `gobierno_id`, `cortes_disueltas` y `gobierno_en_funciones`.

## 8. Contexto y exclusión de periodos

- **Tabla de acontecimientos:** `data/manual/eventos.csv` recoge cada acontecimiento con su nombre en ES y EN, sus fechas, una explicación, la fuente y la justificación de sus límites. Las recesiones siguen la cronología del Comité de Fechado del Ciclo Económico Español (AEE), desde el trimestre posterior al pico hasta el final del trimestre del valle. La crisis inflacionaria se define por un umbral de datos: los meses con el IPC interanual del INE igual o superior al 5 %.
- **Periodos en funciones:** los de más de 60 días se añaden automáticamente a partir de la tabla de Gobiernos.
- **Exclusión:** la web permite excluir uno o varios periodos. Se quitan de la exposición tanto los días como los decretos-leyes aprobados en ellos, y las métricas se recalculan en el navegador con la misma definición que `pipeline/metrics.py`; los tests de `src/lib/metrics.test.ts` comprueban que ambas implementaciones coinciden. Un periodo excluido corta además el cálculo del tiempo entre aprobaciones. Es un análisis de sensibilidad temporal, no una clasificación temática de las normas.
- **Redondeo:** se redondea a la mitad hacia arriba en el pipeline y en la web.
