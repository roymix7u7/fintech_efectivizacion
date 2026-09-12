--  INTEGRIDAD DE DATOS
--  Ajustado al esquema real. Ya estan creados y NO hacen falta:
--    solicitudes_codigo_key        (unico en codigo)
--    perfiles_cliente_user_id_key  (unico en user_id)
--    users_email_key               (unico en email)
--    guias_banco_banco_key         (unico en banco)
--    idx_solicitudes_estado, idx_tarjetas_estado, idx_users_rol,
--    idx_users_estado, idx_perfiles_user_id y varios mas.
--
--  Lo que sigue es lo que falta. Ejecutar bloque por bloque.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Un DNI por persona
--    Hoy nada lo impide, asi que la misma persona puede tener
--    varias cuentas verificadas con el mismo documento.
--    Si el indice falla, ya hay duplicados: este select los lista.
-- ------------------------------------------------------------
-- select dni, count(*) from public.perfiles_cliente
--   group by dni having count(*) > 1;

create unique index if not exists perfiles_cliente_dni_unico
  on public.perfiles_cliente (dni);


-- ------------------------------------------------------------
-- 2) Una tarjeta por banco y ultimos 4 digitos
--    Solo entre las activas, para que dar de baja una y volver a
--    registrarla siga siendo posible.
-- ------------------------------------------------------------
-- Corregido en 05-correcciones.sql: una tarjeta rechazada sigue con
-- activa = true, asi que este indice impedia reintentarla aunque la app
-- si lo permite.
create unique index if not exists tarjetas_cliente_banco_ultimos4_unico
  on public.tarjetas (cliente_id, banco, ultimos_4)
  where activa = true and estado <> 'rechazado';


-- ------------------------------------------------------------
-- 3) Una cuenta de ahorros y una CCI por banco
--    Esta regla hoy solo se comprueba en la app, asi que dos
--    envios rapidos podian crear duplicados.
-- ------------------------------------------------------------
create unique index if not exists cuentas_cliente_banco_tipo_unico
  on public.cuentas_bancarias (cliente_id, banco, tipo)
  where activa = true;

create unique index if not exists cuentas_numero_unico
  on public.cuentas_bancarias (cliente_id, numero_cuenta)
  where activa = true;


-- ------------------------------------------------------------
-- 4) Indices compuestos para las listas del panel
--    Las pantallas filtran por estado y ordenan por fecha. Los
--    indices actuales cubren solo el estado.
-- ------------------------------------------------------------
create index if not exists solicitudes_estado_fecha
  on public.solicitudes (estado, created_at);

create index if not exists solicitudes_cliente_fecha
  on public.solicitudes (cliente_id, created_at desc);

create index if not exists tarjetas_estado_fecha
  on public.tarjetas (estado, created_at)
  where activa = true;

create index if not exists auditoria_logs_fecha
  on public.auditoria_logs (created_at desc);


-- ------------------------------------------------------------
-- 5) El tipo de cuenta esta descuadrado
--
--    La columna cuentas_bancarias.tipo es text con un CHECK que
--    acepta 'ahorros' e 'interbancaria', pero su valor por defecto
--    es 'ahorros'::tipo_cuenta, y ese enum contiene 'ahorros' y
--    'corriente'. Son dos vocabularios distintos conviviendo.
--
--    Funciona de casualidad porque el default se convierte a texto
--    antes de guardarse. Conviene dejar un solo criterio: la app
--    usa 'ahorros' e 'interbancaria', asi que el enum sobra.
-- ------------------------------------------------------------
alter table public.cuentas_bancarias
  alter column tipo set default 'ahorros'::text;

-- Ejecuta esto solo despues de confirmar que ningun otro objeto
-- usa el enum:
--   drop type if exists public.tipo_cuenta;


-- ------------------------------------------------------------
-- 6) Roles que ya no existen en el panel
--
--    El enum rol_usuario todavia tiene 'verificador' y 'tesoreria',
--    del flujo con montos que descartaste. Postgres no permite
--    quitar valores de un enum, asi que primero hay que ver si
--    alguien los tiene asignado.
-- ------------------------------------------------------------
-- select rol, count(*) from public.users group by rol;

-- Si hay cuentas con esos roles, decide a que rol pasan:
--   update public.users set rol = 'gestor'
--   where rol in ('verificador', 'tesoreria');


-- ------------------------------------------------------------
-- 7) La tabla operaciones quedo sin uso
--    Nada inserta filas en ella. En 03-rls-y-triggers ya se
--    cerraron sus politicas, que eran las mas abiertas del
--    esquema. Borrarla solo si no necesitas el historico.
-- ------------------------------------------------------------
-- select count(*) from public.operaciones;
-- drop table if exists public.operaciones;
-- drop type if exists public.estado_operacion;
