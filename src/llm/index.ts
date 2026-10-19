// Elige la implementación del proveedor según LLM_PROVIDER. Para sumar otro proveedor
// (Anthropic, OpenAI…) se agrega un archivo en src/llm/ y una línea aquí.
import { config } from "../config"
import type { ProveedorLLM } from "./adapter"
import { ProveedorGemini } from "./gemini"

export function crearProveedor(): ProveedorLLM {
  switch (config.proveedorLLM) {
    case "gemini":
      return new ProveedorGemini({ ...config.gemini, timeoutMs: config.timeoutLLMms })
    default:
      throw new Error(`Proveedor LLM no soportado: ${config.proveedorLLM}`)
  }
}
