// Ciclo del agente (PRD 6.3): prompt → modelo → herramientas → modelo … → respuesta.
// Reglas: tope de iteraciones (CA1), confirmación humana (CA3/RN4), tool calls visibles (CA4)
// y errores en lenguaje claro sin matar la sesión (CA5). Solo depende de la interfaz ProveedorLLM.
import { z } from "zod"
import type { DefinicionHerramienta, LlamadaHerramienta, ProveedorLLM, ResultadoHerramienta } from "../llm/adapter"
import { ejecutarHerramienta, fallo, type Contexto } from "../tools/contrato"
import { herramientas } from "../tools"
import type { EntradaHistorial, Sesion, ToolCallVisible } from "./sesiones"

/** Marca con la que el prompt pide terminar una pregunta de confirmación. El front la resalta. */
export const MARCA_CONFIRMACION = "Confirmación requerida"

const HERRAMIENTA_ENVIO = "proveedor_simular_envio"

export type Dependencias = {
  proveedor: ProveedorLLM
  sistema: string
  ctx: Contexto
  maxIteraciones: number
  maxTokensSesion: number
}

export type RespuestaTurno = { reply: string; toolCalls: ToolCallVisible[]; needsConfirmation: boolean }

/** Describe las herramientas para el modelo a partir de sus esquemas zod. */
export function definicionesDeHerramientas(): DefinicionHerramienta[] {
  return Object.entries(herramientas).map(([nombre, h]) => {
    const { $schema: _omitido, ...parametros } = z.toJSONSchema(z.object(h.args)) as Record<string, unknown>
    return { nombre, descripcion: h.description, parametros }
  })
}

/** Resumen corto del resultado para el chat. No copia valores (evita mostrar datos bancarios). */
function resumirResultado(textoJson: string): { ok: boolean; resumen: string } {
  let crudo: unknown
  try {
    crudo = JSON.parse(textoJson)
  } catch {
    return { ok: false, resumen: "Resultado ilegible" }
  }
  const r = z.object({ ok: z.boolean(), data: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() }).safeParse(crudo)
  if (!r.success) return { ok: false, resumen: "Resultado ilegible" }
  if (!r.data.ok) return { ok: false, resumen: r.data.error ?? "Error" }
  const d = r.data.data ?? {}
  const partes: string[] = []
  if (typeof d.cliente === "string") partes.push(`${d.cliente} (${String(d.pais)}), formato ${String(d.formato)}`)
  if (Array.isArray(d.campos)) partes.push(`${d.campos.length} campos`)
  if (Array.isArray(d.llenos)) partes.push(`${d.llenos.length} llenos`)
  if (Array.isArray(d.faltantes)) partes.push(`${d.faltantes.length} faltantes`)
  if (Array.isArray(d.requiere_confirmacion)) partes.push(`${d.requiere_confirmacion.length} a confirmar`)
  if (typeof d.ruta === "string") partes.push(d.ruta)
  if (typeof d.listo_para_firma === "boolean") partes.push(d.listo_para_firma ? "listo para firma" : "NO listo para firma")
  return { ok: true, resumen: partes.join(" · ") || "OK" }
}

/** Argumentos para mostrar en el chat: el mapeo se reduce a cantidades para no exhibir valores (RN2). */
function argsVisibles(args: Record<string, unknown>): Record<string, unknown> {
  const mapeo = args.mapeo
  if (typeof mapeo !== "object" || mapeo === null) return args
  const cantidades = Object.fromEntries(Object.entries(mapeo).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} campos` : "?"]))
  return { ...args, mapeo: cantidades }
}

/** Ejecuta una llamada del modelo. RN4: el envío solo se permite si el turno anterior pidió confirmación. */
async function ejecutarLlamada(l: LlamadaHerramienta, confirmacionHabilitada: boolean, ctx: Contexto): Promise<string> {
  const herramienta = herramientas[l.nombre]
  if (!herramienta) return JSON.stringify(fallo(`La herramienta ${l.nombre} no existe.`))
  if (l.nombre === HERRAMIENTA_ENVIO && l.args.confirmado === true && !confirmacionHabilitada) {
    return JSON.stringify(fallo("requiere confirmación explícita: primero pregunta a la analista y espera su respuesta en el siguiente mensaje"))
  }
  return ejecutarHerramienta(herramienta, l.args, ctx)
}

/** Guarda el turno en el historial visible y arma la respuesta de la API. */
function cerrarTurno(sesion: Sesion, reply: string, toolCalls: ToolCallVisible[]): RespuestaTurno {
  const needsConfirmation = reply.includes(MARCA_CONFIRMACION)
  sesion.esperandoConfirmacion = needsConfirmation
  const entrada: EntradaHistorial = { rol: "agente", texto: reply, ts: new Date().toISOString(), toolCalls, needsConfirmation }
  sesion.historial.push(entrada)
  return { reply, toolCalls, needsConfirmation }
}

/** Procesa un mensaje de la usuaria de punta a punta. Nunca lanza. */
export async function ejecutarTurno(sesion: Sesion, mensajeUsuario: string, deps: Dependencias): Promise<RespuestaTurno> {
  // RN4: se captura antes de procesar; el envío solo vale si el mensaje anterior del agente preguntó.
  const confirmacionHabilitada = sesion.esperandoConfirmacion
  sesion.esperandoConfirmacion = false
  sesion.historial.push({ rol: "usuario", texto: mensajeUsuario, ts: new Date().toISOString(), toolCalls: [], needsConfirmation: false })

  if (sesion.tokensUsados >= deps.maxTokensSesion) {
    return cerrarTurno(sesion, "Esta sesión alcanzó su tope de uso del modelo. Abre una sesión nueva para continuar.", [])
  }
  sesion.mensajes.push({ rol: "usuario", texto: mensajeUsuario })
  const toolCalls: ToolCallVisible[] = []
  const definiciones = definicionesDeHerramientas()

  for (let i = 0; i < deps.maxIteraciones; i++) {
    const respuesta = await deps.proveedor.enviar(deps.sistema, sesion.mensajes, definiciones)
    if (!respuesta.ok) return cerrarTurno(sesion, `⚠️ ${respuesta.error}`, toolCalls) // CA5: la sesión sigue viva
    const { texto, llamadas, tokens } = respuesta.data
    sesion.tokensUsados += tokens
    sesion.mensajes.push({ rol: "modelo", texto, llamadas })
    if (llamadas.length === 0) return cerrarTurno(sesion, texto || "No obtuve respuesta del modelo. Intenta de nuevo.", toolCalls)

    const resultados: ResultadoHerramienta[] = []
    for (const l of llamadas) {
      const resultado = await ejecutarLlamada(l, confirmacionHabilitada, deps.ctx)
      resultados.push({ id: l.id, nombre: l.nombre, resultado })
      toolCalls.push({ nombre: l.nombre, args: argsVisibles(l.args), ...resumirResultado(resultado) })
    }
    sesion.mensajes.push({ rol: "herramienta", resultados })
    if (sesion.tokensUsados >= deps.maxTokensSesion) break
  }
  return cerrarTurno(sesion, await resumenPorTope(sesion, deps), toolCalls)
}

/** CA1: al llegar al tope, se pide al modelo (sin herramientas) un cierre con lo que tiene y lo que falta. */
async function resumenPorTope(sesion: Sesion, deps: Dependencias): Promise<string> {
  const aviso = "Se alcanzó el tope de pasos de este turno. Resume lo que lograste y lo que falta, sin llamar herramientas."
  sesion.mensajes.push({ rol: "usuario", texto: aviso })
  const r = await deps.proveedor.enviar(deps.sistema, sesion.mensajes, [])
  if (!r.ok) return `⚠️ Se alcanzó el tope de pasos de este turno y no pude resumir: ${r.error}`
  sesion.tokensUsados += r.data.tokens
  sesion.mensajes.push({ rol: "modelo", texto: r.data.texto, llamadas: [] })
  return `⚠️ Se alcanzó el tope de pasos de este turno.\n\n${r.data.texto}`
}
