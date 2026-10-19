// Generación del formulario en el formato que pidió el cliente (HU-3).
// P0 Excel, P1 PDF generado, P2 portal → valores-portal.md para copiar a mano.
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import type { Celda, CampoPlantilla, Plantilla, Solicitud } from "./datos"
import { valorDeCampo, type Mapeo } from "./mapeo"
import { rutas } from "./rutas"

export type FormularioGenerado = { ruta: string; formato: Solicitud["formato"]; soportado: boolean; mensaje?: string }

/** Nombre del archivo que se genera según el formato. */
export function archivoDeFormulario(formato: Solicitud["formato"]): string {
  return formato === "xlsx" ? "formulario.xlsx" : formato === "pdf" ? "formulario.pdf" : "valores-portal.md"
}

/** Genera el archivo en out/<caso>/ y devuelve su ruta relativa a la raíz del proyecto. */
export async function generarFormulario(
  raiz: string,
  solicitud: Solicitud,
  plantilla: Plantilla,
  mapeo: Mapeo,
): Promise<FormularioGenerado> {
  const caso = solicitud.id
  const carpeta = rutas.salida(raiz, caso)
  await mkdir(carpeta, { recursive: true })
  const archivo = archivoDeFormulario(solicitud.formato)
  const destino = join(carpeta, archivo)
  const ruta = `out/${caso}/${archivo}`

  if (solicitud.formato === "xlsx" && plantilla.tipo === "celdas") {
    await escribirExcel(destino, plantilla.celdas, mapeo)
    return { ruta, formato: "xlsx", soportado: true }
  }
  const campos = plantilla.tipo === "campos" ? plantilla.campos : plantilla.celdas.map((c) => ({ etiqueta: c.etiqueta, obligatorio: false }))
  if (solicitud.formato === "pdf") {
    await writeFile(destino, await crearPdf(solicitud, campos, mapeo))
    return { ruta, formato: "pdf", soportado: true }
  }
  await writeFile(destino, crearValoresPortal(solicitud, campos, mapeo))
  return {
    ruta,
    formato: "portal",
    soportado: false,
    mensaje: "Formato no soportado: el portal web lo opera una persona. Se generaron los valores listos para copiar.",
  }
}

// ---------- Excel (P0) ----------

/** Escribe cada etiqueta y su valor exactamente en la hoja y celda que indica la plantilla. */
async function escribirExcel(destino: string, celdas: Celda[], mapeo: Mapeo): Promise<void> {
  const libro = new ExcelJS.Workbook()
  for (const celda of celdas) {
    const hoja = libro.getWorksheet(celda.hoja) ?? libro.addWorksheet(celda.hoja)
    const etiqueta = hoja.getCell(celda.celda_etiqueta)
    etiqueta.value = celda.etiqueta
    etiqueta.font = { bold: true }

    const campo = valorDeCampo(mapeo, celda.etiqueta)
    const valor = hoja.getCell(celda.celda_valor)
    valor.value = campo?.valor ?? ""
    // La nota de Excel avisa a la analista sin cambiar el valor de la celda.
    if (!campo) valor.note = "Faltante: no existe en el maestro. Completar a mano."
    else if ("propuesta" in campo) valor.note = `Requiere confirmación: ${campo.motivo}`
    else if (campo.nota) valor.note = campo.nota
  }
  libro.eachSheet((hoja) => hoja.columns.forEach((col) => (col.width = 40)))
  await libro.xlsx.writeFile(destino)
}

// ---------- PDF (P1) ----------

const MARGEN = 50
const ANCHO_PAGINA = 595 // tamaño A4 en puntos
const ALTO_PAGINA = 842

/** Las fuentes estándar del PDF no tienen todos los caracteres: se reemplazan los que no existen. */
function textoSeguro(texto: string): string {
  return texto.replace(/[^\u0000-ÿ]/g, "?")
}

/** Parte un texto largo en líneas que entren en el ancho disponible. */
function partirEnLineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const lineas: string[] = []
  let actual = ""
  for (const palabra of texto.split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (fuente.widthOfTextAtSize(prueba, tamano) > ancho && actual) {
      lineas.push(actual)
      actual = palabra
    } else actual = prueba
  }
  return actual ? [...lineas, actual] : lineas
}

/** Genera un PDF con todos los campos, con etiqueta y valor, en el orden de la plantilla. */
async function crearPdf(solicitud: Solicitud, campos: CampoPlantilla[], mapeo: Mapeo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)
  let pagina: PDFPage = pdf.addPage([ANCHO_PAGINA, ALTO_PAGINA])
  let y = ALTO_PAGINA - MARGEN

  const escribir = (texto: string, fuente: PDFFont, tamano: number) => {
    for (const linea of partirEnLineas(textoSeguro(texto), fuente, tamano, ANCHO_PAGINA - 2 * MARGEN)) {
      if (y < MARGEN) {
        pagina = pdf.addPage([ANCHO_PAGINA, ALTO_PAGINA])
        y = ALTO_PAGINA - MARGEN
      }
      pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0, 0, 0) })
      y -= tamano + 4
    }
  }

  escribir("Formulario de registro de proveedor", negrita, 16)
  escribir(`Cliente: ${solicitud.cliente}`, normal, 10)
  escribir("Campos marcados con * son obligatorios.", normal, 9)
  y -= 10
  for (const campo of campos) {
    escribir(`${campo.etiqueta}${campo.obligatorio ? " *" : ""}`, negrita, 11)
    const valor = valorDeCampo(mapeo, campo.etiqueta)
    escribir(valor?.valor ?? "______________________________", normal, 11)
    if (valor?.nota) escribir(valor.nota, normal, 8)
    y -= 6
  }
  return pdf.save()
}

// ---------- Portal web (P2) ----------

/** Evita que un "|" dentro de un valor rompa la tabla Markdown. */
function celdaMd(texto: string): string {
  return texto.replace(/\|/g, "\\|")
}

/** Tabla Markdown con los valores listos para copiar al portal. Credenciales y "Enviar" son humanos. */
function crearValoresPortal(solicitud: Solicitud, campos: CampoPlantilla[], mapeo: Mapeo): string {
  const url = solicitud.cuerpo.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[.,;]$/, "")
  const filas = campos.map((campo) => {
    const valor = valorDeCampo(mapeo, campo.etiqueta)
    const estado = !valor ? "FALTANTE" : "propuesta" in valor ? `Confirmar: ${valor.motivo}` : "Lleno"
    return `| ${celdaMd(campo.etiqueta)} | ${celdaMd(valor?.valor ?? "")} | ${celdaMd(estado)} |`
  })
  return [
    `# Valores para el portal: ${solicitud.cliente}`,
    "",
    "**Formato no soportado:** este registro se hace en un portal web. El agente no lo llena.",
    `Portal: ${url ?? "(no indicado en la solicitud)"}`,
    "",
    "Una persona ingresa las credenciales, copia estos valores y hace clic en \"Enviar\".",
    "",
    "| Campo | Valor | Estado |",
    "|---|---|---|",
    ...filas,
    "",
  ].join("\n")
}
