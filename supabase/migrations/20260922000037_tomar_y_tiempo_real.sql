-- ============================================================
--  ABRIR UN CASO ES ATENDERLO, Y LOS DEMAS LO VEN AL INSTANTE
--
--  Faltaban dos piezas para que la cola sea de verdad compartida.
--
--  1) Abrir no reservaba nada. Un gestor podia estar diez minutos
--     con una solicitud en pantalla y para los demas seguia libre;
--     se enteraban del choque recien al resolver. Ahora abrir un
--     caso libre lo toma, igual que "atender siguiente".
--
--  2) La cola solo se refrescaba a mano. Con Realtime, cuando
--     alguien toma o resuelve algo, la lista de los demas se
--     actualiza sola mientras la tienen a la vista.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tomar un caso al abrirlo
--
--    Devuelve { ok: true } si queda en tus manos, o quien lo tiene.
--    No cambia el estado: solo dice quien lo esta atendiendo.
-- ------------------------------------------------------------
create or replace function public.tomar_caso(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_vence  timestamptz := now() - (public.reserva_minutos() || ' minutes')::interval;
  v_estado text;
  v_quien  uuid;
  v_desde  timestamptz;
begin
  if not public.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Se bloquea la fila: si dos abren a la vez, la segunda espera aqui
  -- y encuentra el caso ya tomado en vez de pisarlo.
  if p_tipo = 'solicitud' then
    select estado, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.solicitudes where id = p_id for update;
  elsif p_tipo = 'tarjeta' then
    select estado, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.tarjetas where id = p_id for update;
  elsif p_tipo = 'kyc' then
    select estado::text, asignado_a, asignado_en into v_estado, v_quien, v_desde
      from public.users where id = p_id for update;
  else
    raise exception 'Tipo no valido: %', p_tipo;
  end if;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'NO_EXISTE');
  end if;

  -- Ya resuelto: no hay nada que tomar, pero tampoco es un choque.
  if (p_tipo = 'kyc' and v_estado not in ('pendiente', 'observado'))
     or (p_tipo <> 'kyc' and v_estado <> 'pendiente') then
    return jsonb_build_object('ok', false, 'motivo', 'RESUELTO', 'estado', v_estado);
  end if;

  -- De otra persona y con la reserva viva: se mira, no se toca.
  if v_quien is not null and v_quien <> v_yo and v_desde > v_vence then
    return jsonb_build_object(
      'ok', false, 'motivo', 'TOMADO',
      'quien', (select email from public.users where id = v_quien),
      'libre_en', ceil(extract(epoch from (v_desde - v_vence)) / 60));
  end if;

  -- Libre, vencido o ya mio: pasa a mis manos y se renueva el reloj.
  if p_tipo = 'solicitud' then
    update public.solicitudes set asignado_a = v_yo, asignado_en = now() where id = p_id;
  elsif p_tipo = 'tarjeta' then
    update public.tarjetas set asignado_a = v_yo, asignado_en = now() where id = p_id;
  else
    update public.users set asignado_a = v_yo, asignado_en = now() where id = p_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tomar_caso(text, uuid) to authenticated;
revoke execute on function public.tomar_caso(text, uuid) from anon;


-- ------------------------------------------------------------
-- 2) Publicar los cambios de las colas
--
--    Sin esto Realtime no emite nada de estas tablas. Cada bloque
--    comprueba antes: volver a agregarlas da error y cortaria la
--    migracion entera.
--
--    No abre datos: Realtime aplica las mismas politicas, asi que
--    cada quien recibe solo los cambios de las filas que ya podria
--    leer consultando.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['solicitudes', 'tarjetas', 'users'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
