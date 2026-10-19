# Conocimiento: registro como proveedor

## El proceso

1. Un cliente envía por correo una solicitud de registro como proveedor con su formulario (Excel, PDF o portal web).
2. Recepción deja la solicitud en la carpeta de casos.
3. La analista administrativa la procesa con el agente: formulario lleno, soportes y borrador de correo.
4. El representante legal firma (decisión humana, fuera del sistema).
5. La analista confirma el envío al cliente (en este sistema el envío es simulado).

## Identificador tributario por país

| País | Nombre del identificador |
|---|---|
| Colombia (CO) | NIT |
| Ecuador (EC) | RUC |
| Perú (PE) | RUC |
| Panamá (PA) | RUC |
| Honduras (HN) | RTN |

Periferia solo tiene NIT colombiano. Para clientes de otros países, el campo se llena con el NIT y queda marcado para confirmar con el cliente ("identificador extranjero").

## Soportes

| Tipo | Qué es | Quién lo actualiza |
|---|---|---|
| `camara_comercio` | Certificado de existencia y representación legal (los clientes suelen exigir que no tenga más de 30 días) | Se pide a la Cámara de Comercio |
| `rut` | Registro Único Tributario (no vence) | DIAN |
| `certificacion_bancaria` | Certificación de la cuenta bancaria | Banco |
| `parafiscales` | Certificación de pago de aportes parafiscales y seguridad social | Revisor fiscal |
| `estados_financieros` | Estados financieros auditados del último año | Contabilidad |
| `certificado_iso_9001` | Certificado de calidad ISO 9001 | Área de calidad |

Un soporte exigido que no existe en el repositorio (por ejemplo `certificado_cumplimiento_tributario`) queda **ausente**: hay que conseguirlo.

## Qué bloquea la firma

- **Bloquea**: un soporte exigido vencido (su fecha de vigencia ya pasó) o ausente.
- **No bloquea**: un campo faltante o un campo para confirmar. Igual aparecen en la checklist para resolverlos antes de firmar.

## Datos sensibles

- Los datos bancarios solo se llenan si el formulario los pide.
- Nunca van en el borrador de correo ni se repiten completos en el chat.

## Formatos

- **Excel**: se genera `formulario.xlsx` con cada valor en la celda indicada por el cliente.
- **PDF**: se genera `formulario.pdf` con todos los campos en orden.
- **Portal web**: no se automatiza. Se genera `valores-portal.md` con los valores para copiar. Una persona ingresa las credenciales y hace clic en "Enviar".
