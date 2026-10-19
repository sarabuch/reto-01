// Rutas de lectura (fixtures/) y escritura (out/). Todas se resuelven desde la raíz del proyecto.
import { join } from "node:path"

const CARPETA_FIXTURES = join("fixtures", "reto-01")

/**
 * Un nombre de caso solo puede tener minúsculas, números y guiones.
 * Así nadie puede pedir "../../algo" y leer o escribir fuera de las carpetas permitidas.
 */
export function esNombreDeCasoValido(caso: string): boolean {
  return /^[a-z0-9-]+$/.test(caso)
}

export const rutas = {
  casos: (raiz: string) => join(raiz, CARPETA_FIXTURES, "casos"),
  caso: (raiz: string, caso: string) => join(raiz, CARPETA_FIXTURES, "casos", caso),
  maestro: (raiz: string) => join(raiz, CARPETA_FIXTURES, "repositorio", "maestro.json"),
  glosario: (raiz: string) => join(raiz, CARPETA_FIXTURES, "glosario-campos.json"),
  soportes: (raiz: string) => join(raiz, CARPETA_FIXTURES, "repositorio", "soportes"),
  salida: (raiz: string, caso: string) => join(raiz, "out", caso),
  paquete: (raiz: string, caso: string) => join(raiz, "out", caso, "paquete"),
}
