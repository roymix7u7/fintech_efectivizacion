-- ============================================================
--  EL SUPERVISOR MIRA, NO SE QUEDA CON EL CASO
--
--  resolver_caso ya exigia puede_resolver(), pero tomar_caso y
--  tomar_siguiente seguian pidiendo solo es_staff(). El efecto no era
--  cosmetico: cuando un supervisor abria una ficha de la cola, el
--  sistema se la asignaba, asi que la ficha decia "tuya" y, peor, el
--  gestor que la tenia la perdia de sus casos. Un supervisor pasando
--  revista a la cola le vaciaba la lista a su equipo.
--
--  Ahora:
--
--  - tomar_caso, para quien no resuelve, no escribe nada y responde
--    SOLO_LECTURA. No es un error: entrar a mirar es legitimo, solo
--    que no reserva.
--
--  - tomar_siguiente se rechaza: pedir el proximo caso no tiene
--    sentido para quien no va a resolverlo.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Abrir un caso: solo reserva quien puede resolverlo
-- ------------------------------------------------------------
create or replace function public.tomar_caso(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_vence  timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
  v_estado text;
  v_quien  uuid;
  v_desde  timestamptz;
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- El supervisor entra a ver como va el trabajo y quien atiende cada
  -- caso. Mirar no reserva: si reservara, le quitaria el caso al
  -- gestor que lo tiene entre manos.
  if not public.puede_resolver() then
    if p_tipo = 'solicitud' then
      select asignado_a, asignado_en into v_quien, v_desde
        from public.solicitudes where id = p_id;
    elsif p_tipo = 'tarjeta' then
      select asignado_a, asignado_en into v_quien, v_desde
        from public.tarjetas where id = p_id;
    elsif p_tipo = 'kyc' then
      select asignado_a, asignado_en into v_quien, v_desde
        from public.users where id = p_id;
    else
      raise exception 'Tipo no valido: %', p_tipo;
    end if;

    return jsonb_build_object(
      'ok', false,
      'motivo', 'SOLO_LECTURA',
      'quien', (select email from public.users
                 where id = v_quien and v_desde > v_vence));
  end if;

  -- Se bloquea la fila: si dos abren a la vez, la segunda espera aqui
  -- y encuentra el caso ya tomado en vez de pisarlo.
  if p_tipo = 'solicitud' then
    select estado, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.solicitudes where id = p_id for update;
  elsif p_tipo = 'tarjeta' then
    select estado, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.tarjetas where id = p_id for update;
  elsif p_tipo = 'kyc' then
    select estado::text, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.users where id = p_id for update;
  else
    raise exception 'Tipo no valido: %', p_tipo;
  end if;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE');
  end if;

  -- Ya resuelto: no hay nada que tomar, pero tampoco es un choque.
  if (p_tipo = 'kyc' and v_estado not in ('pendiente', 'observado'))
     or (p_tipo <> 'kyc' and v_estado <> 'pendiente') then
    return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado);
  end if;

  -- De otra persona y con la reserva viva: se mira, no se toca.
  if v_quien is not null and v_quien <> v_yo and v_desde > v_vence then
    return jsonb_build_object(
      'ok', false, 'motivo', 'TOMADO',
      'quien', (select email from public.users where id = v_quien),
      'libre_en', ceil(extract(epoch from (v_desde - v_vence)) / 60));
  end if;

  -- Libre, vencido o ya mio: pasa a mis manos y se renueva el reloj.
  if p_tipo = 'solicitud' then
    update public.solicitudes set asignado_a = v_yo, asignado_en = now() where id = p_id;
  elsif p_tipo = 'tarjeta' then
    update public.tarjetas set asignado_a = v_yo, asignado_en = now() where id = p_id;
  else
    update public.users set asignado_a = v_yo, asignado_en = now() where id = p_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;


-- ------------------------------------------------------------
-- 2) Pedir el proximo caso: solo para quien lo va a resolver
-- ------------------------------------------------------------
create or replace function public.tomar_siguiente(p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_yo      uuid := auth.uid();
  v_vence   timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
begin
  -- Pedir el proximo caso no tiene sentido para quien no va a
  -- resolverlo: el supervisor mira la cola, no la consume.
  if not public.puede_resolver() then
    raise exception 'Un supervisor puede ver la cola, pero atender es del gestor.'
      using errcode = '42501';
  end if;

  if p_tipo = 'solicitud' then
    select id into v_id from public.solicitudes
     where estado = 'pendiente' and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.solicitudes
     where estado = 'pendiente'
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.solicitudes
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  elsif p_tipo = 'tarjeta' then
    select id into v_id from public.tarjetas
     where estado = 'pendiente' and activa = true
       and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.tarjetas
     where estado = 'pendiente' and activa = true
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.tarjetas
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  elsif p_tipo = 'kyc' then
    select id into v_id from public.users
     where rol = 'cliente' and estado = 'pendiente'
       and asignado_a = v_yo and asignado_en > v_vence
     order by asignado_en limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from public.users
     where rol = 'cliente' and estado = 'pendiente'
       and (asignado_a is null or asignado_en <= v_vence)
     order by created_at
     for update skip locked
     limit 1;
    if v_id is not null then
      update public.users
         set asignado_a = v_yo, asignado_en = now()
       where id = v_id;
    end if;

  else
    raise exception 'Tipo desconocido: %', p_tipo;
  end if;

  return v_id;
end;
$$;

notify pgrst, 'reload schema';
