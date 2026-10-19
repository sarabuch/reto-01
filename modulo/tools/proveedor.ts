// @ts-nocheck
// Archivo GENERADO por scripts/empaquetar-modulo.ts a partir de src/tools/proveedor.ts. No editar a mano.
// Las mismas herramientas que usa la aplicación, en un solo archivo y sin depender del servidor.
// Cada export es una herramienta { description, args (zod), execute(args, ctx) }; el nombre que ve el modelo
// es proveedor_<export>. ctx.directory debe ser la raíz del proyecto que contiene fixtures/reto-01/.
// Dependencias: zod, exceljs, pdf-lib.

// src/tools/proveedor.ts
import { z as z4 } from "zod";

// src/tools/contrato.ts
import { z } from "zod";

// src/negocio/log.ts
import { appendFile, mkdir } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/negocio/rutas.ts
import { join } from "node:path";
var CARPETA_FIXTURES = join("fixtures", "reto-01");
function esNombreDeCasoValido(caso) {
  return /^[a-z0-9-]+$/.test(caso);
}
var rutas = {
  casos: (raiz) => join(raiz, CARPETA_FIXTURES, "casos"),
  caso: (raiz, caso) => join(raiz, CARPETA_FIXTURES, "casos", caso),
  maestro: (raiz) => join(raiz, CARPETA_FIXTURES, "repositorio", "maestro.json"),
  glosario: (raiz) => join(raiz, CARPETA_FIXTURES, "glosario-campos.json"),
  soportes: (raiz) => join(raiz, CARPETA_FIXTURES, "repositorio", "soportes"),
  salida: (raiz, caso) => join(raiz, "out", caso),
  paquete: (raiz, caso) => join(raiz, "out", caso, "paquete")
};

// src/negocio/log.ts
async function registrarEnLog(raiz, caso, entrada) {
  const linea = JSON.stringify({ ts: new Date().toISOString(), caso, ...entrada }) + `
`;
  const carpetaOut = join2(raiz, "out");
  try {
    await mkdir(carpetaOut, { recursive: true });
    await appendFile(join2(carpetaOut, "log.jsonl"), linea);
    if (esNombreDeCasoValido(caso)) {
      await mkdir(join2(carpetaOut, caso), { recursive: true });
      await appendFile(join2(carpetaOut, caso, "log.jsonl"), linea);
    }
  } catch {}
}

// src/tools/contrato.ts
function exito(data) {
  return { ok: true, data };
}
function fallo(error) {
  return { ok: false, error };
}
function mensajeDeError(e) {
  return e instanceof Error ? e.message : String(e);
}
async function ejecutarSeguro(herramienta, caso, ctx, logica, resumir) {
  let resultado;
  try {
    resultado = await logica();
  } catch (e) {
    resultado = fallo(`Error inesperado en ${herramienta}: ${mensajeDeError(e)}`);
  }
  const resumen = resultado.ok ? resumir(resultado.data) : resultado.error;
  await registrarEnLog(ctx.directory, caso, { herramienta, ok: resultado.ok, resumen });
  return JSON.stringify(resultado);
}

// src/negocio/datos.ts
import { readdir, readFile } from "node:fs/promises";
import { join as join3 } from "node:path";
import { z as z2 } from "zod";
var esquemaSolicitud = z2.object({
  id: z2.string(),
  de: z2.string(),
  asunto: z2.string(),
  fecha: z2.string(),
  pais: z2.string(),
  cliente: z2.string(),
  cuerpo: z2.string(),
  formato: z2.enum(["xlsx", "pdf", "portal"]),
  adjuntos: z2.array(z2.string())
});
var esquemaCelda = z2.object({
  hoja: z2.string(),
  celda_etiqueta: z2.string(),
  etiqueta: z2.string(),
  celda_valor: z2.string()
});
var esquemaCampo = z2.object({ etiqueta: z2.string(), obligatorio: z2.boolean() });
var esquemaSoporte = z2.object({
  tipo: z2.string(),
  archivo: z2.string(),
  vigencia_hasta: z2.string().nullable(),
  pais_emisor: z2.string(),
  descripcion: z2.string()
});
var esquemaMaestro = z2.record(z2.string(), z2.unknown());
var esquemaGlosario = z2.record(z2.string(), z2.string());
async function leerJson(ruta, esquema, nombre) {
  let texto;
  try {
    texto = await readFile(ruta, "utf8");
  } catch {
    return fallo(`No se encontró el archivo ${nombre}.`);
  }
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return fallo(`El archivo ${nombre} está dañado (no es un JSON válido).`);
  }
  const validacion = esquema.safeParse(crudo);
  return validacion.success ? exito(validacion.data) : fallo(`El archivo ${nombre} no tiene la estructura esperada.`);
}
async function listarCasos(raiz) {
  try {
    const entradas = await readdir(rutas.casos(raiz), { withFileTypes: true });
    return entradas.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}
async function verificarCaso(raiz, caso) {
  const disponibles = await listarCasos(raiz);
  if (esNombreDeCasoValido(caso) && disponibles.includes(caso))
    return exito(caso);
  return fallo(`El caso "${caso}" no existe. Casos disponibles: ${disponibles.join(", ") || "ninguno"}.`);
}
async function leerSolicitudJson(raiz, caso) {
  return leerJson(join3(rutas.caso(raiz, caso), "solicitud.json"), esquemaSolicitud, `solicitud.json del caso ${caso}`);
}
async function leerPlantilla(raiz, caso, formato) {
  const carpeta = rutas.caso(raiz, caso);
  if (formato === "xlsx") {
    const r = await leerJson(join3(carpeta, "plantilla-celdas.json"), z2.array(esquemaCelda), `plantilla-celdas.json del caso ${caso}`);
    return r.ok ? exito({ tipo: "celdas", celdas: r.data }) : r;
  }
  const r = await leerJson(join3(carpeta, "plantilla-campos.json"), z2.array(esquemaCampo), `plantilla-campos.json del caso ${caso}`);
  return r.ok ? exito({ tipo: "campos", campos: r.data }) : r;
}
async function leerSoportesExigidos(raiz, caso) {
  return leerJson(join3(rutas.caso(raiz, caso), "soportes-exigidos.json"), z2.array(z2.string()), `soportes-exigidos.json del caso ${caso}`);
}
function etiquetasDePlantilla(plantilla) {
  return plantilla.tipo === "celdas" ? plantilla.celdas.map((c) => c.etiqueta) : plantilla.campos.map((c) => c.etiqueta);
}
async function leerMaestro(raiz) {
  return leerJson(rutas.maestro(raiz), esquemaMaestro, "maestro.json");
}
async function leerGlosario(raiz) {
  return leerJson(rutas.glosario(raiz), esquemaGlosario, "glosario-campos.json");
}
async function leerIndiceSoportes(raiz) {
  return leerJson(join3(rutas.soportes(raiz), "index.json"), z2.array(esquemaSoporte), "soportes/index.json");
}

// src/negocio/mapeo.ts
var ID_TRIBUTARIO_POR_PAIS = { CO: "NIT", EC: "RUC", PE: "RUC", PA: "RUC", HN: "RTN" };
var PAIS_DEL_MAESTRO = "CO";
function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function buscarEnGlosario(etiqueta, glosario) {
  const buscada = normalizar(etiqueta);
  const encontrada = Object.entries(glosario).find(([sinonimo]) => normalizar(sinonimo) === buscada);
  return encontrada ? encontrada[1] : null;
}
function leerRuta(maestro, ruta) {
  let actual = maestro;
  for (const parte of ruta.split(".")) {
    if (typeof actual !== "object" || actual === null || !(parte in actual))
      return;
    actual = actual[parte];
  }
  return actual;
}
function comoTexto(valor) {
  if (typeof valor === "string")
    return valor.trim() === "" ? null : valor;
  if (typeof valor === "number")
    return String(valor);
  if (typeof valor === "boolean")
    return valor ? "Sí" : "No";
  if (Array.isArray(valor) && valor.every((v) => typeof v === "string"))
    return valor.length ? valor.join(", ") : null;
  return null;
}
function notaDeMonto(maestro, ruta) {
  if (!ruta.endsWith(".valor"))
    return;
  const base = ruta.slice(0, -".valor".length);
  const moneda = leerRuta(maestro, `${base}.moneda`);
  const ano = leerRuta(maestro, `${base}.ano`);
  if (typeof moneda !== "string")
    return;
  return typeof ano === "number" ? `Moneda: ${moneda}, año ${ano}` : `Moneda: ${moneda}`;
}
function revisarIdTributario(etiqueta, pais) {
  const idDelPais = ID_TRIBUTARIO_POR_PAIS[pais];
  if (!idDelPais) {
    return { motivo: `País ${pais} sin regla de identificador tributario`, propuesta: "Confirmar qué identificador acepta el cliente" };
  }
  if (pais !== PAIS_DEL_MAESTRO) {
    return {
      motivo: `Identificador extranjero: el cliente (${pais}) pide ${idDelPais} y Periferia solo tiene NIT colombiano`,
      propuesta: `Se usa el NIT. Confirmar con el cliente que lo acepta como ${idDelPais}`
    };
  }
  if (normalizar(etiqueta) !== normalizar(idDelPais)) {
    return { motivo: `Etiqueta ambigua "${etiqueta}"`, propuesta: `En ${pais} equivale al ${idDelPais}` };
  }
  return null;
}
function mapearCampo(etiqueta, pais, maestro, glosario) {
  const ruta = buscarEnGlosario(etiqueta, glosario);
  if (!ruta)
    return { campo: etiqueta, motivo: "No está en el glosario: no hay una fuente conocida en el maestro" };
  const valor = comoTexto(leerRuta(maestro, ruta));
  if (valor === null)
    return { campo: etiqueta, motivo: `El maestro no tiene valor en "${ruta}"` };
  const lleno = { campo: etiqueta, ruta, valor, sensible: ruta.startsWith("banco.") };
  const nota = notaDeMonto(maestro, ruta);
  if (nota)
    lleno.nota = nota;
  if (ruta === "nit") {
    const revision = revisarIdTributario(etiqueta, pais);
    if (revision)
      return { ...lleno, ...revision };
  }
  return lleno;
}
function mapearCampos(etiquetas, pais, maestro, glosario) {
  const mapeo = { llenos: [], faltantes: [], requiere_confirmacion: [] };
  for (const etiqueta of etiquetas) {
    const r = mapearCampo(etiqueta, pais, maestro, glosario);
    if ("propuesta" in r)
      mapeo.requiere_confirmacion.push(r);
    else if ("ruta" in r)
      mapeo.llenos.push(r);
    else
      mapeo.faltantes.push(r);
  }
  return mapeo;
}
function valorDeCampo(mapeo, etiqueta) {
  return mapeo.llenos.find((c) => c.campo === etiqueta) ?? mapeo.requiere_confirmacion.find((c) => c.campo === etiqueta) ?? null;
}

// src/negocio/caso.ts
async function cargarSolicitud(raiz, caso) {
  const existe = await verificarCaso(raiz, caso);
  return existe.ok ? leerSolicitudJson(raiz, caso) : existe;
}
async function cargarRepositorio(raiz) {
  const maestro = await leerMaestro(raiz);
  if (!maestro.ok)
    return maestro;
  const glosario = await leerGlosario(raiz);
  if (!glosario.ok)
    return glosario;
  return exito({ maestro: maestro.data, glosario: glosario.data });
}
async function mapearPlantilla(raiz, solicitud, repo) {
  const plantilla = await leerPlantilla(raiz, solicitud.id, solicitud.formato);
  if (!plantilla.ok)
    return fallo(plantilla.error);
  const mapeo = mapearCampos(etiquetasDePlantilla(plantilla.data), solicitud.pais, repo.maestro, repo.glosario);
  return exito({ plantilla: plantilla.data, mapeo });
}

// src/negocio/envio.ts
import { readdir as readdir2, readFile as readFile2, writeFile } from "node:fs/promises";
import { join as join4 } from "node:path";
import { z as z3 } from "zod";
var esquemaEstado = z3.object({
  listo_para_firma: z3.boolean(),
  checklist: z3.object({ bloqueos: z3.array(z3.string()) })
});
async function leerEstadoPaquete(raiz, caso) {
  try {
    const texto = await readFile2(join4(rutas.salida(raiz, caso), "estado-paquete.json"), "utf8");
    const r = esquemaEstado.safeParse(JSON.parse(texto));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
async function simularEnvio(raiz, solicitud, confirmado) {
  if (!confirmado)
    return fallo("requiere confirmación explícita");
  const caso = solicitud.id;
  const estado = await leerEstadoPaquete(raiz, caso);
  if (!estado)
    return fallo(`Primero hay que armar el paquete del caso ${caso}.`);
  const internos = ["checklist.md", "borrador-correo.md"];
  const adjuntos = (await readdir2(rutas.paquete(raiz, caso))).filter((a) => !internos.includes(a));
  const aviso = estado.listo_para_firma ? [] : ["", "**Atención:** se envió con bloqueos pendientes:", ...estado.checklist.bloqueos.map((b) => `- ${b}`)];
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
    ""
  ].join(`
`);
  await writeFile(join4(rutas.salida(raiz, caso), "ENVIO-SIMULADO.md"), contenido);
  return exito({ ruta: `out/${caso}/ENVIO-SIMULADO.md` });
}

// src/negocio/fecha.ts
var ZONA_HORARIA = "America/Bogota";
function esFechaValida(texto) {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(Date.parse(texto));
}
function fechaDeEjecucion() {
  const fijada = process.env.FECHA_EJECUCION?.trim();
  if (fijada && esFechaValida(fijada))
    return fijada;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date);
}

// src/negocio/formulario.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import { join as join5 } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
function archivoDeFormulario(formato) {
  return formato === "xlsx" ? "formulario.xlsx" : formato === "pdf" ? "formulario.pdf" : "valores-portal.md";
}
async function generarFormulario(raiz, solicitud, plantilla, mapeo) {
  const caso = solicitud.id;
  const carpeta = rutas.salida(raiz, caso);
  await mkdir2(carpeta, { recursive: true });
  const archivo = archivoDeFormulario(solicitud.formato);
  const destino = join5(carpeta, archivo);
  const ruta = `out/${caso}/${archivo}`;
  if (solicitud.formato === "xlsx" && plantilla.tipo === "celdas") {
    await escribirExcel(destino, plantilla.celdas, mapeo);
    return { ruta, formato: "xlsx", soportado: true };
  }
  const campos = plantilla.tipo === "campos" ? plantilla.campos : plantilla.celdas.map((c) => ({ etiqueta: c.etiqueta, obligatorio: false }));
  if (solicitud.formato === "pdf") {
    await writeFile2(destino, await crearPdf(solicitud, campos, mapeo));
    return { ruta, formato: "pdf", soportado: true };
  }
  await writeFile2(destino, crearValoresPortal(solicitud, campos, mapeo));
  return {
    ruta,
    formato: "portal",
    soportado: false,
    mensaje: "Formato no soportado: el portal web lo opera una persona. Se generaron los valores listos para copiar."
  };
}
async function escribirExcel(destino, celdas, mapeo) {
  const libro = new ExcelJS.Workbook;
  for (const celda of celdas) {
    const hoja = libro.getWorksheet(celda.hoja) ?? libro.addWorksheet(celda.hoja);
    const etiqueta = hoja.getCell(celda.celda_etiqueta);
    etiqueta.value = celda.etiqueta;
    etiqueta.font = { bold: true };
    const campo = valorDeCampo(mapeo, celda.etiqueta);
    const valor = hoja.getCell(celda.celda_valor);
    valor.value = campo?.valor ?? "";
    if (!campo)
      valor.note = "Faltante: no existe en el maestro. Completar a mano.";
    else if ("propuesta" in campo)
      valor.note = `Requiere confirmación: ${campo.motivo}`;
    else if (campo.nota)
      valor.note = campo.nota;
  }
  libro.eachSheet((hoja) => hoja.columns.forEach((col) => col.width = 40));
  await libro.xlsx.writeFile(destino);
}
var MARGEN = 50;
var ANCHO_PAGINA = 595;
var ALTO_PAGINA = 842;
function textoSeguro(texto) {
  return texto.replace(/[^\u0000-ÿ]/g, "?");
}
function partirEnLineas(texto, fuente, tamano, ancho) {
  const lineas = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(prueba, tamano) > ancho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else
      actual = prueba;
  }
  return actual ? [...lineas, actual] : lineas;
}
async function crearPdf(solicitud, campos, mapeo) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pagina = pdf.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;
  const escribir = (texto, fuente, tamano) => {
    for (const linea of partirEnLineas(textoSeguro(texto), fuente, tamano, ANCHO_PAGINA - 2 * MARGEN)) {
      if (y < MARGEN) {
        pagina = pdf.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
        y = ALTO_PAGINA - MARGEN;
      }
      pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0, 0, 0) });
      y -= tamano + 4;
    }
  };
  escribir("Formulario de registro de proveedor", negrita, 16);
  escribir(`Cliente: ${solicitud.cliente}`, normal, 10);
  escribir("Campos marcados con * son obligatorios.", normal, 9);
  y -= 10;
  for (const campo of campos) {
    escribir(`${campo.etiqueta}${campo.obligatorio ? " *" : ""}`, negrita, 11);
    const valor = valorDeCampo(mapeo, campo.etiqueta);
    escribir(valor?.valor ?? "______________________________", normal, 11);
    if (valor?.nota)
      escribir(valor.nota, normal, 8);
    y -= 6;
  }
  return pdf.save();
}
function celdaMd(texto) {
  return texto.replace(/\|/g, "\\|");
}
function crearValoresPortal(solicitud, campos, mapeo) {
  const url = solicitud.cuerpo.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[.,;]$/, "");
  const filas = campos.map((campo) => {
    const valor = valorDeCampo(mapeo, campo.etiqueta);
    const estado = !valor ? "FALTANTE" : ("propuesta" in valor) ? `Confirmar: ${valor.motivo}` : "Lleno";
    return `| ${celdaMd(campo.etiqueta)} | ${celdaMd(valor?.valor ?? "")} | ${celdaMd(estado)} |`;
  });
  return [
    `# Valores para el portal: ${solicitud.cliente}`,
    "",
    "**Formato no soportado:** este registro se hace en un portal web. El agente no lo llena.",
    `Portal: ${url ?? "(no indicado en la solicitud)"}`,
    "",
    'Una persona ingresa las credenciales, copia estos valores y hace clic en "Enviar".',
    "",
    "| Campo | Valor | Estado |",
    "|---|---|---|",
    ...filas,
    ""
  ].join(`
`);
}

// src/negocio/paquete.ts
import { copyFile, mkdir as mkdir3, readdir as readdir3, rm, writeFile as writeFile3 } from "node:fs/promises";
import { join as join6 } from "node:path";
function evaluarSoportes(exigidos, indice, archivosExistentes, fecha) {
  return exigidos.map((tipo) => {
    const soporte = indice.find((s) => s.tipo === tipo);
    if (!soporte || !archivosExistentes.includes(soporte.archivo)) {
      return { tipo, estado: "ausente", archivo: null, vigencia_hasta: null, descripcion: soporte?.descripcion ?? null };
    }
    const vencido = soporte.vigencia_hasta !== null && soporte.vigencia_hasta < fecha;
    return {
      tipo,
      estado: vencido ? "vencido" : "presente",
      archivo: soporte.archivo,
      vigencia_hasta: soporte.vigencia_hasta,
      descripcion: soporte.descripcion
    };
  });
}
function calcularBloqueos(soportes) {
  return soportes.filter((s) => s.estado !== "presente").map((s) => s.estado === "vencido" ? `Soporte vencido: ${s.tipo} (venció el ${s.vigencia_hasta})` : `Soporte exigido ausente: ${s.tipo}`);
}
function crearChecklist(soportes, mapeo, fecha, errorFormulario) {
  const bloqueos = calcularBloqueos(soportes);
  if (errorFormulario)
    bloqueos.unshift(`No se pudo generar el formulario: ${errorFormulario}`);
  return {
    fecha_ejecucion: fecha,
    soportes,
    campos_faltantes: mapeo.faltantes.map((f) => f.campo),
    requiere_confirmacion: mapeo.requiere_confirmacion.map((c) => ({ campo: c.campo, motivo: c.motivo })),
    bloqueos
  };
}
async function copiarArchivos(raiz, caso, formulario, soportes) {
  const destino = rutas.paquete(raiz, caso);
  await rm(destino, { recursive: true, force: true });
  await mkdir3(destino, { recursive: true });
  if (formulario)
    await copyFile(join6(rutas.salida(raiz, caso), formulario), join6(destino, formulario));
  for (const s of soportes) {
    if (s.archivo)
      await copyFile(join6(rutas.soportes(raiz), s.archivo), join6(destino, s.archivo));
  }
}
async function archivosDeSoportes(raiz) {
  return readdir3(rutas.soportes(raiz));
}
async function armarPaquete(raiz, solicitud, mapeo, maestro, form, soportes, fecha) {
  const caso = solicitud.id;
  const formulario = "archivo" in form ? form.archivo : null;
  const checklist = crearChecklist(soportes, mapeo, fecha, "error" in form ? form.error : null);
  const listo = checklist.bloqueos.length === 0;
  await copiarArchivos(raiz, caso, formulario, soportes);
  const carpeta = rutas.paquete(raiz, caso);
  await writeFile3(join6(carpeta, "checklist.md"), checklistMarkdown(solicitud, checklist, listo));
  await writeFile3(join6(carpeta, "borrador-correo.md"), borradorCorreo(solicitud, maestro, formulario, checklist, listo));
  await writeFile3(join6(rutas.salida(raiz, caso), "estado-paquete.json"), JSON.stringify({ listo_para_firma: listo, checklist }, null, 2));
  return { ruta: `out/${caso}/paquete`, listo_para_firma: listo, formulario, checklist };
}
var ICONO = { presente: "✅ presente", ausente: "❌ ausente", vencido: "⚠️ vencido" };
function textoVigencia(s) {
  if (s.estado === "ausente")
    return "-";
  return s.vigencia_hasta ?? "no vence";
}
function listaMd(items, vacio) {
  return items.length ? items.map((i) => `- ${i}`) : [`- ${vacio}`];
}
function checklistMarkdown(solicitud, c, listo) {
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
    ""
  ].join(`
`);
}
function borradorCorreo(solicitud, maestro, formulario, c, listo) {
  const razonSocial = leerRuta(maestro, "razon_social");
  const adjuntos = [...formulario ? [formulario] : [], ...c.soportes.filter((s) => s.archivo).map((s) => `${s.descripcion ?? s.tipo} (${s.archivo})`)];
  const notaInterna = listo ? [] : ["> NOTA INTERNA (borrar antes de enviar): el paquete NO está listo para firma.", ...c.bloqueos.map((b) => `> - ${b}`), ""];
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
    ""
  ].join(`
`);
}

// src/tools/proveedor.ts
function definir(h) {
  return h;
}
var argCaso = z4.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/, por ejemplo ec-corp-andina");
var leer_solicitud = definir({
  description: "Lee la solicitud del cliente y su plantilla: devuelve país, cliente, formato de salida, campos pedidos, soportes exigidos y campos que requieren confirmación.",
  args: { caso: argCaso },
  async execute(args, ctx) {
    return ejecutarSeguro("proveedor_leer_solicitud", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      if (!solicitud.ok)
        return solicitud;
      const s = solicitud.data;
      const plantilla = await leerPlantilla(ctx.directory, s.id, s.formato);
      if (!plantilla.ok)
        return plantilla;
      const soportes = await leerSoportesExigidos(ctx.directory, s.id);
      if (!soportes.ok)
        return soportes;
      const repo = await cargarRepositorio(ctx.directory);
      if (!repo.ok)
        return repo;
      const campos = etiquetasDePlantilla(plantilla.data);
      const aConfirmar = mapearCampos(campos, s.pais, repo.data.maestro, repo.data.glosario).requiere_confirmacion;
      return exito({
        pais: s.pais,
        cliente: s.cliente,
        formato: s.formato,
        campos,
        soportes: soportes.data,
        asunto: s.asunto,
        remitente: s.de,
        identificador_tributario_del_pais: ID_TRIBUTARIO_POR_PAIS[s.pais] ?? null,
        requiere_confirmacion: aConfirmar.map((c) => ({ campo: c.campo, motivo: c.motivo, propuesta: c.propuesta }))
      });
    }, (d) => `${d.cliente} (${d.pais}), formato ${d.formato}, ${d.campos.length} campos, ${d.soportes.length} soportes`);
  }
});
var mapear_campos = definir({
  description: "Cruza los campos pedidos con el repositorio maestro y clasifica cada uno como lleno (con ruta y valor), faltante o requiere_confirmacion.",
  args: {
    caso: argCaso,
    campos: z4.array(z4.string()).describe("Etiquetas de los campos tal como aparecen en la plantilla (las devuelve proveedor_leer_solicitud)")
  },
  async execute(args, ctx) {
    return ejecutarSeguro("proveedor_mapear_campos", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      if (!solicitud.ok)
        return solicitud;
      const repo = await cargarRepositorio(ctx.directory);
      if (!repo.ok)
        return repo;
      return exito(mapearCampos(args.campos, solicitud.data.pais, repo.data.maestro, repo.data.glosario));
    }, (m) => `${m.llenos.length} llenos, ${m.faltantes.length} faltantes, ${m.requiere_confirmacion.length} a confirmar`);
  }
});
var esquemaCampoMapeado = z4.object({
  campo: z4.string().describe("Etiqueta del campo"),
  valor: z4.string().optional().describe("Valor que devolvió proveedor_mapear_campos")
});
var generar_formulario = definir({
  description: "Genera el formulario lleno en el formato del cliente (Excel o PDF) en out/<caso>/; si es portal web, genera valores-portal.md para copiar a mano.",
  args: {
    caso: argCaso,
    mapeo: z4.object({
      llenos: z4.array(esquemaCampoMapeado).describe("Campos llenos devueltos por proveedor_mapear_campos"),
      faltantes: z4.array(esquemaCampoMapeado).describe("Campos faltantes"),
      requiere_confirmacion: z4.array(esquemaCampoMapeado).describe("Campos que requieren confirmación")
    }).describe("Resultado de proveedor_mapear_campos")
  },
  async execute(args, ctx) {
    return ejecutarSeguro("proveedor_generar_formulario", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      if (!solicitud.ok)
        return solicitud;
      const repo = await cargarRepositorio(ctx.directory);
      if (!repo.ok)
        return repo;
      const calculado = await mapearPlantilla(ctx.directory, solicitud.data, repo.data);
      if (!calculado.ok)
        return calculado;
      const { plantilla, mapeo } = calculado.data;
      const discrepancias = [...args.mapeo.llenos, ...args.mapeo.requiere_confirmacion].filter((c) => c.valor !== undefined && c.valor !== valorDeCampo(mapeo, c.campo)?.valor).map((c) => `${c.campo}: se ignoró el valor recibido y se usó el del maestro`);
      const generado = await generarFormulario(ctx.directory, solicitud.data, plantilla, mapeo);
      return exito({ ...generado, discrepancias });
    }, (d) => `${d.ruta}${d.soportado ? "" : " (formato no soportado)"}`);
  }
});
var armar_paquete = definir({
  description: "Arma out/<caso>/paquete/ con el formulario, los soportes exigidos, checklist.md y borrador-correo.md, y dice si está listo para firma.",
  args: { caso: argCaso },
  async execute(args, ctx) {
    return ejecutarSeguro("proveedor_armar_paquete", args.caso, ctx, async () => {
      const raiz = ctx.directory;
      const solicitud = await cargarSolicitud(raiz, args.caso);
      if (!solicitud.ok)
        return solicitud;
      const s = solicitud.data;
      const repo = await cargarRepositorio(raiz);
      if (!repo.ok)
        return repo;
      const exigidos = await leerSoportesExigidos(raiz, s.id);
      if (!exigidos.ok)
        return exigidos;
      const indice = await leerIndiceSoportes(raiz);
      if (!indice.ok)
        return indice;
      const calculado = await mapearPlantilla(raiz, s, repo.data);
      let form = { error: calculado.ok ? "" : calculado.error };
      if (calculado.ok) {
        await generarFormulario(raiz, s, calculado.data.plantilla, calculado.data.mapeo);
        form = { archivo: archivoDeFormulario(s.formato) };
      }
      const mapeo = calculado.ok ? calculado.data.mapeo : { llenos: [], faltantes: [], requiere_confirmacion: [] };
      const fecha = fechaDeEjecucion();
      const soportes = evaluarSoportes(exigidos.data, indice.data, await archivosDeSoportes(raiz), fecha);
      return exito(await armarPaquete(raiz, s, mapeo, repo.data.maestro, form, soportes, fecha));
    }, (p) => `${p.ruta}: ${p.listo_para_firma ? "listo para firma" : `NO listo (${p.checklist.bloqueos.length} bloqueos)`}`);
  }
});
var simular_envio = definir({
  description: "Simula el envío del paquete escribiendo out/<caso>/ENVIO-SIMULADO.md; solo usar con confirmado=true si la usuaria lo confirmó explícitamente en su último mensaje.",
  args: {
    caso: argCaso,
    confirmado: z4.boolean().describe("true solo si la usuaria confirmó el envío de forma explícita en su último mensaje")
  },
  async execute(args, ctx) {
    return ejecutarSeguro("proveedor_simular_envio", args.caso, ctx, async () => {
      if (!args.confirmado)
        return fallo("requiere confirmación explícita");
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      if (!solicitud.ok)
        return solicitud;
      return simularEnvio(ctx.directory, solicitud.data, true);
    }, (d) => d.ruta);
  }
});
export {
  armar_paquete,
  generar_formulario,
  leer_solicitud,
  mapear_campos,
  simular_envio
};
