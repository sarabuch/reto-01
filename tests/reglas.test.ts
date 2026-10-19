// Pruebas chicas de las reglas críticas del PRD. Corren con: bun test
// Usan una copia temporal de los fixtures para no tocar los originales ni out/.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mapearCampos } from "../src/negocio/mapeo"
import { calcularBloqueos, evaluarSoportes } from "../src/negocio/paquete"
import { ejecutarHerramienta, type Contexto, type Resultado } from "../src/tools/contrato"
import { herramientas } from "../src/tools"

const maestro = { nit: "900123456", razon_social: "Periferia", banco: { numero_cuenta: "123" } }
const glosario = { NIT: "nit", RUC: "nit", "Identificación tributaria": "nit", "Razón social": "razon_social", "Número de cuenta": "banco.numero_cuenta" }

let ctx: Contexto
beforeAll(async () => {
  const raiz = await mkdtemp(join(tmpdir(), "reto01-"))
  await cp(join(import.meta.dir, "..", "fixtures"), join(raiz, "fixtures"), { recursive: true })
  ctx = { directory: raiz, sessionId: "test" }
})
afterAll(async () => rm(ctx.directory, { recursive: true, force: true }))

async function llamar<T>(nombre: string, args: unknown): Promise<Resultado<T>> {
  return JSON.parse(await ejecutarHerramienta(herramientas[nombre]!, args, ctx)) as Resultado<T>
}

describe("HU-2 · mapeo", () => {
  test("un campo sin fuente queda faltante y nunca se inventa", () => {
    const m = mapearCampos(["Referencias comerciales"], "CO", maestro, glosario)
    expect(m.faltantes.map((f) => f.campo)).toEqual(["Referencias comerciales"])
    expect(m.llenos).toHaveLength(0)
  })
  test("el glosario se resuelve sin importar tildes ni mayúsculas", () => {
    const m = mapearCampos(["RAZON SOCIAL"], "CO", maestro, glosario)
    expect(m.llenos[0]?.valor).toBe("Periferia")
  })
  test("RN1: RUC en Ecuador se llena con el NIT y queda requiere_confirmacion", () => {
    const m = mapearCampos(["RUC"], "EC", maestro, glosario)
    expect(m.requiere_confirmacion[0]?.valor).toBe("900123456")
    expect(m.requiere_confirmacion[0]?.motivo).toContain("Identificador extranjero")
  })
  test("HU-1: etiqueta ambigua en Colombia propone NIT; 'NIT' se llena directo", () => {
    const m = mapearCampos(["Identificación tributaria", "NIT"], "CO", maestro, glosario)
    expect(m.requiere_confirmacion[0]?.propuesta).toContain("NIT")
    expect(m.llenos.map((c) => c.campo)).toEqual(["NIT"])
  })
  test("RN2: los datos bancarios quedan marcados como sensibles", () => {
    const m = mapearCampos(["Número de cuenta"], "CO", maestro, glosario)
    expect(m.llenos[0]?.sensible).toBe(true)
  })
})

describe("RN3 · bloqueos de firma", () => {
  const indice = [
    { tipo: "rut", archivo: "rut.txt", vigencia_hasta: null, pais_emisor: "CO", descripcion: "RUT" },
    { tipo: "camara", archivo: "camara.txt", vigencia_hasta: "2026-09-30", pais_emisor: "CO", descripcion: "Cámara" },
  ]
  test("vencido y ausente bloquean; sin vigencia no vence", () => {
    const s = evaluarSoportes(["rut", "camara", "otro"], indice, ["rut.txt", "camara.txt"], "2026-10-01")
    expect(s.map((x) => x.estado)).toEqual(["presente", "vencido", "ausente"])
    expect(calcularBloqueos(s)).toHaveLength(2)
  })
  test("el último día de vigencia todavía es válido", () => {
    const s = evaluarSoportes(["camara"], indice, ["camara.txt"], "2026-09-30")
    expect(s[0]?.estado).toBe("presente")
  })
  test("un campo faltante no bloquea: co-industrias-delta queda listo con fecha 2026-09-03", async () => {
    process.env.FECHA_EJECUCION = "2026-09-03"
    const r = await llamar<{ listo_para_firma: boolean }>("proveedor_armar_paquete", { caso: "co-industrias-delta" })
    delete process.env.FECHA_EJECUCION
    expect(r.ok && r.data.listo_para_firma).toBe(true)
  })
})

describe("Paquete y envío", () => {
  test("RN2: el borrador de correo no contiene datos bancarios", async () => {
    await llamar("proveedor_armar_paquete", { caso: "co-industrias-delta" })
    const borrador = await readFile(join(ctx.directory, "out", "co-industrias-delta", "paquete", "borrador-correo.md"), "utf8")
    for (const dato of ["03100012345", "COLOCOBM", "Bancolombia", "Ahorros"]) expect(borrador).not.toContain(dato)
  })
  test("RN4: sin confirmación no se escribe ENVIO-SIMULADO.md", async () => {
    const r = await llamar("proveedor_simular_envio", { caso: "ec-corp-andina", confirmado: false })
    expect(r).toEqual({ ok: false, error: "requiere confirmación explícita" })
  })
  test("con confirmación y paquete armado se escribe ENVIO-SIMULADO.md", async () => {
    await llamar("proveedor_armar_paquete", { caso: "ec-corp-andina" })
    const r = await llamar<{ ruta: string }>("proveedor_simular_envio", { caso: "ec-corp-andina", confirmado: true })
    expect(r.ok && r.data.ruta).toBe("out/ec-corp-andina/ENVIO-SIMULADO.md")
  })
})

describe("HU-5 · errores claros, nunca excepciones", () => {
  test("caso inexistente devuelve { ok: false } con los casos disponibles", async () => {
    const r = await llamar("proveedor_leer_solicitud", { caso: "no-existe" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("co-industrias-delta")
  })
  test("plantilla corrupta: el paquete se arma igual con los soportes y queda bloqueado", async () => {
    await writeFile(join(ctx.directory, "fixtures", "reto-01", "casos", "hn-agroexport-sula", "plantilla-celdas.json"), "{ roto")
    const r = await llamar<{ listo_para_firma: boolean; checklist: { bloqueos: string[]; soportes: unknown[] } }>(
      "proveedor_armar_paquete",
      { caso: "hn-agroexport-sula" },
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.listo_para_firma).toBe(false)
      expect(r.data.checklist.soportes).toHaveLength(3)
      expect(r.data.checklist.bloqueos[0]).toContain("dañado")
    }
  })
})
