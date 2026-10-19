// Carga de todo lo que necesita un caso: solicitud, plantilla, soportes exigidos y repositorio maestro.
import { exito, fallo, type Resultado } from "../tools/contrato"
import {
  etiquetasDePlantilla,
  leerGlosario,
  leerMaestro,
  leerPlantilla,
  leerSolicitudJson,
  leerSoportesExigidos,
  verificarCaso,
  type Glosario,
  type Maestro,
  type Plantilla,
  type Solicitud,
} from "./datos"
import { mapearCampos, type Mapeo } from "./mapeo"

export type Repositorio = { maestro: Maestro; glosario: Glosario }

/** Verifica el caso y lee su solicitud. Es el primer paso de todas las herramientas. */
export async function cargarSolicitud(raiz: string, caso: string): Promise<Resultado<Solicitud>> {
  const existe = await verificarCaso(raiz, caso)
  return existe.ok ? leerSolicitudJson(raiz, caso) : existe
}

/** Lee maestro y glosario juntos. */
export async function cargarRepositorio(raiz: string): Promise<Resultado<Repositorio>> {
  const maestro = await leerMaestro(raiz)
  if (!maestro.ok) return maestro
  const glosario = await leerGlosario(raiz)
  if (!glosario.ok) return glosario
  return exito({ maestro: maestro.data, glosario: glosario.data })
}

/** Plantilla + mapeo calculado en el servidor desde el maestro (la única fuente de valores, CA2). */
export async function mapearPlantilla(
  raiz: string,
  solicitud: Solicitud,
  repo: Repositorio,
): Promise<Resultado<{ plantilla: Plantilla; mapeo: Mapeo }>> {
  const plantilla = await leerPlantilla(raiz, solicitud.id, solicitud.formato)
  if (!plantilla.ok) return fallo(plantilla.error)
  const mapeo = mapearCampos(etiquetasDePlantilla(plantilla.data), solicitud.pais, repo.maestro, repo.glosario)
  return exito({ plantilla: plantilla.data, mapeo })
}

export { leerSoportesExigidos }
