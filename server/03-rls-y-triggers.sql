-- ============================================================
--  POLITICAS RLS Y TRIGGERS
--  Escrito contra el esquema real devuelto por 01-introspeccion.
--
--  Ejecutar seccion por seccion en Supabase > SQL Editor.
--  Cada seccion es idempotente: se puede correr dos veces.
--
--  Las secciones 1 a 4 cierran agujeros por los que hoy un
--  cliente puede escalar privilegios. Son las urgentes.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  0) FUNCIONES DE APOYO
--
--  Las politicas actuales sobre "users" hacen
--  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() ...)
--  dentro de una politica de la propia tabla users. Eso es
--  recursivo y por eso no funcionaba, y probablemente fue el
--  motivo de agregar la politica users_staff_read que deja
--  leer a cualquiera.
--
--  SECURITY DEFINER hace que estas funciones lean users
--  saltandose RLS, que es la forma correcta de resolverlo.
-- ════════════════════════════════════════════════════════════

create or replace function public.rol_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select rol::text from public.users where id = auth.uid();
$$;

create or replace function public.es_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select rol in ('admin', 'gestor') and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select rol = 'admin' and estado <> 'bloqueado'
    from public.users where id = auth.uid()
  ), false);
$$;

create or replace function public.mi_cliente_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.perfiles_cliente where user_id = auth.uid();
$$;

revoke execute on function public.rol_actual() from anon;
revoke execute on function public.es_staff() from anon;
revoke execute on function public.es_admin() from anon;
revoke execute on function public.mi_cliente_id() from anon;


-- ════════════════════════════════════════════════════════════
--  1) users   ← LA MAS URGENTE
--
--  Tres problemas hoy:
--
--  a) users_staff_read permite SELECT a cualquiera cuya sesion
--     sea 'authenticated', es decir a todos los clientes. Como
--     las politicas se combinan con OR, eso anula users_self_read
--     y deja el correo, el rol y el estado de todo el mundo,
--     incluido el staff, a la vista de cualquier cliente.
--
--  b) users_self_update permite UPDATE sobre la propia fila sin
--     restringir columnas. Un cliente puede ponerse rol admin.
--
--  c) users_self_insert permite crear la propia fila eligiendo
--     rol, asi que puede nacer como admin directamente.
--
--  Los triggers son la proteccion real: RLS controla que filas
--  se tocan, no que columnas.
-- ════════════════════════════════════════════════════════════

create or replace function public.users_forzar_alta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.rol := 'cliente';
    new.estado := 'pendiente';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_users_forzar_alta on public.users;
create trigger tr_users_forzar_alta
  before insert on public.users
  for each row execute function public.users_forzar_alta();

create or replace function public.users_proteger_columnas()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.es_staff() then
    return new;
  end if;

  -- El rol nunca lo cambia el propio usuario.
  new.rol := old.rol;

  -- Unica transicion que puede hacer el cliente: volver a la cola
  -- de revision tras corregir los documentos observados. Sin esta
  -- excepcion la pantalla en-revision no podria reabrir su caso.
  if not (old.estado = 'observado' and new.estado = 'pendiente') then
    new.estado := old.estado;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_users_proteger_columnas on public.users;
create trigger tr_users_proteger_columnas
  before update on public.users
  for each row execute function public.users_proteger_columnas();

-- Se elimina la politica que dejaba leer toda la tabla.
drop policy if exists users_staff_read on public.users;
drop policy if exists users_self_read on public.users;
drop policy if exists users_self_insert on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists users_staff_update on public.users;

create policy users_lectura on public.users
  for select using (id = auth.uid() or public.es_staff());

create policy users_insercion on public.users
  for insert with check (id = auth.uid());

create policy users_actualizacion on public.users
  for update using (id = auth.uid() or public.es_staff());


-- ════════════════════════════════════════════════════════════
--  2) tarjetas y cuentas_bancarias
--
--  Hoy ambas tienen una unica politica FOR ALL cuyo USING es
--  "es mia o soy admin". En una politica ALL sin WITH CHECK, esa
--  misma expresion se usa para validar la escritura, asi que el
--  cliente puede hacer UPDATE de su propia tarjeta y ponerle
--  estado 'aprobado'. Es decir, puede auto-verificarse la tarjeta
--  y quedar habilitado para operar sin que nadie la revise.
-- ════════════════════════════════════════════════════════════

create or replace function public.tarjetas_forzar_alta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
    new.revisado_por := null;
    new.fecha_revision := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_tarjetas_forzar_alta on public.tarjetas;
create trigger tr_tarjetas_forzar_alta
  before insert on public.tarjetas
  for each row execute function public.tarjetas_forzar_alta();

create or replace function public.tarjetas_proteger_estado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    -- El cliente solo puede dar de baja la tarjeta con activa.
    new.estado := old.estado;
    new.motivo_rechazo := old.motivo_rechazo;
    new.revisado_por := old.revisado_por;
    new.fecha_revision := old.fecha_revision;
    new.banco := old.banco;
    new.ultimos_4 := old.ultimos_4;
    new.cliente_id := old.cliente_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_tarjetas_proteger_estado on public.tarjetas;
create trigger tr_tarjetas_proteger_estado
  before update on public.tarjetas
  for each row execute function public.tarjetas_proteger_estado();

drop policy if exists tarjetas_self on public.tarjetas;

create policy tarjetas_lectura on public.tarjetas
  for select using (cliente_id = public.mi_cliente_id() or public.es_staff());

create policy tarjetas_insercion on public.tarjetas
  for insert with check (cliente_id = public.mi_cliente_id());

create policy tarjetas_actualizacion on public.tarjetas
  for update using (cliente_id = public.mi_cliente_id() or public.es_staff())
  with check (cliente_id = public.mi_cliente_id() or public.es_staff());

drop policy if exists cuentas_self on public.cuentas_bancarias;

create policy cuentas_lectura on public.cuentas_bancarias
  for select using (cliente_id = public.mi_cliente_id() or public.es_staff());

create policy cuentas_insercion on public.cuentas_bancarias
  for insert with check (cliente_id = public.mi_cliente_id());

create policy cuentas_actualizacion on public.cuentas_bancarias
  for update using (cliente_id = public.mi_cliente_id() or public.es_staff())
  with check (cliente_id = public.mi_cliente_id() or public.es_staff());


-- ════════════════════════════════════════════════════════════
--  3) solicitudes
--
--  Problema encontrado: solicitudes_staff_update exige rol admin,
--  pero el panel deja que un gestor apruebe y rechace. Hasta ahora
--  ese UPDATE no escribia nada y la pantalla no avisaba, porque el
--  codigo no miraba el error. Ya lo corregi en el panel, y aqui se
--  alinea el permiso con lo que el panel permite hacer.
-- ════════════════════════════════════════════════════════════

create or replace function public.solicitudes_forzar_alta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
    new.revisado_por := null;
    new.fecha_revision := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_solicitudes_forzar_alta on public.solicitudes;
create trigger tr_solicitudes_forzar_alta
  before insert on public.solicitudes
  for each row execute function public.solicitudes_forzar_alta();

drop policy if exists solicitudes_client_insert on public.solicitudes;
drop policy if exists solicitudes_client_read on public.solicitudes;
drop policy if exists solicitudes_staff_read on public.solicitudes;
drop policy if exists solicitudes_staff_update on public.solicitudes;

create policy solicitudes_lectura on public.solicitudes
  for select using (cliente_id = public.mi_cliente_id() or public.es_staff());

create policy solicitudes_insercion on public.solicitudes
  for insert with check (cliente_id = public.mi_cliente_id());

-- Sin politica de UPDATE para clientes: resolver es solo del staff.
create policy solicitudes_actualizacion on public.solicitudes
  for update using (public.es_staff()) with check (public.es_staff());


-- ════════════════════════════════════════════════════════════
--  4) perfiles_cliente
--
--  Falta una politica de UPDATE para el cliente, asi que hoy no
--  puede reenviar sus documentos cuando el gestor lo observa. Se
--  agrega, y un trigger impide que se ponga su propia comision o
--  se marque como validado.
-- ════════════════════════════════════════════════════════════

create or replace function public.perfiles_proteger_validacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.validado_por := old.validado_por;
    new.fecha_validacion := old.fecha_validacion;
    new.tasa_comision := old.tasa_comision;
    new.user_id := old.user_id;
    -- El DNI no se cambia solo: identifica al titular ya verificado.
    new.dni := old.dni;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_perfiles_proteger on public.perfiles_cliente;
create trigger tr_perfiles_proteger
  before update on public.perfiles_cliente
  for each row execute function public.perfiles_proteger_validacion();

drop policy if exists perfiles_self_insert on public.perfiles_cliente;
drop policy if exists perfiles_self_read on public.perfiles_cliente;
drop policy if exists perfiles_staff_update on public.perfiles_cliente;

create policy perfiles_lectura on public.perfiles_cliente
  for select using (user_id = auth.uid() or public.es_staff());

create policy perfiles_insercion on public.perfiles_cliente
  for insert with check (user_id = auth.uid());

create policy perfiles_actualizacion on public.perfiles_cliente
  for update using (user_id = auth.uid() or public.es_staff())
  with check (user_id = auth.uid() or public.es_staff());


-- ════════════════════════════════════════════════════════════
--  5) alertas_sistema y guias_banco
--
--  Hoy la politica de lectura es "true" para el rol public, asi
--  que se leen sin iniciar sesion, con la clave anonima que va
--  dentro de la app publicada, y ademas devuelven las filas con
--  activa = false. Un aviso desactivado sigue siendo visible.
-- ════════════════════════════════════════════════════════════

drop policy if exists alertas_read on public.alertas_sistema;
drop policy if exists alertas_admin_write on public.alertas_sistema;

create policy alertas_lectura on public.alertas_sistema
  for select to authenticated
  using (activa = true or public.es_staff());

create policy alertas_escritura on public.alertas_sistema
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists guias_read on public.guias_banco;
drop policy if exists guias_admin_write on public.guias_banco;

create policy guias_lectura on public.guias_banco
  for select to authenticated
  using (activa = true or public.es_staff());

create policy guias_escritura on public.guias_banco
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ════════════════════════════════════════════════════════════
--  6) auditoria_logs
--
--  auditoria_staff_insert solo deja insertar al staff, pero la app
--  movil registra CREAR_SOLICITUD como cliente. Ese insert viene
--  fallando en silencio desde siempre, asi que no hay rastro de
--  las solicitudes creadas.
--
--  Se permite insertar a cualquier usuario con sesion y el trigger
--  fuerza usuario_id al autor real, para que nadie pueda firmar un
--  registro con el id de otro. Sin UPDATE ni DELETE: un historial
--  que el auditado puede editar no sirve como evidencia.
-- ════════════════════════════════════════════════════════════

create or replace function public.auditoria_autor_real()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.usuario_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists tr_auditoria_autor on public.auditoria_logs;
create trigger tr_auditoria_autor
  before insert on public.auditoria_logs
  for each row execute function public.auditoria_autor_real();

drop policy if exists auditoria_admin_read on public.auditoria_logs;
drop policy if exists auditoria_staff_insert on public.auditoria_logs;

create policy auditoria_lectura on public.auditoria_logs
  for select to authenticated using (public.es_admin());

create policy auditoria_insercion on public.auditoria_logs
  for insert to authenticated with check (auth.uid() is not null);

revoke update, delete on public.auditoria_logs from anon, authenticated;


-- ════════════════════════════════════════════════════════════
--  7) observaciones
--  Los roles verificador y tesoreria ya no existen en el panel.
-- ════════════════════════════════════════════════════════════

drop policy if exists observaciones_read on public.observaciones;
drop policy if exists observaciones_staff_insert on public.observaciones;

create policy observaciones_lectura on public.observaciones
  for select to authenticated using (public.es_staff());

create policy observaciones_insercion on public.observaciones
  for insert to authenticated with check (public.es_staff());


-- ════════════════════════════════════════════════════════════
--  8) operaciones
--
--  La tabla quedo sin uso, pero sus politicas siguen activas y
--  son las mas abiertas de todo el esquema:
--
--    operaciones_client_insert_v2  WITH CHECK true
--    operaciones_staff_update      USING true
--
--  Cualquiera con sesion puede crear filas y modificar las de
--  cualquier otro, incluidos montos y el estado 'depositado'.
--  Aunque hoy nada la lea, conviene cerrarla ya.
-- ════════════════════════════════════════════════════════════

drop policy if exists operaciones_client_insert on public.operaciones;
drop policy if exists operaciones_client_insert_v2 on public.operaciones;
drop policy if exists operaciones_read on public.operaciones;
drop policy if exists operaciones_staff_update on public.operaciones;

create policy operaciones_lectura on public.operaciones
  for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_staff());

create policy operaciones_escritura on public.operaciones
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ════════════════════════════════════════════════════════════
--  9) notificaciones
--  La tabla existe y users tiene expo_push_token, pero ninguna
--  parte del codigo las usa todavia. Se deja bien cerrada.
-- ════════════════════════════════════════════════════════════

drop policy if exists notificaciones_self on public.notificaciones;
drop policy if exists notificaciones_update on public.notificaciones;

create policy notificaciones_lectura on public.notificaciones
  for select to authenticated
  using (user_id = auth.uid() or public.es_staff());

create policy notificaciones_actualizacion on public.notificaciones
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notificaciones_insercion on public.notificaciones
  for insert to authenticated with check (public.es_staff());


-- ════════════════════════════════════════════════════════════
--  10) Storage
--
--  Los cinco buckets ya son privados, eso esta bien. Estas
--  politicas limitan a cada cliente a su propia carpeta <uid>/,
--  que es como la app arma las rutas.
--
--  Antes de ejecutar, revisa el resultado de 01b-storage.sql:
--  si ya existen politicas con otro nombre, conviene borrarlas
--  para que no queden permisos mas abiertos combinados con OR.
-- ════════════════════════════════════════════════════════════

drop policy if exists storage_cliente_sube on storage.objects;
create policy storage_cliente_sube on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('kyc-documentos', 'tarjetas-fotos', 'comprobantes')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_cliente_actualiza on storage.objects;
create policy storage_cliente_actualiza on storage.objects
  for update to authenticated
  using (
    bucket_id in ('kyc-documentos', 'tarjetas-fotos', 'comprobantes')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_cliente_borra on storage.objects;
create policy storage_cliente_borra on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('kyc-documentos', 'tarjetas-fotos', 'comprobantes')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_lectura on storage.objects;
create policy storage_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id in ('kyc-documentos', 'tarjetas-fotos', 'comprobantes')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.es_staff()
    )
  );

-- Las guias de banco las ve cualquier cliente y solo las sube el admin.
drop policy if exists storage_guias_lectura on storage.objects;
create policy storage_guias_lectura on storage.objects
  for select to authenticated using (bucket_id = 'guias-bancos');

drop policy if exists storage_guias_escritura on storage.objects;
create policy storage_guias_escritura on storage.objects
  for all to authenticated
  using (bucket_id = 'guias-bancos' and public.es_admin())
  with check (bucket_id = 'guias-bancos' and public.es_admin());


-- ════════════════════════════════════════════════════════════
--  11) Comprobacion final
--  Ejecuta esto despues de todo y revisa que no quede ninguna
--  politica con condicion "true" ni con el truco del jwt.
-- ════════════════════════════════════════════════════════════

-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname in ('public', 'storage')
--   and (qual = 'true' or with_check = 'true' or qual like '%auth.jwt()%')
-- order by tablename, policyname;
