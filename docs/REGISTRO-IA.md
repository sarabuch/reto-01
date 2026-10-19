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
| 2026-10-19 | Renombrar `docs/PRD.md.md` a `docs/PRD.md`. | Aprobado: se renombró. |
| 2026-10-19 | — | Sara María indicó el repositorio remoto: github.com/sarabuch/reto-01. |
| 2026-10-19 | `proveedor_generar_formulario` recalcula los valores desde el maestro y descarta los que mande el modelo (CA2). | Aprobado. |
| 2026-10-19 | Si la plantilla está dañada, `armar_paquete` revisa igual los soportes y bloquea la firma (HU-5). | Aprobado. |
| 2026-10-19 | Permitir el envío simulado aunque el paquete no esté listo, con un aviso de bloqueos en `ENVIO-SIMULADO.md` (el PRD lo pide para `ec-corp-andina`, que no queda listo). | Aprobado. |
| 2026-10-19 | Agregar una "nota interna" al inicio del borrador de correo cuando el paquete no está listo. | Aprobado. |
| 2026-10-19 | Separar el comportamiento (`agent/prompt.md`) del conocimiento (`src/knowledge/`), con la columna "Quién lo actualiza" agregada por la IA. | Aprobado tal cual. |
| 2026-10-19 | Modelo principal `gemini-3.5-flash-lite` y respaldo automático `gemini-3.8-flash`. Se cambió la idea inicial (3.8 como principal) porque en la prueba real 3.8 devolvió 503 (saturado) tres veces seguidas. | Aprobado. |
| 2026-10-19 | Doble control del envío: además del prompt, el servidor bloquea `simular_envio` si el turno anterior no fue la pregunta de confirmación. En la prueba real el modelo intentó enviar sin preguntar y el bloqueo actuó. | Aprobado (Sara María lo había aprobado como parte del borrador del prompt). |
| 2026-10-19 | En el panel del chat, el `mapeo` se muestra como cantidades, no como valores, para no exhibir datos bancarios. | Aprobado. |
| 2026-10-19 | `ENVIO-SIMULADO.md` no lista `checklist.md` ni `borrador-correo.md` como adjuntos (son internos). | Aprobado. |
| 2026-10-19 | No ejecutar los scripts de instalación de dependencias que Bun bloqueó (no hacen falta). | Aprobado. |
| 2026-10-19 | Front en HTML, CSS y JavaScript planos, sin frameworks, servido por el mismo servidor Bun (un solo comando y un solo servicio en Render). | Aprobado en el plan ("lo más simple que cumpla el PRD"). |
| 2026-10-19 | Botón de ejemplo con el prompt de la sección 11 y la lista de casos disponibles en la bienvenida. | Pendiente de revisión. |
| 2026-10-19 | Guardar el id de sesión en el navegador (sessionStorage) para recuperar el historial al recargar. | Pendiente de revisión. |
| 2026-10-19 | Mostrar las llamadas a herramientas como desplegables: el resumen siempre visible y los argumentos al hacer clic. | Pendiente de revisión. |
