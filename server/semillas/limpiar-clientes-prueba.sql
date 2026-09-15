-- ============================================================
--  BORRA LOS CLIENTES DE PRUEBA
--
--  Solo toca lo creado por clientes-prueba.sql: exige a la vez el
--  dominio @prueba.altoque.pe y el codigo DATOS_PRUEBA. Un cliente
--  real no cumple las dos cosas, asi que no puede borrarse por error.
--
--  Si durante la prueba alguno envio tarjetas o solicitudes, se
--  borran tambien, junto con su rastro en la cola.
-- ============================================================

do $$
declare
  v_ids uuid[];
  v_perfiles uuid[];
begin
  select array_agg(u.id), array_agg(p.id)
    into v_ids, v_perfiles
  from public.users u
  join public.perfiles_cliente p on p.user_id = u.id
  where u.email like '%@prueba.altoque.pe'
    and p.codigo_promo = 'DATOS_PRUEBA';

  if v_ids is null then
    raise notice 'No hay clientes de prueba que borrar.';
    return;
  end if;

  delete from public.solicitudes where cliente_id = any(v_perfiles);
  delete from public.tarjetas where cliente_id = any(v_perfiles);
  delete from public.cuentas_bancarias where cliente_id = any(v_perfiles);
  delete from public.notificaciones where user_id = any(v_ids);
  delete from public.perfiles_cliente where id = any(v_perfiles);
  delete from public.users where id = any(v_ids);
  delete from auth.identities where user_id = any(v_ids);
  delete from auth.users where id = any(v_ids);

  raise notice 'Clientes de prueba borrados: %', array_length(v_ids, 1);
end $$;
