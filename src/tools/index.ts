// Registro de herramientas con el nombre que ve el modelo: <archivo>_<export> (PRD 6.2).
import type { z } from "zod"
import type { Herramienta } from "./contrato"
import * as proveedor from "./proveedor"

export const herramientas: Record<string, Herramienta<z.ZodRawShape>> = {
  proveedor_leer_solicitud: proveedor.leer_solicitud,
  proveedor_mapear_campos: proveedor.mapear_campos,
  proveedor_generar_formulario: proveedor.generar_formulario,
  proveedor_armar_paquete: proveedor.armar_paquete,
  proveedor_simular_envio: proveedor.simular_envio,
}
