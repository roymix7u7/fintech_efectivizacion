-- ============================================================
--  FUNCIONES CERRADAS A QUIEN NO INICIÓ SESIÓN
--
--  El asesor de seguridad de Supabase marcaba 53 funciones que se
--  podían llamar sin sesión (rol anon): Postgres da permiso de
--  ejecutar a "public" por defecto. Todas comprueban el rol por dentro,
--  así que no había un agujero explotable, pero era una puerta abierta
--  que nadie usa: la app y el panel siempre llaman con sesión.
--
--  1. Se da permiso explícito a "authenticated" (antes lo tenía por
--     ser parte de "public").
--  2. Se le quita a "public" y a "anon".
--  3. Lo mismo para las funciones que se creen de aquí en adelante.
--
--  Quien de verdad deba poder llamarse sin sesión (el Libro de
--  Reclamaciones, migración 56) lo concede él mismo, a propósito.
-- ============================================================

grant execute on all functions in schema public to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
