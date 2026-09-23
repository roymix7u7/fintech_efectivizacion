-- ============================================================
--  BORRA TODOS LOS DATOS DE PRUEBA
--
--  Solo toca lo que creo datos-prueba.sql. Para los clientes exige a
--  la vez el dominio @prueba.altoque.pe y el codigo DATOS_PRUEBA: un
--  cliente real no cumple las dos cosas, asi que no puede borrarse
--  por error.
--
--  No borra el bloque "Preferentes" ni los gestores reales: el
--  bloque puede quedarte util, y si quieres quitarlo se borra desde
--  el panel.
-- ============================================================

do $$
declare
  v_ids      uuid[];
  v_perfiles uuid[];
  v_staff    uuid[];
  v_sols     uuid[];
begin
  select array_agg(u.id), array_agg(p.id)
    into v_ids, v_perfiles
  from public.users u
  join public.perfiles_cliente p on p.user_id = u.id
  where u.email like '%@prueba.altoque.pe'
    and p.codigo_promo = 'DATOS_PRUEBA';

  select array_agg(id) into v_staff
  from public.users
  where email like '%@prueba.altoque.pe' and rol <> 'cliente';

  if v_ids is null and v_staff is null then
    raise notice 'No hay datos de prueba que borrar.';
    return;
  end if;

  if v_perfiles is not null then
    select array_agg(id) into v_sols
      from public.solicitudes where cliente_id = any(v_perfiles);

    -- Primero lo que apunta a las solicitudes, y despues ellas.
    delete from public.pagos_eventos where solicitud_id = any(coalesce(v_sols, '{}'));
    delete from public.solicitudes where cliente_id = any(v_perfiles);
    delete from public.tarjetas where cliente_id = any(v_perfiles);
    delete from public.cuentas_bancarias where cliente_id = any(v_perfiles);
    delete from public.comisiones_cliente where cliente_id = any(v_perfiles);
    delete from public.observaciones
     where entidad = 'perfiles_cliente' and entidad_id = any(v_perfiles);
  end if;

  -- Lotes que quedaron sin ninguna solicitud dentro.
  delete from public.lotes_pago l
   where not exists (select 1 from public.pagos_eventos e where e.lote_id = l.id);

  if v_ids is not null then
    delete from public.notificaciones where user_id = any(v_ids);
    delete from public.alertas_vistas where user_id = any(v_ids);
    delete from public.perfiles_cliente where id = any(v_perfiles);
    delete from public.users where id = any(v_ids);
    delete from auth.identities where user_id = any(v_ids);
    delete from auth.users where id = any(v_ids);
  end if;

  if v_staff is not null then
    delete from public.pagos_bancos where user_id = any(v_staff);
    delete from public.auditoria_logs where usuario_id = any(v_staff);
    delete from public.users where id = any(v_staff);
    delete from auth.identities where user_id = any(v_staff);
    delete from auth.users where id = any(v_staff);
  end if;

  raise notice 'Borrados: % clientes y % cuentas de equipo de prueba.',
    coalesce(array_length(v_ids, 1), 0), coalesce(array_length(v_staff, 1), 0);
end $$;
