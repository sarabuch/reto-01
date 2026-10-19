# Verificación por bloque

Lista acumulada de criterios del PRD revisados al cerrar cada bloque. Es la base de la tabla de cobertura de `SOLUCION.md`.

## Bloque 2: herramientas y `demo.ts` (2026-10-19)

| Criterio | Estado | Prueba |
|---|---|---|
| HU-1: lee país, cliente, formato, campos y soportes | Cumple | `bun run demo.ts` (los 4 casos) |
| HU-1: campo ambiguo → `requiere_confirmacion` con el equivalente del país | Cumple | test "etiqueta ambigua en Colombia" |
| HU-2: cada campo termina en lleno / faltante / requiere_confirmacion, con ruta | Cumple | demo + tests de mapeo |
| HU-2: nunca inventa; sin fuente = faltante | Cumple | test "campo sin fuente"; demo: "Número de contribuyente especial" y "Referencias comerciales" |
| HU-2: sinónimos del glosario automáticos | Cumple | test "tildes y mayúsculas" |
| HU-3 P0: Excel con etiqueta y valor en la hoja y celda exactas | Cumple | Excel leído de vuelta (`hn` y `co`) |
| HU-3 P1: PDF con todos los campos en orden | Cumple | PDF de `ec-corp-andina` abierto y revisado |
| HU-3 P2: portal → "formato no soportado" + `valores-portal.md` | Cumple | demo `pa-logistica-istmo` |
| HU-4: paquete con formulario, soportes, checklist y borrador | Cumple | `out/ec-corp-andina/paquete/` |
| HU-4 / RN3: vencido o ausente bloquea; faltante no | Cumple | tests RN3 (incluye `co-industrias-delta` listo con fecha 2026-09-03) |
| HU-4: resumen y pregunta de confirmación en el chat | Pendiente | Bloque 3 (agente) |
| HU-5: caso inexistente, argumentos inválidos y plantilla corrupta → error claro, sigue con lo posible | Cumple | demo "Manejo de errores" + test "plantilla corrupta" |
| HU-5: ninguna herramienta lanza excepción | Cumple | `ejecutarSeguro` en `contrato.ts` + tests |
| RN1: identificador extranjero → NIT + `requiere_confirmacion` | Cumple | test RN1; demo (ec, hn, pa) |
| RN2: datos bancarios solo si se piden; nunca en el borrador | Cumple | test "borrador sin datos bancarios" |
| RN4: envío solo con confirmación | Parcial | la herramienta exige `confirmado=true` (test); el control del "turno anterior" va en el Bloque 3 |
| RN5: `out/<caso>/log.jsonl` con `{ ts, herramienta, ok, resumen }` | Cumple | `out/ec-corp-andina/log.jsonl` |
| PRD 6.2: zod con `.describe()`, devuelve string JSON | Cumple | `src/tools/proveedor.ts`; test "argumentos inválidos" |
| PRD 6.6: `demo.ts` corre sin clave | Cumple | `bun run demo.ts` |
| PRD 8: determinismo; `out/` se limpia al inicio | Cumple | dos ejecuciones con salida idéntica |
| PRD 8: las herramientas no ejecutan comandos de shell | Cumple | revisión del código |

## Bloque 3: agente, prompt y servidor (2026-10-19)

| Criterio | Estado | Prueba |
|---|---|---|
| Clave "AQ." compatible con el SDK oficial (`@google/genai` 2.30.0) | Cumple | `scripts/probar-clave.ts`: `gemini-3.5-flash-lite` responde y llama a la herramienta |
| PRD 6.1: adaptador propio; cambiar de proveedor no toca el ciclo | Cumple | `tests/ciclo.test.ts` usa un proveedor falso con el mismo ciclo |
| PRD 6.1: system prompt en Markdown aparte | Cumple | `agent/prompt.md` + `src/knowledge/registro-proveedor.md` |
| CA1: tope de iteraciones; al llegar, responde con lo que tiene y lo que falta | Cumple | test "CA1" |
| CA2: solo valores que salen de herramientas | Cumple | prompt "Regla de oro" + recálculo en `generar_formulario` |
| CA3 / RN4: confirmación explícita en el turno anterior | Cumple | test "RN4 + CA3"; prueba real: el modelo intentó enviar ante "envía" y el servidor lo bloqueó |
| CA4: tool calls visibles (nombre, argumentos, resumen) y en `out/log.jsonl` | Cumple | respuesta de `/api/chat`; `out/log.jsonl` |
| CA5: error del proveedor en lenguaje claro, la sesión sigue | Cumple | test "CA5"; 503 traducido a "el modelo está saturado" |
| PRD 6.4: `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health` sin claves | Cumple | `curl` a las tres rutas |
| PRD 8: topes de iteraciones y de tokens configurables | Cumple | `MAX_ITERACIONES`, `MAX_TOKENS_SESION` |
| PRD 8: timeout al proveedor con mensaje claro | Parcial | programado (`LLM_TIMEOUT_MS` + `mensajeClaro`), pero no forzado en una prueba real |
| PRD 8: clave nunca en front, repo, logs ni respuestas | Cumple | búsqueda de la clave en `out/`, respuestas, `src/`, `agent/`, `docs/`: sin coincidencias |
| PRD 11, primer mensaje: resumen estructurado, tool calls, ruta, faltantes, estado y pregunta de cierre | Cumple | prueba real con `ec-corp-andina` (≈19.000 tokens, ≈6 s) |
| PRD 11: "envía" genera `ENVIO-SIMULADO.md` solo tras confirmación explícita | Cumple | prueba real: "envía" → pregunta; "Sí, confirmo" → archivo |
| Front que resalta la confirmación | Pendiente | Bloque 4 (la API ya devuelve `needsConfirmation`) |

## Bloque 4: front de chat (2026-10-19)

| Criterio | Estado | Prueba |
|---|---|---|
| PRD 6.1: historial de la conversación y campo de entrada | Cumple | navegador: flujo completo de `ec-corp-andina` |
| PRD 6.1: indicador de "pensando" | Cumple | navegador: "El agente está pensando…" durante el turno |
| PRD 6.1 / CA4: cada llamada a herramienta visible (nombre, argumentos y resultado resumido) | Cumple | navegador: 4 llamadas desplegables con ✓/✗ y resumen |
| PRD 6.1 / CA3: resalta cuando el agente pide confirmación | Cumple | navegador: recuadro amarillo tras "envía" |
| CA5: errores del servidor o de conexión en lenguaje claro | Cumple | código (`enviarMensaje`); el error de conexión no se forzó en el navegador |
| El historial se recupera al recargar la página | Cumple | navegador: recarga con la sesión activa |
| Uso en celular sin desplazamiento horizontal | Cumple | vista de 375 px: ancho de página = ancho de ventana |
| Seguridad: el texto del servidor no se interpreta como HTML | Cumple | código (`escapar` antes de dar formato) |
| PRD 8: un comando levanta front y backend | Cumple | `bun run dev` sirve `web/` y la API en el mismo puerto |

### Bloque 4 (revisión): reorganización según el mockup de Sara María

| Criterio | Estado | Prueba |
|---|---|---|
| Chat y panel "Estado del caso" en dos columnas; en celular el panel pasa arriba y se pliega | Cumple | navegador a 1280 px y a 375 px (sin desplazamiento horizontal) |
| CA2: el panel muestra solo datos reales (archivos de `out/<caso>/` y checklist guardada), no lo que dice el modelo | Cumple | `GET /api/casos/ec-corp-andina/estado`; test "Panel del caso" |
| CA4: rótulo "LLAMADAS A HERRAMIENTAS"; cada tarjeta con nombre, argumentos y resultado | Cumple | navegador |
| CA3 / RN4: recuadro "Requiere tu confirmación" con botones que mandan un mensaje explícito; se desactivan al mandar otro | Cumple | navegador: "Confirmar envío simulado" → `ENVIO-SIMULADO.md` aparece en el panel |
| Seguridad: la ruta nueva rechaza nombres de caso peligrosos | Cumple | `curl` con `..%2F` y test "Panel del caso" |

## Bloque 5: despliegue en Render (2026-10-19)

Link: https://reto-01-proveedor-i2ej.onrender.com/

| Criterio | Estado | Prueba |
|---|---|---|
| PRD 9.3: URL pública donde el agente responde | Cumple | `GET /api/health` → `{ ok: true, provider, model }`, sin claves |
| Render con Bun nativo (sin Docker), versión fija 1.4.3 | Cumple | Build `bun install --frozen-lockfile`, Start `bun run start`, health check `/api/health` |
| PRD 8: clave solo en variables de entorno del backend | Cumple | cargada por Sara María en el panel de Render; `/.env` → 404; ruta con `..` → 400 |
| PRD 8: tope de costo con link público | Cumple | tope por sesión + tope diario global `MAX_TOKENS_DIA` |
| PRD 11 en el link, turno 1: resumen estructurado, tool calls visibles, ruta `out/ec-corp-andina/`, faltantes, `listo_para_firma` y pregunta de cierre | Cumple | API en Render: 4 herramientas ✓, "⛔ no listo", cierre con pregunta de confirmación (74 s) |
| PRD 11 en el link, turno 2: "envía" produce solo `ENVIO-SIMULADO.md` tras confirmación explícita | Cumple | `enviado: false` tras el turno 1 y `true` tras "envía" (que respondía a la pregunta del turno anterior) |
| RN4 en el link: envío sin pregunta previa bloqueado | Cumple | primera prueba: ante "envía" el modelo intentó enviar y el servidor lo bloqueó |
| CA5 en el link: errores del proveedor claros y la sesión sigue viva | Cumple | con Google saturado se mostró "El modelo de Google está saturado…" y el siguiente mensaje funcionó |
| Front desplegado: dos columnas, panel con datos reales, confirmación con botones | Cumple | navegador en el link (incluye el arreglo del panel al agrandar la ventana) |
| Latencia estable | Parcial | depende del plan gratuito de Gemini: el mismo turno tardó de 23 s a 74 s y a veces falló por saturación |
| Envío exclusivo de la marca de confirmación para la pregunta de envío | No cumple | el modelo usó la marca en "¿Hay algún otro caso?"; ajuste del prompt propuesto a Sara María |
