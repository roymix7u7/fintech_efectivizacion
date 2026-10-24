-- Prototipo final del app: lo que el diseño pide y la base todavía no
-- sabía hacer cumplir.
--
--   1. El cliente se registra con DNI o con carnet de extranjería.
--   2. La tarjeta guarda el nombre impreso, para que el gestor lo
--      compare con el titular sin adivinar de la foto.
--   3. La tarjeta no se edita ni se da de baja desde el app: "para
--      darla de baja, habla con un asesor".
--   4. Por banco, una cuenta de ahorros y una CCI. El cliente puede
--      corregir el número, pero no convertir la cuenta en otra (ni de
--      banco ni de tipo), y el número tiene que tener forma de número.

-- ── 1. Tipo de documento ───────────────────────────────────────────
alter table public.perfiles_cliente
  add column if not exists tipo_documento text not null default 'dni';

alter table public.perfiles_cliente
  drop constraint if exists perfiles_tipo_documento_check;
alter table public.perfiles_cliente
  add constraint perfiles_tipo_documento_check
  check (tipo_documento in ('dni', 'ce'));

-- DNI: 8 dígitos. Carnet de extranjería: 9. Todos los perfiles que hay
-- hoy son DNI de 8, así que la regla se valida completa.
alter table public.perfiles_cliente
  drop constraint if exists perfiles_documento_formato_check;
alter table public.perfiles_cliente
  add constraint perfiles_documento_formato_check
  check (
    (tipo_documento = 'dni' and dni ~ '^\d{8}$')
    or (tipo_documento = 'ce' and dni ~ '^\d{9}$')
  );

create or replace function public.perfiles_proteger_validacion()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.es_staff() then
    new.validado_por    := old.validado_por;
    new.fecha_validacion := old.fecha_validacion;
    new.tasa_comision   := old.tasa_comision;
    new.user_id         := old.user_id;
    -- El documento no se cambia solo: identifica al titular ya verificado.
    new.dni             := old.dni;
    new.tipo_documento  := old.tipo_documento;
    -- Sus condiciones comerciales las pone el staff.
    new.bloque_id       := old.bloque_id;
    -- El motivo del bloqueo lo escribe quien bloquea.
    new.motivo_bloqueo  := old.motivo_bloqueo;
    new.bloqueado_por   := old.bloqueado_por;
    new.bloqueado_en    := old.bloqueado_en;
  end if;
  return new;
end;
$function$;

-- ── 2 y 3. Tarjetas ────────────────────────────────────────────────
alter table public.tarjetas
  add column if not exists nombre_impreso text;

alter table public.tarjetas
  drop constraint if exists tarjetas_nombre_impreso_check;
alter table public.tarjetas
  add constraint tarjetas_nombre_impreso_check
  check (nombre_impreso is null or char_length(btrim(nombre_impreso)) between 3 and 60);

create or replace function public.tarjetas_proteger_estado()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.es_staff() then
    -- Desde el app la tarjeta ya no se toca: ni se edita ni se da de
    -- baja. La baja la hace un asesor desde el panel.
    new.estado := old.estado;
    new.motivo_rechazo := old.motivo_rechazo;
    new.revisado_por := old.revisado_por;
    new.fecha_revision := old.fecha_revision;
    new.banco := old.banco;
    new.ultimos_4 := old.ultimos_4;
    new.cliente_id := old.cliente_id;
    new.nombre_impreso := old.nombre_impreso;
    new.activa := old.activa;
  end if;
  return new;
end;
$function$;

-- ── 4. Cuentas ─────────────────────────────────────────────────────
-- Una de ahorros y una CCI por banco, contando solo las activas.
create unique index if not exists cuentas_una_por_tipo_y_banco
  on public.cuentas_bancarias (cliente_id, banco, tipo)
  where activa;

create or replace function public.cuentas_validar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.es_staff() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Editar es corregir el número, no convertir la cuenta en otra.
    new.cliente_id := old.cliente_id;
    new.banco := old.banco;
    new.tipo := old.tipo;
  end if;

  -- Solo se revisa el número cuando entra uno nuevo: hay cuentas viejas
  -- guardadas con guiones y no se quiere bloquear nada más sobre ellas.
  if tg_op = 'INSERT' or new.numero_cuenta is distinct from old.numero_cuenta then
    new.numero_cuenta := regexp_replace(new.numero_cuenta, '\D', '', 'g');
    if new.tipo = 'interbancaria' and new.numero_cuenta !~ '^\d{20}$' then
      raise exception 'El CCI tiene 20 dígitos.';
    end if;
    if new.tipo = 'ahorros' and new.numero_cuenta !~ '^\d{10,20}$' then
      raise exception 'El número de cuenta tiene entre 10 y 20 dígitos.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists tr_cuentas_validar on public.cuentas_bancarias;
create trigger tr_cuentas_validar
  before insert or update on public.cuentas_bancarias
  for each row execute function public.cuentas_validar();
