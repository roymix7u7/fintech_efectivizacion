# Base de datos

El esquema vive solo dentro de Supabase. Esta carpeta lo documenta y guarda
las migraciones pendientes.

## Orden de ejecución

| Archivo | Estado |
| --- | --- |
| `01-introspeccion.sql` | Solo lee. Ejecutado. |
| `01b-storage.sql` | Solo lee. Ejecutado. |
| `02-integridad.sql` | Ejecutado. |
| `03-rls-y-triggers.sql` | Ejecutado. |
| `04-limpieza-y-verificacion.sql` | Ejecutado. |
| `05-correcciones.sql` | Pendiente. Arregla el índice de tarjeta duplicada, que quedó más estricto que la app. |
| `06-limpiar-clientes-prueba.sql` | Opcional. Borra todos los clientes para volver a probar desde cero. Irreversible. |

## Lo que estaba mal y ya está corregido

Row Level Security estaba activo en las once tablas, pero varias políticas eran
tan permisivas que equivalían a no tenerlo. Estos cuatro eran agujeros reales
de escalada de privilegios, no advertencias teóricas. Quedan documentados
porque explican por qué el archivo `03` hace lo que hace.

**Cualquier cliente puede volverse administrador.** La política
`users_self_update` permite hacer `UPDATE` sobre la propia fila sin restringir
qué columnas. La columna `rol` está ahí. Un cliente con la clave anónima, que
va dentro de la app publicada, puede ponerse `rol = 'admin'` con una sola
llamada a la API y entrar al panel completo. `users_self_insert` tiene el
mismo problema al crear la fila.

**Cualquier cliente puede leer toda la tabla de usuarios.** La política
`users_staff_read` tiene como condición que el rol de la sesión sea
`authenticated`, cosa que cumple todo usuario que inicia sesión. Como las
políticas se combinan con OR, esa anula a `users_self_read`. Queda expuesto
el correo, el rol y el estado de todos, incluido el staff.

**Cualquier cliente puede aprobarse su propia tarjeta.** La política
`tarjetas_self` es `FOR ALL` y solo define `USING`. En una política `ALL` sin
`WITH CHECK`, esa misma expresión valida la escritura, así que el cliente
puede hacer `UPDATE` de su tarjeta y ponerle `estado = 'aprobado'`. Queda
habilitado para operar sin que nadie revise su foto. `cuentas_self` tiene la
misma forma.

**La tabla `operaciones` está abierta de par en par.** `operaciones_client_insert_v2`
tiene `WITH CHECK true` y `operaciones_staff_update` tiene `USING true`.
Cualquiera con sesión puede crear filas y modificar las de cualquier otro,
montos y estado `depositado` incluidos. La tabla ya no se usa, pero las
políticas siguen vivas.

Además, `alertas_sistema` y `guias_banco` se leen sin iniciar sesión y
devuelven también las filas con `activa = false`.

## Dos desajustes que ya no fallan en silencio

**Un gestor no puede aprobar solicitudes.** `solicitudes_staff_update` exige
rol `admin`, pero el panel deja que el gestor apruebe y rechace. Ese `UPDATE`
no escribía nada y la pantalla no avisaba porque el código no miraba el error.
El panel ya está corregido y `03` alinea el permiso.

**La auditoría de solicitudes nunca se guardó.** `auditoria_staff_insert` solo
permite insertar al staff, pero quien registra `CREAR_SOLICITUD` es la app del
cliente. Ese insert viene fallando en silencio, así que no hay rastro de
ninguna solicitud creada.

**Falta el permiso para reenviar documentos.** No hay política de `UPDATE`
sobre `perfiles_cliente` para el propio cliente, solo para el staff. Sin eso,
la pantalla de cuenta observada no puede guardar las fotos corregidas.

## Por qué las políticas sobre `users` fallaban

Las políticas actuales de esa tabla hacen
`EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() ...)` dentro de una
política de la propia tabla `users`. Eso es recursivo. Probablemente por ahí
apareció el atajo del `auth.jwt()`, que terminó abriendo la tabla entera.

`03` lo resuelve con funciones `SECURITY DEFINER`, que leen `users` saltándose
RLS. Es la forma estándar de romper esa recursión en Supabase.

## La tabla `notificaciones` ya se usa

Estaba montada sin que nada la tocara. Ahora el panel escribe un aviso cada
vez que se resuelve un KYC, una tarjeta o una solicitud, y la app los muestra
en una campana con contador.

Eso depende de la sección 9 de `03-rls-y-triggers.sql`, que ya está ejecutada,
así que la campana funciona. Todavía no hay ningún aviso escrito porque no se
ha resuelto nada desde entonces: el primero aparecerá cuando apruebes o
rechaces un KYC, una tarjeta o una solicitud.

## Cosas que siguen sin usarse

- La tabla `operaciones` y el enum `estado_operacion`, del flujo con montos.
- La columna `users.expo_push_token`. Los avisos ya existen dentro de la app,
  pero todavía no se envía nada al teléfono cuando está cerrada. Para eso hace
  falta `expo-notifications` y una Edge Function que llame al servicio de push
  de Expo.
- Los buckets `vouchers` y `guias-bancos`. El primero era del flujo viejo. El
  segundo nunca se usó porque las imágenes de las guías se cargan pegando una
  URL externa a mano en el panel, que es frágil.
- Los roles `verificador` y `tesoreria` del enum `rol_usuario`.
- La columna `perfiles_cliente.tasa_comision`, que el gestor asigna al aprobar
  el KYC y no entra en ningún cálculo.

## Un descuadre menor

`cuentas_bancarias.tipo` es `text` con un `CHECK` que acepta `ahorros` e
`interbancaria`, pero su valor por defecto es `'ahorros'::tipo_cuenta`, y ese
enum contiene `ahorros` y `corriente`. Son dos vocabularios conviviendo.
Funciona porque el default se convierte a texto antes de guardarse. `02` deja
un solo criterio.
