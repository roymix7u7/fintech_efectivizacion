# Prompt para rediseñar el app de AlToque Perú WK

> Copia todo lo que está debajo de la línea y pégalo en la otra IA.

---

Necesito que rediseñes la interfaz de una app móvil ya construida y en
funcionamiento. No cambies lo que hace ni agregues funciones: el
comportamiento, las reglas y los datos de cada pantalla ya están
definidos y son los que te describo. Tu trabajo es la propuesta visual y
de experiencia.

Te doy el contexto del negocio y el contenido de cada vista. No te doy
dirección de diseño a propósito: eso es lo que espero de ti.

---

## 1. Qué es la empresa

**AlToque Perú WK** es una fintech peruana. Convierte la línea de
crédito de una tarjeta en efectivo depositado en la cuenta bancaria del
propio cliente.

El circuito real, de cuatro pasos (los dos primeros se hacen una sola
vez):

1. **El cliente crea su cuenta** y verifica su identidad con DNI por
   ambas caras y una selfie sosteniéndolo. Lo exige la ley para operar
   con dinero, y **lo revisa una persona**, no un algoritmo.
2. **Registra su tarjeta de crédito** con una foto donde se vean su
   nombre y los últimos 4 dígitos, con el número completo tapado. Una
   persona verifica que la tarjeta sea suya.
3. **Hace la operación en la app de su propio banco**, siguiendo una
   guía que la empresa le muestra para esa entidad. Cada banco tiene su
   camino.
4. **Envía el comprobante (voucher)** desde el app. La empresa lo
   revisa y deposita en la cuenta bancaria registrada del cliente.

**La comisión:** un porcentaje sobre el monto de la operación, que se
descuenta del depósito. El cliente no paga nada por adelantado ni por
separado. El porcentaje **depende del banco de la tarjeta** y puede
tener condiciones especiales según el cliente. Siempre está a la vista
en su perfil, antes de que opere.

**Regla dura del negocio:** el depósito viaja a una cuenta **del mismo
banco de la tarjeta**. Es inmediato y no cuesta comisión
interbancaria. Por eso, si el cliente no tiene una cuenta registrada de
ese banco, **no puede enviar la solicitud**. Aplica a los cinco bancos
principales: BCP, BBVA, Interbank, Scotiabank y BanBif.

**Quién usa este app:** solamente el cliente final. El personal de la
empresa (gestores que revisan, supervisores, administradores y el área
de pagos) trabaja en un panel web aparte que **no** es parte de este
rediseño.

**Quién es el usuario:** personas en Perú, de todo nivel de
familiaridad con apps bancarias, manejando su propio dinero. Dos cosas
pesan más que cualquier otra: **entender en qué va su operación** y
**confiar en que sus documentos están seguros**. Todo el texto está en
español de Perú, los montos en soles (S/).

**El tono actual de la marca** (respétalo): claro, directo, sin jerga
técnica ni de sistema. Nada se aprueba automáticamente y eso se dice.
Cuando algo se rechaza, se explica por qué.

---

## 2. Marca

- **Nombre escrito:** ALTOQUE PERÚ WK
- **Lema:** "Tu aliado financiero"
- **Logo:** archivo `LOGOATK.png` (te lo adjunto). Es el isotipo. Hoy
  se usa sobre fondo azul marino, en portadas y cabeceras, acompañado
  del nombre en dorado.

### Colores actuales

Base azul marino + acento dorado. Son los colores de la marca:
mantenlos como identidad, y dime si propones ajustarlos.

| Rol                  | Hex       |
| -------------------- | --------- |
| Azul principal       | `#1B2A4A` |
| Azul claro           | `#2C4270` |
| Azul oscuro          | `#0F1B33` |
| Dorado (acento)      | `#E8B800` |
| Dorado claro         | `#FFF3CC` |
| Dorado oscuro        | `#C49B00` |
| Fondo de pantalla    | `#F0F2F5` |
| Tarjeta / superficie | `#FFFFFF` |
| Texto                | `#1B2A4A` |
| Texto secundario     | `#5A6B87` |
| Texto tenue          | `#94A3BB` |
| Borde                | `#DDE3ED` |
| Borde suave          | `#EDF0F5` |
| Fondo de campo       | `#F7F9FC` |
| Éxito                | `#0D9668` |
| Error                | `#D93025` |
| Advertencia          | `#E8A500` |

Colores de acento por banco, usados para distinguir entidades:
BCP `#E67E00`, BBVA `#004481`, Interbank `#00855A`,
Scotiabank `#CC0000`, BanBif `#0077C0`, CMR `#00897B`.

---

## 3. Estados que atraviesan toda la app

**Estado de la cuenta del cliente:**

- `pendiente` — subió documentos, espera revisión humana.
- `activo` — verificado, puede operar.
- `observado` — le devolvieron los documentos con un motivo escrito;
  tiene que volver a subirlos.
- `bloqueado` — no puede entrar ni operar. Hay un motivo escrito que se
  le muestra.

**Estado de una solicitud** (así se le nombra al cliente):

- `pendiente` → "En revisión"
- `aprobado` → "Aprobado" (revisada, esperando el depósito)
- `pagado` → "Pago enviado" (es lo que el cliente espera desde que
  envió el comprobante)
- `rechazado` → "Rechazado", siempre con motivo

**Estado de una tarjeta:** pendiente de verificación, aprobada,
rechazada con motivo.

**Otros hechos que afectan el diseño:**

- La sesión dura **2 horas** y luego se cierra sola.
- Hay **alertas en tiempo real**: aparecen mientras el app está abierto
  y llegan como notificación al teléfono cuando está cerrado. Las
  urgentes **no desaparecen solas**.
- El app se usa con conexión móvil irregular: hay estados de carga,
  esqueletos y un aviso claro de "sin conexión".

---

## 4. Las vistas

### Fuera de sesión

**4.1 Bienvenida (entrada del app)**
Primera pantalla. Comprueba conexión y si ya hay sesión guardada; si la
hay, entra directo sin pedir contraseña. Tres situaciones: revisando,
sin conexión, y bienvenida con logo, marca, lema y dos caminos —
ingresar o crear cuenta. Si quien vuelve está bloqueado, se le muestra
el motivo.

**4.2 Ingresar**
Correo y contraseña, con opción de ver la contraseña, enlace a
recuperarla y acceso a crear cuenta. Tiene que comunicar bien varios
desenlaces distintos: datos incorrectos, sin conexión, cuenta de
personal (este app es solo para clientes), registro que quedó
incompleto, y cuenta bloqueada (con el motivo y un contacto de
soporte). Según el estado, entra al inicio o a la pantalla de revisión.

**4.3 Crear cuenta — 3 pasos**

1. Datos personales: nombres, apellidos, DNI (8 dígitos), teléfono (9
   dígitos), dirección, correo, contraseña (mínimo 8) y confirmación.
   Además un **código promocional opcional**.
2. Verificar correo con un código de 6 dígitos.
3. Documentos de identidad: **DNI cara frontal** (el lado con foto y
   datos), **DNI cara posterior** (el del código de barras) y **selfie
   sosteniendo el DNI junto al rostro**.

Desde el paso 2 la cuenta ya existe, así que no se puede retroceder. El
paso 1 es un formulario largo en móvil: el manejo del teclado y de los
errores por campo importa.

**4.4 Recuperar contraseña**
Pide el correo y envía el enlace de recuperación.

**4.5 Cuenta en revisión**
Es donde espera quien todavía no está verificado. Muestra en qué va, y
si fue **observado**, el motivo escrito por quien revisó y la
posibilidad de volver a subir los tres documentos. También permite
cerrar sesión. Cuando la cuenta se aprueba, lleva al inicio.

### Con sesión

**4.6 Inicio**
Es la portada y el centro de todo. Contiene:

- Saludo según la hora y el nombre del cliente.
- Señal de que su identidad está verificada.
- Contadores de sus operaciones: en revisión, por pagar, pagadas,
  rechazadas; cuántas tarjetas y cuentas tiene registradas; cuántas
  tarjetas están en verificación.
- Los bancos de sus tarjetas aprobadas, con acceso a la **guía de cada
  banco** para hacer la operación.
- **La última operación**, que al tocarla abre su detalle completo ahí
  mismo (no lleva al historial).
- Alertas sin ver y avisos sin leer.
- La acción principal: **enviar una nueva solicitud**. Si le falta una
  tarjeta aprobada o una cuenta bancaria, hay que explicarle qué le
  falta en vez de dejarlo avanzar y fallar.
- Se refresca tirando hacia abajo.

**4.7 Solicitudes (historial)**
Listado de todas sus operaciones, agrupado por día con separadores
("Hoy", "Ayer", fechas anteriores). A propósito **no carga las
imágenes** en la lista: es liviano, poco texto, y al tocar una fila se
abre el detalle completo con el comprobante.

**4.8 Tarjetas y cuentas**
Dos bloques en una pantalla:

- **Mis tarjetas:** banco, últimos 4 dígitos, nombre impreso en la
  tarjeta, foto del frente y del reverso, y su estado de verificación
  (con el motivo si fue rechazada). Al registrar una, una ayuda
  explica **cómo fotografiarla**: solo se necesitan los últimos 4
  dígitos y el nombre; el resto se puede tapar, por seguridad. Bancos
  admitidos para tarjeta: BCP, BBVA, Interbank, Scotiabank, BanBif,
  CMR y "Otros".
- **Mis cuentas bancarias:** banco, tipo (ahorros o interbancaria/CCI)
  y número, validado según el largo que usa cada banco (el CCI son
  exactamente 20 dígitos). Solo los cinco bancos principales.

Esta pantalla tiene que dejar clarísima la regla del negocio: **el
depósito llega a una cuenta del mismo banco de la tarjeta**, y avisar
cuando al cliente le falta la cuenta que va a necesitar.

**4.9 Nueva solicitud**
Es un flujo directo: pantalla propia, sin barra de pestañas ni menú, y
con su propia cabecera. Tres bloques:

1. **Con qué tarjeta hizo la operación** — solo sus tarjetas
   verificadas.
2. **Adjuntar el comprobante** — foto del voucher.
3. **Nota adicional** — opcional.

Muestra el avance ("X de 2 pasos", la nota no cuenta). **Bloquea el
envío** si no tiene una cuenta del mismo banco de esa tarjeta, y lo
explica ahí mismo. Si hay una **alerta urgente activa**, al confirmar
se le muestra su contenido y se le pide decidir si continúa. Y si
intenta salir cuando ya cargó el comprobante o escribió la nota, se le
advierte que perdería lo cargado.

**4.10 Noticias y alertas**
Dos cosas distintas, separadas a propósito en la misma pantalla:

- **Noticias:** promociones, avisos informativos, feriados, descuentos.
  Cada una tiene **una o varias imágenes** (en carrusel), una
  descripción y una **vigencia** con los días que le quedan. Se
  navegan con calma. Cuatro tipos, de menor a mayor peso: Promoción,
  Aviso, Importante, Urgente.
- **Alertas:** interrumpen. Por ejemplo, la caída de un banco: si el
  cliente se entera mañana, ya no le sirvió. Aparecen en tiempo real,
  se distinguen por gravedad (Aviso, Importante, Urgente) y quedan
  registradas para que pueda volver a leer por qué. Las urgentes no se
  van solas.

El problema de diseño: antes estaban mezcladas y un 10% de descuento se
veía igual de urgente que la caída del BCP. Eso no puede volver a pasar.

**4.11 Mi cuenta (perfil)**
En este orden: su identidad verificada (por quién y cuándo), sus datos
personales (nombres, apellidos, DNI, teléfono, dirección), **sus
comisiones por banco** — el porcentaje real que se le aplica, que
calcula el servidor — y al final, cerrar sesión.

**4.12 Mis avisos**
Las notificaciones que le llegaron: título, contenido, fecha y si ya
fueron leídas.

**4.13 Sobre la empresa**
La pantalla que construye confianza. Lleva el lema, los cuatro pasos de
cómo funciona con su tiempo de espera cada uno, la explicación de la
comisión con su fórmula (monto de la operación − comisión = lo que se
deposita), tres garantías sobre el cuidado de los datos (documentos
cifrados, una persona revisa cada caso, siempre se sabe en qué va) y el
contacto: WhatsApp y correo.

**4.14 Guía de un banco**
Los pasos para hacer la operación dentro de la app de un banco
específico. El contenido lo administra la empresa y cambia por banco.

### Elementos transversales

- **Cabecera** con título de la pantalla y acceso al menú.
- **Menú lateral** con: Inicio, Solicitudes, Tarjetas y cuentas, Mis
  avisos, Noticias, Sobre la empresa y Mi cuenta.
- **Barra de pestañas** con solo tres destinos: Inicio, Solicitudes y
  Tarjetas. El resto vive en el menú.
- **Avisos flotantes** para confirmar acciones y errores.
- **Burbuja de alerta** que aparece cuando entra una alerta en tiempo
  real.
- **Vigilante de sesión** que avisa y cierra a las 2 horas.
- Esqueletos de carga y estados vacíos en cada listado.

---

## 5. Restricciones técnicas

- **Expo / React Native** con expo-router. Es un app nativa para
  Android e iOS: no hay CSS web, ni hover, ni media queries. Los
  estilos son `StyleSheet` de React Native.
- Los iconos son de **Ionicons** (`@expo/vector-icons`). Si propones
  otros, dilo.
- Hoy hay **un solo tema claro**. Si propones modo oscuro, indícalo
  como decisión aparte.
- Las animaciones son con la API `Animated` de React Native.
- Pantallas de teléfono, desde ~360 px de ancho. Considera el teclado
  abierto en todos los formularios.

---

## 6. Qué necesito de vuelta

1. Una dirección visual argumentada: paleta final (partiendo de los
   colores de marca), tipografía, tratamiento del logo, y cómo se
   jerarquiza la información.
2. El sistema de componentes: cómo se ve una tarjeta de operación, un
   estado, un campo de formulario, un botón principal y secundario, una
   alerta, un estado vacío.
3. El rediseño de cada vista de la sección 4, indicando qué cambia
   respecto a lo que te describí y por qué.
4. Cómo se distinguen visualmente las cuatro etapas de una solicitud, y
   cómo se diferencian las noticias de las alertas.
5. Si en algún punto crees que la estructura actual estorba, dilo y
   propón la alternativa. No inventes funciones que no existen.
