-- ============================================================
--  CONSERVACIÓN POR PLAZOS Y CONSENTIMIENTO DE PROMOCIONES
--
--  Política de privacidad 1.0:
--    - Fotos de verificación y de tarjetas: 5 años desde la última
--      operación.
--    - Datos de identidad y registro de operaciones: 10 años.
--    - Si la ley obliga a conservar algo tras pedir la eliminación, se
--      bloquea para cualquier otro uso.
--
--  Al eliminar la cuenta de alguien que YA OPERÓ:
--    - sus fotos se mueven al bucket privado "conservados", que solo
--      lee el administrador (lo hace la función eliminar-cuenta);
--    - su nombre y documento quedan en datos_conservados, también solo
--      para el administrador, con sus fechas límite;
--    - el resto se anonimiza igual que antes y pierde el acceso.
--  Si nunca operó, se borra todo como antes.
--
--  Cada día, pg_cron llama a la función purgar-conservados, que borra
--  lo vencido. La llamada se valida con una clave que vive solo en la
--  bóveda (vault) de la base: ni el repositorio ni nadie la ve.
--
--  Promociones: casilla opcional, desmarcada por defecto. Solo quien
--  la acepta recibe promociones en el teléfono, y la puede retirar
--  cuando quiera desde Mi cuenta.
-- ============================================================

create extension if not exists pg_cron;

-- ── Fotos bloqueadas ──
insert into storage.buckets (id, name, public, file_size_limit)
values ('conservados', 'conservados', false, 10485760)
on conflict (id) do update set public = false;

drop policy if exists storage_conservados_admin on storage.objects;
create policy storage_conservados_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'conservados' and public.es_admin());

-- ── Identidad conservada ──
create table if not exists public.datos_conservados (
  user_id            uuid primary key,
  perfil_id          uuid,
  nombres            text,
  apellidos          text,
  tipo_documento     text,
  documento          text,
  ultima_operacion   timestamptz not null,
  -- Rutas dentro del bucket "conservados".
  fotos              jsonb not null default '[]'::jsonb,
  fotos_hasta        timestamptz not null,
  datos_hasta        timestamptz not null,
  fotos_purgadas_en  timestamptz,
  creado_en          timestamptz not null default now()
);

alter table public.datos_conservados enable row level security;
drop policy if exists datos_conservados_admin on public.datos_conservados;
create policy datos_conservados_admin on public.datos_conservados
  for select to authenticated using (public.es_admin());
grant select on public.datos_conservados to authenticated;

-- ── Lo que le conservaríamos a quien pregunta (Mis datos) ──
create or replace function public.mi_retencion()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select max(s.created_at) as ultima
    from public.solicitudes s
    join public.perfiles_cliente p on p.id = s.cliente_id
    where p.user_id = auth.uid()
  )
  select jsonb_build_object(
    'opero', u.ultima is not null,
    'ultima_operacion', u.ultima,
    'fotos_hasta', u.ultima + interval '5 years',
    'datos_hasta', u.ultima + interval '10 years'
  )
  from u
  where auth.uid() is not null;
$$;

revoke all on function public.mi_retencion() from public, anon;
grant execute on function public.mi_retencion() to authenticated;

-- ── Anonimizar, ahora guardando lo que hay que conservar ──
drop function if exists public.anonimizar_cliente(uuid);

create or replace function public.anonimizar_cliente(p_solicitud uuid, p_fotos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.solicitudes_datos;
  v_perfil public.perfiles_cliente;
  v_abiertas int;
  v_ultima timestamptz;
begin
  if not public.es_admin() then
    raise exception 'Eliminar cuentas es del administrador.' using errcode = '42501';
  end if;

  select * into v from public.solicitudes_datos where id = p_solicitud for update;
  if v.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = 'P0001';
  end if;
  if v.estado = 'completada' then
    return jsonb_build_object('ok', true, 'motivo', 'YA_COMPLETADA');
  end if;
  if v.estado not in ('pendiente', 'en_proceso') then
    raise exception 'La solicitud está %, no se puede ejecutar.', v.estado using errcode = 'P0001';
  end if;

  select * into v_perfil from public.perfiles_cliente where user_id = v.user_id;

  -- Lo que está en curso se termina antes: no se deja a nadie sin pagar.
  select count(*) into v_abiertas from public.solicitudes
  where cliente_id = v_perfil.id and estado in ('pendiente', 'aprobado');
  if v_abiertas > 0 then
    raise exception 'Tiene % solicitud(es) en curso. Resuélvelas antes de eliminar la cuenta.', v_abiertas
      using errcode = 'P0001';
  end if;

  -- Si operó, su identidad y sus fotos se conservan bloqueadas.
  select max(created_at) into v_ultima from public.solicitudes where cliente_id = v_perfil.id;
  if v_ultima is not null then
    insert into public.datos_conservados (
      user_id, perfil_id, nombres, apellidos, tipo_documento, documento,
      ultima_operacion, fotos, fotos_hasta, datos_hasta
    ) values (
      v.user_id, v_perfil.id, v_perfil.nombres, v_perfil.apellidos, v_perfil.tipo_documento, v_perfil.dni,
      v_ultima, coalesce(p_fotos, '[]'::jsonb), v_ultima + interval '5 years', v_ultima + interval '10 years'
    )
    on conflict (user_id) do update set
      fotos = case when jsonb_array_length(excluded.fotos) > 0 then excluded.fotos else datos_conservados.fotos end;
  end if;

  if v_perfil.id is not null then
    update public.perfiles_cliente set
      nombres = 'Cuenta',
      apellidos = 'eliminada',
      tipo_documento = 'dni',
      dni = '00000000',
      telefono = null,
      direccion = null,
      codigo_promo = null,
      foto_dni_frontal = null,
      foto_dni_posterior = null,
      foto_selfie = null,
      motivo_observacion = null,
      acepta_promociones = false,
      motivo_bloqueo = 'Cuenta eliminada a pedido del titular',
      bloqueado_por = auth.uid(),
      bloqueado_en = now()
    where id = v_perfil.id;

    update public.tarjetas set foto_tarjeta = null, foto_reverso = null, nombre_impreso = null, activa = false
    where cliente_id = v_perfil.id;
    update public.cuentas_bancarias set activa = false where cliente_id = v_perfil.id;
    delete from public.comisiones_cliente where cliente_id = v_perfil.id;
  end if;

  update public.users
  set estado = 'bloqueado', email = 'eliminado+' || v.user_id::text || '@altoqueperu.invalid'
  where id = v.user_id;

  delete from public.notificaciones where user_id = v.user_id;
  delete from public.push_tokens where user_id = v.user_id;
  delete from public.alertas_vistas where user_id = v.user_id;

  update public.solicitudes_datos
  set estado = 'completada', atendida_por = auth.uid(), atendida_en = now()
  where id = v.id;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'ELIMINAR_CUENTA', 'solicitudes_datos', v.id,
          jsonb_build_object('cliente', v.user_id, 'perfil', v_perfil.id, 'conservado', v_ultima is not null,
                             'fotos_conservadas', jsonb_array_length(coalesce(p_fotos, '[]'::jsonb))));

  return jsonb_build_object(
    'ok', true,
    'user_id', v.user_id,
    'conservado', v_ultima is not null,
    'fotos_hasta', v_ultima + interval '5 years',
    'datos_hasta', v_ultima + interval '10 years'
  );
end;
$$;

revoke all on function public.anonimizar_cliente(uuid, jsonb) from public, anon;
grant execute on function public.anonimizar_cliente(uuid, jsonb) to authenticated;

-- ── Clave de la purga diaria (solo en la bóveda) ──
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'purga_conservados') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'purga_conservados',
                                'Valida la llamada diaria de pg_cron a purgar-conservados');
  end if;
end $$;

-- La función purgar-conservados pregunta aquí si la clave que recibió es
-- la correcta, sin que la clave salga de la base.
create or replace function public.verificar_purga(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'purga_conservados' and decrypted_secret = p_clave
  );
$$;

revoke all on function public.verificar_purga(text) from public, anon, authenticated;
grant execute on function public.verificar_purga(text) to service_role;

-- ── Purga diaria: 3:00 a. m. de Lima (08:00 UTC) ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purgar-conservados') then
    perform cron.unschedule('purgar-conservados');
  end if;
end $$;

select cron.schedule(
  'purgar-conservados',
  '0 8 * * *',
  $cron$
    select net.http_post(
      url := 'https://zsrjctabxqrgunlzvzru.supabase.co/functions/v1/purgar-conservados',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-purga', (select decrypted_secret from vault.decrypted_secrets where name = 'purga_conservados')
      ),
      timeout_milliseconds := 60000
    );
  $cron$
);

-- ── Promociones ──
alter table public.perfiles_cliente
  add column if not exists acepta_promociones boolean not null default false,
  add column if not exists promociones_actualizado_en timestamptz;

create or replace function public.fijar_promociones(p_acepta boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.perfiles_cliente
  set acepta_promociones = coalesce(p_acepta, false), promociones_actualizado_en = now()
  where user_id = auth.uid()
  returning id into v_id;
  if v_id is null then
    raise exception 'No encontramos tu perfil.' using errcode = 'P0001';
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), case when p_acepta then 'ACEPTA_PROMOCIONES' else 'RETIRA_PROMOCIONES' end,
          'perfiles_cliente', v_id, jsonb_build_object('acepta_promociones', coalesce(p_acepta, false)));
  return jsonb_build_object('ok', true, 'acepta', coalesce(p_acepta, false));
end;
$$;

revoke all on function public.fijar_promociones(boolean) from public, anon;
grant execute on function public.fijar_promociones(boolean) to authenticated;
