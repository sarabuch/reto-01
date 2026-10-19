// Sesiones de chat en memoria (PRD 6.1: "sesiones en memoria o archivo").
// En Render se pierden si el servicio se reinicia; para este reto es suficiente.
import type { Mensaje } from "../llm/adapter"

/** Llamada a herramienta tal como se muestra en el chat (CA4): nombre, argumentos y resultado resumido. */
export type ToolCallVisible = { nombre: string; args: Record<string, unknown>; ok: boolean; resumen: string }

export type EntradaHistorial = {
  rol: "usuario" | "agente"
  texto: string
  ts: string
  toolCalls: ToolCallVisible[]
  needsConfirmation: boolean
}

export type Sesion = {
  id: string
  /** Historial que se manda al modelo (incluye resultados completos de herramientas). */
  mensajes: Mensaje[]
  /** Historial que ve la usuaria en el chat. */
  historial: EntradaHistorial[]
  tokensUsados: number
  /** RN4: true solo si el último mensaje del agente fue una pregunta de confirmación. */
  esperandoConfirmacion: boolean
  /** Evita dos turnos simultáneos en la misma sesión. */
  ocupada: boolean
  ultimoUso: number
}

export class AlmacenSesiones {
  private readonly sesiones = new Map<string, Sesion>()
  constructor(private readonly maximo: number) {}

  obtener(id: string): Sesion | undefined {
    return this.sesiones.get(id)
  }

  /** Devuelve la sesión o la crea. Si se llega al máximo, descarta la que lleva más tiempo sin uso. */
  obtenerOCrear(id: string): Sesion {
    const existente = this.sesiones.get(id)
    if (existente) return existente
    if (this.sesiones.size >= this.maximo) this.descartarMasAntigua()
    const nueva: Sesion = { id, mensajes: [], historial: [], tokensUsados: 0, esperandoConfirmacion: false, ocupada: false, ultimoUso: Date.now() }
    this.sesiones.set(id, nueva)
    return nueva
  }

  private descartarMasAntigua(): void {
    const masAntigua = [...this.sesiones.values()].filter((s) => !s.ocupada).sort((a, b) => a.ultimoUso - b.ultimoUso)[0]
    if (masAntigua) this.sesiones.delete(masAntigua.id)
  }
}
