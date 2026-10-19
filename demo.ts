// Verificación sin modelo (PRD 6.6): ejecuta todos los casos de fixtures/reto-01/casos/
// llamando directo a las herramientas, e imprime un resumen por caso. No necesita ninguna clave.
// Uso: bun run demo.ts   (opcional: FECHA_EJECUCION=2026-09-03 bun run demo.ts)
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { ejecutarHerramienta, type Contexto, type Resultado } from "./src/tools/contrato"
import { listarCasos } from "./src/negocio/datos"
import { fechaDeEjecucion } from "./src/negocio/fecha"
import { herramientas } from "./src/tools"

const ctx: Contexto = { directory: import.meta.dir, sessionId: "demo" }

type Mapeo = {
  llenos: { campo: string; valor: string }[]
  faltantes: { campo: string; motivo: string }[]
  requiere_confirmacion: { campo: string; valor: string; motivo: string }[]
}
type Lectura = { pais: string; cliente: string; formato: string; campos: string[]; soportes: string[] }
type Formulario = { ruta: string; soportado: boolean; mensaje?: string }
type Paquete = {
  ruta: string
  listo_para_firma: boolean
  checklist: { soportes: { tipo: string; estado: string }[]; bloqueos: string[] }
}

/** Llama a una herramienta por su nombre y convierte el texto JSON en objeto. */
async function llamar<T>(nombre: string, args: unknown): Promise<Resultado<T>> {
  const herramienta = herramientas[nombre]
  if (!herramienta) return { ok: false, error: `Herramienta desconocida: ${nombre}` }
  return JSON.parse(await ejecutarHerramienta(herramienta, args, ctx)) as Resultado<T>
}

/** Recorre un caso completo: leer → mapear → generar → armar paquete. */
async function procesarCaso(caso: string): Promise<void> {
  console.log(`\n━━━ ${caso} ━━━`)
  const lectura = await llamar<Lectura>("proveedor_leer_solicitud", { caso })
  if (!lectura.ok) return void console.log(`  ✗ ${lectura.error}`)
  const l = lectura.data
  console.log(`  Cliente: ${l.cliente} · País: ${l.pais} · Formato: ${l.formato}`)

  const mapeo = await llamar<Mapeo>("proveedor_mapear_campos", { caso, campos: l.campos })
  if (!mapeo.ok) return void console.log(`  ✗ ${mapeo.error}`)
  const m = mapeo.data
  console.log(`  Campos: ${m.llenos.length} llenos · ${m.faltantes.length} faltantes · ${m.requiere_confirmacion.length} a confirmar`)
  m.faltantes.forEach((f) => console.log(`    - faltante: ${f.campo}`))
  m.requiere_confirmacion.forEach((c) => console.log(`    - confirmar: ${c.campo} = ${c.valor} (${c.motivo})`))

  const form = await llamar<Formulario>("proveedor_generar_formulario", { caso, mapeo: m })
  console.log(form.ok ? `  Formulario: ${form.data.ruta}${form.data.soportado ? "" : ` · ${form.data.mensaje}`}` : `  ✗ ${form.error}`)

  const paquete = await llamar<Paquete>("proveedor_armar_paquete", { caso })
  if (!paquete.ok) return void console.log(`  ✗ ${paquete.error}`)
  const p = paquete.data
  console.log(`  Paquete: ${p.ruta} · ${p.listo_para_firma ? "✅ LISTO PARA FIRMA" : "⛔ NO LISTO"}`)
  console.log(`  Soportes: ${p.checklist.soportes.map((s) => `${s.tipo}=${s.estado}`).join(", ")}`)
  p.checklist.bloqueos.forEach((b) => console.log(`    - bloqueo: ${b}`))
}

/** Muestra que los errores vuelven como { ok: false, error } y nada se rompe (HU-5, RN4). */
async function probarErrores(): Promise<void> {
  console.log("\n━━━ Manejo de errores ━━━")
  const pruebas: [string, string, unknown][] = [
    ["Caso inexistente", "proveedor_leer_solicitud", { caso: "no-existe" }],
    ["Ruta peligrosa", "proveedor_leer_solicitud", { caso: "../../etc" }],
    ["Argumentos inválidos", "proveedor_mapear_campos", { caso: 123 }],
    ["Envío sin confirmar", "proveedor_simular_envio", { caso: "co-industrias-delta", confirmado: false }],
  ]
  for (const [titulo, nombre, args] of pruebas) {
    const r = await llamar<unknown>(nombre, args)
    console.log(`  ${titulo}: ${r.ok ? "ok (inesperado)" : `✓ error claro → ${r.error}`}`)
  }
}

async function main(): Promise<void> {
  await rm(join(ctx.directory, "out"), { recursive: true, force: true }) // PRD 8: out/ se limpia al inicio
  console.log(`Demo sin modelo · fecha de ejecución: ${fechaDeEjecucion()}`)
  for (const caso of await listarCasos(ctx.directory)) await procesarCaso(caso)
  await probarErrores()
  console.log("\nArchivos generados en out/. Log en out/log.jsonl")
}

await main()
