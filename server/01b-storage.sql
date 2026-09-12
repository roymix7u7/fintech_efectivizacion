-- ============================================================
--  SOLO LECTURA. El resultado anterior se corto al final y
--  faltaron estas dos partes. Es un query corto.
-- ============================================================

select jsonb_pretty(jsonb_build_object(

  -- Politicas de Storage: definen quien sube y quien lee los
  -- comprobantes y los documentos de identidad.
  'politicas_storage', coalesce((
    select jsonb_agg(jsonb_build_object(
      'politica', policyname, 'operacion', cmd, 'roles', roles::text,
      'lectura', qual, 'escritura', with_check
    ) order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  ), '[]'::jsonb),

  -- Cuantas filas hay y en que estados, sin datos personales.
  'estados_en_uso', jsonb_build_object(
    'users', coalesce((
      select jsonb_object_agg(rol || '/' || estado, n)
      from (select rol::text as rol, estado::text as estado, count(*) n
            from public.users group by 1, 2) a
    ), '{}'::jsonb),
    'solicitudes', coalesce((
      select jsonb_object_agg(estado, n)
      from (select estado::text as estado, count(*) n
            from public.solicitudes group by 1) b
    ), '{}'::jsonb),
    'tarjetas', coalesce((
      select jsonb_object_agg(estado, n)
      from (select estado::text as estado, count(*) n
            from public.tarjetas group by 1) c
    ), '{}'::jsonb),
    'operaciones', (select count(*) from public.operaciones),
    'notificaciones', (select count(*) from public.notificaciones),
    'perfiles_dni_duplicados', coalesce((
      select jsonb_agg(jsonb_build_object('veces', n))
      from (select dni, count(*) n from public.perfiles_cliente
            group by dni having count(*) > 1) d
    ), '[]'::jsonb)
  )

)) as faltante;
