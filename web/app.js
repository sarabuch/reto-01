// Lógica del chat (PRD 6.1, "Front de chat"): historial, indicador de "pensando",
// llamadas a herramientas visibles (CA4) y pedido de confirmación resaltado (CA3).
// HTML plano, sin frameworks. Todo texto del servidor se escapa antes de mostrarse.

const MARCA_CONFIRMACION = "❓ Confirmación requerida:"
const chat = document.getElementById("chat")
const formulario = document.getElementById("formulario")
const campo = document.getElementById("mensaje")
const botonEnviar = document.getElementById("enviar")
const pensando = document.getElementById("pensando")

// ---------- Sesión ----------

/** Lee o guarda el id de sesión. El almacenamiento del navegador puede fallar: entonces se usa uno nuevo. */
function leerSesionGuardada() {
  try { return sessionStorage.getItem("sessionId") } catch { return null }
}
function guardarSesion(id, conMensajes = false) {
  try {
    sessionStorage.setItem("sessionId", id)
    sessionStorage.setItem("conMensajes", conMensajes ? "si" : "no")
  } catch { /* sin almacenamiento: la sesión dura hasta recargar */ }
}
function sesionTieneMensajes() {
  try { return sessionStorage.getItem("conMensajes") === "si" } catch { return false }
}
function nuevaSesionId() {
  return crypto.randomUUID()
}
let sessionId = leerSesionGuardada() || nuevaSesionId()
guardarSesion(sessionId, sesionTieneMensajes())

// ---------- Formato del texto ----------

/** Evita que un texto se interprete como HTML (seguridad). */
function escapar(texto) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

/** Markdown mínimo: **negrita**, *cursiva*, `código` y listas. Se aplica sobre texto ya escapado. */
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

// ---------- Pintar mensajes ----------

function bajarAlFinal() {
  chat.scrollTop = chat.scrollHeight
}

function pintarUsuario(texto) {
  document.getElementById("bienvenida")?.remove()
  const div = document.createElement("div")
  div.className = "mensaje usuario"
  div.textContent = texto
  chat.append(div)
  bajarAlFinal()
}

/** Una llamada a herramienta: nombre, estado y resumen; al abrirla, muestra los argumentos. */
function pintarHerramienta(tool) {
  const d = document.createElement("details")
  d.className = "tool"
  const estado = tool.ok ? '<span class="estado-ok">✓</span>' : '<span class="estado-error">✗</span>'
  d.innerHTML =
    `<summary>${estado} <span class="nombre">${escapar(tool.nombre)}</span> — ${escapar(tool.resumen)}</summary>` +
    `<pre>Argumentos: ${escapar(JSON.stringify(tool.args, null, 2))}</pre>`
  return d
}

/** Respuesta del agente: herramientas usadas, texto y, si corresponde, la confirmación resaltada. */
function pintarAgente(texto, toolCalls, pideConfirmacion, esError = false) {
  const div = document.createElement("div")
  div.className = "mensaje agente" + (esError ? " error" : "")
  if (toolCalls.length) {
    const lista = document.createElement("div")
    lista.className = "herramientas"
    toolCalls.forEach((t) => lista.append(pintarHerramienta(t)))
    div.append(lista)
  }
  const corte = texto.indexOf(MARCA_CONFIRMACION)
  const cuerpo = document.createElement("div")
  cuerpo.innerHTML = markdown(pideConfirmacion && corte >= 0 ? texto.slice(0, corte) : texto)
  div.append(cuerpo)
  if (pideConfirmacion) {
    const caja = document.createElement("div")
    caja.className = "confirmacion"
    caja.innerHTML = formatoEnLinea(corte >= 0 ? texto.slice(corte) : "❓ El agente necesita tu confirmación para continuar.")
    div.append(caja)
  }
  chat.append(div)
  bajarAlFinal()
}

// ---------- Hablar con el servidor ----------

function ocupado(si) {
  pensando.hidden = !si
  botonEnviar.disabled = si
  campo.disabled = si
}

async function enviarMensaje(texto) {
  pintarUsuario(texto)
  ocupado(true)
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: texto }),
    })
    const datos = await r.json()
    guardarSesion(sessionId, true)
    if (!r.ok) pintarAgente(`⚠️ ${datos.error || "No se pudo procesar el mensaje."}`, [], false, true)
    else pintarAgente(datos.reply, datos.toolCalls || [], datos.needsConfirmation)
  } catch {
    pintarAgente("⚠️ No hay conexión con el servidor. Si es el primer mensaje del día, puede estar despertando: espera un minuto y reintenta.", [], false, true)
  } finally {
    ocupado(false)
    campo.focus()
  }
}

/** Al recargar la página se recupera el historial de la sesión (si el servidor lo conserva). */
async function restaurarHistorial() {
  if (!sesionTieneMensajes()) return
  try {
    const r = await fetch(`/api/sessions/${sessionId}`)
    if (!r.ok) return
    const { historial } = await r.json()
    for (const h of historial) {
      if (h.rol === "usuario") pintarUsuario(h.texto)
      else pintarAgente(h.texto, h.toolCalls, h.needsConfirmation)
    }
  } catch { /* sin historial: se empieza de cero */ }
}

async function mostrarModelo() {
  const etiqueta = document.getElementById("modelo")
  try {
    const r = await fetch("/api/health")
    const datos = await r.json()
    etiqueta.textContent = `${datos.provider} · ${datos.model}`
  } catch {
    etiqueta.textContent = "sin conexión"
  }
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

chat.addEventListener("click", (e) => {
  const boton = e.target.closest(".sugerencia")
  if (boton) enviarMensaje(boton.dataset.texto)
})

document.getElementById("nueva").addEventListener("click", () => {
  sessionId = nuevaSesionId()
  guardarSesion(sessionId)
  location.reload()
})

mostrarModelo()
restaurarHistorial()
