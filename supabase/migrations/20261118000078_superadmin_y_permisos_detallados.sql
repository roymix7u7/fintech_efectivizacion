-- ============================================================
--  SUPER ADMINISTRADOR Y PERMISOS DETALLADOS DEL PERSONAL
--
--  Sigue a la migración 077 (accesos por pantalla e IP).
--
--  1) Super administrador
--     Quien mantiene el sistema. Es un administrador que además figura
--     en la tabla superadmins, que solo se cambia desde la consola SQL
--     (no hay pantalla para darse ese poder). Solo él configura los
--     accesos del personal y las IP; el resto de administradores ya no.
--     Sus cuentas no las puede bloquear, cambiar de rol ni eliminar un
--     administrador común.
--
--  2) Permisos detallados
--     Además de la pantalla ("clientes": "no" | "ver"), se puede quitar
--     una parte de ella ("clientes.bloquear": "no"). El catálogo de
--     partes vive en el panel: admin/src/lib/catalogoPermisos.js.
--
--  3) La base también los aplica
--     Una función que corre antes de cada petición a la API
--     (revisar_peticion) busca en permisos_api qué permiso pide cada
--     función o tabla y rechaza la petición si a esa persona se lo
--     quitaron. Así no sirve llamar a la función a mano.
--     Solo actúa con el personal que tiene recortes: para los clientes
--     y para quien no tiene nada configurado no hace nada.
--
--     Si algún día hiciera falta apagarla (desde la consola SQL):
--       alter role authenticator reset pgrst.db_pre_request;
--       notify pgrst, 'reload config';
--     No borres la función revisar_peticion sin apagarla antes: la API
--     dejaría de responder.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Super administrador
-- ------------------------------------------------------------
create table if not exists public.superadmins (
  user_id    uuid primary key references public.users(id) on delete cascade,
  creado_en  timestamptz not null default now()
);
alter table public.superadmins enable row level security;
revoke all on public.superadmins from anon, authenticated;

-- El administrador con el que se mantiene hoy el sistema.
insert into public.superadmins (user_id)
select id from public.users where id = '2191d347-1356-4989-98bc-8d8b87273421'
on conflict do nothing;

create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_servicio()
      or (exists (select 1 from public.superadmins where user_id = auth.uid()) and public.es_admin());
$$;

-- Un administrador común no toca las cuentas de un super administrador.
create or replace function public.proteger_superadmin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.superadmins where user_id = old.id)
     and not public.es_superadmin()
     and (new.rol is distinct from old.rol
          or new.estado is distinct from old.estado
          or new.sede_id is distinct from old.sede_id) then
    raise exception 'Esta cuenta es del super administrador: solo él puede cambiarla.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_superadmin on public.users;
create trigger proteger_superadmin
  before update on public.users
  for each row execute function public.proteger_superadmin();


-- ------------------------------------------------------------
-- 2) ¿Le quitaron este permiso?
-- ------------------------------------------------------------
-- Pura: decide con los recortes de una persona. p_clave es "pantalla" o
-- "pantalla.parte"; p_escribir, si la petición cambia algo.
create or replace function public.recorte_permite(p_permisos jsonb, p_clave text, p_escribir boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_permisos is null or p_permisos = '{}'::jsonb then true
    when p_permisos ->> split_part(p_clave, '.', 1) = 'no' then false
    when p_escribir and p_permisos ->> split_part(p_clave, '.', 1) = 'ver' then false
    when position('.' in p_clave) > 0 and p_permisos ->> p_clave = 'no' then false
    else true
  end;
$$;

-- Para quien tiene la sesión: recortes + IP permitida. No mira el rol
-- (eso lo decide cada función).
create or replace function public.acceso_permite(p_clave text, p_escribir boolean default true)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if public.es_servicio() then return true; end if;
  if auth.uid() is null then return false; end if;
  if not public.ip_permitida() then return false; end if;
  return public.recorte_permite(
    (select p.permisos from public.permisos_personal p where p.user_id = auth.uid()),
    p_clave, p_escribir);
end;
$$;

revoke all on function public.acceso_permite(text, boolean) from public, anon;
grant execute on function public.acceso_permite(text, boolean) to authenticated, service_role;


-- ------------------------------------------------------------
-- 3) Qué permiso pide cada función o tabla
--    objeto: "rpc/<función>" o "tabla/<tabla>:<MÉTODO>" (POST, PATCH,
--    DELETE). Si un objeto tiene varias filas, basta con que una se
--    cumpla (una misma función puede servir a dos pantallas).
-- ------------------------------------------------------------
create table if not exists public.permisos_api (
  objeto    text not null,
  clave     text not null,
  escritura boolean not null default true,
  primary key (objeto, clave)
);
alter table public.permisos_api enable row level security;
revoke all on public.permisos_api from anon, authenticated;
grant select on public.permisos_api to authenticated;

drop policy if exists permisos_api_lectura on public.permisos_api;
create policy permisos_api_lectura on public.permisos_api
  for select to authenticated
  using (public.es_superadmin());

insert into public.permisos_api (objeto, clave, escritura) values
  -- Resumen
  ('rpc/resumen_graficos',            'dashboard.graficos',      false),
  -- Verificación
  ('tabla/observaciones:POST',        'kyc.observar',            true),
  ('tabla/perfiles_cliente:PATCH',    'kyc.aprobar',             true),
  ('tabla/perfiles_cliente:PATCH',    'alta-presencial',         true),
  -- Tarjetas
  ('rpc/dar_de_baja_tarjeta',         'tarjetas.baja',           true),
  -- Pagos
  ('rpc/pagos_listar',                'pagos',                   false),
  ('rpc/pagos_marcar',                'pagos.confirmar',         true),
  ('rpc/pagos_desmarcar',             'pagos.confirmar',         true),
  ('rpc/pagos_confirmar',             'pagos.confirmar',         true),
  ('rpc/pagos_cancelar',              'pagos.cancelar',          true),
  ('rpc/pagos_historial',             'pagos.historial',         false),
  -- Clientes
  ('rpc/buscar_clientes',             'clientes',                false),
  ('rpc/registrar_vista_fotos',       'clientes.fotos',          false),
  ('rpc/editar_datos_cliente',        'clientes.editar',         true),
  ('rpc/bloquear_cliente',            'clientes.bloquear',       true),
  ('rpc/asignar_cupon',               'clientes.cupon',          true),
  ('rpc/fijar_comision_especial',     'clientes.especial',       true),
  ('rpc/clientes_seguimiento',        'clientes.seguimiento',    false),
  ('rpc/enviar_recordatorio',         'clientes.seguimiento',    true),
  ('rpc/registrar_seguimiento',       'clientes.seguimiento',    true),
  -- Equipo
  ('rpc/rendimiento_equipo',          'equipo.rendimiento',      false),
  ('rpc/fijar_chat_personal',         'equipo.chat',             true),
  ('tabla/pagos_bancos:POST',         'equipo.bancos',           true),
  ('tabla/pagos_bancos:DELETE',       'equipo.bancos',           true),
  -- Sedes
  ('tabla/sedes:POST',                'sedes.crear',             true),
  ('tabla/sedes:PATCH',               'sedes.editar',            true),
  -- Comisiones (la tarifa estándar es el cupón por defecto)
  ('rpc/guardar_cupon',               'comisiones.cupones',      true),
  ('rpc/guardar_tarifa_cupon',        'comisiones.cupones',      true),
  ('rpc/guardar_tarifa_cupon',        'comisiones.estandar',     true),
  ('rpc/listar_especiales',           'comisiones.especiales',   false),
  ('rpc/quitar_comision_especial',    'comisiones.especiales',   true),
  -- Noticias y alertas, guías, legal
  ('tabla/alertas_sistema:POST',      'alertas',                 true),
  ('tabla/alertas_sistema:PATCH',     'alertas',                 true),
  ('tabla/alertas_sistema:DELETE',    'alertas',                 true),
  ('tabla/guias_banco:POST',          'guias',                   true),
  ('tabla/guias_banco:PATCH',         'guias',                   true),
  ('tabla/documentos_legales:POST',   'legal.publicar',          true),
  -- Cumplimiento
  ('rpc/responder_reclamo',           'reclamaciones.responder', true),
  ('rpc/atender_solicitud_datos',     'pedidos-datos.atender',   true)
on conflict (objeto, clave) do update set escritura = excluded.escritura;


-- ------------------------------------------------------------
-- 4) Antes de cada petición a la API
-- ------------------------------------------------------------
create or replace function public.revisar_peticion()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_perm  jsonb;
  v_ruta  text;
  v_met   text;
  v_obj   text;
  r       record;
  v_hay   boolean := false;
  v_ok    boolean := false;
begin
  -- Cualquier fallo de aquí adentro deja pasar la petición: esta
  -- función nunca debe tumbar la API. Las funciones y las políticas de
  -- cada tabla siguen protegiendo por rol.
  begin
    if auth.uid() is null then return; end if;
    select p.permisos into v_perm from public.permisos_personal p where p.user_id = auth.uid();
    if v_perm is null or v_perm = '{}'::jsonb then return; end if;

    v_ruta := ltrim(regexp_replace(coalesce(current_setting('request.path', true), ''), '^.*/rest/v1', ''), '/');
    v_met  := upper(coalesce(current_setting('request.method', true), 'GET'));

    if v_ruta like 'rpc/%' then
      v_obj := split_part(v_ruta, '?', 1);
    elsif v_met in ('POST', 'PATCH', 'PUT', 'DELETE') then
      v_obj := 'tabla/' || split_part(split_part(v_ruta, '?', 1), '/', 1) || ':' || v_met;
    else
      return;
    end if;

    for r in select a.clave, a.escritura from public.permisos_api a where a.objeto = v_obj loop
      v_hay := true;
      if public.recorte_permite(v_perm, r.clave, r.escritura) then
        v_ok := true;
        exit;
      end if;
    end loop;
  exception when others then
    return;
  end;

  if v_hay and not v_ok then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', '42501',
        'message', 'Tu acceso no permite esta acción. Si la necesitas, pídesela al administrador.')::text,
      detail = json_build_object('status', 403)::text;
  end if;
end;
$$;

grant execute on function public.revisar_peticion() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.revisar_peticion';
notify pgrst, 'reload config';


-- ------------------------------------------------------------
-- 5) Aprobar y rechazar casos (identidades, tarjetas y solicitudes)
--    Van por una sola función (resolver_caso) que recibe el tipo, así
--    que se revisa adentro, según el tipo y si aprueba o no.
-- ------------------------------------------------------------
create or replace function public.exigir_permiso_caso(p_tipo text, p_aprobar boolean)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_clave text;
begin
  v_clave := case p_tipo when 'solicitud' then 'solicitudes' when 'tarjeta' then 'tarjetas' when 'kyc' then 'kyc' end
          || '.'
          || case when p_aprobar then 'aprobar' when p_tipo = 'kyc' then 'observar' else 'rechazar' end;
  if v_clave is not null and not public.acceso_permite(v_clave, true) then
    raise exception 'Tu acceso no permite esta acción. Si la necesitas, pídesela al administrador.' using errcode = '42501';
  end if;
end;
$$;

-- Se agrega la revisión al comienzo de resolver_caso sin reescribirla.
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.resolver_caso(text,uuid,boolean,text)'::regprocedure);
  if position('exigir_permiso_caso' in d) = 0 then
    if position('if not public.puede_resolver() then' in d) = 0 then
      raise notice 'resolver_caso cambió: agrega a mano "perform public.exigir_permiso_caso(p_tipo, p_aprobar);" al comienzo.';
    else
      d := replace(d, 'if not public.puede_resolver() then',
                   'perform public.exigir_permiso_caso(p_tipo, p_aprobar);' || chr(10) || '  if not public.puede_resolver() then');
      execute d;
    end if;
  end if;
end;
$$;


-- ------------------------------------------------------------
-- 6) Los accesos ahora los configura solo el super administrador
-- ------------------------------------------------------------
create or replace function public.mi_acceso()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'permisos', coalesce((select p.permisos from public.permisos_personal p where p.user_id = auth.uid()), '{}'::jsonb),
    'ip', public.ip_actual(),
    'restringida', cardinality(coalesce(public.ips_de(auth.uid()), '{}')) > 0,
    'permitida', public.ip_permitida(),
    'superadmin', exists (select 1 from public.superadmins s where s.user_id = auth.uid())
  );
$$;

drop policy if exists permisos_personal_lectura on public.permisos_personal;
create policy permisos_personal_lectura on public.permisos_personal
  for select to authenticated
  using (user_id = auth.uid() or public.es_superadmin());

create or replace function public.guardar_acceso(
  p_user     uuid,
  p_permisos jsonb,
  p_ip_sede  boolean,
  p_ips      text[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol      text;
  v_sede     uuid;
  v_ips      text[];
  v_permisos jsonb := '{}'::jsonb;
  v_lista    text[];
  k          text;
  val        text;
begin
  if not public.es_superadmin() then
    raise exception 'Los accesos los configura el super administrador.' using errcode = '42501';
  end if;

  select rol::text, sede_id into v_rol, v_sede from public.users where id = p_user;
  if v_rol is null or v_rol = 'cliente' then
    raise exception 'Esa persona no es del equipo.' using errcode = 'P0001';
  end if;

  -- Pantallas: "no" o "ver". Partes ("pantalla.parte"): solo "no".
  for k, val in select key, value from jsonb_each_text(coalesce(p_permisos, '{}'::jsonb)) loop
    if (k ~ '^[a-z-]{1,40}$' and val in ('no', 'ver'))
       or (k ~ '^[a-z-]{1,40}\.[a-z-]{1,40}$' and val = 'no') then
      v_permisos := v_permisos || jsonb_build_object(k, val);
    end if;
  end loop;

  v_ips := public.limpiar_ips(p_ips);

  if p_user = auth.uid() then
    if v_permisos <> '{}'::jsonb then
      raise exception 'No puedes quitarte permisos a ti mismo.' using errcode = 'P0001';
    end if;
    v_lista := v_ips || case when coalesce(p_ip_sede, false)
                             then coalesce((select s.ips from public.sedes s where s.id = v_sede), '{}')
                             else '{}'::text[] end;
    if cardinality(v_lista) > 0 and not public.ip_en_lista(public.ip_actual(), v_lista) then
      raise exception 'Te quedarías fuera: tu IP actual (%) no está en la lista. Agrégala antes de guardar.',
        coalesce(public.ip_actual(), 'no detectada') using errcode = 'P0001';
    end if;
  end if;

  insert into public.permisos_personal (user_id, permisos, ip_sede, ips, actualizado_por, updated_at)
  values (p_user, v_permisos, coalesce(p_ip_sede, false), v_ips, auth.uid(), now())
  on conflict (user_id) do update
    set permisos = excluded.permisos,
        ip_sede = excluded.ip_sede,
        ips = excluded.ips,
        actualizado_por = excluded.actualizado_por,
        updated_at = now();

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'CAMBIAR_ACCESOS', 'permisos_personal', p_user,
          jsonb_build_object('permisos', v_permisos, 'ip_sede', coalesce(p_ip_sede, false), 'ips', v_ips));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.guardar_ips_sede(p_sede uuid, p_ips text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ips   text[];
  v_mias  record;
  v_lista text[];
begin
  if not public.es_superadmin() then
    raise exception 'Las IP de una sede las configura el super administrador.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sedes where id = p_sede) then
    raise exception 'Esa sede no existe.' using errcode = 'P0001';
  end if;

  v_ips := public.limpiar_ips(p_ips);

  -- Si quien guarda está atado a esta sede, la lista nueva tiene que incluir su IP actual.
  select u.sede_id, coalesce(p.ip_sede, false) as ip_sede, coalesce(p.ips, '{}') as ips
    into v_mias
  from public.users u left join public.permisos_personal p on p.user_id = u.id
  where u.id = auth.uid();
  if v_mias.ip_sede and v_mias.sede_id = p_sede then
    v_lista := v_mias.ips || v_ips;
    if cardinality(v_lista) > 0 and not public.ip_en_lista(public.ip_actual(), v_lista) then
      raise exception 'Te quedarías fuera: tu IP actual (%) no está en la lista de tu sede. Agrégala antes de guardar.',
        coalesce(public.ip_actual(), 'no detectada') using errcode = 'P0001';
    end if;
  end if;

  update public.sedes set ips = v_ips, updated_at = now() where id = p_sede;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'CAMBIAR_IPS_SEDE', 'sedes', p_sede, jsonb_build_object('ips', v_ips));

  return jsonb_build_object('ok', true);
end;
$$;

-- Resumen de accesos de todo el personal, para la pantalla del super administrador.
create or replace function public.accesos_personal()
returns table (user_id uuid, permisos jsonb, ip_sede boolean, ips text[], superadmin boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id,
         coalesce(p.permisos, '{}'::jsonb),
         coalesce(p.ip_sede, false),
         coalesce(p.ips, '{}'),
         exists (select 1 from public.superadmins s where s.user_id = u.id),
         p.updated_at
  from public.users u
  left join public.permisos_personal p on p.user_id = u.id
  where u.rol <> 'cliente' and public.es_superadmin();
$$;

create or replace function public.ip_diagnostico()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  h jsonb;
begin
  if not public.es_superadmin() then return null; end if;
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  return jsonb_build_object(
    'ip', public.ip_actual(),
    'cf_connecting_ip', h ->> 'cf-connecting-ip',
    'x_real_ip', h ->> 'x-real-ip',
    'x_forwarded_for', h ->> 'x-forwarded-for',
    'por_servidor', (h ->> 'x-atk-ip') is not null
  );
end;
$$;

revoke all on function public.accesos_personal() from public, anon;
grant execute on function public.accesos_personal() to authenticated;
revoke all on function public.es_superadmin() from anon;
