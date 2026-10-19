# Verificación por bloque

Lista acumulada de criterios del PRD revisados al cerrar cada bloque. Es la base de la tabla de cobertura de `SOLUCION.md`.

## Bloque 2: herramientas y `demo.ts` (2026-10-19)

| Criterio | Estado | Prueba |
|---|---|---|
| HU-1: lee país, cliente, formato, campos y soportes | Cumple | `bun run demo.ts` (los 4 casos) |
| HU-1: campo ambiguo → `requiere_confirmacion` con el equivalente del país | Cumple | test "etiqueta ambigua en Colombia" |
| HU-2: cada campo termina en lleno / faltante / requiere_confirmacion, con ruta | Cumple | demo + tests de mapeo |
| HU-2: nunca inventa; sin fuente = faltante | Cumple | test "campo sin fuente"; demo: "Número de contribuyente especial" y "Referencias comerciales" |
| HU-2: sinónimos del glosario automáticos | Cumple | test "tildes y mayúsculas" |
| HU-3 P0: Excel con etiqueta y valor en la hoja y celda exactas | Cumple | Excel leído de vuelta (`hn` y `co`) |
| HU-3 P1: PDF con todos los campos en orden | Cumple | PDF de `ec-corp-andina` abierto y revisado |
| HU-3 P2: portal → "formato no soportado" + `valores-portal.md` | Cumple | demo `pa-logistica-istmo` |
| HU-4: paquete con formulario, soportes, checklist y borrador | Cumple | `out/ec-corp-andina/paquete/` |
| HU-4 / RN3: vencido o ausente bloquea; faltante no | Cumple | tests RN3 (incluye `co-industrias-delta` listo con fecha 2026-09-03) |
| HU-4: resumen y pregunta de confirmación en el chat | Pendiente | Bloque 3 (agente) |
| HU-5: caso inexistente, argumentos inválidos y plantilla corrupta → error claro, sigue con lo posible | Cumple | demo "Manejo de errores" + test "plantilla corrupta" |
| HU-5: ninguna herramienta lanza excepción | Cumple | `ejecutarSeguro` en `contrato.ts` + tests |
| RN1: identificador extranjero → NIT + `requiere_confirmacion` | Cumple | test RN1; demo (ec, hn, pa) |
| RN2: datos bancarios solo si se piden; nunca en el borrador | Cumple | test "borrador sin datos bancarios" |
| RN4: envío solo con confirmación | Parcial | la herramienta exige `confirmado=true` (test); el control del "turno anterior" va en el Bloque 3 |
| RN5: `out/<caso>/log.jsonl` con `{ ts, herramienta, ok, resumen }` | Cumple | `out/ec-corp-andina/log.jsonl` |
| PRD 6.2: zod con `.describe()`, devuelve string JSON | Cumple | `src/tools/proveedor.ts`; test "argumentos inválidos" |
| PRD 6.6: `demo.ts` corre sin clave | Cumple | `bun run demo.ts` |
| PRD 8: determinismo; `out/` se limpia al inicio | Cumple | dos ejecuciones con salida idéntica |
| PRD 8: las herramientas no ejecutan comandos de shell | Cumple | revisión del código |
