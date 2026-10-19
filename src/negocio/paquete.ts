// Armado del paquete para firma (HU-4, RN2, RN3).
// out/<caso>/paquete/ lleva: formulario, soportes copiados, checklist.md y borrador-correo.md.
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Maestro, Solicitud, SoporteRepositorio } from "./datos"
import { leerRuta, type Mapeo } from "./mapeo"
import { rutas } from "./rutas"

export type EstadoSoporte = {
  tipo: string
  estado: "presente" | "ausente" | "vencido"
  archivo: string | null
  vigencia_hasta: string | null
  descripcion: string | null
}

export type Checklist = {
  fecha_ejecucion: string
  soportes: EstadoSoporte[]
  campos_faltantes: string[]
  requiere_confirmacion: { campo: string; motivo: string }[]
  bloqueos: string[]
}

export type Paquete = { ruta: string; listo_para_firma: boolean; formulario: string | null; checklist: Checklist }

/** Formulario ya generado (nombre del archivo) o el motivo por el que no se pudo generar. */
export type FormularioDelPaquete = { archivo: string } | { error: string }

/**
 * Clasifica cada soporte exigido. Vencido = vigencia_hasta anterior a la fecha de ejecución.
 * Sin vigencia (null) = no vence. Ausente = no está en el índice o falta el archivo.
 */
export function evaluarSoportes(
  exigidos: string[],
  indice: SoporteRepositorio[],
  archivosExistentes: string[],
  fecha: string,
): EstadoSoporte[] {
  return exigidos.map((tipo) => {
    const soporte = indice.find((s) => s.tipo === tipo)
    if (!soporte || !archivosExistentes.includes(soporte.archivo)) {
      return { tipo, estado: "ausente", archivo: null, vigencia_hasta: null, descripcion: soporte?.descripcion ?? null }
    }
    const vencido = soporte.vigencia_hasta !== null && soporte.vigencia_hasta < fecha
    return {
      tipo,
      estado: vencido ? "vencido" : "presente",
      archivo: soporte.archivo,
      vigencia_hasta: soporte.vigencia_hasta,
      descripcion: soporte.descripcion,
    }
  })
}

/** RN3: un soporte vencido o ausente bloquea la firma. Un campo faltante NO bloquea (solo se lista). */
export function calcularBloqueos(soportes: EstadoSoporte[]): string[] {
  return soportes
    .filter((s) => s.estado !== "presente")
    .map((s) => (s.estado === "vencido" ? `Soporte vencido: ${s.tipo} (venció el ${s.vigencia_hasta})` : `Soporte exigido ausente: ${s.tipo}`))
}

/** Arma la checklist a partir de los soportes y del mapeo. Sin formulario (plantilla dañada) también bloquea. */
export function crearChecklist(soportes: EstadoSoporte[], mapeo: Mapeo, fecha: string, errorFormulario: string | null): Checklist {
  const bloqueos = calcularBloqueos(soportes)
  if (errorFormulario) bloqueos.unshift(`No se pudo generar el formulario: ${errorFormulario}`)
  return {
    fecha_ejecucion: fecha,
    soportes,
    campos_faltantes: mapeo.faltantes.map((f) => f.campo),
    requiere_confirmacion: mapeo.requiere_confirmacion.map((c) => ({ campo: c.campo, motivo: c.motivo })),
    bloqueos,
  }
}

/** Copia al paquete el formulario y los soportes encontrados (también los vencidos, marcados en la checklist). */
async function copiarArchivos(raiz: string, caso: string, formulario: string | null, soportes: EstadoSoporte[]): Promise<void> {
  const destino = rutas.paquete(raiz, caso)
  await rm(destino, { recursive: true, force: true }) // se rearma desde cero: mismo resultado en cada ejecución
  await mkdir(destino, { recursive: true })
  if (formulario) await copyFile(join(rutas.salida(raiz, caso), formulario), join(destino, formulario))
  for (const s of soportes) {
    if (s.archivo) await copyFile(join(rutas.soportes(raiz), s.archivo), join(destino, s.archivo))
  }
}

/** Lista los archivos de soporte que existen de verdad en el repositorio. */
export async function archivosDeSoportes(raiz: string): Promise<string[]> {
  return readdir(rutas.soportes(raiz))
}

/** Escribe el paquete completo y devuelve su estado. */
export async function armarPaquete(
  raiz: string,
  solicitud: Solicitud,
  mapeo: Mapeo,
  maestro: Maestro,
  form: FormularioDelPaquete,
  soportes: EstadoSoporte[],
  fecha: string,
): Promise<Paquete> {
  const caso = solicitud.id
  const formulario = "archivo" in form ? form.archivo : null
  const checklist = crearChecklist(soportes, mapeo, fecha, "error" in form ? form.error : null)
  const listo = checklist.bloqueos.length === 0
  await copiarArchivos(raiz, caso, formulario, soportes)
  const carpeta = rutas.paquete(raiz, caso)
  await writeFile(join(carpeta, "checklist.md"), checklistMarkdown(solicitud, checklist, listo))
  await writeFile(join(carpeta, "borrador-correo.md"), borradorCorreo(solicitud, maestro, formulario, checklist, listo))
  // Estado guardado para que la simulación de envío sepa qué se armó.
  await writeFile(join(rutas.salida(raiz, caso), "estado-paquete.json"), JSON.stringify({ listo_para_firma: listo, checklist }, null, 2))
  return { ruta: `out/${caso}/paquete`, listo_para_firma: listo, formulario, checklist }
}

// ---------- Documentos Markdown ----------

const ICONO: Record<EstadoSoporte["estado"], string> = { presente: "✅ presente", ausente: "❌ ausente", vencido: "⚠️ vencido" }

/** Un soporte ausente no tiene vigencia; uno presente sin fecha no vence. */
function textoVigencia(s: EstadoSoporte): string {
  if (s.estado === "ausente") return "-"
  return s.vigencia_hasta ?? "no vence"
}

function listaMd(items: string[], vacio: string): string[] {
  return items.length ? items.map((i) => `- ${i}`) : [`- ${vacio}`]
}

function checklistMarkdown(solicitud: Solicitud, c: Checklist, listo: boolean): string {
  return [
    `# Checklist: ${solicitud.cliente} (${solicitud.id})`,
    "",
    `Fecha de ejecución: ${c.fecha_ejecucion}`,
    `Estado: **${listo ? "LISTO PARA FIRMA" : "NO LISTO PARA FIRMA"}**`,
    "",
    "## Bloqueos",
    ...listaMd(c.bloqueos, "Ninguno"),
    "",
    "## Soportes exigidos",
    "| Soporte | Estado | Vigente hasta | Archivo |",
    "|---|---|---|---|",
    ...c.soportes.map((s) => `| ${s.tipo} | ${ICONO[s.estado]} | ${textoVigencia(s)} | ${s.archivo ?? "-"} |`),
    "",
    "## Campos faltantes (no bloquean la firma, completar a mano)",
    ...listaMd(c.campos_faltantes, "Ninguno"),
    "",
    "## Campos que requieren confirmación",
    ...listaMd(c.requiere_confirmacion.map((r) => `${r.campo}: ${r.motivo}`), "Ninguno"),
    "",
    "## Pasos humanos",
    "- Revisar el formulario y los campos marcados.",
    "- Firma del representante legal.",
    "- Confirmar el envío al cliente.",
    "",
  ].join("\n")
}

/** RN2: el borrador nunca incluye datos bancarios; no copia ningún valor del formulario. */
function borradorCorreo(solicitud: Solicitud, maestro: Maestro, formulario: string | null, c: Checklist, listo: boolean): string {
  const razonSocial = leerRuta(maestro, "razon_social")
  const adjuntos = [...(formulario ? [formulario] : []), ...c.soportes.filter((s) => s.archivo).map((s) => `${s.descripcion ?? s.tipo} (${s.archivo})`)]
  const notaInterna = listo
    ? []
    : ["> NOTA INTERNA (borrar antes de enviar): el paquete NO está listo para firma.", ...c.bloqueos.map((b) => `> - ${b}`), ""]
  return [
    ...notaInterna,
    `**Para:** ${solicitud.de}`,
    `**Asunto:** RE: ${solicitud.asunto}`,
    "",
    "Buen día,",
    "",
    `Adjuntamos el formulario de registro como proveedor para ${solicitud.cliente}, firmado por nuestro representante legal, junto con los soportes solicitados:`,
    "",
    ...adjuntos.map((a) => `- ${a}`),
    "",
    "Quedamos atentos a cualquier comentario.",
    "",
    "Cordialmente,",
    "Área Administrativa",
    typeof razonSocial === "string" ? razonSocial : "",
    "",
  ].join("\n")
}
