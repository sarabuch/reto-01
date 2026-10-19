// Cruce de cada campo pedido con el repositorio maestro (HU-2, RN1, RN2).
// Es una función pura: misma entrada, misma salida. El modelo nunca decide valores.
import type { Glosario, Maestro } from "./datos"

export type CampoLleno = { campo: string; ruta: string; valor: string; sensible: boolean; nota?: string }
export type CampoFaltante = { campo: string; motivo: string }
export type CampoAConfirmar = CampoLleno & { motivo: string; propuesta: string }

export type Mapeo = {
  llenos: CampoLleno[]
  faltantes: CampoFaltante[]
  requiere_confirmacion: CampoAConfirmar[]
}

/** RN1: nombre del identificador tributario en cada país. */
export const ID_TRIBUTARIO_POR_PAIS: Record<string, string> = { CO: "NIT", EC: "RUC", PE: "RUC", PA: "RUC", HN: "RTN" }

/** País del maestro: Periferia solo tiene NIT colombiano. */
const PAIS_DEL_MAESTRO = "CO"

/** Quita tildes, mayúsculas y espacios extra para comparar etiquetas ("Teléfono " = "telefono"). */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

/** Busca la etiqueta en el glosario ignorando tildes y mayúsculas. Devuelve la ruta del maestro o null. */
export function buscarEnGlosario(etiqueta: string, glosario: Glosario): string | null {
  const buscada = normalizar(etiqueta)
  const encontrada = Object.entries(glosario).find(([sinonimo]) => normalizar(sinonimo) === buscada)
  return encontrada ? encontrada[1] : null
}

/** Lee un valor del maestro con una ruta tipo "banco.swift". Devuelve undefined si no existe. */
export function leerRuta(maestro: Maestro, ruta: string): unknown {
  let actual: unknown = maestro
  for (const parte of ruta.split(".")) {
    if (typeof actual !== "object" || actual === null || !(parte in actual)) return undefined
    actual = (actual as Record<string, unknown>)[parte]
  }
  return actual
}

/** Convierte un valor del maestro a texto para el formulario. Objetos y vacíos no son un valor llenable. */
function comoTexto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() === "" ? null : valor
  if (typeof valor === "number") return String(valor)
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (Array.isArray(valor) && valor.every((v) => typeof v === "string")) return valor.length ? valor.join(", ") : null
  return null
}

/** Si el dato es un monto (ruta "x.valor" con moneda al lado), agrega moneda y año como nota. */
function notaDeMonto(maestro: Maestro, ruta: string): string | undefined {
  if (!ruta.endsWith(".valor")) return undefined
  const base = ruta.slice(0, -".valor".length)
  const moneda = leerRuta(maestro, `${base}.moneda`)
  const ano = leerRuta(maestro, `${base}.ano`)
  if (typeof moneda !== "string") return undefined
  return typeof ano === "number" ? `Moneda: ${moneda}, año ${ano}` : `Moneda: ${moneda}`
}

/**
 * RN1 y HU-1: decide si un identificador tributario necesita confirmación humana.
 * Devuelve null si se puede llenar directo (cliente colombiano que pide "NIT").
 */
function revisarIdTributario(etiqueta: string, pais: string): { motivo: string; propuesta: string } | null {
  const idDelPais = ID_TRIBUTARIO_POR_PAIS[pais]
  if (!idDelPais) {
    return { motivo: `País ${pais} sin regla de identificador tributario`, propuesta: "Confirmar qué identificador acepta el cliente" }
  }
  if (pais !== PAIS_DEL_MAESTRO) {
    return {
      motivo: `Identificador extranjero: el cliente (${pais}) pide ${idDelPais} y Periferia solo tiene NIT colombiano`,
      propuesta: `Se usa el NIT. Confirmar con el cliente que lo acepta como ${idDelPais}`,
    }
  }
  if (normalizar(etiqueta) !== normalizar(idDelPais)) {
    return { motivo: `Etiqueta ambigua "${etiqueta}"`, propuesta: `En ${pais} equivale al ${idDelPais}` }
  }
  return null
}

/** Mapea un solo campo a lleno, faltante o requiere_confirmacion. */
function mapearCampo(etiqueta: string, pais: string, maestro: Maestro, glosario: Glosario): CampoLleno | CampoFaltante | CampoAConfirmar {
  const ruta = buscarEnGlosario(etiqueta, glosario)
  if (!ruta) return { campo: etiqueta, motivo: "No está en el glosario: no hay una fuente conocida en el maestro" }

  const valor = comoTexto(leerRuta(maestro, ruta))
  if (valor === null) return { campo: etiqueta, motivo: `El maestro no tiene valor en "${ruta}"` }

  // RN2: los datos bancarios se marcan como sensibles (nunca van en el borrador de correo).
  const lleno: CampoLleno = { campo: etiqueta, ruta, valor, sensible: ruta.startsWith("banco.") }
  const nota = notaDeMonto(maestro, ruta)
  if (nota) lleno.nota = nota

  if (ruta === "nit") {
    const revision = revisarIdTributario(etiqueta, pais)
    if (revision) return { ...lleno, ...revision }
  }
  return lleno
}

/** HU-2: cada campo termina en exactamente uno de tres estados. Nunca se inventa un valor. */
export function mapearCampos(etiquetas: string[], pais: string, maestro: Maestro, glosario: Glosario): Mapeo {
  const mapeo: Mapeo = { llenos: [], faltantes: [], requiere_confirmacion: [] }
  for (const etiqueta of etiquetas) {
    const r = mapearCampo(etiqueta, pais, maestro, glosario)
    if ("propuesta" in r) mapeo.requiere_confirmacion.push(r)
    else if ("ruta" in r) mapeo.llenos.push(r)
    else mapeo.faltantes.push(r)
  }
  return mapeo
}

/** Busca el valor que corresponde a una etiqueta (lleno o a confirmar). null = faltante. */
export function valorDeCampo(mapeo: Mapeo, etiqueta: string): CampoLleno | CampoAConfirmar | null {
  return mapeo.llenos.find((c) => c.campo === etiqueta) ?? mapeo.requiere_confirmacion.find((c) => c.campo === etiqueta) ?? null
}
