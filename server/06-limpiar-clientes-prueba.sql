-- ============================================================
--  BORRAR TODOS LOS CLIENTES DE PRUEBA
--
--  ESTO NO SE PUEDE DESHACER.
--  Borra clientes, perfiles, tarjetas, cuentas, solicitudes
--  y avisos.
--
--  Las cuentas de staff (admin y gestor) NO se tocan.
--  Las noticias y las guias de banco NO se tocan.
--
--  Los ARCHIVOS de Storage no se pueden borrar desde SQL:
--  Supabase lo bloquea con un trigger para evitar dejar
--  objetos huerfanos. Se borran aparte, ver el paso 4.
--
--  Ejecuta el paso 1 primero y revisa la lista.
-- ============================================================


-- ------------------------------------------------------------
-- PASO 1: mira que se va a borrar. Solo lee.
-- ------------------------------------------------------------
select
  u.id,
  u.email,
  u.estado::text as estado,
  p.nombres || ' ' || p.apellidos as nombre,
  (select count(*) from public.tarjetas t where t.cliente_id = p.id) as tarjetas,
  (select count(*) from public.solicitudes s where s.cliente_id = p.id) as solicitudes
from public.users u
left join public.perfiles_cliente p on p.user_id = u.id
where u.rol = 'cliente'
order by u.created_at;


-- ------------------------------------------------------------
-- PASO 2: anota las carpetas de Storage que habra que borrar.
--
--  Ejecuta esto ANTES del paso 3 y guarda el resultado: una vez
--  borrados los usuarios ya no podras saber que carpetas eran
--  suyas. Cada carpeta se llama igual que el id del cliente.
-- ------------------------------------------------------------
select distinct
  o.bucket_id as bucket,
  (storage.foldername(o.name))[1] as carpeta,
  count(*) over (
    partition by o.bucket_id, (storage.foldername(o.name))[1]
  ) as archivos
from storage.objects o
where o.bucket_id in ('kyc-documentos', 'tarjetas-fotos', 'comprobantes')
  and (storage.foldername(o.name))[1] in (
    select id::text from public.users where rol = 'cliente'
  )
order by bucket, carpeta;


-- ------------------------------------------------------------
-- PASO 3: el borrado de los datos.
--
--  Ejecuta este bloque completo, de "do $$" hasta "$$;".
--  Va en una sola transaccion: o se borra todo o no se borra
--  nada, asi no quedan filas sueltas apuntando a un usuario
--  que ya no existe.
--
--  Borrar de auth.users es lo que libera el correo. Si solo
--  borras de public.users, Supabase sigue diciendo que el
--  correo ya esta registrado.
-- ------------------------------------------------------------
do $$
declare
  ids_clientes uuid[];
  ids_perfiles uuid[];
  borrados int;
begin
  select array_agg(id) into ids_clientes
  from public.users where rol = 'cliente';

  if ids_clientes is null then
    raise notice 'No hay clientes que borrar.';
    return;
  end if;

  select array_agg(id) into ids_perfiles
  from public.perfiles_cliente where user_id = any(ids_clientes);

  -- Filas que dependen del perfil
  if ids_perfiles is not null then
    delete from public.solicitudes where cliente_id = any(ids_perfiles);
    delete from public.operaciones where cliente_id = any(ids_perfiles);
    delete from public.cuentas_bancarias where cliente_id = any(ids_perfiles);
    delete from public.tarjetas where cliente_id = any(ids_perfiles);
    delete from public.observaciones
      where entidad = 'perfiles_cliente' and entidad_id = any(ids_perfiles);
  end if;

  -- Filas que dependen del usuario
  delete from public.notificaciones where user_id = any(ids_clientes);
  delete from public.auditoria_logs where usuario_id = any(ids_clientes);
  delete from public.perfiles_cliente where user_id = any(ids_clientes);
  delete from public.users where id = any(ids_clientes);

  -- Y por ultimo la cuenta de acceso, que es lo que libera el correo.
  delete from auth.users where id = any(ids_clientes);
  get diagnostics borrados = row_count;
  raise notice 'Cuentas borradas: %', borrados;
end $$;


-- ------------------------------------------------------------
-- PASO 4: los archivos.
--
--  Opcion A, la mas simple: en el panel de Supabase entra a
--  Storage, abre cada uno de los tres buckets, selecciona las
--  carpetas que anotaste en el paso 2 y borralas.
--
--  Opcion B: ejecuta el script limpiar-storage.mjs que esta en
--  esta misma carpeta. Borra todo lo que quedo huerfano sin que
--  tengas que ir bucket por bucket.
--
--  Dejarlos tampoco rompe nada: los buckets son privados y
--  ninguna fila los referencia ya.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- PASO 5: comprobar que quedo limpio.
--  Deberias ver solo tus cuentas de staff.
-- ------------------------------------------------------------
select rol::text as rol, estado::text as estado, count(*) as cuantos
from public.users
group by 1, 2
order by 1, 2;

-- Y que no quedaron cuentas de acceso huerfanas:
select count(*) as auth_sin_fila_en_users
from auth.users a
where not exists (select 1 from public.users u where u.id = a.id);
