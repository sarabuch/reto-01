// Pruebas del ciclo del agente con un proveedor falso (sin clave ni internet).
// También demuestran que el ciclo no depende de Gemini: cualquier ProveedorLLM sirve.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cp, mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ejecutarTurno, MARCA_CONFIRMACION, type Dependencias } from "../src/agent/ciclo"
import { AlmacenSesiones } from "../src/agent/sesiones"
import type { LlamadaHerramienta, ProveedorLLM, RespuestaModelo } from "../src/llm/adapter"
import { exito, fallo, type Resultado } from "../src/tools/contrato"

type Paso = Resultado<RespuestaModelo>

/** Proveedor falso: devuelve las respuestas de un guion, en orden. */
function proveedorFalso(guion: Paso[]): ProveedorLLM {
  let i = 0
  return {
    nombre: "falso",
    modelo: "guion",
    async enviar() {
      return guion[Math.min(i++, guion.length - 1)]!
    },
  }
}

const texto = (t: string): Paso => exito({ texto: t, llamadas: [], tokens: 10, modelo: "guion" })
const llamada = (nombre: string, args: Record<string, unknown>): Paso => {
  const l: LlamadaHerramienta = { id: `id-${nombre}`, nombre, args }
  return exito({ texto: "", llamadas: [l], tokens: 10, modelo: "guion" })
}

let raiz: string
beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "reto01-ciclo-"))
  await cp(join(import.meta.dir, "..", "fixtures"), join(raiz, "fixtures"), { recursive: true })
})
afterAll(async () => rm(raiz, { recursive: true, force: true }))

function deps(proveedor: ProveedorLLM, maxIteraciones = 25): Dependencias {
  return { proveedor, sistema: "prueba", ctx: { directory: raiz, sessionId: "t" }, maxIteraciones, maxTokensSesion: 100_000 }
}

const existe = (ruta: string) => stat(ruta).then(() => true, () => false)

describe("ciclo del agente", () => {
  test("CA4: cada llamada a herramienta queda visible con nombre, argumentos y resumen", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-1")
    const p = proveedorFalso([llamada("proveedor_leer_solicitud", { caso: "ec-corp-andina" }), texto("Listo")])
    const r = await ejecutarTurno(sesion, "lee ec-corp-andina", deps(p))
    expect(r.toolCalls[0]).toMatchObject({ nombre: "proveedor_leer_solicitud", ok: true })
    expect(r.toolCalls[0]?.resumen).toContain("Corporación Andina")
    expect(r.reply).toBe("Listo")
  })

  test("RN4: el envío se bloquea si el turno anterior no pidió confirmación", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-2")
    const p = proveedorFalso([
      llamada("proveedor_armar_paquete", { caso: "ec-corp-andina" }),
      llamada("proveedor_simular_envio", { caso: "ec-corp-andina", confirmado: true }),
      texto("No pude enviar"),
    ])
    const r = await ejecutarTurno(sesion, "arma y envía ec-corp-andina", deps(p))
    expect(r.toolCalls[1]).toMatchObject({ nombre: "proveedor_simular_envio", ok: false })
    expect(await existe(join(raiz, "out", "ec-corp-andina", "ENVIO-SIMULADO.md"))).toBe(false)
  })

  test("RN4 + CA3: tras una pregunta de confirmación, el siguiente mensaje sí puede enviar", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-3")
    const p = proveedorFalso([
      llamada("proveedor_armar_paquete", { caso: "ec-corp-andina" }),
      texto(`Paquete armado.\n❓ ${MARCA_CONFIRMACION}: ¿Confirmas el envío?`),
      llamada("proveedor_simular_envio", { caso: "ec-corp-andina", confirmado: true }),
      texto("Enviado (simulado)"),
    ])
    const primero = await ejecutarTurno(sesion, "arma ec-corp-andina", deps(p))
    expect(primero.needsConfirmation).toBe(true)
    const segundo = await ejecutarTurno(sesion, "sí, envía", deps(p))
    expect(segundo.toolCalls[0]?.ok).toBe(true)
    expect(await existe(join(raiz, "out", "ec-corp-andina", "ENVIO-SIMULADO.md"))).toBe(true)
  })

  test("CA1: con el tope de iteraciones el turno termina con un resumen", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-4")
    const repetida = llamada("proveedor_leer_solicitud", { caso: "co-industrias-delta" })
    const p = proveedorFalso([repetida, repetida, repetida, texto("Resumen parcial")])
    const r = await ejecutarTurno(sesion, "procesa", deps(p, 3))
    expect(r.toolCalls).toHaveLength(3)
    expect(r.reply).toContain("tope de pasos")
  })

  test("PRD 8: al superar el tope de tokens de la sesión se corta sin otra llamada al modelo", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-6")
    let llamadasAlModelo = 0
    const repetida = llamada("proveedor_leer_solicitud", { caso: "co-industrias-delta" })
    const p: ProveedorLLM = { nombre: "falso", modelo: "guion", async enviar() { llamadasAlModelo++; return repetida } }
    const conTope: Dependencias = { ...deps(p), maxTokensSesion: 15 } // cada respuesta falsa cuenta 10 tokens
    const r1 = await ejecutarTurno(sesion, "procesa", conTope)
    expect(r1.reply).toContain("tope de uso")
    expect(llamadasAlModelo).toBe(2)
    const r2 = await ejecutarTurno(sesion, "sigue", conTope)
    expect(r2.reply).toContain("tope de uso")
    expect(llamadasAlModelo).toBe(2)
  })

  test("CA5: un error del proveedor se muestra claro y la sesión sigue funcionando", async () => {
    const sesion = new AlmacenSesiones(5).obtenerOCrear("sesion-5")
    const p = proveedorFalso([fallo("El modelo de Google está saturado"), texto("Ahora sí")])
    const r1 = await ejecutarTurno(sesion, "hola", deps(p))
    expect(r1.reply).toContain("saturado")
    const r2 = await ejecutarTurno(sesion, "hola de nuevo", deps(p))
    expect(r2.reply).toBe("Ahora sí")
  })
})
