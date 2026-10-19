# Agente "Registro como Proveedor"

Agente conversacional que prepara los registros como proveedor que piden los clientes de Periferia IT Group. Lee la solicitud, llena el formulario con los datos del repositorio maestro (Excel, PDF o valores para un portal), arma el paquete con los soportes, la checklist y un borrador de correo, y **pide confirmación explícita antes de cualquier envío**. Nunca firma ni envía nada real.

Reto técnico 01 · Perxia 2.0 · Periferia IT Group. El planteamiento completo está en [`SOLUCION.md`](SOLUCION.md).

## Link de prueba

**https://reto-01-proveedor-i2ej.onrender.com/**

- Es público: no hace falta clave de acceso.
- Corre en el plan gratuito de Render. **El servicio se duerme tras 15 minutos sin uso**: el primer pedido puede tardar unos 50 segundos. Para despertarlo, abrí `/api/health` y esperá `{"ok":true,...}`.
- Las sesiones y los archivos de `out/` se borran cuando el servicio se reinicia.

Prompt de ejemplo (PRD, sección 11), también disponible como botón en la pantalla inicial:

```
Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles
faltan, si el paquete está listo para firma y qué soportes debo actualizar.
No envíes nada todavía.
```

Después, escribí `envía` y confirmá: recién ahí se genera `out/ec-corp-andina/ENVIO-SIMULADO.md`.

## Levantarlo en local

Requisito: [Bun](https://bun.sh) 1.4 o superior.

```bash
bun install
```

```bash
cp .env.example .env
```

Completá `GEMINI_API_KEY` en `.env` (clave gratuita de [Google AI Studio](https://aistudio.google.com/apikey)) y levantá front y backend con un solo comando:

```bash
bun run dev
```

Abrí http://localhost:3000.

## Verificación sin modelo

`demo.ts` ejecuta los 4 casos de `fixtures/reto-01/casos/` llamando directo a las herramientas. No necesita clave. Limpia `out/` al inicio y da el mismo resultado en cada ejecución.

```bash
bun run demo.ts
```

Para fijar la fecha con la que se calculan los vencimientos (por defecto, hoy en Colombia):

```bash
FECHA_EJECUCION=2026-09-03 bun run demo.ts
```

Pruebas de las reglas críticas y del ciclo del agente (con un modelo falso, sin clave):

```bash
bun test
```

Para comprobar que la clave de Gemini funciona, sin mostrarla:

```bash
bun run scripts/probar-clave.ts
```

## Variables de entorno

Solo `GEMINI_API_KEY` es obligatoria. La clave vive únicamente en `.env` (local) o en el panel de Render; nunca en el repositorio, el front, los logs ni las respuestas de la API.

| Variable | Por defecto | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | (obligatoria) | Clave de Google AI Studio |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Modelo principal |
| `GEMINI_MODEL_RESPALDO` | `gemini-3.6-flash,gemini-3.8-flash` | Modelos que se prueban en orden si el principal está saturado, sin cupo o lento |
| `FECHA_EJECUCION` | hoy (America/Bogota) | Fecha `AAAA-MM-DD` para decidir si un soporte está vencido |
| `MAX_ITERACIONES` | `25` | Vueltas herramienta → modelo por turno |
| `MAX_TOKENS_SESION` | `300000` | Tope de tokens por sesión de chat |
| `MAX_TOKENS_DIA` | `2000000` | Tope de tokens por día para todo el servidor |
| `LLM_TIMEOUT_MS` | `45000` | Espera máxima por llamada al modelo |
| `LLM_PROVIDER` | `gemini` | Proveedor del adaptador LLM |
| `PORT` | `3000` | Puerto (Render lo define solo) |

### Qué pasa al superar un tope

- **`MAX_ITERACIONES`:** el agente hace una última llamada, sin herramientas, y responde con lo que logró y lo que falta.
- **`MAX_TOKENS_SESION`:** el turno se corta sin otra llamada al modelo. Desde ahí la sesión pide abrir una nueva.
- **`MAX_TOKENS_DIA`:** el servidor responde "tope diario alcanzado" sin llamar al modelo. El contador vuelve a cero al cambiar el día (UTC) o al reiniciarse el servidor.
- **`LLM_TIMEOUT_MS`:** se prueba el siguiente modelo de respaldo. Si fallan todos, el chat lo explica y la sesión sigue.

## API

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ reply, toolCalls[], needsConfirmation }`. Cada `toolCall` es `{ nombre, args, ok, resumen }`. `sessionId`: 8 a 64 caracteres `[A-Za-z0-9-]` |
| `GET` | `/api/sessions/:id` | `{ sessionId, tokensUsados, historial[] }`: historial visible completo de la sesión |
| `GET` | `/api/health` | `{ ok: true, provider, model }`, sin claves |
| `GET` | `/api/casos/:caso/estado` | `{ caso, archivos[], paquete, enviado }`: lo generado en `out/<caso>/`, para el panel lateral del chat |

Ejemplo:

```bash
curl -X POST https://reto-01-proveedor-i2ej.onrender.com/api/chat -H "Content-Type: application/json" -d '{"sessionId":"prueba-0001","message":"Procesa el caso co-industrias-delta"}'
```

## Herramientas del agente

Están en `src/tools/proveedor.ts`, tipadas con `zod` e importables sin el servidor (las usa `demo.ts`). Ninguna lanza excepciones: devuelven `{ ok: true, data }` o `{ ok: false, error }`.

| Herramienta | Qué hace |
|---|---|
| `proveedor_leer_solicitud` | País, cliente, formato, campos pedidos, soportes exigidos y campos a confirmar |
| `proveedor_mapear_campos` | Cada campo → `lleno` (con ruta en el maestro), `faltante` o `requiere_confirmacion` |
| `proveedor_generar_formulario` | `out/<caso>/formulario.xlsx`, `formulario.pdf` o `valores-portal.md` |
| `proveedor_armar_paquete` | `out/<caso>/paquete/` con formulario, soportes, `checklist.md` y `borrador-correo.md`, y `listo_para_firma` |
| `proveedor_simular_envio` | `out/<caso>/ENVIO-SIMULADO.md`, solo con `confirmado: true` y si el turno anterior pidió confirmación |

Cada ejecución queda registrada en `out/log.jsonl` y `out/<caso>/log.jsonl`.

## Estructura

```
agent/prompt.md                     comportamiento del agente (system prompt)
src/knowledge/registro-proveedor.md conocimiento del proceso
src/tools/                          herramientas y contrato común
src/negocio/                        reglas de negocio (mapeo, formularios, paquete, envío)
src/llm/                            adaptador del proveedor LLM (interfaz + Gemini)
src/agent/                          ciclo del agente y sesiones
src/server.ts                       API HTTP y archivos del front
web/                                front de chat (HTML, CSS y JS planos)
demo.ts                             verificación sin modelo
tests/                              pruebas de reglas críticas y del ciclo
fixtures/reto-01/                   datos de prueba (no se modifican)
```

La guía detallada de cada archivo, el recorrido de un pedido y dónde vive cada regla del PRD están en [`docs/GUIA-DEL-CODIGO.md`](docs/GUIA-DEL-CODIGO.md).

## Despliegue en Render

Web Service con el entorno nativo de Node + Bun (la versión se fija en `.bun-version`):

| Campo | Valor |
|---|---|
| Build Command | `bun install --frozen-lockfile` |
| Start Command | `bun run start` |
| Health Check Path | `/api/health` |
| Variables | `GEMINI_API_KEY` |

Cada push a `main` vuelve a desplegar el servicio, y eso reinicia las sesiones en memoria.
