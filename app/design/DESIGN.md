# AlToque Perú WK — Especificación de diseño ("Cristal medido")

Este documento es la fuente de verdad del rediseño visual de la app cliente (Expo / React Native, expo-router).
**Es solo un cambio visual y de experiencia: no cambies lógica, reglas de negocio, llamadas al servidor ni datos.**

Referencias:
- Tokens: `src/theme/tokens.ts` — nunca escribas colores, tamaños o radios sueltos.
- Componentes base: `src/components/brand/*` y `src/components/ui/*`.
- Pantallas de referencia (HTML con los valores exactos): `reference/pantallas/*.html` y el prototipo completo `reference/Prototipo.dc.html`. Léelos para sacar medidas, colores y orden de elementos; no se ejecutan fuera del lienzo de Claude.

---

## 1. Principios

1. **Base clara y sólida.** Fondo porcelana `#F6F4EF`, tarjetas blancas. El azul noche `#0F1B33` solo en cabeceras con logo y en las tarjetas de crédito.
2. **Poco texto, formas que explican.** Etiquetas cortas; nada de párrafos explicativos. Las formas comunican (tarjeta vs. cuenta, lo que falta = hueco punteado).
3. **Dorado = dinero.** El dorado sólido `#E8B800` es exclusivo de la acción que mueve dinero ("Nueva solicitud", "Enviar solicitud", "Enviar comprobante") y de la moneda "S/". Todas las demás acciones son marino `#1B2A4A` o contorno.
4. **El estado nunca va solo en color.** Siempre ícono + texto + color.
5. **Alerta ≠ noticia.** Alerta = bloque de color sólido con ícono. Noticia = tarjeta blanca con imagen. Nunca se mezclan.
6. **Cristal medido.** El desenfoque solo en 4 lugares (§4).

## 2. Tipografía

- **Sora 600** para títulos de pantalla, saludo y cifras (contadores, porcentajes, código de verificación).
- **Manrope** para todo lo demás (400–800). Botones y etiquetas de sección en 800.
- Cifras siempre con `fontVariant: ['tabular-nums']`.
- Etiqueta de sección: 11 px, 800, mayúsculas, `letterSpacing` 1.7, color `text3`. Una por bloque, nada más.
- Sin cursivas.

## 3. Color

Ver `tokens.ts`. Claves:
- Texto `#1B2A4A` / secundario `#4F5B74` / pequeño `#626D82` (no usar más claro en texto útil).
- Estados de solicitud (`requestStatus`): En revisión (azul claro + reloj), Aprobado (crema + check), **Pago enviado (verde sólido + avión: único sólido)**, Rechazado (rosa + ✕).
- Colores de banco (`banks`): solo en sellos, tarjetas, íconos de cuenta y bloques de guía. Siempre con nombre o dígitos al lado. En BCP el texto encima va oscuro.

## 4. Cristal (expo-blur) — solo aquí

1. Tarjeta de "Nueva solicitud" montada sobre el borde de la cabecera del Inicio (`GlassPanel variant="light"`).
2. Hojas y menú lateral: detalle de solicitud, menú (`variant="sheet"`).
3. Barra de pestañas flotante y barras fijas inferiores de los flujos (`variant="light"`).
4. Botones, sello y avatar dentro de cabeceras azul noche (`variant="onNight"`).

Máximo 2 por pantalla. Todo lo demás son `View` sólidas. Las luces del fondo se hacen con `AmbientGlow` (gradiente radial), no con blur.

## 5. Componentes

| Componente | Uso |
|---|---|
| `Logo` | Isotipo ATK sobre azul noche (cabeceras, bienvenida, sobre la empresa). |
| `BankIcon` | Edificio = **cuenta bancaria**. Nunca usar otra metáfora para cuenta. |
| `BankBadge` | Sello cuadrado del banco en listas y selectores. |
| `StatusChip` | Estado de una **solicitud**. No usarlo para el estado de tarjetas. |
| `CardShape` | Forma de **tarjeta** (verificada / en verificación / rechazada, y mazo ×N). |
| `AccountShape` | Forma de **cuenta** (ok / falta, y mazo ×N). |
| `GlassPanel` | Cristal (§4). |
| `AmbientGlow` | Luces del fondo azul noche. |

Botones: alto 56–60, radio 18–20. Principal marino con texto blanco; dinero dorado con texto `#0F1B33`; secundario con borde marino 1.5; deshabilitado `#ECE8DF` con texto `#626D82` y el motivo escrito dentro ("Adjunta el comprobante para enviar").
Campos: alto 52–56, radio 14–16, borde `#E7E3DA`; foco = borde marino 2 + halo dorado; error = borde rojo + mensaje con ícono debajo.
Toque mínimo 44×44. Presionar = escala 0.97.

## 6. Pantallas

### Fuera de sesión
- **Bienvenida:** cabecera azul noche (≈70% de alto, esquinas inferiores 40) con luces, logo, "PERÚ WK" y lema "Tu aliado financiero." Pastilla de cristal: "Revisión humana | Datos cifrados". Abajo: "Crear cuenta" (dorado) y "Ingresar" (contorno).
- **Ingresar:** logo en sello azul noche, título "Hola de nuevo.", campos, error en una línea roja con ícono, botón marino, enlaces "¿Olvidaste tu contraseña?" y "Crear cuenta".
- **Crear cuenta (3 pasos):** barra de 3 segmentos arriba a la derecha. Paso 1: campos agrupados en 3 tarjetas (Identidad, Contacto, Seguridad); el código promocional se despliega al tocarlo. Paso 2: chip verde "Cuenta creada", sin botón atrás, 6 recuadros de código. Paso 3: 3 fotos con silueta propia (DNI frente, DNI reverso, selfie con DNI); se marcan con check.
- **Cuenta en revisión:** cabecera azul con línea de tiempo (creada ✓ → revisión humana (dorado pulsando) / observada (rojo !) → activa). Observada: motivo en cita + volver a subir las 3 fotos.
- **Recuperar contraseña:** correo + "Enviar enlace" → confirmación con ícono de sobre.

### Con sesión
- **Inicio** (orden exacto):
  1. Cabecera azul noche con luces: menú, logo, campana.
  2. **Alerta urgente** (roja) — encima del saludo.
  3. "Buenas tardes" + nombre (Sora). Sin sello "Verificada".
  4. Cristal: botón dorado "Nueva solicitud" + "Puedes operar con" y chips de banco (listo ✓ / "Falta cuenta").
  5. ÚLTIMA SOLICITUD: sello del banco, "Con tarjeta ···· 4821", hora, chip de estado y línea de avance con etapas escritas (Enviada · Revisión · Aprobada · Depósito). Al tocar abre el detalle (hoja).
  6. TUS SOLICITUDES: 4 contadores (Revisión, Por pagar, Pagadas, Rechazadas) + "Ver todas".
  7. GUÍAS: un bloque por banco pintado con su color, solo el nombre + flecha.
  8. TARJETAS Y CUENTAS: mini tarjeta + número, mini edificio + número.
- **Solicitudes:** agrupadas por día (HOY, AYER, fecha). Filas: sello, ···· dígitos, hora, chip. Sin imágenes.
- **Detalle (hoja de cristal):** línea de tiempo vertical con horas, "Depósito en", "Comisión", comprobante.
- **Tarjetas y cuentas:**
  - Leyenda de formas: tarjeta → edificio "Cuenta del mismo banco".
  - Una fila por banco: `CardShape` — línea — `AccountShape`. Línea dorada con moneda "S/" = listo; punteada dorada = falta cuenta; punteada gris = sin tarjeta.
  - Varias del mismo banco = mazo ×N; al tocar la fila se despliega la lista (tarjetas y cuentas).
  - Solo verificadas arriba. **En verificación y rechazadas van al final en "Otros estados"**: líneas simples sin tarjeta blanca (ícono mini + "Banco ···· 0000" + estado en color). La rechazada se despliega para ver el motivo y "Registrar de nuevo".
  - Botones "+ Tarjeta" (marino con mini tarjeta) y "+ Cuenta" (contorno con mini edificio).
- **Registrar tarjeta:** grilla de 7 bancos, últimos 4 + nombre, ilustración de qué tapar (número central y código de seguridad), fotos frente/reverso.
- **Agregar cuenta:** 5 bancos, selector Ahorros | CCI, número con contador (CCI = 20 dígitos), vista previa tarjeta → edificio.
- **Nueva solicitud** (pantalla propia, sin pestañas): "1 · ¿Con qué tarjeta?" (solo verificadas), "2 · Comprobante", "Nota · opcional". Si la tarjeta no tiene cuenta del mismo banco: bloqueo dentro de la misma tarjeta con "Agregar". Barra fija con el botón y el motivo si está deshabilitado. Alerta urgente activa → diálogo antes de enviar. Salir con comprobante cargado → hoja de confirmación.
- **Solicitud enviada:** pantalla azul noche, check dorado con anillo, chip "En revisión".
- **Noticias y alertas:** selector segmentado **Alertas | Noticias** (indicador que se desliza). Alertas: urgente roja con "Entendido" (luego queda en contorno), importante dorada, "Anteriores". Noticias: carrusel de imágenes con puntos, sobretítulo de tipo, vigencia "Quedan N días".
- **Mis avisos:** "Sin leer" (punto dorado) y "Leídos".
- **Mi cuenta:** tarjeta azul noche con avatar y "Verificada por [gestor] · fecha", datos, comisiones por banco en grilla (dorado = condición especial), cerrar sesión.
- **Sobre la empresa:** cabecera con logo, 3 garantías en cristal, 4 pasos, fórmula Monto − Comisión = Tu depósito, WhatsApp y correo.
- **Guía de banco:** cabecera con la luz del color del banco, pasos numerados, barra fija "Enviar comprobante".
- **Menú lateral:** cristal claro, perfil, 7 destinos (Mis avisos con contador, Noticias con punto rojo si hay urgente), hora de cierre de sesión.

## 7. Movimiento (Animated / Reanimated)

Easing `cubic-bezier(0.2, 0.8, 0.2, 1)` (`Easing.bezier(0.2, 0.8, 0.2, 1)`). Duraciones en `tokens.motion`.
- Avanzar: entra desde la derecha (+56 px, opacidad 0→1). Volver: desde la izquierda.
- Entre pestañas: fundido.
- Flujos modales (Nueva solicitud, Registrar tarjeta, Agregar cuenta): suben +80 px. En expo-router: `presentation: 'modal'` o `animation: 'slide_from_bottom'`.
- Hoja de detalle: desde abajo 100%. Menú: desde la izquierda.
- "Pop" (0.92 → 1.02 → 1) al seleccionar tarjeta, adjuntar, o cuando aparece una fila nueva.
- Moneda "S/" recorre la línea hacia la cuenta al montar la fila.
- Respeta "Reducir movimiento": `AccessibilityInfo.isReduceMotionEnabled()` → sin animaciones.

## 8. Íconos (Ionicons)

menú `menu`, campana `notifications-outline`, inicio `home-outline`, solicitudes `receipt-outline`, tarjeta `card-outline`, cámara `camera-outline`, candado `lock-closed-outline`, reloj `time-outline`, check `checkmark`, cerrar `close`, alerta `warning-outline`, info `information-circle-outline`, flecha `arrow-forward`, chevron `chevron-forward`, atrás `chevron-back`, enviar `paper-plane-outline`, WhatsApp `logo-whatsapp`, correo `mail-outline`, salir `log-out-outline`.
**Cuenta bancaria: siempre `BankIcon` (propio), no un Ionicon.**

## 9. Pendientes de negocio (no inventar)

- Si hay 2 cuentas del mismo banco, ¿cuál recibe el depósito? (el diseño muestra una etiqueta "Recibe depósitos").
- Tarjetas CMR y "Otros": ¿a qué cuenta se deposita?
- Largo del número de cuenta de ahorros por banco (el prototipo usa un mínimo provisional de 10).
- Tiempos de espera de cada paso, WhatsApp y correo de soporte.
