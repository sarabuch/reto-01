# Guía del código

Explicación en lenguaje simple de qué hace cada parte del proyecto. Se actualiza en cada bloque.

## Términos que se repiten

- **Herramienta (tool):** una función que el agente puede pedir que se ejecute, por ejemplo "leer la solicitud". El modelo de lenguaje no lee archivos: le pide a una herramienta que lo haga y recibe el resultado.
- **Fixture:** un archivo de datos de prueba. Están en `fixtures/reto-01/` y no se modifican.
- **Maestro:** `maestro.json`, la ficha con los datos de Periferia. Es la única fuente de valores.
- **Glosario:** traduce el nombre que usa cada cliente ("Domicilio fiscal") a la clave del maestro (`direccion`).
- **Ruta del maestro:** el "camino" a un dato dentro del maestro, por ejemplo `banco.swift`, que significa "dentro de banco, el campo swift".
- **zod:** librería que revisa que los datos tengan la forma esperada antes de usarlos (por ejemplo, que `caso` sea un texto).
- **JSON:** formato de texto para datos estructurados, del tipo `{ "clave": "valor" }`.
- **Log:** registro de actividad. Cada vez que se ejecuta una herramienta se agrega una línea.
- **Modelo / LLM:** el modelo de lenguaje (Gemini), que entiende el pedido y decide qué herramientas llamar.
- **System prompt:** las instrucciones fijas que lee el modelo en cada conversación (`agent/prompt.md`).
- **Function calling:** la capacidad del modelo de responder "ejecutá tal herramienta con estos datos" en vez de texto.
- **Adaptador:** una pieza intermedia que traduce entre nuestro formato y el de un proveedor (Google). Si cambiamos de proveedor, solo cambia el adaptador.
- **Ciclo del agente:** la repetición modelo → herramienta → modelo hasta tener una respuesta final.
- **Token:** unidad con la que el proveedor mide el texto (más o menos media palabra). Define el costo.
- **API / endpoint:** las "direcciones" del servidor a las que el front le hace pedidos, como `/api/chat`.
- **Sesión:** una conversación. Se identifica con un `sessionId` y vive en memoria.

## Carpetas y archivos

| Ruta | Qué hace |
|---|---|
| `demo.ts` | Corre los 4 casos llamando a las herramientas sin modelo e imprime un resumen. Comando: `bun run demo.ts`. |
| `src/tools/contrato.ts` | Las reglas comunes de todas las herramientas: el formato `{ ok, data }` / `{ ok: false, error }`, la validación con zod, la protección para que nunca "exploten" y el registro en el log. |
| `src/tools/proveedor.ts` | Las 5 herramientas que ve el agente. Son delgadas: validan, llaman a `src/negocio/` y devuelven el resultado. |
| `src/tools/index.ts` | La lista de herramientas con el nombre que ve el modelo (`proveedor_leer_solicitud`, etc.). |
| `src/negocio/rutas.ts` | Dónde está cada archivo. También impide nombres de caso peligrosos como `../../`. |
| `src/negocio/datos.ts` | Lee y valida los fixtures. Si un archivo está roto, devuelve un mensaje claro. |
| `src/negocio/caso.ts` | Junta lo que necesita un caso: solicitud, plantilla, maestro y glosario. |
| `src/negocio/mapeo.ts` | Decide, campo por campo, si queda lleno, faltante o requiere confirmación. |
| `src/negocio/formulario.ts` | Escribe el Excel, el PDF o el archivo de valores para el portal. |
| `src/negocio/paquete.ts` | Revisa los soportes (presente, ausente o vencido), arma la checklist y el borrador de correo, y copia todo a `paquete/`. |
| `src/negocio/envio.ts` | Simula el envío: solo escribe `ENVIO-SIMULADO.md`. |
| `src/negocio/fecha.ts` | La fecha "de hoy" con la que se decide si algo venció. |
| `src/negocio/log.ts` | Escribe el registro en `out/log.jsonl` y `out/<caso>/log.jsonl`. |
| `agent/prompt.md` | **Comportamiento** del agente: tono, flujo, cuándo pregunta, regla de oro y confirmación. |
| `src/knowledge/registro-proveedor.md` | **Conocimiento** del proceso: identificador por país, soportes, qué bloquea la firma. Se suma al prompt. |
| `src/agent/prompt.ts` | Junta el comportamiento y el conocimiento en un solo system prompt. |
| `src/agent/ciclo.ts` | El ciclo del agente: llama al modelo, ejecuta herramientas, aplica el tope de pasos y el bloqueo del envío. |
| `src/agent/sesiones.ts` | Guarda las conversaciones en memoria, con un máximo de sesiones. |
| `src/llm/adapter.ts` | La interfaz neutra del proveedor: `enviar(sistema, mensajes, herramientas)`. |
| `src/llm/gemini.ts` | La implementación para Gemini: traduce mensajes, pasa a un modelo de respaldo si hay saturación y explica los errores en lenguaje claro. |
| `src/llm/index.ts` | Elige el proveedor según `LLM_PROVIDER`. |
| `src/config.ts` | Lee la configuración del `.env`: clave, modelo, topes de costo y tiempo de espera. |
| `src/server.ts` | El servidor HTTP: `/api/chat`, `/api/sessions/:id`, `/api/health` y la página del chat (`web/`). |
| `scripts/probar-clave.ts` | Prueba la clave de Gemini sin mostrarla. Comando: `bun run scripts/probar-clave.ts`. |
| `tests/reglas.test.ts` | Pruebas chicas de las reglas críticas. Comando: `bun test`. |
| `tests/ciclo.test.ts` | Pruebas del ciclo con un modelo falso (sin clave): tope, confirmación, errores. |
| `out/` | Lo que genera el sistema. No va al repositorio y se borra al inicio del demo. |

## Cómo viaja un pedido desde el chat

1. La analista escribe en el chat y el front hace `POST /api/chat` con `{ sessionId, message }`.
2. `server.ts` valida el pedido, busca la sesión y llama a `ejecutarTurno` (`ciclo.ts`).
3. El ciclo le manda al modelo (vía el adaptador) el system prompt, la conversación y la lista de herramientas.
4. Si el modelo pide herramientas, el ciclo las ejecuta (pasos de abajo) y le devuelve los resultados. Se repite hasta que el modelo responde con texto, con un tope de 25 vueltas.
5. Si la respuesta contiene "❓ Confirmación requerida", la sesión queda "esperando confirmación". Solo en el mensaje siguiente se permite `proveedor_simular_envio` con `confirmado: true`. Si el modelo intenta enviar antes, el servidor lo bloquea.
6. El servidor devuelve `{ reply, toolCalls, needsConfirmation }` y el front lo muestra.

## Las herramientas, paso a paso (lo mismo que hace `demo.ts` sin modelo)

1. **`proveedor_leer_solicitud`** abre `solicitud.json`, la plantilla y los soportes exigidos. Devuelve el país, el cliente, el formato, los campos y los soportes, y avisa qué campos van a necesitar confirmación.
2. **`proveedor_mapear_campos`** busca cada campo en el glosario, toma el valor del maestro y lo clasifica.
3. **`proveedor_generar_formulario`** escribe `out/<caso>/formulario.xlsx`, `.pdf` o `valores-portal.md`. Los valores siempre se vuelven a leer del maestro: si el modelo manda un valor distinto, se ignora y se avisa en `discrepancias`.
4. **`proveedor_armar_paquete`** crea `out/<caso>/paquete/` con el formulario, los soportes, `checklist.md` y `borrador-correo.md`, y calcula `listo_para_firma`.
5. **`proveedor_simular_envio`** escribe `ENVIO-SIMULADO.md`, solo si `confirmado` es verdadero y el paquete ya existe.

Cada paso deja una línea en el log.

## Dónde vive cada regla del PRD

| Regla | Dónde |
|---|---|
| HU-1, campos ambiguos | `mapeo.ts` → `revisarIdTributario`. Se usa desde `proveedor_leer_solicitud`. |
| HU-2 / CA2, nunca inventar | `mapeo.ts` → `mapearCampo`: sin glosario o sin valor = faltante. `proveedor_generar_formulario` ignora valores que vengan del modelo. |
| HU-3, formatos | `formulario.ts` |
| HU-4 / RN3, bloqueos | `paquete.ts` → `evaluarSoportes` y `calcularBloqueos` |
| HU-5, errores claros | `contrato.ts` → `ejecutarSeguro` y `ejecutarHerramienta`; `datos.ts` → `leerJson` |
| RN1, identificador por país | `mapeo.ts` → `ID_TRIBUTARIO_POR_PAIS` y `revisarIdTributario` |
| RN2, datos bancarios | `mapeo.ts` los marca como `sensible`; `paquete.ts` → `borradorCorreo` no copia ningún valor |
| RN4 / CA3, confirmación | `proveedor.ts` → `simular_envio` exige `confirmado`; `ciclo.ts` → `ejecutarLlamada` solo lo permite si el turno anterior preguntó; `agent/prompt.md` → sección "Confirmación" |
| RN5 / CA4, log | `log.ts`, llamado desde `contrato.ts`; las llamadas visibles en el chat, en `ciclo.ts` |
| CA1, tope de iteraciones | `ciclo.ts` → `ejecutarTurno` y `resumenPorTope`; valor en `config.ts` |
| CA2, solo valores de herramientas | `agent/prompt.md` → "Regla de oro"; `generar_formulario` recalcula desde el maestro |
| CA5, errores del modelo | `gemini.ts` → `mensajeClaro`; `ciclo.ts` muestra el error y la sesión sigue |
| PRD 8, costo | `config.ts` → `maxIteraciones` y `maxTokensSesion` |
