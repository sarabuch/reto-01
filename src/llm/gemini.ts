// Implementación del adaptador para Google Gemini (SDK oficial @google/genai).
// Traduce el historial neutro al formato de Gemini y los errores a mensajes claros (CA5).
import { ApiError, GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai"
import { exito, fallo, mensajeDeError, type Resultado } from "../tools/contrato"
import type { DefinicionHerramienta, LlamadaHerramienta, Mensaje, ProveedorLLM, RespuestaModelo } from "./adapter"

type OpcionesGemini = { clave: string; modelo: string; modeloRespaldo: string; timeoutMs: number }

/** Convierte un mensaje del historial neutro en un "Content" de Gemini. */
function aContenido(m: Mensaje): Content {
  if (m.rol === "usuario") return { role: "user", parts: [{ text: m.texto }] }
  if (m.rol === "modelo") {
    const partes: Part[] = m.texto ? [{ text: m.texto }] : []
    for (const l of m.llamadas) {
      // La firma (thoughtSignature) se devuelve tal cual: Gemini 3 la exige para seguir la conversación.
      partes.push({ functionCall: { id: l.id, name: l.nombre, args: l.args }, ...(l.firma ? { thoughtSignature: l.firma } : {}) })
    }
    return { role: "model", parts: partes }
  }
  return {
    role: "user",
    parts: m.resultados.map((r) => ({ functionResponse: { id: r.id, name: r.nombre, response: { resultado: r.resultado } } })),
  }
}

function aDeclaracion(h: DefinicionHerramienta): FunctionDeclaration {
  return { name: h.nombre, description: h.descripcion, parametersJsonSchema: h.parametros }
}

/** Traduce errores técnicos a lenguaje claro, sin trazas ni la clave. */
function mensajeClaro(e: unknown): { texto: string; reintentable: boolean } {
  if (e instanceof ApiError) {
    if (e.status === 429) return { texto: "Se alcanzó el límite de uso gratuito del modelo. Espera un minuto y vuelve a intentar.", reintentable: true }
    if (e.status === 503 || e.status === 500) return { texto: "El modelo de Google está saturado en este momento. Intenta de nuevo en unos segundos.", reintentable: true }
    if (e.status === 401 || e.status === 403) return { texto: "La clave del modelo no es válida o no tiene permisos. Revisa GEMINI_API_KEY.", reintentable: false }
    if (e.status === 400) return { texto: "El modelo rechazó el pedido (formato inválido).", reintentable: false }
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return { texto: "El modelo tardó demasiado en responder. Intenta de nuevo.", reintentable: true }
  }
  return { texto: `No se pudo hablar con el modelo: ${mensajeDeError(e).slice(0, 120)}`, reintentable: false }
}

export class ProveedorGemini implements ProveedorLLM {
  readonly nombre = "google-gemini"
  readonly modelo: string
  private readonly ia: GoogleGenAI
  private readonly opciones: OpcionesGemini

  constructor(opciones: OpcionesGemini) {
    this.opciones = opciones
    this.modelo = opciones.modelo
    this.ia = new GoogleGenAI({ apiKey: opciones.clave })
  }

  /** Intenta con el modelo principal; si está saturado o sin cupo, prueba una vez con el de respaldo. */
  async enviar(sistema: string, mensajes: Mensaje[], herramientas: DefinicionHerramienta[]): Promise<Resultado<RespuestaModelo>> {
    if (!this.opciones.clave) return fallo("Falta la clave del modelo (GEMINI_API_KEY) en el servidor.")
    const modelos = [this.opciones.modelo, this.opciones.modeloRespaldo].filter((m) => m)
    let ultimoError = ""
    for (const modelo of modelos) {
      try {
        return exito(await this.llamar(modelo, sistema, mensajes, herramientas))
      } catch (e) {
        const { texto, reintentable } = mensajeClaro(e)
        ultimoError = texto
        if (!reintentable) break
      }
    }
    return fallo(ultimoError)
  }

  private async llamar(modelo: string, sistema: string, mensajes: Mensaje[], herramientas: DefinicionHerramienta[]): Promise<RespuestaModelo> {
    const r = await this.ia.models.generateContent({
      model: modelo,
      contents: mensajes.map(aContenido),
      config: {
        systemInstruction: sistema,
        tools: herramientas.length ? [{ functionDeclarations: herramientas.map(aDeclaracion) }] : undefined,
        abortSignal: AbortSignal.timeout(this.opciones.timeoutMs),
      },
    })
    const partes = r.candidates?.[0]?.content?.parts ?? []
    const llamadas: LlamadaHerramienta[] = partes
      .filter((p) => p.functionCall?.name)
      .map((p, i) => ({
        id: p.functionCall?.id ?? `llamada-${Date.now()}-${i}`,
        nombre: p.functionCall?.name ?? "",
        args: p.functionCall?.args ?? {},
        ...(p.thoughtSignature ? { firma: p.thoughtSignature } : {}),
      }))
    const texto = partes.filter((p) => p.text && !p.thought).map((p) => p.text).join("")
    return { texto, llamadas, tokens: r.usageMetadata?.totalTokenCount ?? 0, modelo }
  }
}
