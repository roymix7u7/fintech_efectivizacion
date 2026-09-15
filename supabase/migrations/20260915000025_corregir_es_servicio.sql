-- ============================================================
--  CORRIGE UN HUECO DE SEGURIDAD GRAVE EN es_servicio()
--
--  La migracion 13 hizo que es_servicio() mirara current_user para
--  reconocer a las funciones del servidor. El problema: dentro de
--  una funcion SECURITY DEFINER, current_user no es quien llama,
--  sino el DUENO de la funcion, que es postgres.
--
--  es_staff(), es_supervisor() y es_admin() son SECURITY DEFINER
--  y llaman a es_servicio(). Resultado: para cualquier usuario con
--  sesion, cliente incluido, las tres devolvian verdadero.
--
--  Comprobado antes de corregir, simulando una peticion real de un
--  cliente (rol authenticated): es_staff = true, es_admin = true, y
--  RLS le dejaba ver las 5 solicitudes del sistema en vez de sus 2.
--
--  Lo que eso abria: leer datos de todos los clientes, escribir en
--  tablas de administracion, y el trigger de users dejaba pasar
--  cualquier cambio de rol porque tambien empieza por es_servicio().
--
--  La senal correcta es el token de la peticion y la sesion de
--  conexion, que no cambian dentro de una funcion SECURITY DEFINER:
--
--    · peticion con la clave service_role: el token dice
--      role = service_role;
--    · migraciones y editor SQL: no hay token, y la conexion es de
--      postgres o de un rol que pertenece a postgres;
--    · peticiones del app y del panel: entran como authenticator,
--      que no pertenece a postgres, con role = authenticated.
-- ============================================================

create or replace function public.es_servicio()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      nullif(current_setting('request.jwt.claim.role', true), '')
    ) = 'service_role'
    or (
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
      and pg_has_role(session_user, 'postgres', 'MEMBER')
    );
$$;

