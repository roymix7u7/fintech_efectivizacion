# AlToque Perú WK — Documentación del sistema

**Curso:** Desarrollo Full Stack (UTP) · **1er avance del proyecto final**

> Lo marcado como **NO TIENE** no existe en el sistema y queda por
> completar o justificar. Lo marcado como *(propuesto)* es una
> sugerencia, no un dato del sistema.

---

## 1. Descripción del sistema

**Nombre:** AlToque Perú WK — plataforma de efectivización de línea de
tarjeta de crédito.

**Tipo de empresa:** fintech peruana de servicios financieros al
consumidor, con operación de back-office propia (verificación de
identidad y pagos).

### Problema que resuelve

- La operación se hacía por canales sueltos (chat, teléfono), sin
  registro ni trazabilidad de quién revisó qué.
- Varios revisores podían trabajar el mismo caso y duplicar o
  contradecir decisiones.
- Las comisiones se pactaban caso por caso, sin control central ni
  visibilidad para el cliente.
- El cliente no sabía en qué estado iba su operación ni por qué se le
  rechazaba.
- La verificación de identidad, exigida por ley para operar con dinero,
  no quedaba documentada.

### Roles de usuario

| Rol | Dónde entra | Qué puede hacer |
|---|---|---|
| Cliente | App móvil | Registrarse, verificar identidad, registrar tarjetas y cuentas, enviar solicitudes con comprobante, ver estado e historial, ver sus comisiones, leer noticias y alertas |
| Gestor | Panel web | Atender solo la cola que el sistema le reparte: verificar identidades y tarjetas, aprobar o rechazar solicitudes con motivo |
| Supervisor | Panel web | Ver todas las colas y quién atiende cada caso (solo lectura), bloquear y desbloquear clientes, fijar comisiones especiales, crear y bloquear gestores de su sede |
| Pagos | Panel web | Solo el módulo de Pagos: buscar por DNI, marcar solicitudes aprobadas, agruparlas en lote por banco y confirmar el envío, cancelar con motivo, ver historial |
| Administrador | Panel web | Todo lo anterior, más comisiones por bloques, sedes, noticias y alertas, guías por banco, nombrar supervisores y ver la auditoría |

### Módulos y funcionalidades

**App del cliente**

- Registro en 3 pasos — datos personales, verificación de correo por
  código y carga de DNI (ambas caras) más selfie.
- Verificación de identidad (KYC) — estado en revisión, observado con
  motivo y reenvío de documentos.
- Tarjetas — registro con foto de frente y reverso, solo últimos 4
  dígitos y nombre impreso.
- Cuentas bancarias — con validación del largo de cuenta y del CCI por
  banco.
- Nueva solicitud — elegir tarjeta verificada, adjuntar comprobante y
  nota opcional.
- Historial — operaciones agrupadas por día, con detalle y comprobante
  bajo demanda.
- Inicio — resumen de operaciones, bancos, última operación y accesos a
  las guías.
- Noticias y alertas — promociones y avisos urgentes, en tiempo real y
  con notificación push.
- Mi cuenta — datos personales y el porcentaje de comisión real por
  banco.
- Guías por banco — pasos para hacer la operación en la app de cada
  entidad.

**Panel web**

- Dashboard — métricas de la operación y rendimiento del equipo.
- Identidades (KYC) — cola de verificación con reparto automático.
- Solicitudes — cola de revisión de comprobantes con aprobación o
  rechazo.
- Tarjetas — cola de verificación de tarjetas.
- Pagos — marcado, lotes por banco, confirmación, cancelación con
  motivo e historial.
- Comisiones — bloques de tarifas por banco, asignación a clientes y
  comisiones especiales.
- Alertas y noticias — publicación con imágenes, vigencia y alcance.
- Guías — contenido por banco.
- Equipo y sedes — alta de personal por rol y sede.
- Auditoría — registro de quién hizo qué.

---

## 2. Stack técnico

### Entorno de desarrollo

- **Editor:** Visual Studio Code.
- **Gestor de paquetes:** npm. Dos proyectos independientes: `app/`
  (Expo) y `admin/` (Next.js).
- **Pruebas:** `node:test` nativo — 22 pruebas unitarias en
  `app/pruebas/pruebas.test.mjs` (base64, rutas de Storage,
  validaciones de DNI, email y celular, fechas) más un verificador
  estático propio (`app/pruebas/verificar.cjs`).
  **Jest, Vitest, React Testing Library, Cypress y Playwright: NO TIENE.**
- **Linter:** ESLint 8 con `eslint-config-next`, solo en el panel. En el
  app **NO TIENE** configuración de ESLint.

### Control de versiones

- Git + GitHub: `roymix7u7/fintech_efectivizacion`.
- 73 commits. Monorepo en un solo repositorio.
- **Ramas: solo `main`.** No hay ramas de feature, Pull Requests ni
  CI/CD. **NO TIENE** flujo de ramas.

### Contenedores, VM o serverless

- Docker, Kubernetes y máquinas virtuales: **NO TIENE.**
- Serverless: **sí** — 2 Supabase Edge Functions escritas en Deno
  (`crear-staff`, `enviar-alerta-push`).

### Framework front-end

- **App móvil:** React Native 0.86.3 sobre Expo SDK 57, React 19.2.
- **Panel web:** Next.js 14.2 con App Router y React 18.

### Router y gestión de estado

- **Router:** `expo-router` 57 (basado en archivos, con Stack y Tabs) en
  el app; App Router de Next.js en el panel.
- **Estado:** React Hooks (`useState`, `useCallback`, `useFocusEffect`,
  `useMemo`), un **Context propio** para los avisos flotantes
  (`app/src/components/Avisos.js`, el único `createContext` del
  proyecto) y una caché propia en memoria (`app/src/lib/cache.js`, hook
  `useDatos`), más una caché de sesión en el panel.
  **Redux, Zustand, Pinia, Recoil y Jotai: NO TIENE.**

### Estilos

- **App:** `StyleSheet` de React Native con un tema propio centralizado
  (`theme/colors.js`, `theme/tipografia.js`, `theme/estados.js`). No
  aplica framework CSS.
- **Panel:** **Tailwind CSS 3.4** con componentes shadcn/ui sobre Radix
  UI, más `clsx`, `tailwind-merge`, `class-variance-authority`,
  `tw-animate-css` e iconos `lucide-react`.

### Reactividad

- React Hooks en ambos proyectos.
- `Animated` de React Native y `react-native-reanimated` 4.5 para
  transiciones.
- **Supabase Realtime** (`postgres_changes` sobre WebSocket) para las
  colas del panel y las alertas del app.
- Signals: **NO TIENE.**

### Consumo de API

- **Librería HTTP:** `@supabase/supabase-js` 2.106 (cliente PostgREST).
  **Axios: NO TIENE.** `fetch` nativo se usa en dos lugares: el chequeo
  de conexión del app (`app/src/lib/conexion.js`, contra
  `/auth/v1/health` con `AbortController` y timeout) y dentro de las
  Edge Functions.
- **Endpoints:** no hay API REST propia. Se consumen **tablas vía
  PostgREST** (`.from().select()`, `.insert()`, `.update()`) y
  **~54 funciones RPC** en PostgreSQL. Las principales:
  `resumen_inicio`, `mis_comisiones`, `tomar_caso`, `tomar_siguiente`,
  `resolver_caso`, `mis_casos`, `estado_cola`, `bloquear_cliente`,
  `pagos_marcar`, `pagos_confirmar`, `pagos_cancelar`,
  `listar_bloques`, `fijar_comision_especial`, `alertas_sin_ver`.
- **Formularios y validaciones:** formularios controlados a mano, con
  validaciones propias en `app/src/lib/validaciones.js` (DNI de 8
  dígitos, celular de 9, email, largo de cuenta y CCI por banco) **más
  validación en la base de datos** mediante constraints, triggers y
  excepciones dentro de las funciones.
  **Formik, React Hook Form, Zod y Yup: NO TIENE.**

### Autenticación en el front

- Supabase Auth con correo y contraseña.
- **Token: JWT** de Supabase, persistido en AsyncStorage (app) y en el
  navegador (panel).
- Verificación de correo con código de 6 dígitos al registrarse.
- **Rutas protegidas:** guarda por rol en el panel (`getSession()` más
  redirección) y guarda por estado de cuenta en el app (activo,
  pendiente, observado, bloqueado).
- Sesión con caducidad propia de **2 horas**.
- **Autenticación en dos pasos (2FA/MFA): NO TIENE.** El código de 6
  dígitos pertenece al registro, no al login.

### Despliegue del front

- **App:** EAS Build con tres perfiles — `preview` (APK interno),
  `desarrollo` (APK con cliente de desarrollo) y `produccion` (AAB para
  Play Store). Paquete Android: `com.altoqueperu.fintech`.
- **Panel web: NO TIENE despliegue.** Hoy corre en local
  (`next dev` / `next build`). Vercel o Netlify sin configurar.

### Back-end y base de datos

- **BaaS:** Supabase (proyecto `zsrjctabxqrgunlzvzru`, región
  sa-east-1).
- **Base de datos:** PostgreSQL 17.6 (**SQL**). 22 tablas, entre ellas
  `users`, `perfiles_cliente`, `tarjetas`, `cuentas_bancarias`,
  `solicitudes`, `operaciones`, `observaciones`, `comisiones_banco`,
  `bloques_comision`, `bloques_comision_banco`, `comisiones_cliente`,
  `lotes_pago`, `pagos_bancos`, `pagos_eventos`, `alertas_sistema`,
  `alertas_vistas`, `notificaciones`, `push_tokens`, `guias_banco`,
  `sedes` y `auditoria_logs`.
- **Framework back-end tradicional** (Express, NestJS, Django, Laravel):
  **NO TIENE.** La lógica de negocio vive en funciones PL/pgSQL
  `SECURITY DEFINER` y en las políticas de RLS.
- **CRUD:** vía PostgREST con **Row Level Security** en todas las
  tablas.
- **WebSockets:** Supabase Realtime.
- **JWT:** emitido y validado por Supabase; las funciones leen
  `auth.uid()` y las claims de la sesión.
- **Storage:** 4 buckets — `kyc-documentos`, `tarjetas-fotos` y
  `comprobantes` (privados, con URLs firmadas) y `noticias-fotos`
  (público).
- **Migraciones versionadas:** 29 archivos SQL en
  `supabase/migrations/` más 12 scripts base en `server/`.
- **Notificaciones push:** `expo-notifications` más una Edge Function
  que envía a los tokens registrados.

### Herramientas de diseño y gestión

Figma, Trello, Jira y Notion: **NO TIENE.** No hay tablero de gestión ni
archivo de diseño; el diseño se definió directamente en código.

---

## 3. Caso de uso de alto nivel

**Actores:** Cliente · Gestor · Supervisor · Pagos · Administrador ·
Sistema (reparto automático y notificaciones) · Supabase
(autenticación y almacenamiento).

### Cliente

- Registrarse y verificar correo
- Enviar documentos de identidad
- Reenviar documentos observados
- Registrar tarjeta de crédito
- Registrar cuenta bancaria
- Enviar solicitud con comprobante
- Consultar estado e historial
- Consultar su comisión
- Recibir alertas y notificaciones

### Gestor

- Atender caso asignado (identidad, tarjeta o solicitud)
- Aprobar identidad y asignar bloque de comisión
- Observar identidad con motivo
- Aprobar o rechazar tarjeta con motivo
- Aprobar o rechazar solicitud con motivo
- Tomar siguiente caso de la cola

### Supervisor

- Consultar colas y quién atiende cada caso *(solo lectura)*
- Bloquear y desbloquear cliente con motivo
- Fijar comisión especial a un cliente
- Dar de alta y bloquear gestores de su sede

### Pagos

- Buscar cliente por DNI
- Marcar solicitudes aprobadas para pago
- Agrupar en lote por banco y confirmar envío
- Cancelar envío con motivo
- Consultar historial de pagos

### Administrador

- Gestionar bloques de comisión por banco
- Aplicar cambios masivos de tarifas
- Publicar noticias y alertas con vigencia
- Gestionar guías por banco
- Gestionar equipo y sedes
- Consultar auditoría y métricas

### Sistema (casos automáticos)

- Repartir caso al gestor menos cargado
- Liberar caso no atendido en 10 minutos
- Enviar notificación push de alerta
- Cerrar sesión tras 2 horas

### Relaciones para el diagrama

- `Enviar solicitud` **«include»** `Validar cuenta del mismo banco`
- `Aprobar identidad` **«include»** `Asignar bloque de comisión`
- `Atender caso` **«include»** `Reservar caso (evita doble atención)`
- Supervisor y Administrador **heredan** las consultas del Gestor, no
  sus acciones de resolución.

---

## 4. Bondades del sistema

### Beneficios concretos

- **Ningún caso se trabaja dos veces:** la base de datos bloquea la fila
  y avisa con nombre quién se quedó con el caso.
- **Reparto automático y parejo:** cada caso llega al gestor menos
  cargado; si no lo atiende en 10 minutos vuelve a la bolsa.
- **Trazabilidad completa:** toda decisión queda en `auditoria_logs` con
  autor, fecha, estado anterior y posterior.
- **Comisiones controladas:** tarifas por bloques, cambios masivos que
  no pisan las condiciones especiales, y visibilidad de quién tiene
  excepción.
- **Menos errores de pago:** el depósito solo puede ir a una cuenta del
  mismo banco de la tarjeta, validado antes de que el cliente envíe.
- **Separación de funciones:** quien revisa no paga, quien supervisa no
  resuelve y quien paga solo ve sus bancos.
- **Cumplimiento:** identidad verificada por una persona antes de
  operar, con documentos en buckets privados y acceso restringido.
- **Menos consultas al soporte:** el cliente ve estado, motivo de
  rechazo y su comisión sin preguntar.

### Métricas sugeridas *(propuestas, aún no instrumentadas)*

| Indicador | Meta propuesta |
|---|---|
| Tiempo medio de verificación de identidad | de horas a menos de 30 min |
| Casos atendidos por gestor y hora | +30 % por el reparto automático |
| Casos duplicados o con doble decisión | 0 (garantizado por la BD) |
| Errores de depósito por banco equivocado | −100 % (bloqueo previo) |
| Consultas a soporte por "¿en qué va mi operación?" | −50 % |
| Tiempo de cierre de un lote de pagos | −40 % frente al marcado uno por uno |

---

## 5. Datos de empresa sugeridos *(propuesto)*

**Giro:** servicios financieros / fintech de disposición de efectivo con
tarjeta de crédito. Perú, operación en Lima con alcance nacional.

**Tamaño:** pequeña empresa — 18 a 25 colaboradores; entre 1.500 y
3.000 clientes activos.

**Organigrama:**

- Gerencia General
- Jefatura de Operaciones → Supervisores (2) → Gestores (6 a 8)
- Área de Pagos (4 a 6 encargados, asignados por banco)
- Cumplimiento y Riesgos (1)
- Tecnología (2)
- Atención al Cliente (2)

**Procesos clave actuales:**

1. Captación y verificación de identidad (KYC).
2. Verificación de medios de pago (tarjetas) y cuentas de abono.
3. Recepción y revisión de comprobantes de operación.
4. Liquidación y transferencia por banco.
5. Gestión de tarifas y condiciones comerciales.
6. Comunicación de incidencias y promociones.

**Stakeholders:** clientes, gestores y supervisores, área de pagos,
cumplimiento, gerencia, entidades bancarias (BCP, BBVA, Interbank,
Scotiabank, BanBif) y la SBS/UIF como marco regulatorio.

**Objetivos estratégicos alineados al sistema:**

- Escalar el volumen de operaciones sin crecer el equipo en la misma
  proporción.
- Sostener la trazabilidad que exige la normativa de prevención de
  lavado de activos.
- Reducir pérdidas por errores de depósito y por comisiones mal
  aplicadas.
- Mejorar la retención con transparencia de estado y de tarifa.

**Justificación técnica:** un BaaS con RLS y lógica en la base de datos
permite que las reglas críticas —quién ve qué, quién puede resolver, una
sola decisión por caso— se cumplan aunque falle o se manipule el
cliente. Evita montar y mantener un back-end propio con el equipo de TI
disponible.

**Justificación económica:** sin servidores propios ni licencias; costo
inicial casi nulo y escalado por consumo. El panel web y el app
comparten una sola base y un solo modelo de permisos, lo que reduce el
costo de desarrollo y de mantenimiento.

**Justificación operativa:** elimina el trabajo duplicado y las colas
informales, reparte la carga de forma automática y deja registro de cada
decisión, lo que acorta tanto el tiempo de atención como el de respuesta
ante una auditoría.

---

## 6. Temas del curso y su aplicación

| Tema del curso | Dónde se aplica en mi sistema |
|---|---|
| Entorno de desarrollo y npm | Dos proyectos npm: `app/` (Expo) y `admin/` (Next.js) |
| Control de versiones (Git) | GitHub, 73 commits en `main`. **Falta:** ramas y Pull Requests |
| Contenedores / Docker | **NO TIENE** |
| Serverless | 2 Edge Functions en Deno: `crear-staff`, `enviar-alerta-push` |
| Framework front-end | React Native + Expo SDK 57 (móvil) y Next.js 14 App Router (panel) |
| Router | `expo-router` (basado en archivos, Stack y Tabs) y App Router de Next.js |
| Gestión de estado | React Hooks + Context propio (`Avisos.js`) + caché propia (`lib/cache.js`). **Sin Redux ni Zustand** |
| Framework CSS | Tailwind CSS 3.4 con shadcn/Radix en el panel; `StyleSheet` con tema propio en el app |
| Reactividad / hooks | `useState`, `useCallback`, `useFocusEffect`, `useMemo`; `Animated` y Reanimated |
| Consumo de API | `@supabase/supabase-js`: PostgREST sobre tablas y ~54 funciones RPC; `fetch` para el chequeo de conexión y en las Edge Functions. **Sin axios** |
| Formularios y validación | Formularios controlados + `lib/validaciones.js` + constraints y triggers en PostgreSQL |
| Autenticación | Supabase Auth, JWT, verificación de correo por código, guardas por rol y por estado, sesión de 2 h |
| Rutas protegidas | `getSession()` más redirección por rol en el panel; por estado de cuenta en el app |
| Base de datos SQL | PostgreSQL 17, 22 tablas, 29 migraciones versionadas |
| CRUD | PostgREST con RLS en todas las tablas |
| WebSockets | Supabase Realtime (`postgres_changes`) para colas y alertas |
| Seguridad y autorización | RLS, funciones `SECURITY DEFINER`, `FOR UPDATE SKIP LOCKED`, auditoría |
| Almacenamiento de archivos | 4 buckets de Supabase Storage, 3 privados con URLs firmadas |
| Pruebas | 22 pruebas con `node:test` y verificador estático. **Falta:** pruebas de componentes y E2E |
| Despliegue | EAS Build (APK/AAB) para el app. **Panel: NO TIENE despliegue** |
| Autenticación en dos pasos | **NO TIENE** |
| Herramientas de diseño y gestión | **NO TIENE** (sin Figma, Trello ni Jira) |

---

## 7. Pendientes antes de entregar

1. **Descripción del rol Supervisor desactualizada** en
   `admin/src/app/equipo/page.js` (línea 32): dice que "reasigna casos,
   verifica tarjetas", pero el supervisor pasó a ser solo lectura. Hay
   que corregir ese texto para que la pantalla no contradiga esta
   documentación.
2. **Data de prueba dentro de las migraciones:**
   `supabase/migrations/20260922000032_datos_prueba.sql`. Conviene
   mencionarla como semilla de pruebas o retirarla.
3. **Decidir y documentar el despliegue del panel web**, que hoy solo
   corre en local.
