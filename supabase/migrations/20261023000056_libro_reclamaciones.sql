-- ============================================================
--  LIBRO DE RECLAMACIONES VIRTUAL
--
--  Código de Protección y Defensa del Consumidor y su reglamento del
--  Libro de Reclamaciones (Indecopi). La hoja lleva:
--    - el proveedor (razón social, RUC, domicilio: en la app y la web),
--    - número correlativo y fecha,
--    - el consumidor (nombre, documento, domicilio, teléfono, correo;
--      padre o madre si es menor de edad),
--    - el servicio contratado y el monto reclamado,
--    - si es RECLAMO (disconformidad con el servicio) o QUEJA (malestar
--      con la atención), el detalle y lo que pide,
--    - la respuesta del proveedor y su fecha.
--  Plazo de respuesta: 15 días hábiles. [Confirmar con asesoría legal.]
--
--  Se puede registrar SIN cuenta (desde la web): por eso
--  registrar_reclamo() es la única función abierta a "anon".
-- ============================================================

-- De paso: las 5 funciones que el asesor de Supabase marcaba sin
-- search_path fijo.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('update_updated_at', 'reserva_minutos', 'noticia_vigente', 'pagos_reserva_minutos', 'sumar_dias_habiles')
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

create sequence if not exists public.reclamaciones_numero;

create table if not exists public.reclamaciones (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint not null default nextval('public.reclamaciones_numero') unique,
  -- "000001-2026": lo que el consumidor anota y cita.
  codigo            text generated always as (lpad(numero::text, 6, '0') || '-' || extract(year from (creado_en at time zone 'America/Lima'))::int::text) stored,
  creado_en         timestamptz not null default now(),
  vence_en          timestamptz not null default public.sumar_dias_habiles(now(), 15),
  tipo              text not null check (tipo in ('reclamo', 'queja')),
  -- Consumidor
  nombres           text not null check (length(trim(nombres)) between 3 and 150),
  tipo_documento    text not null check (tipo_documento in ('dni', 'ce', 'pasaporte')),
  numero_documento  text not null check (numero_documento ~ '^[A-Za-z0-9]{6,15}$'),
  domicilio         text not null check (length(trim(domicilio)) between 5 and 250),
  telefono          text check (telefono is null or telefono ~ '^\+?[0-9 ]{6,20}$'),
  correo            text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(correo) <= 150),
  menor_edad        boolean not null default false,
  apoderado         text check (apoderado is null or length(trim(apoderado)) between 3 and 150),
  -- Lo contratado
  descripcion_bien  text not null check (length(trim(descripcion_bien)) between 3 and 300),
  monto             numeric(12, 2) check (monto is null or monto >= 0),
  -- Lo que reclama
  detalle           text not null check (length(trim(detalle)) between 20 and 3000),
  pedido            text not null check (length(trim(pedido)) between 5 and 1000),
  -- Quién y desde dónde
  user_id           uuid references public.users(id),
  origen            text not null default 'web' check (origen in ('app', 'web')),
  -- Respuesta del proveedor
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'respondido')),
  respuesta         text check (respuesta is null or length(respuesta) <= 3000),
  respondido_en     timestamptz,
  respondido_por    uuid references public.users(id),
  check (not menor_edad or apoderado is not null)
);

create index if not exists reclamaciones_usuario_idx on public.reclamaciones (user_id, creado_en desc);
create index if not exists reclamaciones_estado_idx on public.reclamaciones (estado, vence_en);

alter table public.reclamaciones enable row level security;

drop policy if exists reclamaciones_lectura on public.reclamaciones;
create policy reclamaciones_lectura on public.reclamaciones
  for select to authenticated
  using (user_id = auth.uid() or public.es_admin() or public.es_supervisor());

grant select on public.reclamaciones to authenticated;

-- ── Registrar (con o sin cuenta) ──
create or replace function public.registrar_reclamo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.reclamaciones;
  v_correo text := lower(trim(coalesce(p->>'correo', '')));
  v_recientes int;
begin
  -- Freno a quien llene el libro de basura: 5 por correo al día.
  select count(*) into v_recientes from public.reclamaciones
  where correo = v_correo and creado_en > now() - interval '1 day';
  if v_recientes >= 5 then
    raise exception 'Ya registraste varios reclamos hoy con ese correo. Si es urgente, escríbenos a contacto@altoqueperu.com.'
      using errcode = 'P0001';
  end if;

  insert into public.reclamaciones (
    tipo, nombres, tipo_documento, numero_documento, domicilio, telefono, correo,
    menor_edad, apoderado, descripcion_bien, monto, detalle, pedido, user_id, origen
  ) values (
    p->>'tipo',
    trim(p->>'nombres'),
    coalesce(p->>'tipo_documento', 'dni'),
    upper(regexp_replace(coalesce(p->>'numero_documento', ''), '\s', '', 'g')),
    trim(p->>'domicilio'),
    nullif(trim(coalesce(p->>'telefono', '')), ''),
    v_correo,
    coalesce((p->>'menor_edad')::boolean, false),
    nullif(trim(coalesce(p->>'apoderado', '')), ''),
    trim(p->>'descripcion_bien'),
    nullif(p->>'monto', '')::numeric,
    trim(p->>'detalle'),
    trim(p->>'pedido'),
    auth.uid(),
    case when p->>'origen' = 'app' then 'app' else 'web' end
  )
  returning * into v;

  if v.user_id is not null then
    insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
    values (v.user_id, 'reclamo', format('Registramos tu %s N.° %s', v.tipo, v.codigo),
            format('Te responderemos a más tardar el %s.', to_char(v.vence_en at time zone 'America/Lima', 'DD/MM/YYYY')));
  end if;

  return jsonb_build_object('ok', true, 'id', v.id, 'codigo', v.codigo, 'creado_en', v.creado_en, 'vence_en', v.vence_en);
end;
$$;

revoke all on function public.registrar_reclamo(jsonb) from public;
grant execute on function public.registrar_reclamo(jsonb) to anon, authenticated;

-- ── Responder (administrador o supervisor) ──
create or replace function public.responder_reclamo(p_id uuid, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.reclamaciones;
  v_resp text := nullif(trim(coalesce(p_respuesta, '')), '');
begin
  if not (public.es_admin() or public.es_supervisor()) then
    raise exception 'Responder reclamos es del administrador o el supervisor.' using errcode = '42501';
  end if;
  if v_resp is null or length(v_resp) < 20 then
    raise exception 'La respuesta debe explicar qué se hizo (al menos 20 letras).' using errcode = 'P0001';
  end if;

  update public.reclamaciones
  set estado = 'respondido', respuesta = v_resp, respondido_en = now(), respondido_por = auth.uid()
  where id = p_id and estado = 'pendiente'
  returning * into v;
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'YA_RESPONDIDO');
  end if;

  if v.user_id is not null then
    insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
    values (v.user_id, 'reclamo', format('Respondimos tu %s N.° %s', v.tipo, v.codigo), v_resp);
  end if;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'RESPONDER_RECLAMO', 'reclamaciones', v.id, jsonb_build_object('codigo', v.codigo));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.responder_reclamo(uuid, text) from public, anon;
grant execute on function public.responder_reclamo(uuid, text) to authenticated;
