// Servidor HTTP (PRD 6.4). Expone la API del chat y sirve el front de web/.
// No contiene reglas de negocio: esas viven en src/tools, src/negocio y agent/prompt.md.
import { join, normalize, sep } from "node:path"
import { z } from "zod"
import { ejecutarTurno, type Dependencias } from "./agent/ciclo"
import { cargarSystemPrompt } from "./agent/prompt"
import { AlmacenSesiones } from "./agent/sesiones"
import { config } from "./config"
import { crearProveedor } from "./llm"
import { estadoDelCaso } from "./negocio/estado"
import { mensajeDeError } from "./tools/contrato"

const RAIZ = join(import.meta.dir, "..")
const CARPETA_WEB = join(RAIZ, "web")

const proveedor = crearProveedor()
const sesiones = new AlmacenSesiones(config.maxSesiones)
const deps: Dependencias = {
  proveedor,
  sistema: await cargarSystemPrompt(RAIZ),
  ctx: { directory: RAIZ, sessionId: "" },
  maxIteraciones: config.maxIteraciones,
  maxTokensSesion: config.maxTokensSesion,
}

const esquemaChat = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "sessionId inválido"),
  message: z.string().trim().min(1, "El mensaje está vacío").max(4000, "El mensaje es demasiado largo"),
})

/** PRD 8 (costo): tokens gastados hoy por todo el servidor. Se reinicia al cambiar el día (UTC). */
const consumoDiario = { dia: "", tokens: 0 }
function tokensDeHoy(): number {
  const hoy = new Date().toISOString().slice(0, 10)
  if (consumoDiario.dia !== hoy) {
    consumoDiario.dia = hoy
    consumoDiario.tokens = 0
  }
  return consumoDiario.tokens
}

function json(datos: unknown, status = 200): Response {
  return Response.json(datos, { status })
}

/** POST /api/chat → { reply, toolCalls, needsConfirmation } */
async function manejarChat(req: Request): Promise<Response> {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: "El cuerpo debe ser JSON" }, 400)
  }
  const pedido = esquemaChat.safeParse(cuerpo)
  if (!pedido.success) return json({ error: pedido.error.issues.map((i) => i.message).join("; ") }, 400)

  if (tokensDeHoy() >= config.maxTokensDia) {
    return json({ reply: "⚠️ Esta demo alcanzó su tope diario de uso del modelo. Vuelve a intentar mañana.", toolCalls: [], needsConfirmation: false })
  }
  const sesion = sesiones.obtenerOCrear(pedido.data.sessionId)
  if (sesion.ocupada) return json({ error: "Todavía estoy respondiendo el mensaje anterior." }, 409)
  sesion.ocupada = true
  sesion.ultimoUso = Date.now()
  const tokensAntes = sesion.tokensUsados
  try {
    const respuesta = await ejecutarTurno(sesion, pedido.data.message, { ...deps, ctx: { directory: RAIZ, sessionId: sesion.id } })
    consumoDiario.tokens += sesion.tokensUsados - tokensAntes
    return json(respuesta)
  } catch (e) {
    // Red de seguridad: nunca debería pasar, pero la sesión no muere (CA5).
    console.error("Error inesperado en el turno:", mensajeDeError(e))
    return json({ reply: "⚠️ Ocurrió un error inesperado. Intenta de nuevo.", toolCalls: [], needsConfirmation: false })
  } finally {
    sesion.ocupada = false
  }
}

/** GET /api/sessions/:id → historial visible completo */
function manejarSesion(id: string): Response {
  const sesion = sesiones.obtener(id)
  return sesion
    ? json({ sessionId: id, tokensUsados: sesion.tokensUsados, historial: sesion.historial })
    : json({ error: "Sesión no encontrada" }, 404)
}

/** GET /api/casos/:caso/estado → archivos generados y checklist, para el panel lateral del chat. */
async function manejarEstadoCaso(caso: string): Promise<Response> {
  const r = await estadoDelCaso(RAIZ, caso)
  return r.ok ? json(r.data) : json({ error: r.error }, 400)
}

/** Sirve archivos de web/ sin permitir salir de esa carpeta. */
async function servirEstatico(ruta: string): Promise<Response> {
  const relativa = ruta === "/" ? "index.html" : ruta.slice(1)
  const destino = normalize(join(CARPETA_WEB, relativa))
  if (!destino.startsWith(CARPETA_WEB + sep)) return new Response("No encontrado", { status: 404 })
  const archivo = Bun.file(destino)
  return (await archivo.exists()) ? new Response(archivo) : new Response("No encontrado", { status: 404 })
}

const servidor = Bun.serve({
  port: config.puerto,
  idleTimeout: 255, // segundos: un turno con varias herramientas puede tardar
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/api/health" && req.method === "GET") {
      return json({ ok: true, provider: proveedor.nombre, model: proveedor.modelo }) // sin claves
    }
    if (url.pathname === "/api/chat" && req.method === "POST") return manejarChat(req)
    const sesion = url.pathname.match(/^\/api\/sessions\/([A-Za-z0-9-]+)$/)
    if (sesion?.[1] && req.method === "GET") return manejarSesion(sesion[1])
    const caso = url.pathname.match(/^\/api\/casos\/([a-z0-9-]+)\/estado$/)
    if (caso?.[1] && req.method === "GET") return manejarEstadoCaso(caso[1])
    if (url.pathname.startsWith("/api/")) return json({ error: "Ruta no encontrada" }, 404)
    return servirEstatico(url.pathname)
  },
})

console.log(`Servidor listo en http://localhost:${servidor.port} · ${proveedor.nombre} / ${proveedor.modelo}`)
