// Prueba la clave de Gemini y el function calling de los modelos candidatos.
// Nunca imprime la clave: si aparece en un mensaje de error, se reemplaza por "***".
// Uso: bun run scripts/probar-clave.ts
import { GoogleGenAI, Type } from "@google/genai"

const MODELOS_CANDIDATOS = (process.env.MODELOS_A_PROBAR ?? "gemini-3.8-flash,gemini-3.5-flash-lite").split(",")

/** Herramienta de juguete: si el modelo la llama, el function calling funciona. */
const herramientaDePrueba = {
  name: "consultar_pais",
  description: "Devuelve el identificador tributario de un país.",
  parameters: {
    type: Type.OBJECT,
    properties: { pais: { type: Type.STRING, description: "Código de país, por ejemplo EC" } },
    required: ["pais"],
  },
}

function ocultarClave(texto: string, clave: string): string {
  return texto.split(clave).join("***")
}

async function probarModelo(ia: GoogleGenAI, modelo: string, clave: string): Promise<void> {
  const inicio = Date.now()
  try {
    const r = await ia.models.generateContent({
      model: modelo,
      contents: "¿Cuál es el identificador tributario de Ecuador? Usá la herramienta.",
      config: { tools: [{ functionDeclarations: [herramientaDePrueba] }] },
    })
    const llamada = r.functionCalls?.[0]
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    console.log(
      llamada
        ? `✓ ${modelo}: responde y llama a la herramienta ${llamada.name}(${JSON.stringify(llamada.args)}) en ${segundos}s`
        : `~ ${modelo}: responde pero NO llamó a la herramienta. Texto: ${r.text?.slice(0, 80)}`,
    )
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.log(`✗ ${modelo}: ${ocultarClave(mensaje, clave).slice(0, 300)}`)
  }
}

const clave = process.env.GEMINI_API_KEY?.trim() ?? ""
if (!clave) {
  console.log("✗ Falta GEMINI_API_KEY en el archivo .env")
  process.exit(1)
}
console.log(`Clave encontrada (formato ${clave.startsWith("AQ.") ? "AQ., nuevo" : clave.startsWith("AIza") ? "AIza, clásico" : "desconocido"}, ${clave.length} caracteres)`)
const ia = new GoogleGenAI({ apiKey: clave })
for (const modelo of MODELOS_CANDIDATOS) await probarModelo(ia, modelo, clave)
