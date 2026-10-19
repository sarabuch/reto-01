// Interfaz propia del proveedor de lenguaje (PRD 6.1: "Adaptador LLM").
// El ciclo del agente solo conoce estos tipos. Cambiar Gemini por otro proveedor
// significa escribir otra implementación de ProveedorLLM, sin tocar el ciclo.
import type { Resultado } from "../tools/contrato"

/** Pedido del modelo para ejecutar una herramienta. `firma` es un dato interno del proveedor que hay que devolverle tal cual. */
export type LlamadaHerramienta = { id: string; nombre: string; args: Record<string, unknown>; firma?: string }

export type ResultadoHerramienta = { id: string; nombre: string; resultado: string }

/** Historial en un formato neutro, independiente del proveedor. */
export type Mensaje =
  | { rol: "usuario"; texto: string }
  | { rol: "modelo"; texto: string; llamadas: LlamadaHerramienta[] }
  | { rol: "herramienta"; resultados: ResultadoHerramienta[] }

/** Herramienta descrita para el modelo: nombre, descripción y esquema JSON de sus argumentos. */
export type DefinicionHerramienta = { nombre: string; descripcion: string; parametros: Record<string, unknown> }

export type RespuestaModelo = { texto: string; llamadas: LlamadaHerramienta[]; tokens: number; modelo: string }

export interface ProveedorLLM {
  readonly nombre: string
  readonly modelo: string
  /** Envía el historial y las herramientas disponibles; devuelve texto y/o pedidos de herramientas. Nunca lanza. */
  enviar(sistema: string, mensajes: Mensaje[], herramientas: DefinicionHerramienta[]): Promise<Resultado<RespuestaModelo>>
}
