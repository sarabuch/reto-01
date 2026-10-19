// Lectura de los fixtures (solo lectura). Cada archivo se valida con zod:
// si está dañado, se devuelve un error claro en vez de seguir con datos rotos (HU-5).
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { exito, fallo, type Resultado } from "../tools/contrato"
import { esNombreDeCasoValido, rutas } from "./rutas"

// ---------- Esquemas de los archivos (PRD 7.1 y 7.2) ----------

export const esquemaSolicitud = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  pais: z.string(),
  cliente: z.string(),
  cuerpo: z.string(),
  formato: z.enum(["xlsx", "pdf", "portal"]),
  adjuntos: z.array(z.string()),
})
export type Solicitud = z.infer<typeof esquemaSolicitud>

const esquemaCelda = z.object({
  hoja: z.string(),
  celda_etiqueta: z.string(),
  etiqueta: z.string(),
  celda_valor: z.string(),
})
export type Celda = z.infer<typeof esquemaCelda>

const esquemaCampo = z.object({ etiqueta: z.string(), obligatorio: z.boolean() })
export type CampoPlantilla = z.infer<typeof esquemaCampo>

/** Plantilla Excel (celdas) o PDF/portal (lista ordenada de campos). */
export type Plantilla = { tipo: "celdas"; celdas: Celda[] } | { tipo: "campos"; campos: CampoPlantilla[] }

const esquemaSoporte = z.object({
  tipo: z.string(),
  archivo: z.string(),
  vigencia_hasta: z.string().nullable(),
  pais_emisor: z.string(),
  descripcion: z.string(),
})
export type SoporteRepositorio = z.infer<typeof esquemaSoporte>

/** El maestro es un JSON con objetos anidados; se recorre con rutas tipo "banco.swift". */
const esquemaMaestro = z.record(z.string(), z.unknown())
export type Maestro = z.infer<typeof esquemaMaestro>

const esquemaGlosario = z.record(z.string(), z.string())
export type Glosario = z.infer<typeof esquemaGlosario>

// ---------- Lectura genérica ----------

/** Lee un JSON y lo valida. Devuelve un error claro si no existe o no cumple el esquema. */
async function leerJson<T>(ruta: string, esquema: z.ZodType<T>, nombre: string): Promise<Resultado<T>> {
  let texto: string
  try {
    texto = await readFile(ruta, "utf8")
  } catch {
    return fallo(`No se encontró el archivo ${nombre}.`)
  }
  let crudo: unknown
  try {
    crudo = JSON.parse(texto)
  } catch {
    return fallo(`El archivo ${nombre} está dañado (no es un JSON válido).`)
  }
  const validacion = esquema.safeParse(crudo)
  return validacion.success
    ? exito(validacion.data)
    : fallo(`El archivo ${nombre} no tiene la estructura esperada.`)
}

// ---------- Casos ----------

/** Lista las carpetas de casos disponibles en fixtures/reto-01/casos/. */
export async function listarCasos(raiz: string): Promise<string[]> {
  try {
    const entradas = await readdir(rutas.casos(raiz), { withFileTypes: true })
    return entradas.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

/** Comprueba que el caso tenga un nombre seguro y exista; si no, explica cuáles hay. */
export async function verificarCaso(raiz: string, caso: string): Promise<Resultado<string>> {
  const disponibles = await listarCasos(raiz)
  if (esNombreDeCasoValido(caso) && disponibles.includes(caso)) return exito(caso)
  return fallo(`El caso "${caso}" no existe. Casos disponibles: ${disponibles.join(", ") || "ninguno"}.`)
}

export async function leerSolicitudJson(raiz: string, caso: string): Promise<Resultado<Solicitud>> {
  return leerJson(join(rutas.caso(raiz, caso), "solicitud.json"), esquemaSolicitud, `solicitud.json del caso ${caso}`)
}

/** Lee la plantilla según el formato: xlsx → plantilla-celdas.json; pdf y portal → plantilla-campos.json. */
export async function leerPlantilla(raiz: string, caso: string, formato: Solicitud["formato"]): Promise<Resultado<Plantilla>> {
  const carpeta = rutas.caso(raiz, caso)
  if (formato === "xlsx") {
    const r = await leerJson(join(carpeta, "plantilla-celdas.json"), z.array(esquemaCelda), `plantilla-celdas.json del caso ${caso}`)
    return r.ok ? exito({ tipo: "celdas", celdas: r.data }) : r
  }
  const r = await leerJson(join(carpeta, "plantilla-campos.json"), z.array(esquemaCampo), `plantilla-campos.json del caso ${caso}`)
  return r.ok ? exito({ tipo: "campos", campos: r.data }) : r
}

export async function leerSoportesExigidos(raiz: string, caso: string): Promise<Resultado<string[]>> {
  return leerJson(join(rutas.caso(raiz, caso), "soportes-exigidos.json"), z.array(z.string()), `soportes-exigidos.json del caso ${caso}`)
}

/** Etiquetas de la plantilla, en el orden en que aparecen. */
export function etiquetasDePlantilla(plantilla: Plantilla): string[] {
  return plantilla.tipo === "celdas" ? plantilla.celdas.map((c) => c.etiqueta) : plantilla.campos.map((c) => c.etiqueta)
}

// ---------- Repositorio ----------

export async function leerMaestro(raiz: string): Promise<Resultado<Maestro>> {
  return leerJson(rutas.maestro(raiz), esquemaMaestro, "maestro.json")
}

export async function leerGlosario(raiz: string): Promise<Resultado<Glosario>> {
  return leerJson(rutas.glosario(raiz), esquemaGlosario, "glosario-campos.json")
}

export async function leerIndiceSoportes(raiz: string): Promise<Resultado<SoporteRepositorio[]>> {
  return leerJson(join(rutas.soportes(raiz), "index.json"), z.array(esquemaSoporte), "soportes/index.json")
}
