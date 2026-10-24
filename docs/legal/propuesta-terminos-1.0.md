# Propuesta para la versión 1.0 de los documentos legales

Para revisión de la asesoría legal. Los textos vigentes (versión 0.9.2, en borrador) se leen en el panel → Legal, o en la web en `/terminos`, `/privacidad` y `/autorizacion-fotos`.

Cuando la asesoría apruebe los textos, se publican desde el panel → Legal como versión 1.0, sin marcar "borrador". La app pide a cada cliente aceptarlos una vez.

## 1. Cambios de redacción propuestos

### Términos y condiciones, punto 1 ("Quiénes somos")

**Texto vigente:**
> ALTOQUE PERU WK S.A.C., con RUC 20611531410 y domicilio en Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403, Lince, Lima, Perú, en adelante "AlToque", ofrece un servicio para convertir en dinero en tu cuenta bancaria el saldo disponible de tu tarjeta de crédito, a cambio de una comisión.

**Propuesta:**
> ALTOQUE PERU WK S.A.C., con RUC 20611531410 y domicilio en Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403, Lince, Lima, Perú, en adelante "AlToque", ofrece un servicio de gestión de operaciones con tarjeta de crédito: el cliente realiza una operación con su tarjeta siguiendo las indicaciones de la app y AlToque le deposita el monto en su cuenta de ahorros, descontando la comisión que se le muestra antes de cada solicitud. AlToque no otorga préstamos ni cobra intereses.

El sentido es el mismo; la redacción es más sobria y deja explícito que no es un préstamo. Corresponde a la asesoría confirmar que esta descripción es exacta y suficiente frente a la protección al consumidor.

### Términos y condiciones: nuevo punto sobre las marcas

> **Marcas de terceros.** AlToque no está afiliado ni es patrocinado por BCP, BBVA, Interbank, Scotiabank, BanBif, CMR, Visa, Mastercard, American Express ni ningún otro banco, emisor o marca de tarjeta. Sus nombres se usan solo para identificar la tarjeta o la cuenta del cliente.

### Términos y condiciones, punto 7 ("Reclamos")

Reemplazar "[Libro de Reclamaciones virtual: pendiente.]" por:
> También puedes registrar un reclamo o una queja en nuestro Libro de Reclamaciones virtual, desde la app (menú → Libro de Reclamaciones) o en la web. Te responderemos en un plazo máximo de 15 días hábiles.

## 2. Datos pendientes que completa la asesoría

- **Términos:** alcance y límites de responsabilidad.
- **Privacidad:** plazos de conservación por tipo de dato, considerando las obligaciones de prevención del lavado de activos.
- **Privacidad:** nombre y código de inscripción del banco de datos personales ante la Autoridad Nacional de Protección de Datos Personales.
- **Autorización de fotos:** plazo de conservación de las fotos de identidad.

## 3. Plazos que la asesoría debe confirmar

| Plazo | Valor configurado hoy | Dónde está |
|---|---|---|
| Respuesta a un reclamo o queja | 15 días hábiles | Base de datos, migración 56 |
| Respuesta a un pedido de eliminación de cuenta | 10 días hábiles | Base de datos, migración 54 |

Ambos plazos se cuentan sin descontar feriados.

## 4. Consultas sobre el modelo de negocio

- Si las reglas de Visa, Mastercard y American Express, y el contrato con el procesador de pagos, permiten este tipo de operación.
- Si la empresa es sujeto obligado ante la UIF-Perú (prevención del lavado de activos) y qué registros debe conservar.
