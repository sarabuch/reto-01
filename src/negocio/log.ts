// Registro de cada ejecución de herramienta (RN5 y CA4).
// Escribe una línea JSON en out/log.jsonl (global) y en out/<caso>/log.jsonl.
import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { esNombreDeCasoValido } from "./rutas"

type EntradaLog = { herramienta: string; ok: boolean; resumen: string }

/** Agrega una entrada { ts, herramienta, ok, resumen }. Nunca lanza: el log no debe romper la herramienta. */
export async function registrarEnLog(raiz: string, caso: string, entrada: EntradaLog): Promise<void> {
  const linea = JSON.stringify({ ts: new Date().toISOString(), caso, ...entrada }) + "\n"
  const carpetaOut = join(raiz, "out")
  try {
    await mkdir(carpetaOut, { recursive: true })
    await appendFile(join(carpetaOut, "log.jsonl"), linea)
    // Solo se crea la carpeta del caso si el nombre es seguro (evita escribir fuera de out/).
    if (esNombreDeCasoValido(caso)) {
      await mkdir(join(carpetaOut, caso), { recursive: true })
      await appendFile(join(carpetaOut, caso, "log.jsonl"), linea)
    }
  } catch {
    // Si el disco falla, se pierde la línea de log pero la herramienta sigue funcionando.
  }
}
