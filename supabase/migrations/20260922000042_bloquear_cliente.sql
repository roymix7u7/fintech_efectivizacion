-- ============================================================
--  BLOQUEAR Y DESBLOQUEAR A UN CLIENTE
--
--  Hasta ahora no habia forma de hacerlo. El estado existia y el app
--  lo respetaba, pero ningun boton lo escribia para un cliente: el
--  unico "Bloquear" del panel vive en Equipo, y esa lista solo trae
--  personal. Un cliente que mandaba comprobantes falsos seguia
--  entrando y enviando solicitudes.
--
--  Quien puede: supervisor y administrador. El gestor revisa
--  documentos; cerrarle la cuenta a alguien es otra cosa.
--
--  Sirve en cualquier estado, tambien con la cuenta ya aprobada: el
--  motivo para cerrar una cuenta suele aparecer despues de haberla
--  abierto.
--
--  Al desbloquear se vuelve a donde estaba: activo si su identidad
--  ya estaba verificada, y pendiente si nunca se reviso.
-- ============================================================


-- ------------------------------------------------------------
-- 1) De quien fue la decision y por que
--    Aparte de motivo_observacion, que es para pedir documentos
--    de nuevo. Mezclarlos haria que un bloqueo se leyera en el app
--    como "corrige tu DNI".
-- ------------------------------------------------------------
alter table public.perfiles_cliente
  add column if not exists motivo_bloqueo text,
  add column if not exists bloqueado_por  uuid references public.users(id),
  add column if not exists bloqueado_en   timestamptz;


-- ------------------------------------------------------------
-- 2) La accion
-- ------------------------------------------------------------
create or replace function public.bloquear_cliente(
  p_id       uuid,
  p_bloquear boolean,
  p_motivo   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_rol     text;
  v_estado  text;
  v_validado uuid;
  v_nuevo   text;
begin
  if not public.es_supervisor() then
    raise exception 'Bloquear una cuenta es del supervisor o del administrador.'
      using errcode = '42501';
  end if;

  select u.rol::text, u.estado::text, p.validado_por
    into v_rol, v_estado, v_validado
  from public.users u
  left join public.perfiles_cliente p on p.user_id = u.id
  where u.id = p_id
  for update of u;

  if v_rol is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0001';
  end if;
  -- El personal se bloquea desde Equipo, donde estan las reglas de
  -- sede. Esta funcion es solo para clientes.
  if v_rol <> 'cliente' then
    raise exception 'Esta acción es solo para clientes.' using errcode = 'P0001';
  end if;

  if p_bloquear then
    if v_estado = 'bloqueado' then
      return jsonb_build_object('ok', false, 'motivo', 'YA_BLOQUEADO');
    end if;
    -- El cliente lee este texto al intentar entrar, asi que tiene que
    -- decir algo: "bloqueado" a secas no le explica nada.
    if v_motivo is null or length(v_motivo) < 10 then
      raise exception 'Escribe el motivo del bloqueo (al menos 10 letras).'
        using errcode = 'P0001';
    end if;

    update public.users set estado = 'bloqueado' where id = p_id;
    update public.perfiles_cliente
       set motivo_bloqueo = v_motivo, bloqueado_por = v_yo, bloqueado_en = now()
     where user_id = p_id;

    insert into public.auditoria_logs
      (usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues)
    values (v_yo, 'BLOQUEAR_CLIENTE', 'users', p_id,
            jsonb_build_object('estado', v_estado),
            jsonb_build_object('estado', 'bloqueado', 'motivo', v_motivo));

    return jsonb_build_object('ok', true, 'estado', 'bloqueado');
  end if;

  -- ── Desbloquear ──
  if v_estado <> 'bloqueado' then
    return jsonb_build_object('ok', false, 'motivo', 'NO_BLOQUEADO');
  end if;

  -- Vuelve a donde estaba: si su identidad ya se habia verificado,
  -- activo; si nunca se reviso, de vuelta a la cola.
  v_nuevo := case when v_validado is not null then 'activo' else 'pendiente' end;

  update public.users set estado = v_nuevo::public.estado_usuario where id = p_id;
  update public.perfiles_cliente
     set motivo_bloqueo = null, bloqueado_por = null, bloqueado_en = null
   where user_id = p_id;

  insert into public.auditoria_logs
    (usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (v_yo, 'DESBLOQUEAR_CLIENTE', 'users', p_id,
          jsonb_build_object('estado', 'bloqueado'),
          jsonb_build_object('estado', v_nuevo));

  if v_nuevo = 'activo' then
    insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
    values (p_id, 'cuenta_activa', 'Tu cuenta volvió a estar activa',
            'Ya puedes operar con normalidad.');
  end if;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end;
$$;

grant execute on function public.bloquear_cliente(uuid, boolean, text) to authenticated;
revoke execute on function public.bloquear_cliente(uuid, boolean, text) from anon;

notify pgrst, 'reload schema';
