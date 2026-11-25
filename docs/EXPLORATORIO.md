# Análisis exploratorio (fase 3)

Corte: 25/11/2026. Todo lo que aparece aquí se regenera así:

```bash
python3 -m pipeline.metrics 2026-11-25   # → data/derived/*.json y comparacion_*.csv
python3 -m pipeline.report               # → docs/exploratorio.html (gráficos SVG, sin dependencias)
```

`docs/exploratorio.html` es un documento de trabajo: los colores son provisionales y no tiene el diseño final. Las cifras de este texto son una foto de la fecha de corte. En la web se calcularán en el momento, sin textos fijos.

## 1. Cifras generales
- **Total:** 765 RDL desde el 29/12/1978, con una media histórica de 16,0 al año.
- **Últimos días:** 14 en los últimos 30 días y 49 en los últimos 365.
- **Récord en cualquier ventana de 30 días:** 14, alcanzado el 24-25/11/2026. El récord anterior era de 10 (12/12/1997, Aznar I). Le siguen el 30/03/2012 (Rajoy I) y el 28/12/2018 (Sánchez I), ambos con 9.
- **Récord en un solo día:** 6 RDL, el 23/06/2000 (Aznar II, paquete de medidas liberalizadoras).
- **Récord en un mes natural:** 14, en noviembre de 2026 (mes aún en curso). El máximo anterior era 9 (marzo de 2012 y diciembre de 2018).

## 2. Comparación entre Gobiernos (RDL por año de mandato efectivo)
| Gobierno | RDL | Días | Anualizado | Máx. mes | Máx. 30 d | % meses sin RDL |
|---|---|---|---|---|---|---|
| Sánchez I | 43 | 585 | 26,8 | 9 | 9 | 26 |
| Sánchez III | 76 | 1.106 | 25,1 | 14 | 14 | 29 |
| Sánchez II | 96 | 1.409 | 24,9 | 7 | 8 | 16 |
| Aznar I | 85 | 1.453 | 21,4 | 8 | 10 | 22 |
| Calvo-Sotelo | 37 | 644 | 21,0 | 5 | 7 | 14 |
| … | | | | | | |
| González II | 21 | 1.231 | 6,2 | 3 | 4 | 65 |

**Por presidente:** Sánchez 25,3 al año; Calvo-Sotelo 21,0; Suárez 19,4; Rajoy 16,6; Aznar 16,0; Zapatero 14,1; González 9,6.

**Para la web:**
- Suárez II sale primero en intensidad bruta (31,8), pero solo cuenta 92 días de exposición, todos con las Cortes disueltas o en funciones. **Propuesta:** atenuar y excluir de los rankings los mandatos de menos de 365 días, con un interruptor para mostrarlos. Afecta a Suárez II.
- Los partidos son PSOE (15,3), PP (16,3) y UCD (20,1). Las coaliciones se agrupan con el partido del presidente. Mezclan épocas muy distintas, así que conviene presentarlos con cautela.

## 3. Perfil temporal
- **RDL acumulados en los primeros 365 días:**
  - Sánchez II: 39
  - Sánchez I: 35
  - Rajoy I: 29
  - Aznar I: 20
  - Rajoy II: 20
  - Suárez III: 19
  - Calvo-Sotelo: 18
  - Aznar II: 18
  - González IV: 17
  - Zapatero I: 17
  - González I: 13
  - Zapatero II: 13
  - Sánchez III: 10
  - González III: 5
  - González II: 3
- **Sánchez III:** el perfil más atípico. Arranca lento (10 RDL en el primer año) y se concentra al final del mandato, como se ve en el mapa de calor. Rajoy I y Sánchez II, en cambio, cargan el inicio.
- **Hitos a igualdad de tiempo:** solo Rajoy I supera los 1.461 días (4 años naturales). Aznar I se queda en 1.453 y la mayoría de las legislaturas completas, en torno a 1.330-1.460. **Propuesta:** en la web, usar como último hito 1.400 días o «fin de mandato», en lugar de exactamente 4 años.

## 4. Fin de mandato / elecciones convocadas
- **Ritmo con las Cortes disueltas frente a la media de la propia legislatura:** la mediana histórica es ×0,53, en los 14 ciclos cerrados con legislatura de 180 días o más. Solo 5 superan ×1.
- **2026:** 18 RDL en los primeros 51 días tras la disolución. Ningún ciclo anterior pasó de 7 en todo el periodo de Cortes disueltas, que dura unos 54-62 días. Comparando los primeros 51 días de cada ciclo, los siguientes son 1979 con 7, 1982 con 6 y 1993 con 5.
- **2019 (marzo):** concentración **antes** de la disolución (16 RDL en los 90 días previos, frente a 8 en 2026 y como mucho 7 en el resto de ciclos).
- **Gobierno en funciones tras las elecciones:** hay pocos RDL. Las excepciones son Sánchez en 2019 (8 en 254 días) y González en 1993 (3 en 33 días).
- **Matiz definitorio:** la disolución cuenta desde la entrada en vigor del RD, por lo que los RDL aprobados el mismo día que el RD de disolución quedan antes. Es el caso de 1982, con 2 RDL.

## 5. Resultado parlamentario
- **Convalidación:** de los 756 RDL con decisión, 737 se convalidaron y 19 se derogaron (2,5 %). Otros 9 están pendientes.
  - **14 de las 19 derogaciones son de la XV Legislatura (Sánchez III):** un 20,9 % de sus RDL con decisión. En los demás Gobiernos la tasa va del 0 al 3,4 %, salvo Suárez II (1 de 8: el RDL 1/1979).
  - Por presidente: Sánchez 16 derogados, y Suárez, Zapatero y Rajoy 1 cada uno.
- **Tramitación como proyecto de ley:** 251 de 752 RDL con decisión conocida (33 %).
  - Va en aumento: 58 % con Sánchez, frente al 15-24 % de Zapatero, Aznar, González y Rajoy.
  - **Pero de los PL resultantes, 129 caducaron y solo 106 se aprobaron.** La caducidad se concentra en Sánchez II y III (34 y 43), en buena parte por las disoluciones.
- **Propuesta para la web:** un diagrama de flujo de aprobación → convalidación/derogación → ¿tramitación? → ley aprobada/caducada/en curso, porque la caducidad masiva es un hallazgo en sí mismo.

## 6. Gobernar por decreto (peso en las normas con rango de ley)
- **Media del indicador** (RDL / leyes + LO + RDLeg + RDL): 23,9 % entre 1979 y 2015, y 54,8 % entre 2016 y 2025. En 2026 llega al 84,9 %: 45 RDL frente a 4 leyes y 4 LO (año incompleto).
- **Los picos coinciden con años electorales o de Gobierno en funciones**, cuando las Cortes legislan poco: 2004 (42 %), 2008 (56 %), 2016 (70 %) y 2019 (69 %). El indicador mide la composición de la producción normativa, no la calidad democrática.
- **Ajuste por leyes derivadas de RDL** (dobles conteos): sube unos puntos el porcentaje, por ejemplo de 53,7 a 64,4 % en 2012.

## 7. Mayoría parlamentaria
- **Media ponderada por días de mandato:**
  - Gobiernos sin mayoría absoluta: 18,3 RDL al año (12 gobiernos).
  - Gobiernos con mayoría absoluta: 11,4 RDL al año (4 gobiernos: González I-III y Aznar II).
- **Dispersión:** hay una asociación negativa débil y con mucha variación. Rajoy I tenía mayoría absoluta y aun así se sitúa en 16; Sánchez I, con un 24 % de los escaños, está en 26,8.
- **Coaliciones:** solo hay dos, Sánchez II y III, con 25,0 de media. Coinciden con el mismo presidente y con la pandemia, la crisis energética y la DANA. No es posible separar el efecto de la coalición.

## 8. Anomalías revisadas
| Observación | Diagnóstico |
|---|---|
| Suárez II con 31,8 RDL al año | Exposición corta (92 días). Es correcto, pero no es comparable: hay que filtrarlo (ver § 2) |
| Legislatura XI con 1 RDL en 188 días | Correcto: Gobierno en funciones en 2016 |
| González III sin mayoría con 175 escaños | Correcto: 176 es la mayoría absoluta |
| Los hitos de 4 años casi siempre vacíos | Correcto: la mayoría de los mandatos dura menos de 1.461 días (ver § 3) |
| La suma por Gobierno y por legislatura da 765 RDL y 17.499 días | Coincide con la serie diaria |
| El máximo de 30 días por Gobierno coincide con la serie `m30_seg` | Comprobado para los 16 Gobiernos |
| 9 RDL de 2026 pendientes | Aprobados hace menos de 90 días; la Diputación Permanente aún no ha decidido |

## 9. Decisiones abiertas para la fase 4 (diseño)
1. Umbral de exposición mínima para los rankings: propongo 365 días.
2. Último hito de tiempo en los perfiles: propongo 1.400 días o «fin de mandato».
3. Cómo mostrar el año en curso en los gráficos anuales: atenuado y con la etiqueta «hasta DD/MM».
4. Partidos: agrupar las coaliciones con el partido del presidente o mostrarlas como categoría propia.
