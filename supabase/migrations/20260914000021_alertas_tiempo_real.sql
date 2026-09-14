-- ============================================================
--  ALERTAS EN TIEMPO REAL Y NOTIFICACION AL TELEFONO
--
--  Hasta ahora la burbuja solo aparecia al abrir el app. Si algo
--  pasa mientras el cliente esta a mitad de una solicitud, se
--  entera cuando ya la mando: justo cuando el aviso ya no sirve.
--
--  Dos caminos, porque cubren situaciones distintas:
--
--    · Con el app abierto: Realtime. El servidor avisa al
--      telefono en el momento y la burbuja sale sola.
--
--    · Con el app cerrado: notificacion push. Es el unico canal
--      que llega cuando la aplicacion no esta corriendo.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Publicar los cambios de alertas_sistema
--    Sin esto, Realtime no emite nada de esta tabla. El bloque
--    comprueba antes porque volver a agregarla da error y
--    cortaria la migracion entera.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'alertas_sistema'
  ) then
    alter publication supabase_realtime add table public.alertas_sistema;
  end if;
end $$;

-- Realtime necesita la fila completa para decidir, politica en
-- mano, si este cliente puede ver el cambio. Con la identidad por
-- defecto solo viaja la clave primaria y las actualizaciones se
-- descartarian.
alter table public.alertas_sistema replica identity full;


-- ------------------------------------------------------------
-- 2) A que telefono escribirle
--
--    La clave es el token y no el usuario: un telefono prestado o
--    revendido conserva su token y pasa a otra persona. Con el
--    token como clave, la fila se muda de dueno sola y el aviso
--    no termina en el telefono equivocado.
-- ------------------------------------------------------------
create table if not exists public.push_tokens (
  token           text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  plataforma      text,
  actualizado_en  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Cada quien administra los tokens de sus propios telefonos. El
-- envio lo hace la funcion del servidor con la clave de servicio,
-- asi que nadie necesita leer los tokens de los demas.
drop policy if exists push_tokens_propios on public.push_tokens;
create policy push_tokens_propios on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;


-- ------------------------------------------------------------
-- 3) Rastro del envio
--    Para que el panel pueda decir si la notificacion salio, y
--    para no mandarla dos veces al editar el texto de una alerta.
-- ------------------------------------------------------------
alter table public.alertas_sistema
  add column if not exists push_enviado_en timestamptz,
  add column if not exists push_alcance integer;


notify pgrst, 'reload schema';
