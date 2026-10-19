# SOLUCION · Reto 01 · Agente "Registro como Proveedor"

> **\[PRD\]** marca lo que viene del enunciado del reto; **\[propio\]**, lo que se decidió o redactó en este trabajo. Link de prueba: https://reto-01-proveedor-i2ej.onrender.com/

## 1. Problema en una frase

El área administrativa de Periferia transcribe a mano, campo por campo, los mismos datos en cada formulario de registro como proveedor (entre 8 y 12 por mes, para clientes de Colombia, Ecuador, Perú, Panamá y Honduras), con riesgo de error en datos sensibles (NIT, cuenta bancaria) y demoras que retrasan la facturación. **\[PRD §1–2\]**

Le duele a la analista administrativa, que es la usuaria principal, y de rebote a facturación. Además, el representante legal firma sin una verificación sistemática de que el paquete esté completo. **\[propio\]**

## 2. Arquitectura

```
Chat web  ──►  Backend (ciclo del agente + adaptador LLM)  ──►  Herramientas (zod)
                                                                   │
                                          fixtures/ (solo lectura) y out/ (escritura)
```

| Capa | Dónde vive |
| --- | --- |
| Comportamiento | `agent/prompt.md` |
| Conocimiento del proceso | `src/knowledge/registro-proveedor.md` |
| Ejecución | `src/tools/proveedor.ts` |
| Adaptador del modelo | `src/llm/` |

**\[PRD §6.1 y 6.5\]** Un cambio de reglas de negocio no debería tocar el servidor. **\[PRD §6.5\]**

Diagrama final, tal como quedó construido: **\[propio\]**

```
┌──────────────────────────────┐   POST /api/chat          ┌──────────────────────────────────────────────┐
│ Front (web/, HTML plano)     │ ────────────────────────► │ src/server.ts (Bun)                          │
│ - chat + "pensando"          │ ◄──────────────────────── │  ├─ src/agent/ciclo.ts  (tope 25 vueltas,     │
│ - tarjetas de herramientas   │ { reply, toolCalls,       │  │   bloqueo del envío sin pregunta previa)   │
│ - recuadro de confirmación   │   needsConfirmation }     │  ├─ src/agent/sesiones.ts (memoria)           │
│ - panel: carpeta + checklist │ ◄── GET /api/casos/:caso  │  └─ src/llm/ adaptador → Gemini (+ respaldos) │
└──────────────────────────────┘        /estado            └───────────────┬──────────────────────────────┘
                                                                           │ llama
                                                           ┌───────────────▼──────────────────────────────┐
                                                           │ src/tools/proveedor.ts (5 herramientas, zod)  │
                                                           │  └─ src/negocio/ (mapeo, formulario, paquete, │
                                                           │      envío, fecha, log)                       │
                                                           └───────┬──────────────────────────┬───────────┘
                                                      fixtures/ (solo lectura)          out/ (escritura)
```

Ajustes respecto de lo planeado: **\[propio\]**

- Las reglas de negocio se separaron en `src/negocio/`. Las herramientas de `src/tools/proveedor.ts` quedaron como una capa delgada que valida, ejecuta y registra.
- El system prompt real se arma uniendo `agent/prompt.md` (comportamiento) con `src/knowledge/registro-proveedor.md` (conocimiento).
- El front se reorganizó según un mockup propio: chat a la izquierda y panel con la carpeta generada y la checklist a la derecha. Para alimentar el panel con datos reales, y no con lo que escribe el modelo, se sumó la ruta `GET /api/casos/:caso/estado`.
- El adaptador del modelo prueba una lista de modelos de respaldo si el principal está saturado o lento.

## 3. Ciclo del agente

- **Bucle.** El backend envía al modelo el prompt, el historial y las herramientas disponibles. El modelo pide una herramienta, el backend la ejecuta y devuelve el resultado, hasta que el modelo responde en texto. **\[propio\]**
- **Tope de iteraciones.** 25 por turno (valor sugerido por el PRD). Al alcanzarlo, el agente responde con lo que tiene y lo que falta. **\[PRD CA1\]**
- **Confirmación humana.** `proveedor_simular_envio` rechaza si no recibe `confirmado: true`. El agente cierra el turno con una pregunta explícita y solo avanza si el siguiente mensaje confirma. El front resalta ese estado. **\[PRD CA3, §6.2\]**
- **Errores.** Las herramientas nunca lanzan excepciones: devuelven `{ ok, data }` o `{ ok: false, error }`, y la sesión no se cae. **\[PRD §6.2, CA5\]**
- **Doble control del envío.** Además del prompt, el servidor (`src/agent/ciclo.ts`) rechaza `proveedor_simular_envio` con `confirmado: true` si el mensaje anterior del agente no fue la pregunta de confirmación. Ese mensaje se reconoce porque termina con la marca `❓ Confirmación requerida:`. En las pruebas reales, ante un "envía" sin pregunta previa el modelo intentó enviar varias veces y el servidor lo bloqueó siempre. **\[propio\]**
- **Topes y timeout: valores elegidos y qué pasa al superarlos.** Todos se configuran por variable de entorno. **\[propio\]**

  | Tope | Valor | Qué pasa al superarlo | Dónde está | Probado |
  | --- | --- | --- | --- | --- |
  | Vueltas por turno (`MAX_ITERACIONES`) **\[PRD CA1\]** | 25 | Se hace una última llamada al modelo, sin herramientas, para que resuma lo que logró y lo que falta. La respuesta empieza con "⚠️ Se alcanzó el tope de pasos de este turno". | `src/agent/ciclo.ts` → `resumenPorTope` | Sí (test "CA1") |
  | Tokens por sesión (`MAX_TOKENS_SESION`) | 300.000 | El turno se corta sin otra llamada al modelo; lo ya ejecutado queda visible y en `out/`. Desde ahí, cada mensaje de esa sesión responde "⚠️ Esta sesión alcanzó su tope de uso del modelo. Abre una sesión nueva para continuar". | `src/agent/ciclo.ts` → `ejecutarTurno` | Sí (test "PRD 8") |
  | Tokens por día, todo el servidor (`MAX_TOKENS_DIA`) | 2.000.000 | Antes de cada mensaje se revisa el total del día: si se pasó, responde "⚠️ Esta demo alcanzó su tope diario de uso del modelo. Vuelve a intentar mañana", sin llamar al modelo. El contador vuelve a cero al cambiar el día (UTC) o al reiniciarse el servidor. | `src/server.ts` → `tokensDeHoy` | No (revisado en el código) |
  | Espera por llamada al modelo (`LLM_TIMEOUT_MS`) | 45 s | Se corta la llamada y se prueba el siguiente modelo de la lista de respaldo. Si fallan todos, el chat muestra "⚠️ El modelo tardó demasiado en responder. Intenta de nuevo" y la sesión sigue viva. | `src/llm/gemini.ts` → `enviar` | Sí (forzado en local con 1 ms) |

  El tope por día existe porque el link es público y se pueden abrir muchas sesiones. La espera primero fue de 60 s, después de 30 s, y quedó en 45 s tras medir la latencia real del plan gratuito.
- **Visibilidad (CA4).** Cada llamada a herramienta vuelve al front con nombre, argumentos y resumen, y queda en `out/log.jsonl` y en `out/<caso>/log.jsonl`. En el chat, el mapeo enviado a `generar_formulario` se muestra como cantidades, para no exhibir datos bancarios. **\[propio\]**

## 4. Elección del modelo

- **Proveedor y modelo:** Google Gemini, `gemini-3.5-flash-lite` como modelo principal, con respaldo automático en `gemini-3.6-flash` y `gemini-3.8-flash`, y clave gratuita de AI Studio. **\[propio\]**
- **Por qué:** soporta function calling (requisito de las herramientas), la capa gratuita permite construir y demostrar sin costo, y el adaptador permite migrar de proveedor. **\[propio\]**
  - La idea inicial era usar `gemini-3.8-flash`, el Flash más capaz y recomendado por Google para agentes. Pero en la prueba con la clave devolvió "alta demanda" (HTTP 503) tres veces seguidas.
  - `gemini-3.5-flash-lite`, también estable y gratuito, respondió en 1,7 s y llamó bien a la herramienta de prueba. En el caso real ejecutó las 4 herramientas en el orden correcto.
  - El modelo se cambia con `GEMINI_MODEL` sin tocar código.
- **Clave:** el formato actual de las claves de AI Studio empieza con "AQ.". Se confirmó compatible con el SDK oficial `@google/genai` 2.30.0, sin configuración extra, con `scripts/probar-clave.ts`, a pesar de reportes en el foro de Google de errores 401 con este formato. **\[propio\]**
- **Costo por caso procesado** (medido con el prompt de la sección 11 sobre `ec-corp-andina`): **\[propio\]**
  - **Consumo:** 5 llamadas al modelo, 18.450 tokens de entrada y entre 828 y 846 de salida. Se midió dos veces con el mismo resultado de entrada.
  - **Plan gratuito:** USD 0.
  - **Plan pago con `gemini-3.5-flash-lite`** (USD 0,30 por millón de tokens de entrada y USD 2,50 de salida): **≈ USD 0,0077 por caso**, unos USD 0,09 por mes para 12 casos.
  - **Si atiende el respaldo `gemini-3.8-flash`** (USD 0,75 / 3,75 hasta el 31-12-2026, el doble desde 2027): ≈ USD 0,017 por caso.
  - **Conversación completa de la demo** (procesar, "envía" y confirmar): se midieron entre 33.800 y 40.200 tokens en total.
- **Límite conocido:** la capa gratuita limita las solicitudes por minuto, lo que puede afectar una demo con varios usuarios. **\[propio\]**
- **Límite observado:** durante el desarrollo, la capa gratuita se degradó por horas. **\[propio\]**
  - **Latencia:** una consulta mínima pasó de 1,7 s a entre 16 y 40 s.
  - **Saturación:** algunos modelos respondían HTTP 503 ("saturado").
  - **Efecto en un caso completo:** tardó entre 7 y 74 s, y algunas veces falló con un mensaje claro de "modelo saturado".

## 5. Diseño del portal web (solo documentación)

**Estrategia.** Las opciones son un navegador controlado por el agente, RPA o una extensión de navegador. Sus límites son el CAPTCHA, el doble factor (MFA) y los cambios de diseño del portal. **\[PRD §7.4\]**

Para 8 a 12 registros por mes, recomiendo un enfoque asistido: el agente prepara los valores y el humano opera el portal. **\[propio\]**

Como paso intermedio antes de automatizar, el agente puede generar, además de `valores-portal.md`, una lista de verificación por pantalla del portal, para que la analista confirme campo por campo lo que cargó. **\[propio\]**

**Credenciales.** Nunca en el repositorio, el prompt ni los logs, y las ingresa el humano. **\[PRD §7.4\]** Viven en un gestor de secretos de la empresa (por ejemplo, el servicio de secretos de la nube que ya use Periferia). El agente nunca recibe la credencial, ni siquiera para "probar el ingreso". **\[propio\]**

El propio reto muestra por qué el ingreso es humano: en `pa-logistica-istmo`, las credenciales del portal llegaron "por separado al correo del representante legal". **\[propio\]**

**Reparto agente / humano.**

| El agente | El humano |
| --- | --- |
| Prepara `valores-portal.md`, listo para copiar **\[PRD HU-3\]** | Inicia sesión (credenciales, CAPTCHA, MFA) **\[PRD §7.4\]** |
| Marca faltantes y dudas **\[propio\]** | Revisa lo cargado **\[propio\]** |
| (Fase intermedia) genera una lista de verificación por pantalla **\[propio\]** | Confirma campo por campo lo que cargó **\[propio\]** |
| (Fase futura) rellena campos en pantalla **\[propio\]** | Hace clic en "Enviar" **\[PRD §7.4\]** |

**En este reto:** formato `portal` → el agente responde "formato no soportado" y genera `out/<caso>/valores-portal.md`. **\[PRD HU-3\]**

## 6. Decisiones y trade-offs

Decisiones tomadas durante el desarrollo. **\[propio\]**

| # | Decisión | Alternativa descartada | Por qué |
| --- | --- | --- | --- |
| 1 | Las reglas de negocio viven en las herramientas, no en el modelo | Dejar que el modelo decida los valores | El modelo puede completar con un valor plausible; las herramientas son la única fuente de valores. Costo: menos flexibilidad |
| 2 | Excel (P0) antes que PDF (P1) | Repartir el esfuerzo entre ambos | Cerrar primero lo obligatorio y probado. Prioridades según el **\[PRD\]** |
| 3 | Soporte ausente o vencido bloquea `listo_para_firma`; el envío simulado solo advierte (`ENVIO-SIMULADO.md` lista los bloqueos pendientes) | Bloquear también el envío | El **\[PRD\]** no lo define: es una decisión de producto entre advertir y ser estricta |
| 4 | Gemini con clave gratuita | Un modelo de pago | Costo cero para construir; a cambio, límites de uso |
| 5 | Sesiones en memoria o archivos, sin base de datos | Base de datos | Más simple; no escala. El **\[PRD §6.1\]** lo permite |
| 6 | Doble control del envío: prompt **y** bloqueo en el servidor | Confiar solo en el prompt | En las pruebas reales el modelo intentó enviar sin preguntar; el servidor lo bloqueó siempre |
| 7 | Mapeo exacto por glosario | Coincidencia "parecida" con un puntaje de confianza | Un parecido puede llenar un dato equivocado (por ejemplo, "Teléfono contacto comercial" con el teléfono general); es preferible un `faltante` a un error |
| 8 | `gemini-3.5-flash-lite` con una lista de modelos de respaldo | Un solo modelo, el más capaz | El plan gratuito se satura por modelo; los respaldos mantienen viva la demo |
| 9 | HTML plano servido por el mismo servidor | React con un build aparte | Un solo comando y un solo servicio en Render; menos piezas que explicar |
| 10 | Panel lateral alimentado por una ruta del servidor | Mostrar en el panel lo que escribe el modelo | Solo se afirma lo que sale de una herramienta o del disco **\[PRD CA2\]** |

## 7. Supuestos

**Supuestos que el PRD declara. \[PRD §10\]**

- Los fixtures representan la variabilidad real de los clientes; en producción habrá plantillas peores.
- El repositorio maestro está actualizado; en producción se necesita un dueño del dato.

**Supuestos propios al interpretar el PRD. \[propio\]** Confirmados según lo construido:

- La "fecha de ejecución" para decidir si un soporte está vencido es la fecha del día en que corre el agente, en la zona horaria de Colombia. La variable `FECHA_EJECUCION` permite fijarla, por ejemplo para la demo. `demo.ts` da el mismo resultado en ejecuciones consecutivas del mismo día.
  - Con la fecha real (19-10-2026), ningún caso queda listo para firma, porque la Cámara de Comercio venció el 30-09-2026.
  - Con `FECHA_EJECUCION=2026-09-03`, la fecha del PRD, quedan listos `co-industrias-delta` y `pa-logistica-istmo`.
- Un soporte con `vigencia_hasta` igual a la fecha de ejecución todavía está vigente: vence a partir del día siguiente. Un soporte sin `vigencia_hasta` (el RUT) no vence.
- El mapeo no calcula una confianza numérica. Una etiqueta que coincide con el glosario (ignorando tildes y mayúsculas) es confiable y se llena. Una que no está en el glosario es `faltante`: nunca se adivina por parecido. `requiere_confirmacion` sale de reglas explícitas: identificador tributario extranjero (RN1) o etiqueta ambigua como "Identificación tributaria" (HU-1).
- Los valores se copian tal cual del maestro (por ejemplo, País = `CO` e Ingresos = `98000000000`). La moneda y el año de los ingresos se agregan como nota, sin modificar el valor.
- Se permite simular el envío aunque el paquete no esté `listo_para_firma`, con una advertencia explícita en `ENVIO-SIMULADO.md`. El PRD espera ese envío en la demo de `ec-corp-andina`, que no queda listo.
- Un campo `requiere_confirmacion` no bloquea `listo_para_firma` (RN3 solo menciona soportes vencidos o ausentes), pero aparece en la checklist.
- Un soporte exigido cuenta como presente si figura en `soportes/index.json` y su archivo existe. Los soportes vencidos también se copian al paquete, marcados como vencidos en la checklist.
- El registro de actividad se escribe en los dos lugares que nombra el PRD: `out/log.jsonl` (CA4) y `out/<caso>/log.jsonl` (RN5).
- `proveedor_generar_formulario` recibe el `mapeo` del contrato, pero los valores que escribe los vuelve a calcular desde el maestro. Si el modelo manda un valor distinto, se ignora y se informa en `discrepancias`.
- El agente responde siempre en español.
- El PRD menciona una rúbrica en su sección 10, pero esa sección trata de riesgos y no trae puntajes; se trabajó sin conocer su detalle.

## 8. Cobertura

Historias según el **\[PRD §5\]**. Estado y columna "qué falta" son **\[propio\]**. El detalle por bloque está en `docs/COBERTURA.md`.

| HU | Estado | Qué falta para producción |
| --- | --- | --- |
| 1. Leer solicitud | Hecho: país, cliente, formato, campos y soportes de los 4 casos; los campos de identificador tributario ambiguo o extranjero se reportan con su propuesta | Plantillas reales más variadas |
| 2. Mapear campos | Hecho: tres estados con ruta en el maestro; sinónimos del glosario resueltos ignorando tildes y mayúsculas; nunca se inventa (test "campo sin fuente queda faltante"). Sin confianza numérica (ver supuestos) | Mejorar sinónimos con uso real |
| 3. Generar formulario (xlsx / pdf / portal) | Hecho: Excel (P0) celda por celda, PDF generado (P1) con todos los campos en orden, portal (P2) con "formato no soportado" y `valores-portal.md` | AcroForm real, portal asistido |
| 4. Armar paquete | Hecho: paquete con formulario, soportes, checklist y borrador sin datos bancarios; vencido o ausente bloquea; pregunta de confirmación antes de enviar; `ENVIO-SIMULADO.md` solo tras confirmación (probado en el link) | Soportes reales, firma electrónica |
| 5. Manejo de errores | Hecho: caso inexistente, argumentos inválidos y plantilla corrupta devuelven errores claros, y el paquete sigue con los soportes; los errores del modelo (saturado, cupo, demora) se muestran claros y la sesión sigue | Monitoreo y alertas |

Además de las historias: **\[propio\]**

| Pieza | Estado | Qué falta para producción |
| --- | --- | --- |
| Front de chat (historial, "pensando", tool calls, confirmación resaltada) | Hecho | Autenticación si deja de ser una demo |
| Link público (Render) | Hecho, con latencia variable por la capa gratuita de Gemini | Plan pago del modelo y de Render (sin suspensión) |
| `demo.ts` sin modelo y 20 pruebas (`bun test`) | Hecho | Pruebas con plantillas reales |
| Bonus `modulo/` (sección 9.4 del PRD) | No hecho | Empaquetar `agent.md`, `tools/` y `SKILL.md` reutilizando los mismos archivos |

## 9. Uso de IA

### 9.1 Herramientas y para qué

- **Claude (chat):** asistencia en la preparación del entorno, planificación del desarrollo, diseño de `CLAUDE.md` y construcción de mockups.
- **Claude Code:** construcción del código y de los borradores del repositorio. En concreto: **\[propio\]**
  - **Código:** las herramientas y `demo.ts`; el adaptador de Gemini, el ciclo del agente y el servidor; el front a partir de mi mockup; las pruebas.
  - **Investigación:** el modelo gratuito vigente y la compatibilidad de la clave "AQ."; la medición de tokens y costo por caso.
  - **Despliegue y verificación:** la preparación del despliegue en Render (yo creé el servicio y cargué la clave); la verificación por bloque contra el PRD (`docs/COBERTURA.md`).
  - **Documentación:** la guía del código (`docs/GUIA-DEL-CODIGO.md`), el registro de decisiones (`docs/REGISTRO-IA.md`), el README y el primer borrador de este documento.
- **Gemini:** es el modelo del agente en ejecución, no una herramienta de construcción.

### 9.2 Correcciones y sugerencias que hice durante el trabajo con la IA

| Lo que planteé | Qué se hizo con eso |
| --- | --- |
| Sugerí pasarle el PRD completo a Claude Code y evitar repeticiones en `CLAUDE.md` | Se guardó en `docs/PRD.md`, fuera del repo público, y `CLAUDE.md` lo referencia en lugar de copiarlo |
| Pedí comentarios en el código para facilitar su lectura y revisión | La IA propuso ajustar: comentarios breves por función o bloque, con la regla del PRD que implementan, más una guía `docs/GUIA-DEL-CODIGO.md`. Lo acepté |
| Pedí pruebas y verificaciones contra el PRD en cada bloque | Se acotó: usar `demo.ts` y los casos de ejemplo, revisar solo las secciones del bloque y verificar al final de punta a punta con `ec-corp-andina`. Lo acepté |
| Pedí señalar en la documentación qué estaba en el PRD y qué es propio | La IA auditó el borrador, etiquetó el origen de cada parte (**\[PRD\]** o **\[propio\]**) y rehízo la sección de supuestos |

### 9.3 Decisiones que tomé yo

| Decisión | Origen |
| --- | --- |
| Resolver el Reto 01 (Registro como Proveedor) | Propia, tras comparar los tres retos con la IA |
| Usar Gemini con clave gratuita de AI Studio como modelo del agente | Propia |
| Usar Bun en lugar de Node | Propia (la herramienta que ya había probado) |
| Desplegar en Render, plan gratuito | Recomendación de la IA frente a Railway, que adopté |
| Pasar el PRD completo a Claude Code, guardado fuera del repo público | Mía la idea; el cuidado del repo lo propuso la IA |
| Pedir comentarios por bloque y guía del código | Mía la idea; ajuste de la IA |
| Verificar cada bloque con pruebas y contra el PRD | Mía la idea; ajuste de la IA |
| Revisar yo el `agent/prompt.md` antes de seguir | Propuesta de la IA, aceptada |
| Hacer una práctica previa fuera del reloj (prueba general de las herramientas y de la llamada a la API) | Propuesta de la IA, ejecutada |
| Reescribir yo las secciones de producto de este documento | Acordado con la IA |
| Marcar siempre el origen (PRD o propio) de lo que se incorpora | Propia |
| Diseño del front: dos columnas, panel con carpeta y checklist, botones de confirmación | Propia (mockup hecho con Claude chat); Claude Code lo implementó **\[propio\]** |

### 9.4 Propuestas de la IA que descarté o ajusté

- Verificación exhaustiva con suites de tests → reducida a `demo.ts` y casos de ejemplo.
- Diseño del front de Claude Code (una columna, herramientas como desplegables) → reemplazado por **mi mockup**: dos columnas con el panel de carpeta y checklist, tarjetas de herramientas y botones de confirmación. Claude Code lo aplicó sin contradecir el PRD: el panel lee datos reales y los botones mandan un mensaje mío explícito. **\[propio\]**
- Modelo `gemini-3.8-flash` como principal (propuesta inicial de Claude Code) → cambiado a `gemini-3.5-flash-lite` con respaldos después de probarlo con mi clave: el 3.8 estaba saturado. **\[propio\]**
- Tiempo de espera de 30 s al modelo (propuesto tras un corte en Render) → corregido a 45 s cuando se midió que el plan gratuito tardaba hasta 40 s por consulta. **\[propio\]**
- Prompt del agente: aprobé el borrador y después dos ajustes que Claude Code detectó en las pruebas en Render: la marca de confirmación solo para la pregunta de envío, y no decir que el envío está prohibido. **\[propio\]**
- Las demás propuestas de Claude Code las aprobé tal cual; el detalle, con fecha, está en `docs/REGISTRO-IA.md`. Entre ellas: la fecha real con `FECHA_EJECUCION`, el mapeo exacto por glosario, el envío con advertencia, el doble control del envío en el servidor y el tope diario de tokens. **\[propio\]**

### 9.5 Cómo verifiqué

Ejecuté `demo.ts` y los casos de `fixtures/` al cerrar cada bloque, revisé los criterios de las historias de usuario y probé de punta a punta el caso `ec-corp-andina` con el prompt de la sección 11 del PRD. Resultados: **\[propio\]**

**En una línea:** los 4 casos corren con `demo.ts`, pasan 20 pruebas y la sección 11 funciona en el link público.

- **`demo.ts`** procesa los 4 casos sin clave y da la misma salida en dos ejecuciones seguidas. Resultados por caso:

  | Caso | Campos | Paquete |
  | --- | --- | --- |
  | `co-industrias-delta` | 17 llenos | No listo: Cámara de Comercio vencida |
  | `ec-corp-andina` | 13 llenos, 1 faltante, 1 a confirmar | No listo: Cámara de Comercio vencida y certificado ausente |
  | `hn-agroexport-sula` | 9 llenos, 1 faltante, 1 a confirmar | No listo: Cámara de Comercio y parafiscales vencidos |
  | `pa-logistica-istmo` | Portal: "formato no soportado" y `valores-portal.md` | No listo: Cámara de Comercio vencida |

- **`bun test`**: 20 pruebas pasan. Cubren las reglas RN1 a RN4, HU-2 y HU-5, el panel del caso y el ciclo del agente con un modelo falso (tope de pasos, tope de tokens por sesión, bloqueo del envío y errores del proveedor).
- **En el link de Render**, con el prompt de la sección 11:
  - Primer mensaje: 4 herramientas visibles, resumen estructurado, faltante, RUC a confirmar, "no listo para firma" y pregunta de cierre. No se envió nada.
  - "envía": el modelo intentó enviar sin preguntar y el servidor lo bloqueó; después hizo la pregunta de confirmación.
  - Confirmación: se generó `ENVIO-SIMULADO.md`.
- **La clave** no aparece en ningún archivo generado, respuesta ni archivo del repositorio (búsqueda antes de cada push).
- **Lo que quedó parcial:** la latencia en el link depende de la capa gratuita de Gemini, y el corte por tiempo de espera no se forzó en el link (sí localmente).

## 10. Riesgos de producción

| Riesgo | Mitigación | Origen |
| --- | --- | --- |
| El modelo completa un campo faltante con un valor plausible | Las herramientas son la única fuente de valores; el prompt prohíbe valores fuera del mapeo | **\[PRD §10\]** |
| Portales con CAPTCHA o MFA | El humano opera el portal; el agente prepara los valores en formato copiable | **\[PRD §10\]** |
| Datos bancarios filtrados | Solo se llenan si la plantilla los pide y nunca van en el borrador de correo | **\[PRD RN2\]** |
| Maestro desactualizado | Asignar un dueño del dato y alertar por vigencias | **\[PRD §10\]** y **\[propio\]** |
| Soportes vencidos que pasan inadvertidos | Bloqueo de `listo_para_firma` y alerta previa al vencimiento | **\[propio\]** |
| Límites de la capa gratuita o caída del proveedor | Adaptador intercambiable, topes de costo y mensajes claros | **\[propio\]** |
| Plantillas reales más desordenadas | Todo lo ambiguo va a confirmación humana | **\[propio\]** |
| Latencia y saturación de la capa gratuita del modelo (se midieron hasta 74 s por caso y fallas por saturación) | Plan pago del modelo en producción, respaldos automáticos y mensajes claros | **\[propio\]** |
| Pérdida de la conversación si el servidor se reinicia (las sesiones viven en memoria; en Render pasó durante una prueba) | Guardar las sesiones en archivo o base de datos; no desplegar durante el uso | **\[propio\]** |
| Uso abusivo del link público que gaste la clave | Topes por sesión y por día (ya implementados); autenticación en producción | **\[propio\]** |
| Instrucciones escondidas en el correo del cliente (por ejemplo, "envíen ya") | El prompt trata el cuerpo del correo como dato, no como orden, y el envío exige confirmación humana | **\[propio\]** |
| El modelo nombra un caso que no existe (pasó una vez, como ejemplo) | Las herramientas validan el nombre del caso y devuelven la lista de casos reales | **\[propio\]** |
