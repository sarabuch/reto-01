# Registro de uso de IA

Base para la sección 9 de `SOLUCION.md`: qué propuso la IA y qué decidió Sara María.

| Fecha | Propuesta de la IA (Claude Code) | Decisión de Sara María |
|---|---|---|
| 2026-10-19 | Plan en 7 bloques, siguiendo el orden de `CLAUDE.md`. | Aprobado. |
| 2026-10-19 | Usar la fecha real para calcular vencimientos, con una variable opcional `FECHA_EJECUCION` para la demo. | Aprobado. |
| 2026-10-19 | Mapeo exacto por glosario (ignorando tildes y mayúsculas), sin coincidencias "parecidas". Lo que no está en el glosario es faltante. | Aprobado. |
| 2026-10-19 | Copiar los valores del maestro tal cual (`CO`, `98000000000`), con la moneda como nota aparte. | Aprobado. |
| 2026-10-19 | Escribir el log en `out/log.jsonl` (CA4) y en `out/<caso>/log.jsonl` (RN5). | Aprobado. |
| 2026-10-19 | Copiar los soportes vencidos al paquete, marcados como vencidos en la checklist. | Aprobado. |
| 2026-10-19 | Orden de prioridad: P0, después P1 y P2, y el bonus `modulo/` solo si sobra tiempo. | Aprobado. |
| 2026-10-19 | Renombrar `docs/PRD.md.md` a `docs/PRD.md`. | Sin respuesta todavía. No se tocó; el `.gitignore` cubre los dos nombres. |
| 2026-10-19 | — | Sara María indicó el repositorio remoto: github.com/sarabuch/reto-01. |
| 2026-10-19 | `proveedor_generar_formulario` recalcula los valores desde el maestro y descarta los que mande el modelo (CA2). | Pendiente de revisión. |
| 2026-10-19 | Si la plantilla está dañada, `armar_paquete` revisa igual los soportes y bloquea la firma (HU-5). | Pendiente de revisión. |
| 2026-10-19 | Permitir el envío simulado aunque el paquete no esté listo, con un aviso de bloqueos en `ENVIO-SIMULADO.md` (el PRD lo pide para `ec-corp-andina`, que no queda listo). | Pendiente de revisión. |
| 2026-10-19 | Agregar una "nota interna" al inicio del borrador de correo cuando el paquete no está listo. | Pendiente de revisión. |
