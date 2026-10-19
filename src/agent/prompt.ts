// Arma el system prompt: comportamiento (agent/prompt.md) + conocimiento (src/knowledge/).
// Ambos viven en Markdown aparte, no en el código (PRD 6.1 y 6.5).
import { readFile } from "node:fs/promises"
import { join } from "node:path"

export async function cargarSystemPrompt(raiz: string): Promise<string> {
  const comportamiento = await readFile(join(raiz, "agent", "prompt.md"), "utf8")
  const conocimiento = await readFile(join(raiz, "src", "knowledge", "registro-proveedor.md"), "utf8")
  return `${comportamiento}\n\n${conocimiento}`
}
