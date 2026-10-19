// Lógica del chat (PRD 6.1, "Front de chat"): historial, indicador de "pensando",
// llamadas a herramientas visibles (CA4), confirmación resaltada con botones (CA3)
// y panel con el estado real del caso. HTML plano, sin frameworks.
// Todo texto que llega del servidor se escapa antes de mostrarse.

const MARCA_CONFIRMACION = "❓ Confirmación requerida:"
const TEXTO_CONFIRMAR = "Sí, confirmo el envío simulado."
const TEXTO_POSTERGAR = "Todavía no, no envíes nada."
const NOMBRES_SOPORTES = {
  camara_comercio: "Cámara de Comercio",
  rut: "RUT",
  certificacion_bancaria: "Certificación bancaria",
  parafiscales: "Parafiscales",
  estados_financieros: "Estados financieros",
  certificado_iso_9001: "Certificado ISO 9001",
  certificado_cumplimiento_tributario: "Cumplimiento tributario",
}
const ETIQUETAS_ESTADO = { presente: "Presente", vencido: "Vencido: bloquea", ausente: "Ausente: bloquea" }

const chat = document.getElementById("chat")
const formulario = document.getElementById("formulario")
const campo = document.getElementById("mensaje")
const botonEnviar = document.getElementById("enviar")
const pensando = document.getElementById("pensando")
const insignia = document.getElementById("insignia")

let modeloEnUso = "conectando…"
let cantidadMensajes = 0
let casoActual = null

// ---------- Sesión ----------

/** El almacenamiento del navegador puede fallar (modo privado): entonces la sesión dura hasta recargar. */
function leerAlmacen(clave) {
  try { return sessionStorage.getItem(clave) } catch { return null }
}
function guardarAlmacen(clave, valor) {
  try { sessionStorage.setItem(clave, valor) } catch { /* sin almacenamiento */ }
}

let sessionId = leerAlmacen("sessionId") || crypto.randomUUID()
guardarAlmacen("sessionId", sessionId)
const sesionConMensajes = () => leerAlmacen("conMensajes") === "si"

function actualizarInsignia() {
  const estado = cantidadMensajes === 0 ? "sesión nueva" : cantidadMensajes === 1 ? "1 mensaje" : `${cantidadMensajes} mensajes`
  insignia.textContent = `${modeloEnUso} · ${estado}`
}

// ---------- Formato del texto ----------

/** Evita que un texto se interprete como HTML (seguridad). */
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

/** Markdown mínimo sobre texto ya escapado: **negrita**, *cursiva* y `código`. */
function formatoEnLinea(texto) {
  return escapar(texto)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
}

/** Cada línea es un párrafo; las de lista conservan su número o viñeta y su sangría. */
function markdown(texto) {
  return texto
    .split("\n")
    .filter((linea) => linea.trim())
    .map((linea) => {
      const item = linea.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
      if (!item) return `<p>${formatoEnLinea(linea)}</p>`
      const nivel = Math.min(Math.floor(item[1].length / 2), 3)
      const marca = /\d/.test(item[2]) ? item[2] : "•"
      return `<p class="item nivel-${nivel}"><span class="marca">${marca}</span><span>${formatoEnLinea(item[3])}</span></p>`
    })
    .join("")
}

/** Argumentos en una línea: los textos tal cual, las listas como [cantidad], los objetos como {…}. */
function argsCortos(args) {
  const partes = Object.entries(args).map(([clave, valor]) => {
    if (typeof valor === "string") return `${clave}: "${valor}"`
    if (Array.isArray(valor)) return `${clave}: [${valor.length}]`
    if (valor && typeof valor === "object") return `${clave}: {…}`
    return `${clave}: ${valor}`
  })
  return `{ ${partes.join(", ")} }`
}

// ---------- Pintar mensajes ----------

function bajarAlFinal() {
  chat.scrollTop = chat.scrollHeight
}

function nuevoElemento(etiqueta, clase, html = "") {
  const el = document.createElement(etiqueta)
  el.className = clase
  el.innerHTML = html
  return el
}

function pintarUsuario(texto) {
  document.getElementById("bienvenida")?.remove()
  const burbuja = nuevoElemento("div", "burbuja-usuario")
  burbuja.textContent = texto
  chat.append(burbuja)
  bajarAlFinal()
}

/** Tarjeta de una herramienta: nombre, argumentos cortos y resultado; al abrirla, los argumentos completos. */
function tarjetaHerramienta(tool) {
  const d = nuevoElemento("details", "tool")
  d.innerHTML =
    `<summary><span class="tool-nombre">${escapar(tool.nombre)}</span>` +
    `<span class="tool-args">args: ${escapar(argsCortos(tool.args))}</span>` +
    `<span class="tool-resultado${tool.ok ? "" : " fallo"}">${tool.ok ? "✓" : "✗"} Resultado: ${escapar(tool.resumen)}</span></summary>` +
    `<pre>${escapar(JSON.stringify(tool.args, null, 2))}</pre>`
  return d
}

/** Recuadro de confirmación: la pregunta del agente y botones que mandan un mensaje explícito (RN4). */
function recuadroConfirmacion(pregunta, activo) {
  const caja = nuevoElemento(
    "div",
    "confirmacion",
    `<div class="rotulo">REQUIERE TU CONFIRMACIÓN</div><div>${formatoEnLinea(pregunta)}</div>` +
      `<div class="aclaracion">Solo se escribirá ENVIO-SIMULADO.md; no se envía nada real.</div>`,
  )
  const botones = nuevoElemento("div", "botones")
  const confirmar = nuevoElemento("button", "boton-principal", "Confirmar envío simulado")
  const postergar = nuevoElemento("button", "boton-secundario", "Todavía no")
  confirmar.type = postergar.type = "button"
  confirmar.dataset.texto = TEXTO_CONFIRMAR
  postergar.dataset.texto = TEXTO_POSTERGAR
  confirmar.disabled = postergar.disabled = !activo
  botones.append(confirmar, postergar)
  caja.append(botones)
  return caja
}

/** Turno del agente: llamadas a herramientas, respuesta y, si corresponde, la confirmación. */
function pintarAgente(texto, toolCalls, pideConfirmacion, { esError = false, activo = true } = {}) {
  const turno = nuevoElemento("div", "turno-agente" + (esError ? " error" : ""))
  if (toolCalls.length) {
    turno.append(nuevoElemento("div", "rotulo", "LLAMADAS A HERRAMIENTAS"))
    toolCalls.forEach((t) => turno.append(tarjetaHerramienta(t)))
  }
  const corte = pideConfirmacion ? texto.indexOf(MARCA_CONFIRMACION) : -1
  const cuerpo = corte >= 0 ? texto.slice(0, corte) : texto
  if (cuerpo.trim()) turno.append(nuevoElemento("div", "burbuja-agente", markdown(cuerpo)))
  if (pideConfirmacion) {
    const pregunta = corte >= 0 ? texto.slice(corte + MARCA_CONFIRMACION.length).trim() : "El agente necesita tu confirmación para continuar."
    turno.append(recuadroConfirmacion(pregunta, activo))
  }
  chat.append(turno)
  bajarAlFinal()
}

/** Una confirmación solo vale para el turno siguiente: al mandar otro mensaje, se desactivan los botones. */
function desactivarConfirmaciones() {
  chat.querySelectorAll(".confirmacion button").forEach((b) => (b.disabled = true))
}

// ---------- Panel del caso ----------

/** El caso del que se habla: el último que aparece en los argumentos de una herramienta. */
function casoDeHerramientas(toolCalls) {
  const conCaso = [...toolCalls].reverse().find((t) => typeof t.args.caso === "string")
  return conCaso ? conCaso.args.caso : null
}

/** Dibuja la carpeta out/<caso>/ como árbol. estado-paquete.json es interno y no se muestra. */
function arbolDeCarpeta(caso, archivos) {
  const visibles = archivos.filter((a) => a !== "estado-paquete.json")
  if (!visibles.length) return "Todavía no hay archivos generados."
  const lineas = [`out/${caso}/`]
  const sueltos = visibles.filter((a) => !a.includes("/"))
  const carpetas = [...new Set(visibles.filter((a) => a.includes("/")).map((a) => a.split("/")[0]))]
  sueltos.forEach((a) => lineas.push(`  ${a}`))
  for (const carpeta of carpetas) {
    lineas.push(`  ${carpeta}/`)
    visibles.filter((a) => a.startsWith(`${carpeta}/`)).forEach((a) => lineas.push(`    ${a.slice(carpeta.length + 1)}`))
  }
  return lineas.join("\n")
}

function pintarSoportes(paquete) {
  const contenedor = document.getElementById("soportes")
  const listo = document.getElementById("listo")
  if (!paquete) {
    contenedor.textContent = "El paquete todavía no se armó."
    listo.hidden = true
    return
  }
  contenedor.innerHTML = paquete.checklist.soportes
    .map((s) => `<div class="fila-soporte"><span>${escapar(NOMBRES_SOPORTES[s.tipo] ?? s.tipo)}</span>` +
      `<span class="${escapar(s.estado)}">${escapar(ETIQUETAS_ESTADO[s.estado] ?? s.estado)}</span></div>`)
    .join("")
  listo.hidden = false
  listo.className = "estado-paquete " + (paquete.listo_para_firma ? "listo" : "no-listo")
  listo.textContent = paquete.listo_para_firma ? "Listo para firma" : "No listo"
}

/** Pide al servidor lo que realmente se generó para el caso (no lo que dice el modelo). */
async function actualizarPanel(caso) {
  if (!caso) return
  casoActual = caso
  try {
    const r = await fetch(`/api/casos/${encodeURIComponent(caso)}/estado`)
    if (!r.ok) return
    const estado = await r.json()
    document.getElementById("carpeta").textContent = arbolDeCarpeta(caso, estado.archivos)
    pintarSoportes(estado.paquete)
  } catch { /* el panel queda como estaba */ }
}

// ---------- Hablar con el servidor ----------

function ocupado(si) {
  pensando.hidden = !si
  botonEnviar.disabled = si
  campo.disabled = si
}

async function enviarMensaje(texto) {
  desactivarConfirmaciones()
  pintarUsuario(texto)
  cantidadMensajes++
  actualizarInsignia()
  ocupado(true)
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: texto }),
    })
    const datos = await r.json()
    guardarAlmacen("conMensajes", "si")
    if (!r.ok) {
      pintarAgente(`⚠️ ${datos.error || "No se pudo procesar el mensaje."}`, [], false, { esError: true })
      return
    }
    pintarAgente(datos.reply, datos.toolCalls || [], datos.needsConfirmation)
    await actualizarPanel(casoDeHerramientas(datos.toolCalls || []) ?? casoActual)
  } catch {
    pintarAgente("⚠️ No hay conexión con el servidor. Si es el primer mensaje del día, puede estar despertando: espera un minuto y reintenta.", [], false, { esError: true })
  } finally {
    ocupado(false)
    campo.focus()
  }
}

/** Al recargar la página se recupera el historial de la sesión (si el servidor lo conserva). */
async function restaurarHistorial() {
  if (!sesionConMensajes()) return
  try {
    const r = await fetch(`/api/sessions/${sessionId}`)
    if (!r.ok) return
    const { historial } = await r.json()
    historial.forEach((h, i) => {
      if (h.rol === "usuario") pintarUsuario(h.texto)
      else pintarAgente(h.texto, h.toolCalls, h.needsConfirmation, { activo: i === historial.length - 1 })
    })
    cantidadMensajes = historial.filter((h) => h.rol === "usuario").length
    actualizarInsignia()
    await actualizarPanel(casoDeHerramientas(historial.flatMap((h) => h.toolCalls)))
  } catch { /* sin historial: se empieza de cero */ }
}

async function mostrarModelo() {
  try {
    const datos = await (await fetch("/api/health")).json()
    modeloEnUso = `${datos.provider} · ${datos.model}`
  } catch {
    modeloEnUso = "sin conexión"
  }
  actualizarInsignia()
}

// ---------- Eventos ----------

formulario.addEventListener("submit", (e) => {
  e.preventDefault()
  const texto = campo.value.trim()
  if (!texto) return
  campo.value = ""
  enviarMensaje(texto)
})

campo.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    formulario.requestSubmit()
  }
})

// Botón de ejemplo y botones de confirmación: mandan su texto como mensaje de la usuaria.
chat.addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-texto]")
  if (boton && !boton.disabled) enviarMensaje(boton.dataset.texto)
})

document.getElementById("nueva").addEventListener("click", () => {
  guardarAlmacen("sessionId", crypto.randomUUID())
  guardarAlmacen("conMensajes", "no")
  location.reload()
})

// En pantallas chicas el panel empieza plegado para dejar lugar al chat.
document.getElementById("panel-detalles").open = window.innerWidth > 900

mostrarModelo()
restaurarHistorial()
