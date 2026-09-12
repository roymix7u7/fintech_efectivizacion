-- ============================================================
--  SOLO LECTURA. No modifica ningún dato de tus clientes.
--
--  Supabase > SQL Editor > New query > pegar todo > Run.
--  Devuelve UNA sola celda con todo el esquema en JSON.
--  Haz clic en la celda, copia el contenido y pégalo en el chat.
-- ============================================================

select jsonb_pretty(jsonb_build_object(

  -- Columnas de cada tabla
  'columnas', coalesce((
    select jsonb_object_agg(tabla, cols)
    from (
      select c.table_name as tabla,
             jsonb_agg(jsonb_build_object(
               'columna', c.column_name,
               'tipo', c.data_type,
               'null', c.is_nullable,
               'default', c.column_default
             ) order by c.ordinal_position) as cols
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
      group by c.table_name
    ) x
  ), '{}'::jsonb),

  -- Claves primarias, únicas y foráneas
  'restricciones', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tabla', tabla, 'tipo', tipo, 'nombre', nombre,
      'columnas', columnas, 'referencia', referencia
    ) order by tabla, tipo)
    from (
      select tc.table_name as tabla,
             tc.constraint_type as tipo,
             tc.constraint_name as nombre,
             string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columnas,
             max(ccu.table_name || '.' || ccu.column_name) as referencia
      from information_schema.table_constraints tc
      left join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
      left join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.table_schema = tc.table_schema
       and tc.constraint_type = 'FOREIGN KEY'
      where tc.table_schema = 'public'
      group by tc.table_name, tc.constraint_type, tc.constraint_name
    ) x
  ), '[]'::jsonb),

  -- Restricciones CHECK, para ver qué estados acepta cada tabla
  'checks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tabla', rel.relname,
      'nombre', con.conname,
      'definicion', pg_get_constraintdef(con.oid)
    ) order by rel.relname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and con.contype = 'c'
  ), '[]'::jsonb),

  -- Índices existentes
  'indices', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tabla', tablename, 'nombre', indexname, 'definicion', indexdef
    ) order by tablename, indexname)
    from pg_indexes where schemaname = 'public'
  ), '[]'::jsonb),

  -- RLS activo por tabla
  'rls_activo', coalesce((
    select jsonb_object_agg(c.relname, c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ), '{}'::jsonb),

  -- Políticas RLS del esquema public
  'politicas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tabla', tablename, 'politica', policyname, 'operacion', cmd,
      'roles', roles::text, 'lectura', qual, 'escritura', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ), '[]'::jsonb),

  -- Triggers propios
  'triggers', coalesce((
    select jsonb_agg(distinct jsonb_build_object(
      'tabla', event_object_table, 'nombre', trigger_name,
      'momento', action_timing, 'evento', event_manipulation,
      'accion', action_statement
    ))
    from information_schema.triggers where trigger_schema = 'public'
  ), '[]'::jsonb),

  -- Funciones definidas por ti
  'funciones', coalesce((
    select jsonb_agg(jsonb_build_object(
      'nombre', p.proname, 'seguridad', case when p.prosecdef then 'definer' else 'invoker' end
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), '[]'::jsonb),

  -- Buckets de Storage y si son públicos
  'buckets', coalesce((
    select jsonb_agg(jsonb_build_object(
      'nombre', name, 'publico', public, 'limite_bytes', file_size_limit
    ) order by name)
    from storage.buckets
  ), '[]'::jsonb),

  -- Políticas de Storage
  'politicas_storage', coalesce((
    select jsonb_agg(jsonb_build_object(
      'politica', policyname, 'operacion', cmd,
      'lectura', qual, 'escritura', with_check
    ) order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  ), '[]'::jsonb),

  -- Tipos enum y sus valores permitidos.
  -- Varias columnas son enum, no texto, asi que esto dice exactamente
  -- que estados acepta la base.
  'enums', coalesce((
    select jsonb_object_agg(nombre, valores)
    from (
      select t.typname as nombre,
             jsonb_agg(e.enumlabel order by e.enumsortorder) as valores
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
    ) en
  ), '{}'::jsonb),

  -- Conteo de filas y estados en uso, sin exponer datos personales.
  -- El ::text es necesario porque las columnas son enum.
  'estados_en_uso', jsonb_build_object(
    'users', coalesce((
      select jsonb_object_agg(coalesce(rol::text,'?') || '/' || coalesce(estado::text,'?'), n)
      from (select rol::text as rol, estado::text as estado, count(*) n
            from public.users group by 1, 2) a
    ), '{}'::jsonb),
    'solicitudes', coalesce((
      select jsonb_object_agg(coalesce(estado,'?'), n)
      from (select estado::text as estado, count(*) n
            from public.solicitudes group by 1) b
    ), '{}'::jsonb),
    'tarjetas', coalesce((
      select jsonb_object_agg(coalesce(estado,'?'), n)
      from (select estado::text as estado, count(*) n
            from public.tarjetas group by 1) c
    ), '{}'::jsonb),
    'operaciones', (select count(*) from public.operaciones)
  )

)) as esquema;
