// Contrato común de las herramientas (PRD 6.2 y HU-5).
// Toda herramienta devuelve { ok: true, data } o { ok: false, error } y nunca lanza excepciones.
import { z } from "zod"
import { registrarEnLog } from "../negocio/log"

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

/** Contexto que recibe cada herramienta: raíz del proyecto y sesión de chat. */
export type Contexto = { directory: string; sessionId: string }

/** Forma obligatoria de una herramienta: descripción, argumentos zod y execute. */
export type Herramienta<Forma extends z.ZodRawShape> = {
  description: string
  args: Forma
  execute(args: z.infer<z.ZodObject<Forma>>, ctx: Contexto): Promise<string>
}

/** Atajo para construir un resultado exitoso. */
export function exito<T>(data: T): Resultado<T> {
  return { ok: true, data }
}

/** Atajo para construir un resultado con error en lenguaje claro. */
export function fallo(error: string): Resultado<never> {
  return { ok: false, error }
}

/** Convierte cualquier error en un texto corto, sin traza cruda (HU-5). */
export function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Ejecuta la lógica de una herramienta de forma segura:
 * atrapa cualquier excepción, la convierte en { ok: false, error }
 * y deja registro en el log (RN5, CA4).
 */
export async function ejecutarSeguro<T>(
  herramienta: string,
  caso: string,
  ctx: Contexto,
  logica: () => Promise<Resultado<T>>,
  resumir: (data: T) => string,
): Promise<string> {
  let resultado: Resultado<T>
  try {
    resultado = await logica()
  } catch (e) {
    resultado = fallo(`Error inesperado en ${herramienta}: ${mensajeDeError(e)}`)
  }
  const resumen = resultado.ok ? resumir(resultado.data) : resultado.error
  await registrarEnLog(ctx.directory, caso, { herramienta, ok: resultado.ok, resumen })
  return JSON.stringify(resultado)
}

/**
 * Valida los argumentos con zod antes de ejecutar (PRD 6.2).
 * Si no cumplen, devuelve el error al llamador en vez de ejecutar.
 * La usan tanto demo.ts como el servidor.
 */
export async function ejecutarHerramienta<Forma extends z.ZodRawShape>(
  herramienta: Herramienta<Forma>,
  argsCrudos: unknown,
  ctx: Contexto,
): Promise<string> {
  const validacion = z.object(herramienta.args).safeParse(argsCrudos)
  if (!validacion.success) {
    const detalle = validacion.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`)
    return JSON.stringify(fallo(`Argumentos inválidos: ${detalle.join("; ")}`))
  }
  return herramienta.execute(validacion.data, ctx)
}
