// Bonus PRD 9.4: modulo/ debe tener las MISMAS piezas que usa la aplicación, no copias divergentes.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generarModulo, normalizar } from "../scripts/empaquetar-modulo"
import * as herramientasApp from "../src/tools/proveedor"

const RAIZ = join(import.meta.dir, "..")
const NOMBRES = ["leer_solicitud", "mapear_campos", "generar_formulario", "armar_paquete", "simular_envio"]

type HerramientaSuelta = { description: string; args: object; execute: (args: object, ctx: object) => Promise<string> }

let copia: string
beforeAll(async () => {
  copia = await mkdtemp(join(tmpdir(), "reto01-modulo-"))
  await cp(join(RAIZ, "fixtures"), join(copia, "fixtures"), { recursive: true })
})
afterAll(async () => rm(copia, { recursive: true, force: true }))

describe("modulo/ (bonus PRD 9.4)", () => {
  test("está sincronizado con las fuentes de la app (si falla: bun run modulo)", async () => {
    const esperado = await generarModulo(RAIZ)
    for (const [ruta, contenido] of Object.entries(esperado)) {
      expect(normalizar(await readFile(join(RAIZ, "modulo", ruta), "utf8"))).toBe(contenido)
    }
  }, 30_000)

  test("agent.md y SKILL.md tienen el frontmatter que pide el PRD", async () => {
    const agente = await readFile(join(RAIZ, "modulo", "agent.md"), "utf8")
    expect(agente).toMatch(/^---\r?\ndescription: .+\r?\nmode: primary\r?\npermission:\r?\n  edit: deny\r?\n  bash: deny\r?\n---/)
    const skill = await readFile(join(RAIZ, "modulo", "skill", "registro-proveedor", "SKILL.md"), "utf8")
    expect(skill).toMatch(/^---\r?\nname: registro-proveedor\r?\ndescription: .+\r?\n---/)
  })

  test("las herramientas se importan sin el servidor y dan el mismo resultado que las de la app", async () => {
    const modulo = (await import("../modulo/tools/proveedor")) as Record<string, HerramientaSuelta>
    const app = herramientasApp as unknown as Record<string, HerramientaSuelta>
    expect(Object.keys(modulo).sort()).toEqual([...NOMBRES].sort())
    const ctx = { directory: copia, sessionId: "modulo" }
    for (const nombre of ["leer_solicitud", "mapear_campos"]) {
      const args = nombre === "leer_solicitud" ? { caso: "ec-corp-andina" } : { caso: "ec-corp-andina", campos: ["RUC", "Banco", "Referencias comerciales"] }
      expect(modulo[nombre]!.description).toBe(app[nombre]!.description)
      expect(await modulo[nombre]!.execute(args, ctx)).toBe(await app[nombre]!.execute(args, ctx))
    }
  })
})
