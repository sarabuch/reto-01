// Fecha de ejecución con la que se decide si un soporte está vencido (HU-4).
// Por defecto es la fecha de hoy en Colombia. FECHA_EJECUCION (AAAA-MM-DD) permite fijarla para pruebas o la demo.

const ZONA_HORARIA = "America/Bogota"

function esFechaValida(texto: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(Date.parse(texto))
}

/** Devuelve la fecha como texto AAAA-MM-DD (así se puede comparar directo con vigencia_hasta). */
export function fechaDeEjecucion(): string {
  const fijada = process.env.FECHA_EJECUCION?.trim()
  if (fijada && esFechaValida(fijada)) return fijada
  // "en-CA" formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date())
}
