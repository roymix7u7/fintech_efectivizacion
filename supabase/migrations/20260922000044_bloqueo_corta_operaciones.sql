-- ============================================================
--  BLOQUEAR CORTA LAS OPERACIONES AL INSTANTE
--
--  El app saca al cliente bloqueado cuando intenta entrar, pero eso
--  solo se revisa al abrir sesion. Alguien con el app ya abierto
--  seguia con su token vivo, y mi_cliente_id() no miraba el estado:
--  podia seguir mandando solicitudes, tarjetas y cuentas hasta
--  cerrar la aplicacion.
--
--  Justo el caso que motiva un bloqueo -- alguien haciendo algo
--  indebido ahora mismo -- era el que no se detenia.
--
--  Ahora la funcion devuelve null si la cuenta esta bloqueada. Todas
--  las politicas de cliente cuelgan de ella (solicitudes, tarjetas,
--  cuentas, comprobantes), asi que el corte es inmediato y no hace
--  falta tocar cada politica.
--
--  Se excluye solo 'bloqueado', no se exige 'activo': un cliente
--  pendiente u observado todavia tiene que poder completar su
--  registro.
-- ============================================================

create or replace function public.mi_cliente_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from public.perfiles_cliente p
  join public.users u on u.id = p.user_id
  where p.user_id = auth.uid()
    and u.estado <> 'bloqueado';
$$;

revoke execute on function public.mi_cliente_id() from anon;

notify pgrst, 'reload schema';
