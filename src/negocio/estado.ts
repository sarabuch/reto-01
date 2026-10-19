// Estado de un caso para el panel lateral del chat: archivos generados en out/<caso>/
// y la checklist guardada al armar el paquete. Solo lee lo que escribieron las herramientas (CA2).
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { exito, fallo, type Resultado } from "../tools/contrato"
import { esNombreDeCasoValido, rutas } from "./rutas"

const esquemaEstadoGuardado = z.object({
  listo_para_firma: z.boolean(),
  checklist: z.object({
    fecha_ejecucion: z.string(),
    soportes: z.array(z.object({ tipo: z.string(), estado: z.string(), vigencia_hasta: z.string().nullable() })),
    campos_faltantes: z.array(z.string()),
    requiere_confirmacion: z.array(z.object({ campo: z.string(), motivo: z.string() })),
    bloqueos: z.array(z.string()),
  }),
})

export type EstadoCaso = {
  caso: string
  /** Rutas relativas a out/<caso>/, por ejemplo "paquete/checklist.md". */
  archivos: string[]
  /** null = el paquete todavía no se armó. */
  paquete: z.infer<typeof esquemaEstadoGuardado> | null
  enviado: boolean
}

/** Lista los archivos de una carpeta y sus subcarpetas, en orden alfabético. */
async function listarArchivos(carpeta: string, prefijo = ""): Promise<string[]> {
  let entradas
  try {
    entradas = await readdir(carpeta, { withFileTypes: true })
  } catch {
    return []
  }
  const archivos: string[] = []
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativa = `${prefijo}${e.name}`
    if (e.isDirectory()) archivos.push(...(await listarArchivos(join(carpeta, e.name), `${relativa}/`)))
    else archivos.push(relativa)
  }
  return archivos
}

async function leerEstadoGuardado(raiz: string, caso: string): Promise<EstadoCaso["paquete"]> {
  try {
    const r = esquemaEstadoGuardado.safeParse(JSON.parse(await readFile(join(rutas.salida(raiz, caso), "estado-paquete.json"), "utf8")))
    return r.success ? r.data : null
  } catch {
    return null
  }
}

/** Devuelve lo generado para un caso. Si todavía no se procesó, las listas vienen vacías. */
export async function estadoDelCaso(raiz: string, caso: string): Promise<Resultado<EstadoCaso>> {
  if (!esNombreDeCasoValido(caso)) return fallo("Nombre de caso inválido.")
  const archivos = await listarArchivos(rutas.salida(raiz, caso))
  return exito({ caso, archivos, paquete: await leerEstadoGuardado(raiz, caso), enviado: archivos.includes("ENVIO-SIMULADO.md") })
}
