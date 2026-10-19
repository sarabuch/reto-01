// Bonus PRD 9.4: genera modulo/ a partir de los MISMOS archivos que usa la aplicación.
// - modulo/agent.md                          ← frontmatter + agent/prompt.md
// - modulo/skill/registro-proveedor/SKILL.md ← frontmatter + src/knowledge/registro-proveedor.md
// - modulo/tools/proveedor.ts                ← src/tools/proveedor.ts empaquetado en un solo archivo
// tests/modulo.test.ts falla si modulo/ se desfasa de estas fuentes (no hay copias divergentes).
// Uso: bun run modulo
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const FRONTMATTER_AGENTE = `---
description: Prepara registros como proveedor de Periferia IT Group. Lee la solicitud del cliente, llena el formulario desde el repositorio maestro y arma el paquete para firma; nunca envía nada sin confirmación explícita.
mode: primary
permission:
  edit: deny
  bash: deny
---

`

const FRONTMATTER_SKILL = `---
name: registro-proveedor
description: Conocimiento del proceso de registro como proveedor de Periferia IT Group. Identificador tributario por país, soportes y quién los actualiza, qué bloquea la firma, datos sensibles y formatos de salida.
---

`

const ENCABEZADO_HERRAMIENTAS = `// @ts-nocheck
// Archivo GENERADO por scripts/empaquetar-modulo.ts a partir de src/tools/proveedor.ts. No editar a mano.
// Las mismas herramientas que usa la aplicación, en un solo archivo y sin depender del servidor.
// Cada export es una herramienta { description, args (zod), execute(args, ctx) }; el nombre que ve el modelo
// es proveedor_<export>. ctx.directory debe ser la raíz del proyecto que contiene fixtures/reto-01/.
// Dependencias: zod, exceljs, pdf-lib.

`

/** Las tres piezas del módulo: ruta dentro de modulo/ → contenido. */
export type Modulo = Record<string, string>

/** Unifica los saltos de línea (Git en Windows puede convertirlos) para comparar contenidos. */
export function normalizar(texto: string): string {
  return texto.replace(/\r\n/g, "\n")
}

/** Empaqueta las herramientas y sus reglas de negocio en un solo archivo autónomo. */
async function empaquetarHerramientas(raiz: string): Promise<string> {
  const r = await Bun.build({
    entrypoints: [join(raiz, "src", "tools", "proveedor.ts")],
    target: "node",
    format: "esm",
    external: ["zod", "exceljs", "pdf-lib"],
  })
  const salida = r.outputs[0]
  if (!r.success || !salida) throw new Error(`No se pudieron empaquetar las herramientas: ${r.logs.join("; ")}`)
  return ENCABEZADO_HERRAMIENTAS + normalizar(await salida.text())
}

/** Arma el contenido de las tres piezas sin escribir nada en disco. */
export async function generarModulo(raiz: string): Promise<Modulo> {
  const prompt = normalizar(await readFile(join(raiz, "agent", "prompt.md"), "utf8"))
  const conocimiento = normalizar(await readFile(join(raiz, "src", "knowledge", "registro-proveedor.md"), "utf8"))
  return {
    "agent.md": FRONTMATTER_AGENTE + prompt,
    "skill/registro-proveedor/SKILL.md": FRONTMATTER_SKILL + conocimiento,
    "tools/proveedor.ts": await empaquetarHerramientas(raiz),
  }
}

/** Escribe modulo/ en disco. */
async function escribirModulo(raiz: string): Promise<void> {
  const modulo = await generarModulo(raiz)
  for (const [ruta, contenido] of Object.entries(modulo)) {
    const destino = join(raiz, "modulo", ruta)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, contenido)
    console.log(`✓ modulo/${ruta}`)
  }
}

if (import.meta.main) await escribirModulo(join(import.meta.dir, ".."))
