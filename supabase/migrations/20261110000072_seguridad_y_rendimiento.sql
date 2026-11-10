-- ============================================================
--  SEGURIDAD Y RENDIMIENTO (lo que marca el asesor de Supabase)
-- ============================================================
--  1. Las funciones de disparador (triggers) y la de eventos no deben
--     poder llamarse desde la API: solo existen para los disparadores,
--     que siguen funcionando igual (Postgres no revisa el permiso de
--     ejecución al dispararlos).
--  2. Funciones internas que hoy puede llamar cualquiera sin sesión
--     (anon): se cierran a anon y quedan para usuarios con sesión.
--     registrar_reclamo (Libro de Reclamaciones) y verificar_registro
--     (registro) SIGUEN abiertas: la web las usa sin sesión.
--  3. Dos funciones sin search_path fijo.
--  4. Políticas que recalculaban auth.uid() por cada fila: ahora una
--     vez por consulta ((select auth.uid())). Mismo resultado, más rápido
--     con muchos clientes.
--  5. Índices para las claves foráneas que no tenían.
--
--  Las sentencias de 4 y 5 salen de las definiciones reales de la base
--  (pg_policies, pg_constraint), no escritas a mano.
--  Se puede ejecutar más de una vez.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Funciones de disparador y de eventos: fuera de la API
-- ------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2) Funciones internas: sin sesión, no
-- ------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.banco_con_dia_siguiente(text)',
    'public.comision_hoy(uuid, text)',
    'public.cuenta_deposito_defecto(uuid)',
    'public.es_dia_habil(date)',
    'public.se_puede_hoy()',
    'public.siguiente_dia_habil(date)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3) search_path fijo
-- ------------------------------------------------------------
alter function public.hoy_lima() set search_path = public;
alter function public.texto_fecha_deposito(date) set search_path = public;

-- ------------------------------------------------------------
-- 4) auth.uid() una vez por consulta
-- ------------------------------------------------------------
alter policy alertas_vistas_insert on public.alertas_vistas with check ((user_id = (select auth.uid())));
alter policy alertas_vistas_lectura on public.alertas_vistas using (((user_id = (select auth.uid())) OR es_staff()));
alter policy auditoria_insercion on public.auditoria_logs with check (((select auth.uid()) IS NOT NULL));
alter policy consentimientos_lectura on public.consentimientos using (((user_id = (select auth.uid())) OR es_staff()));
alter policy notificaciones_actualizacion on public.notificaciones using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy notificaciones_lectura on public.notificaciones using (((user_id = (select auth.uid())) OR es_staff()));
alter policy pagos_bancos_lectura on public.pagos_bancos using (((user_id = (select auth.uid())) OR es_supervisor()));
alter policy perfiles_actualizacion on public.perfiles_cliente using (((user_id = (select auth.uid())) OR es_staff())) with check (((user_id = (select auth.uid())) OR es_staff()));
alter policy perfiles_insercion on public.perfiles_cliente with check ((user_id = (select auth.uid())));
alter policy perfiles_lectura on public.perfiles_cliente using (((user_id = (select auth.uid())) OR es_staff()));
alter policy push_tokens_propios on public.push_tokens using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy reclamaciones_lectura on public.reclamaciones using (((user_id = (select auth.uid())) OR es_admin() OR es_supervisor()));
alter policy solicitudes_datos_lectura on public.solicitudes_datos using (((user_id = (select auth.uid())) OR es_admin() OR es_supervisor()));
alter policy users_actualizacion on public.users using (((id = (select auth.uid())) OR es_staff()));
alter policy users_insercion on public.users with check ((id = (select auth.uid())));
alter policy users_lectura on public.users using (((id = (select auth.uid())) OR es_staff()));

-- ------------------------------------------------------------
-- 5) Índices de las claves foráneas
-- ------------------------------------------------------------
create index if not exists idx_alertas_sistema_creada_por on public.alertas_sistema (creada_por);
create index if not exists idx_bloques_comision_creado_por on public.bloques_comision (creado_por);
create index if not exists idx_chat_personal_actualizado_por on public.chat_personal (actualizado_por);
create index if not exists idx_comisiones_banco_actualizado_por on public.comisiones_banco (actualizado_por);
create index if not exists idx_comisiones_cliente_asignado_por on public.comisiones_cliente (asignado_por);
create index if not exists idx_consentimientos_documento_id on public.consentimientos (documento_id);
create index if not exists idx_documentos_legales_publicado_por on public.documentos_legales (publicado_por);
create index if not exists idx_guias_banco_actualizado_por on public.guias_banco (actualizado_por);
create index if not exists idx_lotes_pago_creado_por on public.lotes_pago (creado_por);
create index if not exists idx_observaciones_creado_por on public.observaciones (creado_por);
create index if not exists idx_operaciones_cuenta_destino_id on public.operaciones (cuenta_destino_id);
create index if not exists idx_operaciones_depositado_por on public.operaciones (depositado_por);
create index if not exists idx_operaciones_tarjeta_id on public.operaciones (tarjeta_id);
create index if not exists idx_operaciones_verificado_por on public.operaciones (verificado_por);
create index if not exists idx_pagos_eventos_usuario_id on public.pagos_eventos (usuario_id);
create index if not exists idx_perfiles_cliente_bloqueado_por on public.perfiles_cliente (bloqueado_por);
create index if not exists idx_perfiles_cliente_registrado_por on public.perfiles_cliente (registrado_por);
create index if not exists idx_perfiles_cliente_validado_por on public.perfiles_cliente (validado_por);
create index if not exists idx_reclamaciones_respondido_por on public.reclamaciones (respondido_por);
create index if not exists idx_sedes_creada_por on public.sedes (creada_por);
create index if not exists idx_seguimientos_usuario_id on public.seguimientos (usuario_id);
create index if not exists idx_solicitudes_asignado_a on public.solicitudes (asignado_a);
create index if not exists idx_solicitudes_cuenta_deposito_id on public.solicitudes (cuenta_deposito_id);
create index if not exists idx_solicitudes_datos_atendida_por on public.solicitudes_datos (atendida_por);
create index if not exists idx_solicitudes_marcada_por on public.solicitudes (marcada_por);
create index if not exists idx_solicitudes_pagado_por on public.solicitudes (pagado_por);
create index if not exists idx_solicitudes_revisado_por on public.solicitudes (revisado_por);
create index if not exists idx_solicitudes_tarjeta_id on public.solicitudes (tarjeta_id);
create index if not exists idx_tarjetas_asignado_a on public.tarjetas (asignado_a);
create index if not exists idx_tarjetas_revisado_por on public.tarjetas (revisado_por);
create index if not exists idx_users_asignado_a on public.users (asignado_a);

commit;

notify pgrst, 'reload schema';
