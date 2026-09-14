-- ============================================================
--  NOTICIAS CON IMAGENES Y CON VIGENCIA DE VERDAD
--
--  Habia dos problemas.
--
--  1) fecha_fin no servia para nada. El panel la guardaba y la
--     app la mostraba como texto, pero ninguna consulta la
--     miraba: una promocion vencida en marzo seguia visible en
--     septiembre hasta que alguien la desactivaba a mano.
--
--  2) No habia donde poner imagenes, y una promocion sin imagen
--     es un parrafo gris que nadie lee.
--
--  Se agrega ademas fecha_inicio, para poder dejar preparada una
--  campana y que aparezca sola el dia que toca.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Columnas nuevas
--    imagenes es un arreglo de paths dentro del bucket, no de
--    URLs: una URL firmada caduca y quedaria guardada muerta en
--    la fila. El primer elemento es la portada.
-- ------------------------------------------------------------
alter table public.alertas_sistema
  add column if not exists imagenes text[] not null default '{}',
  add column if not exists fecha_inicio timestamptz not null default now(),
  add column if not exists fecha_fin timestamptz;


-- ------------------------------------------------------------
-- 2) Una sola definicion de "vigente"
--    Antes cada consulta decidia por su cuenta, y por eso unas
--    filtraban y otras no. Ahora hay un unico lugar donde se
--    dice que significa que una noticia este al aire.
--
--    stable, no immutable: depende de now().
-- ------------------------------------------------------------
create or replace function public.noticia_vigente(
  p_activa  boolean,
  p_inicio  timestamptz,
  p_fin     timestamptz
)
returns boolean
language sql
stable
as $$
  select coalesce(p_activa, false)
     and (p_inicio is null or p_inicio <= now())
     and (p_fin    is null or p_fin    >  now());
$$;

grant execute on function public.noticia_vigente(boolean, timestamptz, timestamptz)
  to authenticated;


-- ------------------------------------------------------------
-- 3) La vigencia se aplica en la politica de lectura
--    Ponerlo aqui y no en cada consulta significa que el cliente
--    no puede ver una noticia vencida ni pidiendola por id: la
--    fila no existe para el. El staff si las ve todas, porque el
--    panel necesita mostrar el historial.
-- ------------------------------------------------------------
drop policy if exists alertas_lectura on public.alertas_sistema;
create policy alertas_lectura on public.alertas_sistema
  for select to authenticated
  using (
    public.noticia_vigente(activa, fecha_inicio, fecha_fin)
    or public.es_staff()
  );


-- ------------------------------------------------------------
-- 4) Indice para el orden que usa la app
-- ------------------------------------------------------------
create index if not exists alertas_vigencia_idx
  on public.alertas_sistema (activa, fecha_inicio desc);


-- ------------------------------------------------------------
-- 5) Bucket de las imagenes
--
--    Publico, al reves que los demas. Los otros guardan
--    documentos de una persona y por eso van firmados. Estas son
--    piezas de marketing que veran los 30 mil clientes: firmarlas
--    obligaria a una llamada extra por imagen y por cliente, y
--    ademas impediria que la CDN las cachee. No hay nada privado
--    que proteger en ellas.
--
--    Subir sigue siendo solo del admin.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'noticias-fotos', 'noticias-fotos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_noticias_lectura on storage.objects;
create policy storage_noticias_lectura on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'noticias-fotos');

drop policy if exists storage_noticias_escritura on storage.objects;
create policy storage_noticias_escritura on storage.objects
  for all to authenticated
  using (bucket_id = 'noticias-fotos' and public.es_admin())
  with check (bucket_id = 'noticias-fotos' and public.es_admin());


-- ------------------------------------------------------------
-- 6) El resumen del inicio tambien respeta la vigencia
--    La funcion no es SECURITY DEFINER, asi que la politica de
--    arriba ya la filtra. Se deja explicito igualmente para que
--    el limit 3 se entienda leyendo la funcion sola, y se agrega
--    la portada para poder mostrar miniatura en el inicio.
-- ------------------------------------------------------------
create or replace function public.resumen_inicio()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_perfil  public.perfiles_cliente%rowtype;
  v_bancos  text[];
begin
  select * into v_perfil
  from public.perfiles_cliente
  where user_id = auth.uid();

  if v_perfil.id is null then
    return jsonb_build_object(
      'perfil', null,
      'stats', jsonb_build_object('pendientes', 0, 'aprobadas', 0, 'tarjetas', 0),
      'bancos', '[]'::jsonb,
      'alertas', '[]'::jsonb,
      'guias', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct banco), '{}')
    into v_bancos
  from public.tarjetas
  where cliente_id = v_perfil.id and activa = true and estado = 'aprobado';

  return jsonb_build_object(
    'perfil', to_jsonb(v_perfil),

    'stats', jsonb_build_object(
      'pendientes', (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado = 'pendiente'),
      'aprobadas',  (select count(*) from public.solicitudes
                      where cliente_id = v_perfil.id and estado = 'aprobado'),
      'tarjetas',   coalesce(array_length(v_bancos, 1), 0)
    ),

    'bancos', to_jsonb(v_bancos),

    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje,
               'tipo', a.tipo, 'created_at', a.created_at,
               'portada', a.imagenes[1]
             ) order by a.fecha_inicio desc)
      from (select * from public.alertas_sistema
             where public.noticia_vigente(activa, fecha_inicio, fecha_fin)
             order by fecha_inicio desc limit 3) a
    ), '[]'::jsonb),

    'guias', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'banco', g.banco)
                       order by g.banco)
      from public.guias_banco g
      where g.activa = true and g.banco = any(v_bancos)
    ), '[]'::jsonb),

    'hay_guias', exists(select 1 from public.guias_banco where activa = true)
  );
end;
$$;

grant execute on function public.resumen_inicio() to authenticated;
revoke execute on function public.resumen_inicio() from anon;


-- ------------------------------------------------------------
-- 7) Refrescar la cache del esquema
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
