// Configuración leída de variables de entorno (.env en local, panel de Render en producción).
// La clave NUNCA se imprime ni se expone: solo se lee aquí y se entrega al adaptador.

/** Lee un número de una variable de entorno; si falta o no es válido, usa el valor por defecto. */
function numero(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre])
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto
}

export const config = {
  puerto: numero("PORT", 3000),
  proveedorLLM: process.env.LLM_PROVIDER?.trim() || "gemini",
  gemini: {
    clave: process.env.GEMINI_API_KEY?.trim() ?? "",
    modelo: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
    modeloRespaldo: process.env.GEMINI_MODEL_RESPALDO?.trim() || "gemini-3.8-flash",
  },
  /** CA1: tope de vueltas herramienta → modelo por turno. */
  maxIteraciones: numero("MAX_ITERACIONES", 25),
  /** PRD 8 (costo): tope de tokens por sesión, para que nadie gaste la clave sin límite. */
  maxTokensSesion: numero("MAX_TOKENS_SESION", 300_000),
  /** PRD 8 (robustez): tiempo máximo de espera al proveedor LLM. */
  timeoutLLMms: numero("LLM_TIMEOUT_MS", 60_000),
  /** Máximo de sesiones en memoria (evita que el servidor se llene). */
  maxSesiones: numero("MAX_SESIONES", 200),
  /** PRD 8 (costo): tope de tokens por día para todo el servidor (el link es público y se pueden abrir muchas sesiones). */
  maxTokensDia: numero("MAX_TOKENS_DIA", 2_000_000),
}
