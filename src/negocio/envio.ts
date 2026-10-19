// Envío simulado (HU-4, RN4). Solo escribe out/<caso>/ENVIO-SIMULADO.md; no envía nada real.
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { exito, fallo, type Resultado } from "../tools/contrato"
import type { Solicitud } from "./datos"
import { rutas } from "./rutas"

const esquemaEstado = z.object({
  listo_para_firma: z.boolean(),
  checklist: z.object({ bloqueos: z.array(z.string()) }),
})

/** Lee el estado guardado al armar el paquete. Si no existe, el paquete no se armó todavía. */
async function leerEstadoPaquete(raiz: string, caso: string): Promise<z.infer<typeof esquemaEstado> | null> {
  try {
    const texto = await readFile(join(rutas.salida(raiz, caso), "estado-paquete.json"), "utf8")
    const r = esquemaEstado.safeParse(JSON.parse(texto))
    return r.success ? r.data : null
  } catch {
    return null
  }
}

/** RN4: sin confirmación explícita no se hace nada. Con confirmación, deja constancia del envío simulado. */
export async function simularEnvio(raiz: string, solicitud: Solicitud, confirmado: boolean): Promise<Resultado<{ ruta: string }>> {
  if (!confirmado) return fallo("requiere confirmación explícita")
  const caso = solicitud.id
  const estado = await leerEstadoPaquete(raiz, caso)
  if (!estado) return fallo(`Primero hay que armar el paquete del caso ${caso}.`)

  const adjuntos = await readdir(rutas.paquete(raiz, caso))
  const aviso = estado.listo_para_firma
    ? []
    : ["", "**Atención:** se envió con bloqueos pendientes:", ...estado.checklist.bloqueos.map((b) => `- ${b}`)]
  const contenido = [
    "# Envío simulado",
    "",
    "No se envió ningún correo real. Este archivo deja constancia de que la usuaria confirmó el envío en el chat.",
    "",
    `- Fecha y hora: ${new Date().toISOString()}`,
    `- Para: ${solicitud.de}`,
    `- Asunto: RE: ${solicitud.asunto}`,
    `- Listo para firma: ${estado.listo_para_firma ? "sí" : "no"}`,
    ...aviso,
    "",
    "## Adjuntos (out/" + caso + "/paquete/)",
    ...adjuntos.map((a) => `- ${a}`),
    "",
  ].join("\n")
  await writeFile(join(rutas.salida(raiz, caso), "ENVIO-SIMULADO.md"), contenido)
  return exito({ ruta: `out/${caso}/ENVIO-SIMULADO.md` })
}
