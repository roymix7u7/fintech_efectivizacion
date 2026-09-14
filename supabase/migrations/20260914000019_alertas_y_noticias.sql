-- ============================================================
--  SEPARAR ALERTAS DE NOTICIAS
--
--  Las dos cosas vivian en la misma tabla y se mostraban en la
--  misma lista, pero no son lo mismo:
--
--    · Una noticia se navega. Una promocion, un feriado, un
--      descuento. Si el cliente la ve manana no pasa nada.
--
--    · Una alerta interrumpe. "El BCP no esta procesando hoy".
--      Si se entera manana ya no le sirvio de nada.
--
--  El problema de una alerta que aparece como burbuja es que si
--  el cliente la pierde, se perdio para siempre. Aqui se resuelve
--  guardando por cliente cuando la vio: la burbuja es solo la
--  forma de avisar, la alerta sigue en su lista con un punto de
--  "nueva" hasta que la abra.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Que clase de aviso es cada fila
--    Texto con check y no un enum: agregar valores a un enum
--    obliga a partir la migracion en dos archivos, y aqui no
--    hace falta esa ceremonia para dos valores.
-- ------------------------------------------------------------
alter table public.alertas_sistema
  add column if not exists categoria text not null default 'noticia';

alter table public.alertas_sistema
  drop constraint if exists alertas_categoria_valida;

alter table public.alertas_sistema
  add constraint alertas_categoria_valida
  check (categoria in ('noticia', 'alerta'));

-- Lo que ya existia con tono de advertencia o de urgencia era,
-- en la practica, una alerta. Se mueve; desde el panel se puede
-- cambiar de lado cuando haga falta.
update public.alertas_sistema
   set categoria = 'alerta'
 where tipo in ('advertencia', 'critico')
   and categoria = 'noticia';


-- ------------------------------------------------------------
-- 2) Quien vio que alerta
--    Una fila por cliente y alerta. Sin esto no hay forma de
--    saber si la burbuja llego a verse, y la unica salida seria
--    repetirla en cada arranque hasta cansar al cliente.
-- ------------------------------------------------------------
create table if not exists public.alertas_vistas (
  alerta_id  uuid not null
             references public.alertas_sistema(id) on delete cascade,
  user_id    uuid not null
             references auth.users(id) on delete cascade,
  vista_en   timestamptz not null default now(),
  primary key (alerta_id, user_id)
);

create index if not exists alertas_vistas_user_idx
  on public.alertas_vistas (user_id);

alter table public.alertas_vistas enable row level security;

-- El cliente solo ve y escribe sus propias marcas. El staff las
-- lee todas, para poder decir cuantos abrieron una alerta.
drop policy if exists alertas_vistas_lectura on public.alertas_vistas;
create policy alertas_vistas_lectura on public.alertas_vistas
  for select to authenticated
  using (user_id = auth.uid() or public.es_staff());

drop policy if exists alertas_vistas_insert on public.alertas_vistas;
create policy alertas_vistas_insert on public.alertas_vistas
  for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.alertas_vistas to authenticated;


-- ------------------------------------------------------------
-- 3) El inicio solo adelanta noticias
--    Las alertas tienen su propio camino: la burbuja y su lista.
--    Mezclarlas otra vez en el resumen del inicio devolveria el
--    problema que esta migracion viene a resolver.
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

    -- Se conserva el nombre 'alertas' en la respuesta para no
    -- romper la app publicada, pero ya solo trae noticias.
    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje,
               'tipo', a.tipo, 'created_at', a.created_at,
               'portada', a.imagenes[1]
             ) order by a.fecha_inicio desc)
      from (select * from public.alertas_sistema
             where categoria = 'noticia'
               and public.noticia_vigente(activa, fecha_inicio, fecha_fin)
             order by fecha_inicio desc limit 3) a
    ), '[]'::jsonb),

    -- Alertas al aire que este cliente todavia no abrio. Alimenta
    -- el punto del menu sin una consulta extra al entrar.
    'alertas_sin_ver', (
      select count(*)
      from public.alertas_sistema a
      where a.categoria = 'alerta'
        and public.noticia_vigente(a.activa, a.fecha_inicio, a.fecha_fin)
        and not exists (
          select 1 from public.alertas_vistas v
          where v.alerta_id = a.id and v.user_id = auth.uid()
        )
    ),

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


notify pgrst, 'reload schema';
