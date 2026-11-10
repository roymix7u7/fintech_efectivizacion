-- ============================================================
--  AVISOS DEL NAVEGADOR (notificaciones web)
-- ============================================================
--  Cada navegador donde un cliente aceptó "avisarme cuando mi asesor
--  responda" queda aquí. La función chatwoot-avisos (Supabase) los lee
--  con la clave de servicio y les manda la notificación.
--
--  · Un navegador pertenece a una sola cuenta: si en esa PC entra otro
--    cliente y activa los avisos, el navegador pasa a ser suyo.
--  · Al cerrar sesión la web lo quita (quitar_aviso_navegador): en una
--    PC compartida, el siguiente no recibe avisos del anterior.
--  · Los navegadores que ya no existen (el servicio de avisos responde
--    404/410) los borra la función al intentar enviarles.
--
--  Se puede ejecutar más de una vez.
-- ============================================================

begin;

create table if not exists public.avisos_navegador (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh     text not null check (length(p256dh) between 20 and 200),
  auth       text not null check (length(auth) between 10 and 100),
  navegador  text check (length(navegador) <= 300),
  creado_en  timestamptz not null default now(),
  usado_en   timestamptz
);

create index if not exists idx_avisos_navegador_user on public.avisos_navegador (user_id);

alter table public.avisos_navegador enable row level security;

-- El cliente ve sus navegadores; escribir, solo con las funciones de abajo.
drop policy if exists avisos_navegador_lectura on public.avisos_navegador;
create policy avisos_navegador_lectura on public.avisos_navegador
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.avisos_navegador from anon, authenticated;
grant select on public.avisos_navegador to authenticated;

-- Guarda (o pasa a esta cuenta) el navegador actual. Máximo 10 por cuenta:
-- si se pasa, se olvida el más antiguo.
create or replace function public.guardar_aviso_navegador(
  p_endpoint text, p_p256dh text, p_auth text, p_navegador text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Necesitas iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.avisos_navegador (user_id, endpoint, p256dh, auth, navegador)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_navegador, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         navegador = excluded.navegador,
         creado_en = now();

  delete from public.avisos_navegador
   where id in (
     select id from public.avisos_navegador
      where user_id = v_user
      order by creado_en desc
      offset 10
   );
end;
$$;

-- Quita el navegador actual (al cerrar sesión o al desactivar los avisos).
create or replace function public.quitar_aviso_navegador(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.avisos_navegador
   where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.guardar_aviso_navegador(text, text, text, text) from public, anon;
revoke execute on function public.quitar_aviso_navegador(text) from public, anon;
grant execute on function public.guardar_aviso_navegador(text, text, text, text) to authenticated, service_role;
grant execute on function public.quitar_aviso_navegador(text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
