-- ============================================================
--  DIRECTORIO DE CLIENTES: GESTOR LO VE, SUPERVISOR EDITA
-- ============================================================
--  1. El gestor puede ver el Directorio (buscar_clientes, ficha_cliente),
--     solo para leer.
--  2. Supervisor y administrador corrigen los datos de un cliente con
--     editar_datos_cliente: nombres, apellidos, documento, celular y
--     dirección. El CORREO no se toca (es su usuario para ingresar).
--     Cada cambio queda en la auditoría con lo de antes y lo de después.
--  3. El gestor no puede cambiar esos datos ni saltándose el panel: el
--     disparador los deja como estaban (sigue pudiendo hacer su trabajo de
--     verificación, que no los toca).
--
--  Se puede ejecutar más de una vez.
-- ============================================================

begin;

-- 1) Quién ve el Directorio: supervisor/admin, pagos y gestor.
create or replace function public.puede_ver_clientes()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.es_supervisor() or public.es_pagos() or coalesce((
    select rol = 'gestor' and estado <> 'bloqueado'
      from public.users where id = auth.uid()
  ), false);
$$;

-- 3) Datos personales del cliente: solo él mismo, supervisor/admin o el
--    servidor. Al gestor se le devuelven como estaban.
create or replace function public.perfiles_proteger_datos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_staff() and not public.es_supervisor() and new.user_id <> auth.uid() then
    new.nombres        := old.nombres;
    new.apellidos      := old.apellidos;
    new.tipo_documento := old.tipo_documento;
    new.dni            := old.dni;
    new.telefono       := old.telefono;
    new.direccion      := old.direccion;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_perfiles_proteger_datos on public.perfiles_cliente;
create trigger tr_perfiles_proteger_datos
  before update on public.perfiles_cliente
  for each row execute function public.perfiles_proteger_datos();

revoke execute on function public.perfiles_proteger_datos() from public, anon, authenticated;

-- 2) Editar los datos de un cliente (supervisor y administrador).
--    p_datos: { nombres, apellidos, tipo_documento, dni, telefono, direccion }
--    Solo se cambian las claves que vengan; lo demás queda igual.
create or replace function public.editar_datos_cliente(p_cliente uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  public.perfiles_cliente%rowtype;
  v_nombres   text;
  v_apellidos text;
  v_tipo      text;
  v_dni       text;
  v_telefono  text;
  v_direccion text;
  v_cambios_antes   jsonb := '{}'::jsonb;
  v_cambios_despues jsonb := '{}'::jsonb;
begin
  if not public.es_supervisor() or auth.uid() is null then
    raise exception 'Solo un supervisor o el administrador puede editar los datos del cliente.' using errcode = '42501';
  end if;

  select * into v_antes from public.perfiles_cliente where id = p_cliente for update;
  if not found then
    raise exception 'No existe ese cliente.' using errcode = 'P0002';
  end if;

  v_nombres   := coalesce(nullif(regexp_replace(trim(p_datos->>'nombres'), '\s+', ' ', 'g'), ''), v_antes.nombres);
  v_apellidos := coalesce(nullif(regexp_replace(trim(p_datos->>'apellidos'), '\s+', ' ', 'g'), ''), v_antes.apellidos);
  v_tipo      := coalesce(nullif(lower(trim(p_datos->>'tipo_documento')), ''), v_antes.tipo_documento);
  v_dni       := coalesce(nullif(regexp_replace(coalesce(p_datos->>'dni', ''), '\D', '', 'g'), ''), v_antes.dni);
  v_direccion := case when p_datos ? 'direccion' then nullif(regexp_replace(trim(p_datos->>'direccion'), '\s+', ' ', 'g'), '') else v_antes.direccion end;
  v_telefono  := v_antes.telefono;
  if p_datos ? 'telefono' then
    v_telefono := right(regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g'), 9);
    if v_telefono !~ '^9\d{8}$' then
      raise exception 'El celular debe tener 9 dígitos y empezar con 9.' using errcode = '22023';
    end if;
    v_telefono := '+51' || v_telefono;
  end if;

  if length(v_nombres) not between 2 and 80 or v_nombres !~ '^[[:alpha:]ÁÉÍÓÚÜÑáéíóúüñ'' .-]+$' then
    raise exception 'Revisa los nombres: solo letras, de 2 a 80.' using errcode = '22023';
  end if;
  if length(v_apellidos) not between 2 and 80 or v_apellidos !~ '^[[:alpha:]ÁÉÍÓÚÜÑáéíóúüñ'' .-]+$' then
    raise exception 'Revisa los apellidos: solo letras, de 2 a 80.' using errcode = '22023';
  end if;
  if v_tipo not in ('dni', 'ce') then
    raise exception 'El tipo de documento es DNI o carnet de extranjería.' using errcode = '22023';
  end if;
  if (v_tipo = 'dni' and v_dni !~ '^\d{8}$') or (v_tipo = 'ce' and v_dni !~ '^\d{9}$') then
    raise exception '%', case when v_tipo = 'dni' then 'El DNI tiene 8 dígitos.' else 'El carnet de extranjería tiene 9 dígitos.' end
      using errcode = '22023';
  end if;
  if v_dni <> v_antes.dni and exists (select 1 from public.perfiles_cliente where dni = v_dni and id <> p_cliente) then
    raise exception 'Ese documento ya pertenece a otro cliente.' using errcode = '23505';
  end if;
  if length(coalesce(v_direccion, '')) > 200 then
    raise exception 'La dirección es muy larga (máximo 200 caracteres).' using errcode = '22023';
  end if;

  -- Solo lo que cambió va a la auditoría.
  if v_nombres   is distinct from v_antes.nombres        then v_cambios_antes := v_cambios_antes || jsonb_build_object('nombres', v_antes.nombres);               v_cambios_despues := v_cambios_despues || jsonb_build_object('nombres', v_nombres); end if;
  if v_apellidos is distinct from v_antes.apellidos      then v_cambios_antes := v_cambios_antes || jsonb_build_object('apellidos', v_antes.apellidos);           v_cambios_despues := v_cambios_despues || jsonb_build_object('apellidos', v_apellidos); end if;
  if v_tipo      is distinct from v_antes.tipo_documento then v_cambios_antes := v_cambios_antes || jsonb_build_object('tipo_documento', v_antes.tipo_documento); v_cambios_despues := v_cambios_despues || jsonb_build_object('tipo_documento', v_tipo); end if;
  if v_dni       is distinct from v_antes.dni            then v_cambios_antes := v_cambios_antes || jsonb_build_object('dni', v_antes.dni);                       v_cambios_despues := v_cambios_despues || jsonb_build_object('dni', v_dni); end if;
  if v_telefono  is distinct from v_antes.telefono       then v_cambios_antes := v_cambios_antes || jsonb_build_object('telefono', v_antes.telefono);             v_cambios_despues := v_cambios_despues || jsonb_build_object('telefono', v_telefono); end if;
  if v_direccion is distinct from v_antes.direccion      then v_cambios_antes := v_cambios_antes || jsonb_build_object('direccion', v_antes.direccion);           v_cambios_despues := v_cambios_despues || jsonb_build_object('direccion', v_direccion); end if;

  if v_cambios_despues = '{}'::jsonb then
    return jsonb_build_object('cambios', 0);
  end if;

  update public.perfiles_cliente
     set nombres = v_nombres, apellidos = v_apellidos, tipo_documento = v_tipo,
         dni = v_dni, telefono = v_telefono, direccion = v_direccion
   where id = p_cliente;

  insert into public.auditoria_logs (usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (auth.uid(), 'EDITAR_DATOS_CLIENTE', 'perfiles_cliente', p_cliente, v_cambios_antes, v_cambios_despues);

  return jsonb_build_object('cambios', (select count(*) from jsonb_object_keys(v_cambios_despues)));
end;
$$;

revoke execute on function public.editar_datos_cliente(uuid, jsonb) from public, anon;
grant execute on function public.editar_datos_cliente(uuid, jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
