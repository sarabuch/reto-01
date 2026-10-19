// Herramientas del agente "Registro como Proveedor" (PRD 6.2).
// El nombre que ve el modelo es proveedor_<export>, por ejemplo proveedor_leer_solicitud.
// Son la ÚNICA fuente de valores que el agente puede afirmar (CA2). Ninguna lanza excepciones (HU-5).
import { z } from "zod"
import { cargarRepositorio, cargarSolicitud, leerSoportesExigidos, mapearPlantilla } from "../negocio/caso"
import { etiquetasDePlantilla, leerIndiceSoportes, leerPlantilla } from "../negocio/datos"
import { simularEnvio } from "../negocio/envio"
import { fechaDeEjecucion } from "../negocio/fecha"
import { archivoDeFormulario, generarFormulario } from "../negocio/formulario"
import { ID_TRIBUTARIO_POR_PAIS, mapearCampos, valorDeCampo } from "../negocio/mapeo"
import { archivosDeSoportes, armarPaquete as armar, evaluarSoportes, type FormularioDelPaquete } from "../negocio/paquete"
import { ejecutarSeguro, exito, fallo, type Contexto, type Herramienta } from "./contrato"

/** Ayuda a TypeScript a inferir los tipos de los argumentos de cada herramienta. */
function definir<Forma extends z.ZodRawShape>(h: Herramienta<Forma>): Herramienta<Forma> {
  return h
}

const argCaso = z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/, por ejemplo ec-corp-andina")

// ---------- HU-1 ----------

export const leer_solicitud = definir({
  description:
    "Lee la solicitud del cliente y su plantilla: devuelve país, cliente, formato de salida, campos pedidos, soportes exigidos y campos que requieren confirmación.",
  args: { caso: argCaso },
  async execute(args: { caso: string }, ctx: Contexto) {
    return ejecutarSeguro("proveedor_leer_solicitud", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso)
      if (!solicitud.ok) return solicitud
      const s = solicitud.data
      const plantilla = await leerPlantilla(ctx.directory, s.id, s.formato)
      if (!plantilla.ok) return plantilla
      const soportes = await leerSoportesExigidos(ctx.directory, s.id)
      if (!soportes.ok) return soportes
      const repo = await cargarRepositorio(ctx.directory)
      if (!repo.ok) return repo
      const campos = etiquetasDePlantilla(plantilla.data)
      // HU-1: los campos ambiguos o de identificador tributario se avisan desde la lectura.
      const aConfirmar = mapearCampos(campos, s.pais, repo.data.maestro, repo.data.glosario).requiere_confirmacion
      return exito({
        pais: s.pais,
        cliente: s.cliente,
        formato: s.formato,
        campos,
        soportes: soportes.data,
        asunto: s.asunto,
        remitente: s.de,
        identificador_tributario_del_pais: ID_TRIBUTARIO_POR_PAIS[s.pais] ?? null,
        requiere_confirmacion: aConfirmar.map((c) => ({ campo: c.campo, motivo: c.motivo, propuesta: c.propuesta })),
      })
    }, (d) => `${d.cliente} (${d.pais}), formato ${d.formato}, ${d.campos.length} campos, ${d.soportes.length} soportes`)
  },
})

// ---------- HU-2 ----------

export const mapear_campos = definir({
  description:
    "Cruza los campos pedidos con el repositorio maestro y clasifica cada uno como lleno (con ruta y valor), faltante o requiere_confirmacion.",
  args: {
    caso: argCaso,
    campos: z.array(z.string()).describe("Etiquetas de los campos tal como aparecen en la plantilla (las devuelve proveedor_leer_solicitud)"),
  },
  async execute(args: { caso: string; campos: string[] }, ctx: Contexto) {
    return ejecutarSeguro("proveedor_mapear_campos", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso)
      if (!solicitud.ok) return solicitud
      const repo = await cargarRepositorio(ctx.directory)
      if (!repo.ok) return repo
      return exito(mapearCampos(args.campos, solicitud.data.pais, repo.data.maestro, repo.data.glosario))
    }, (m) => `${m.llenos.length} llenos, ${m.faltantes.length} faltantes, ${m.requiere_confirmacion.length} a confirmar`)
  },
})

// ---------- HU-3 ----------

const esquemaCampoMapeado = z.object({
  campo: z.string().describe("Etiqueta del campo"),
  valor: z.string().optional().describe("Valor que devolvió proveedor_mapear_campos"),
})

export const generar_formulario = definir({
  description:
    "Genera el formulario lleno en el formato del cliente (Excel o PDF) en out/<caso>/; si es portal web, genera valores-portal.md para copiar a mano.",
  args: {
    caso: argCaso,
    mapeo: z
      .object({
        llenos: z.array(esquemaCampoMapeado).describe("Campos llenos devueltos por proveedor_mapear_campos"),
        faltantes: z.array(esquemaCampoMapeado).describe("Campos faltantes"),
        requiere_confirmacion: z.array(esquemaCampoMapeado).describe("Campos que requieren confirmación"),
      })
      .describe("Resultado de proveedor_mapear_campos"),
  },
  async execute(args: { caso: string; mapeo: { llenos: { campo: string; valor?: string }[]; requiere_confirmacion: { campo: string; valor?: string }[] } }, ctx: Contexto) {
    return ejecutarSeguro("proveedor_generar_formulario", args.caso, ctx, async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso)
      if (!solicitud.ok) return solicitud
      const repo = await cargarRepositorio(ctx.directory)
      if (!repo.ok) return repo
      // CA2: los valores se recalculan desde el maestro; lo que mande el modelo solo se compara.
      const calculado = await mapearPlantilla(ctx.directory, solicitud.data, repo.data)
      if (!calculado.ok) return calculado
      const { plantilla, mapeo } = calculado.data
      const discrepancias = [...args.mapeo.llenos, ...args.mapeo.requiere_confirmacion]
        .filter((c) => c.valor !== undefined && c.valor !== valorDeCampo(mapeo, c.campo)?.valor)
        .map((c) => `${c.campo}: se ignoró el valor recibido y se usó el del maestro`)
      const generado = await generarFormulario(ctx.directory, solicitud.data, plantilla, mapeo)
      return exito({ ...generado, discrepancias })
    }, (d) => `${d.ruta}${d.soportado ? "" : " (formato no soportado)"}`)
  },
})

// ---------- HU-4 ----------

export const armar_paquete = definir({
  description:
    "Arma out/<caso>/paquete/ con el formulario, los soportes exigidos, checklist.md y borrador-correo.md, y dice si está listo para firma.",
  args: { caso: argCaso },
  async execute(args: { caso: string }, ctx: Contexto) {
    return ejecutarSeguro("proveedor_armar_paquete", args.caso, ctx, async () => {
      const raiz = ctx.directory
      const solicitud = await cargarSolicitud(raiz, args.caso)
      if (!solicitud.ok) return solicitud
      const s = solicitud.data
      const repo = await cargarRepositorio(raiz)
      if (!repo.ok) return repo
      const exigidos = await leerSoportesExigidos(raiz, s.id)
      if (!exigidos.ok) return exigidos
      const indice = await leerIndiceSoportes(raiz)
      if (!indice.ok) return indice

      // HU-5: si la plantilla está dañada, se sigue con los soportes y queda bloqueado.
      const calculado = await mapearPlantilla(raiz, s, repo.data)
      let form: FormularioDelPaquete = { error: calculado.ok ? "" : calculado.error }
      if (calculado.ok) {
        await generarFormulario(raiz, s, calculado.data.plantilla, calculado.data.mapeo)
        form = { archivo: archivoDeFormulario(s.formato) }
      }
      const mapeo = calculado.ok ? calculado.data.mapeo : { llenos: [], faltantes: [], requiere_confirmacion: [] }
      const fecha = fechaDeEjecucion()
      const soportes = evaluarSoportes(exigidos.data, indice.data, await archivosDeSoportes(raiz), fecha)
      return exito(await armar(raiz, s, mapeo, repo.data.maestro, form, soportes, fecha))
    }, (p) => `${p.ruta}: ${p.listo_para_firma ? "listo para firma" : `NO listo (${p.checklist.bloqueos.length} bloqueos)`}`)
  },
})

export const simular_envio = definir({
  description:
    "Simula el envío del paquete escribiendo out/<caso>/ENVIO-SIMULADO.md; solo usar con confirmado=true si la usuaria lo confirmó explícitamente en su último mensaje.",
  args: {
    caso: argCaso,
    confirmado: z.boolean().describe("true solo si la usuaria confirmó el envío de forma explícita en su último mensaje"),
  },
  async execute(args: { caso: string; confirmado: boolean }, ctx: Contexto) {
    return ejecutarSeguro("proveedor_simular_envio", args.caso, ctx, async () => {
      // RN4: sin confirmación no se toca nada, ni siquiera se lee el caso.
      if (!args.confirmado) return fallo("requiere confirmación explícita")
      const solicitud = await cargarSolicitud(ctx.directory, args.caso)
      if (!solicitud.ok) return solicitud
      return simularEnvio(ctx.directory, solicitud.data, true)
    }, (d) => d.ruta)
  },
})
