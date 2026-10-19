# Módulo reutilizable: agente "Registro como Proveedor"

El mismo agente de la aplicación, empaquetado para integrarse a otras plataformas de agentes, sin depender del servidor (bonus, PRD 9.4).

| Pieza | Qué es | Se genera desde |
|---|---|---|
| `agent.md` | Frontmatter (`description`, `mode: primary`, `permission: { edit: deny, bash: deny }`) + el system prompt | `agent/prompt.md` |
| `tools/proveedor.ts` | Las 5 herramientas en un solo archivo: `leer_solicitud`, `mapear_campos`, `generar_formulario`, `armar_paquete`, `simular_envio`. Cada una es `{ description, args (zod), execute(args, ctx) }`; el modelo las ve como `proveedor_<export>` | `src/tools/proveedor.ts` y `src/negocio/` |
| `skill/registro-proveedor/SKILL.md` | Frontmatter (`name`, `description`) + el conocimiento del proceso | `src/knowledge/registro-proveedor.md` |

**No son copias divergentes.** Estos archivos se generan con `bun run modulo` a partir de las fuentes que usa la aplicación, y la prueba `tests/modulo.test.ts` falla si alguno se desfasa. La misma prueba comprueba que las herramientas del módulo dan exactamente el mismo resultado que las de la app.

## Cómo integrarlo

- Requiere las dependencias `zod`, `exceljs` y `pdf-lib`.
- `ctx.directory` debe apuntar a la raíz de un proyecto que contenga `fixtures/reto-01/`. Las herramientas leen solo de ahí y escriben solo en `out/`.
- Las herramientas no validan los argumentos por su cuenta: la plataforma debe validarlos con los esquemas `zod` de `args` antes de llamar a `execute`, como hace la aplicación.
- La confirmación del envío depende del prompt (`agent.md`) y de que `simular_envio` exige `confirmado: true`. El bloqueo adicional del servidor (envío sin pregunta en el turno anterior) vive en el ciclo de la aplicación y no viaja en el módulo: la plataforma que lo integre debería aplicar un control equivalente.
