-- ============================================================
--  DAR DE BAJA UNA TARJETA DESDE EL PANEL
--
--  Desde el app la tarjeta ya no se edita ni se da de baja (migración
--  47): el cliente lee "para darla de baja, habla con un asesor". Esta
--  es la otra mitad: el asesor lo hace desde el panel, con un motivo,
--  el cliente recibe el aviso y queda en auditoría.
--
--  Quién: el gestor (es quien atiende al cliente), el supervisor y el
--  administrador. El área de pagos no toca tarjetas.
-- ============================================================

create or replace function public.dar_de_baja_tarjeta(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_t      record;
begin
  if not (public.puede_resolver() or public.es_supervisor()) then
    raise exception 'Dar de baja una tarjeta es del gestor, el supervisor o el administrador.'
      using errcode = '42501';
  end if;

  -- El cliente lee el motivo en su app: tiene que decir algo.
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Escribe el motivo de la baja (al menos 10 letras).' using errcode = 'P0001';
  end if;

  select t.id, t.banco, t.ultimos_4, t.activa, p.user_id
    into v_t
  from public.tarjetas t
  join public.perfiles_cliente p on p.id = t.cliente_id
  where t.id = p_id
  for update of t;

  if v_t.id is null then
    raise exception 'Esa tarjeta no existe.' using errcode = 'P0001';
  end if;
  if not v_t.activa then
    return jsonb_build_object('ok', false, 'motivo', 'YA_DE_BAJA');
  end if;

  update public.tarjetas set activa = false where id = p_id;

  insert into public.notificaciones (user_id, tipo, titulo, cuerpo)
  values (
    v_t.user_id,
    'tarjeta',
    'Tarjeta dada de baja',
    format('Tu tarjeta %s ···· %s ya no está registrada. Motivo: %s', v_t.banco, v_t.ultimos_4, v_motivo)
  );

  insert into public.auditoria_logs
    (usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (v_yo, 'BAJA_TARJETA', 'tarjetas', p_id,
          jsonb_build_object('activa', true),
          jsonb_build_object('activa', false, 'motivo', v_motivo));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dar_de_baja_tarjeta(uuid, text) from public, anon;
grant execute on function public.dar_de_baja_tarjeta(uuid, text) to authenticated;
