-- ============================================================
--  QUIEN PUEDE CAMBIAR QUE, ROL POR ROL
--
--  El trigger anterior tenia dos problemas.
--
--  GRAVE: un gestor no podia aprobar un KYC. La ultima rama
--  conservaba el estado para todo el que no fuera admin ni
--  supervisor, asi que al poner un cliente en activo el trigger
--  lo revertia en silencio. El panel mostraba exito y no pasaba
--  nada.
--
--  HUECO: un supervisor podia cambiar el estado de cualquiera,
--  incluido un administrador. Solo se le limitaba el rol.
--
--  El modelo queda asi:
--    · el gestor ejecuta: resuelve colas y toca el estado de
--      clientes, nunca el de personal ni ningun rol,
--    · el supervisor dirige a su gente: ademas bloquea y
--      desbloquea gestores de SU sede, sin poder ascenderlos ni
--      moverlos de sede,
--    · el administrador configura: manda sobre todo,
--    · nadie se cambia el rol a si mismo, ni siquiera el admin.
-- ============================================================

create or replace function public.users_proteger_columnas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
begin
  -- Codigo de servidor ya verificado. La funcion de alta comprueba
  -- por su cuenta quien llama antes de escribir.
  if public.es_servicio() then
    return new;
  end if;

  -- El administrador manda sobre todo, salvo sobre su propio rol.
  if public.es_admin() and new.id <> v_yo then
    return new;
  end if;

  -- Nadie se asciende a si mismo. Un admin que se degrada por error
  -- dejaria el sistema sin administrador.
  if new.id = v_yo then
    new.rol := old.rol;
    new.sede_id := old.sede_id;
    -- Unica excepcion: un cliente observado vuelve a la cola tras
    -- corregir sus documentos desde la app.
    if not (old.estado = 'observado' and new.estado = 'pendiente') then
      new.estado := old.estado;
    end if;
    return new;
  end if;

  -- ── Sobre la fila de un CLIENTE ──
  if old.rol = 'cliente' then
    if public.es_staff() then
      -- Revisar identidad es el trabajo del gestor: el estado queda
      -- libre. Lo que no puede es ascender a nadie ni asignarle sede.
      new.rol := 'cliente';
      new.sede_id := old.sede_id;
      return new;
    end if;
    -- Otro cliente cualquiera no toca nada.
    new.rol := old.rol;
    new.estado := old.estado;
    new.sede_id := old.sede_id;
    return new;
  end if;

  -- ── Sobre la fila de alguien del PERSONAL ──
  -- Solo el supervisor, y solo sobre gestores de su propia sede.
  if public.es_supervisor()
     and old.rol = 'gestor'
     and old.sede_id is not distinct from public.mi_sede()
     and old.sede_id is not null
  then
    new.rol := 'gestor';          -- no puede ascenderlo
    new.sede_id := old.sede_id;   -- no puede moverlo de sede
    return new;                   -- el estado si: puede bloquearlo
  end if;

  -- Cualquier otro caso: la fila no cambia.
  new.rol := old.rol;
  new.estado := old.estado;
  new.sede_id := old.sede_id;
  return new;
end;
$$;


-- ------------------------------------------------------------
--  Indicadores propios del gestor
--
--  Un gestor no necesita ver el volumen de la empresa. Esto le da
--  solo lo suyo: lo que tiene tomado y lo que resolvio hoy.
-- ------------------------------------------------------------
create or replace function public.mis_metricas()
returns table (
  asignadas       bigint,
  resueltas_hoy   bigint,
  aprobadas_hoy   bigint,
  rechazadas_hoy  bigint,
  resueltas_semana bigint
)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*) from public.solicitudes
      where estado = 'pendiente'
        and asignado_a = auth.uid()
        and asignado_en > now() - (public.reserva_minutos() || ' minutes')::interval),
    (select count(*) from public.solicitudes
      where revisado_por = auth.uid()
        and fecha_revision >= date_trunc('day', now())),
    (select count(*) from public.solicitudes
      where revisado_por = auth.uid() and estado = 'aprobado'
        and fecha_revision >= date_trunc('day', now())),
    (select count(*) from public.solicitudes
      where revisado_por = auth.uid() and estado = 'rechazado'
        and fecha_revision >= date_trunc('day', now())),
    (select count(*) from public.solicitudes
      where revisado_por = auth.uid()
        and fecha_revision >= now() - interval '7 days');
$$;

grant execute on function public.mis_metricas() to authenticated;
revoke execute on function public.mis_metricas() from anon;
