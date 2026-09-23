-- ============================================================
--  EL CLIENTE VEIA SU BLOQUE EN BLANCO
--
--  mis_comisiones() corria con los permisos de quien la llama, y las
--  tablas de bloques solo las puede leer el equipo. Resultado: al
--  cliente le salia el bloque en null y solo los bancos donde ya
--  tenia tarjeta o una tarifa especial; los demas bancos de su
--  bloque no aparecian.
--
--  Se marca como funcion de servidor. No abre nada: la funcion
--  resuelve el cliente por auth.uid() y solo devuelve lo suyo.
-- ============================================================

create or replace function public.mis_comisiones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_bloque  text;
begin
  select id into v_cliente from public.perfiles_cliente where user_id = auth.uid();
  if v_cliente is null then
    return jsonb_build_object('bloque', null, 'bancos', '[]'::jsonb);
  end if;

  select b.nombre into v_bloque
  from public.perfiles_cliente p
  join public.bloques_comision b on b.id = p.bloque_id
  where p.id = v_cliente;

  return jsonb_build_object(
    'bloque', v_bloque,
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'banco', x.banco,
               'porcentaje', public.comision_efectiva(v_cliente, x.banco),
               'especial', public.origen_comision(v_cliente, x.banco) = 'especial',
               'con_tarjeta', x.con_tarjeta
             ) order by x.con_tarjeta desc, x.banco)
      from (
        select bb.banco,
               exists (select 1 from public.tarjetas t
                        where t.cliente_id = v_cliente and t.activa = true
                          and t.estado = 'aprobado' and t.banco = bb.banco) as con_tarjeta
        from (
          select banco from public.bloques_comision_banco bb2
          join public.perfiles_cliente p on p.bloque_id = bb2.bloque_id
          where p.id = v_cliente
          union
          select banco from public.comisiones_cliente where cliente_id = v_cliente
          union
          select banco from public.tarjetas
           where cliente_id = v_cliente and activa = true and estado = 'aprobado'
        ) bb
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.mis_comisiones() to authenticated;
revoke execute on function public.mis_comisiones() from anon;

notify pgrst, 'reload schema';
