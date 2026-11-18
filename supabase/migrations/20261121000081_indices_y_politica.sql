-- ════════════════════════════════════════════════════════════════════
-- 081 · Avisos de rendimiento de Supabase
--
--   · Índices para las claves foráneas que no tenían (lista de bloqueo y
--     permisos del personal): borrar o cruzar por esas columnas no recorre
--     la tabla entera.
--   · La regla de lectura de permisos_personal evaluaba auth.uid() una vez
--     por fila; con (select auth.uid()) se evalúa una sola vez por consulta.
--     Hace lo mismo que antes.
-- ════════════════════════════════════════════════════════════════════

create index if not exists lista_bloqueo_cliente_id_idx on public.lista_bloqueo (cliente_id);
create index if not exists lista_bloqueo_creado_por_idx on public.lista_bloqueo (creado_por);
create index if not exists lista_bloqueo_quitado_por_idx on public.lista_bloqueo (quitado_por);
create index if not exists permisos_personal_actualizado_por_idx on public.permisos_personal (actualizado_por);

drop policy if exists permisos_personal_lectura on public.permisos_personal;
create policy permisos_personal_lectura on public.permisos_personal
  for select to authenticated
  using (user_id = (select auth.uid()) or es_superadmin());
