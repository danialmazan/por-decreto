# Propuesta de diseño (fase 4)

Las maquetas, hechas con datos reales, están en `docs/diseno/`. Para verlas:

```bash
python3 -m http.server 8765 --directory docs
```

Después abre <http://localhost:8765/diseno/>. Si cambian los datos, se regeneran con `python3 -m pipeline.design_data`.

## 0. Decisiones tomadas (revisión del 25/11/2026)

La maqueta consolidada es `docs/diseno/por-decreto.html`.

- **Identidad:** dirección **B · Pulso**.
- **Nombre:** **Por decreto**, también en inglés. Hasta el 25/11/2026 se llamó «Decretómetro», pero se cambió porque Civio ya tiene una herramienta con ese nombre sobre decretos-leyes (civio.es/el-boe-nuestro-de-cada-dia/decretometro/).
- **Modo claro por defecto.** El oscuro solo se activa con el botón y se recuerda en el navegador.
- **Orden de la página:** sismógrafo primero (es la entrada), después el calendario semanal, «Desde la disolución de las Cortes» e intensidad por Gobierno. Sin sumario: lo más visual y directo posible.
- **Contador inicial:**
  - Lectura principal: decretos-leyes en los últimos 30 días.
  - Debajo, «hasta el DD mmm AAAA», el total del Gobierno en curso con su media anual («76 con Sánchez III (25,1 al año)») y el total desde 1978 con la media histórica.
- **Píldora dinámica:**
  - «Récord desde 1978» si la ventana actual iguala o supera el máximo histórico.
  - «Top N desde 1978» si está entre los 10 episodios más altos. Un episodio es el pico de la ventana de 30 días, con picos separados más de 30 días.
  - En otro caso, «Percentil P», que es el porcentaje de días con un valor inferior.
  - Probado con cortes simulados: 12/12/1997 da récord; 30/03/2012 y 28/12/2018 dan Top 2; 07/04/2020 da Top 4; 01/06/2023 da percentil 35.
- **Medias:** siempre con 1 decimal.
- **Tarjeta de Gobierno:** aparece al pasar el cursor o al enfocar con el teclado sobre la franja de Gobiernos y sobre las barras. Formato: «**Sánchez III** · PSOE + Sumar / noviembre 2023 – hoy (36 meses)». En las barras se añaden el número de decretos-leyes y la media anual.
- **Calendario semanal:**
  - Paleta de calor de 0 a 5 o más: `#fde3a7 → #f9b95a → #ee8131 → #d1501e → #8f2a12`, sobre la celda vacía `#e2e9e5`. En oscuro, la rampa se invierte en luminosidad.
  - Las semanas que todavía no existen no se dibujan, y la semana 53 solo aparece en los años ISO que la tienen.
  - La tarjeta muestra el número de decretos-leyes, las fechas de la semana y el Gobierno.
- **Desde la disolución de las Cortes:**
  - Las curvas empiezan en el día 0 (disolución) y llegan hasta la toma de posesión del nuevo Gobierno o hasta el día 120.
  - Hay un círculo el día de las elecciones de cada ciclo y una línea discontinua para las elecciones del ciclo en curso.
  - Al pasar el cursor, una tarjeta muestra el ranking de ese día: los 6 primeros, el ciclo en curso y la curva más cercana al cursor, que además se resalta.
  - La frase compara a igualdad de días.
- **Intensidad por Gobierno:** se puede ordenar por **mayor intensidad** o en **orden cronológico**. El selector va alineado con el título.
- **Selector de origen del recuento:** **Desde la disolución** o **Desde el anuncio**.
  - La fecha del anuncio sale de `data/manual/anuncios_electorales.csv`, con la fuente de cada ciclo.
  - Si no hay un anuncio previo documentado, se usa el Consejo de Ministros que acuerda la disolución.
  - En 2016 y en septiembre de 2019 se usa el comunicado del Rey sin candidato.
  - Se ve la diferencia en 2011 (anuncio 59 días antes), en 2015 (26 días antes) y en febrero de 2019 (17 días antes).
- **Top 10 de semanas:** barras horizontales bajo el calendario. Muestra el ranking con empates (1, 2, 2…), la fecha de la semana, el Gobierno con el color de su partido, una tarjeta al pasar el cursor y una nota sobre las semanas empatadas que quedan fuera.

## 1. Opciones planteadas inicialmente

| Decisión | Opciones | Recomendación |
|---|---|---|
| Dirección visual (elegida: **B**) | A Boletín · B Pulso · C Calendario | **A con la entrada de C**: la identidad del BOE (cabecera con «Núm.», sumario y sellos) y, como primera visualización, el calendario semanal, que muestra toda la historia en una pantalla de móvil. Debajo, el timeline interactivo. |
| Nombre (elegido primero: Decretómetro; definitivo: **Por decreto**) | Por decreto · Artículo 86 · Decretómetro · Urgente · Ritmo de decreto | **Por decreto** / *By Decree* (alternativa neutra: Artículo 86) |
| Exposición mínima para los rankings | 0 / 180 / 365 días | **365 días**, con un interruptor «incluir mandatos cortos» |
| Último hito en los perfiles | 4 años / 1.400 días / fin de mandato | **1.400 días** y «fin de mandato» |
| Coaliciones en la vista por partido | Partido del presidente / categoría propia | **Partido del presidente**, con una nota y el socio indicado en la ficha del Gobierno |
| Año en curso | Igual que los demás / atenuado | **Atenuado**, con la etiqueta «hasta DD/MM» |

## 2. Arquitectura de información

Una sola página larga, porque el encargo pide una experiencia visual y no un panel, con navegación por anclas y vistas compartibles por URL. El idioma va en la ruta (`/` en español y `/en/` en inglés) y el estado de las vistas en la *query*: `?vista=gobiernos&agr=mes&gob=sanchez_3&desde=2018-06-01`. Al cambiar de idioma se conserva todo.

```
┌ Barra superior fija ────────────────────────────────────────────────┐
│ Por decreto [icono]                          ES | EN   ◐ tema       │
├─────────────────────────────────────────────────────────────────────┤
│ Cabecera: Núm. 765 · datos hasta… · frase dinámica (30 días)        │
│ Sumario: últimos 5 RDL con sello de estado                           │
│ Indicadores: total · media anual · últimos 365 d · récord 30 d…     │
├ Índice (chips desplazables en móvil) ───────────────────────────────┤
│ Calendario · Timeline · Gobiernos · Perfiles · Fin de mandato ·     │
│ Después · Por decreto · Mayorías · Contexto · Explorador · Método   │
└─────────────────────────────────────────────────────────────────────┘
```

| Sección | Contenido | Fase |
|---|---|---|
| Calendario | Rejilla de años × semanas ISO con la marca del partido. Al tocar una semana se ven sus RDL | 5 |
| **A. Timeline** (pieza central) | Agregaciones: día, semana, mes y año (barras); 7, 30 y 365 días móviles (línea con área); 30 días por defecto. Bandas de Gobierno y de Cortes disueltas, zoom y arrastre, selección de periodo, filtros, saltos a cada mandato, máximos y panel con la lista de RDL del periodo seleccionado | 5 |
| **B. Gobiernos** | Selector: presidentes / Gobiernos / partidos / legislaturas. Barras ordenables por cualquier indicador y tabla | 5 |
| **C. Perfiles** | Curvas acumuladas desde el día 0, intensidad móvil de 30 días superpuesta (hasta 4 Gobiernos), mapa de calor por mes de mandato y comparaciones a 100 días, 6 meses, 1, 2 y 1.400 días | 5 |
| **G. Fin de mandato / Elecciones convocadas** | Curvas alineadas en la disolución, ritmo por fase, ratio frente a la propia legislatura, comparación a igualdad de días y lista de RDL con las Cortes disueltas | 5 (MVP) |
| D. ¿Qué sucede después? | Flujo aprobación → convalidación/derogación → tramitación → ley/caducidad; barras apiladas por año; comparación por Gobierno | 6 |
| E. Gobernar por decreto | Proporción anual de RDL sobre las normas con rango de ley, con la variante sin leyes derivadas y la explicación del indicador | 6 |
| F. Mayorías | Dispersión de escaños frente a RDL anualizados (círculo = monocolor, cuadrado = coalición), medias ponderadas e interruptor para excluir periodos | 6 |
| Contexto | Bandas de acontecimientos que se pueden activar en el timeline y recálculo excluyendo periodos | 6 |
| Explorador | Búsqueda por título, filtros (fechas, Gobierno, resultado), enlaces al BOE y al Congreso, descarga en CSV | 6 |
| Metodología | Definiciones, denominadores, fuentes, cobertura y fecha de actualización | 6 |

## 3. Sistema visual

### Colores de partido (comunes a las tres direcciones)
- **Validación:** se ha comprobado con `validate_palette.js --pairs all` en los dos modos y pasa todos los controles (separación para daltonismo ≥ 10 en el par más cercano).

| Partido | Claro | Oscuro |
|---|---|---|
| UCD | `#1f9a8a` | `#1a9a8c` |
| PSOE | `#d5373e` | `#e05a50` |
| PP | `#2a62c9` | `#4c82dd` |
| Socios de coalición (solo como marca secundaria y con texto): Unidas Podemos | `#7b4bb5` | — |
| Socios de coalición (solo como marca secundaria y con texto): Sumar | `#c2407f` | — |

- **Uso:** los colores de partido identifican al Gobierno y nunca valoran. El resultado parlamentario (convalidado, derogado, pendiente) se muestra con sellos o con una escala de la marca, **no** con rojo y verde de estado.
- **Identidad sin depender del color:** etiquetas directas y leyenda, siempre.

### Tipografía y tokens de cada dirección

| Dirección | Fondo / tinta | Acento | Tipografía |
|---|---|---|---|
| A Boletín | `#ffffff` / `#000000` (oscuro `#161616` / `#f2f2f2`) | violeta de sello `#5a3d9a` | Old Standard TT (títulos y cifras) + Libre Franklin (texto e interfaz) |
| B Pulso | `#f3f6f4` papel milimetrado / `#102a3a` | trazo `#0e5a8a`, plumilla `#e8a100` | Schibsted Grotesk 400–800 |
| C Calendario | `#f6f7f9` / `#18212e` | rampa secuencial azul `#b7d0ea → #173f7a` | Public Sans 400–800 |

Todas tienen modo oscuro **elegido** (tonos propios, no una inversión). Las fuentes se servirán desde el propio repositorio con Fontsource, como en `ocupados/`.

### Iconos (también sirven de favicon)
- **A:** hoja con líneas y sello circular.
- **B:** trazo de pulso con punto ámbar.
- **C:** rejilla de 3×3 con tres casillas marcadas.

Los tres son SVG planos sobre un cuadrado redondeado, en la línea de los iconos de `ocupados` y `modelecciones`, y van a la derecha del título, como pide la guía de diseño.

## 4. Especificación de gráficos

- **Marcas:** líneas de 1,5–2,5 px; barras con 2 px de separación y esquinas de 2 px; cuadrícula y ejes discretos.
- **Interacción:** cursor con tooltip en las líneas; tooltip por marca en barras, celdas y puntos. Las zonas táctiles son más grandes que la marca (≥ 44 px en móvil).
- **Timeline:**
  - En móvil, el gráfico ocupa todo el ancho y el zoom se hace con dos dedos o con un selector de rango bajo el gráfico, al estilo de un minimapa.
  - Para las ventanas móviles con un Gobierno filtrado se usa la serie `m30_seg`, que no atribuye RDL de otro Gobierno.
  - Las ventanas incompletas (`_completa = false`) se dibujan discontinuas.
- **Año en curso:** atenuado y con «hasta DD/MM», en todos los gráficos anuales.
- **Cortes disueltas:** banda gris neutra en todos los gráficos temporales, con su leyenda.
- **Textos dinámicos:** se generan siempre a partir de los datos y contemplan empates, por ejemplo «7 (1979, Suárez II; 1982, Calvo-Sotelo)».
- **Animación:** un único momento orquestado, que es el trazo del timeline o la cuenta del calendario al cargar. El resto de transiciones responden a acciones del usuario, como cambiar de agregación (la serie se transforma, no se sustituye). Se respeta `prefers-reduced-motion`.
- **Accesibilidad:**
  - Cada gráfico tiene una tabla equivalente.
  - Contraste AA.
  - Foco visible distinto de la selección.
  - Navegación por teclado en el timeline (flechas para moverse día a día, Mayús para semanas).

## 5. Pila técnica (para la fase 5)

- **Tecnologías:** Vite + React + TypeScript, con módulos de d3 (`d3-scale`, `d3-shape`, `d3-zoom` y `d3-array`), Vitest y Playwright, como en `ocupados/` y `modelecciones/`.
- **Rutas:** `index.html` y `en/index.html` como entradas separadas, con metadatos para compartir localizados.
- **Datos:** `public/data/` contendrá JSON compactos generados por `pipeline/metrics.py`: la serie diaria en un vector de enteros, Gobiernos, ciclos, comparación y RDL. Los CSV completos se podrán descargar.
- **Presupuesto:** menos de 200 kB de JS comprimido en la carga inicial y datos diferidos por sección.
