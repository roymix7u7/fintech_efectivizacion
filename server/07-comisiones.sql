-- ============================================================
--  COMISIONES EN DOS NIVELES
--
--  Cada banco tiene una comision general. Encima, un cliente
--  puede tener una comision especial para un banco concreto.
--  Lo especial gana sobre lo general.
--
--  Ejecutar entero. Es seguro correrlo dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Comision general por banco
-- ------------------------------------------------------------
create table if not exists public.comisiones_banco (
  id              uuid primary key default gen_random_uuid(),
  banco           text not null unique,
  porcentaje      numeric(5,2) not null
                    check (porcentaje >= 0 and porcentaje <= 100),
  activa          boolean not null default true,
  nota            text,
  actualizado_por uuid references public.users(id),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

drop trigger if exists tr_comisiones_banco_updated on public.comisiones_banco;
create trigger tr_comisiones_banco_updated
  before update on public.comisiones_banco
  for each row execute function public.update_updated_at();


-- ------------------------------------------------------------
-- 2) Comision especial de un cliente en un banco
--    La clave unica por cliente y banco impide que existan dos
--    tarifas distintas para el mismo caso.
-- ------------------------------------------------------------
create table if not exists public.comisiones_cliente (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null
                  references public.perfiles_cliente(id) on delete cascade,
  banco         text not null,
  porcentaje    numeric(5,2) not null
                  check (porcentaje >= 0 and porcentaje <= 100),
  motivo        text,
  asignado_por  uuid references public.users(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (cliente_id, banco)
);

create index if not exists comisiones_cliente_banco
  on public.comisiones_cliente (banco);

drop trigger if exists tr_comisiones_cliente_updated on public.comisiones_cliente;
create trigger tr_comisiones_cliente_updated
  before update on public.comisiones_cliente
  for each row execute function public.update_updated_at();


-- ------------------------------------------------------------
-- 3) Siembra de bancos con la tarifa que ya usabas
--    perfiles_cliente.tasa_comision tenia 1.00 por defecto, asi
--    que se arranca con eso y luego lo ajustas banco por banco.
-- ------------------------------------------------------------
insert into public.comisiones_banco (banco, porcentaje)
values
  ('BCP', 1.00), ('BBVA', 1.00), ('Interbank', 1.00),
  ('Scotiabank', 1.00), ('BanBif', 1.00), ('CMR', 1.00), ('Otros', 1.00)
on conflict (banco) do nothing;


-- ------------------------------------------------------------
-- 4) Cual es la comision que aplica
--
--    Orden: especial del cliente en ese banco, luego general del
--    banco, y como ultimo recurso la tasa suelta que ya estaba en
--    el perfil. Ese ultimo escalon existe para que ningun cliente
--    se quede sin tarifa mientras terminas de configurar.
-- ------------------------------------------------------------
create or replace function public.comision_efectiva(
  p_cliente uuid,
  p_banco   text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select porcentaje from public.comisiones_cliente
      where cliente_id = p_cliente and banco = p_banco),
    (select porcentaje from public.comisiones_banco
      where banco = p_banco and activa = true),
    (select tasa_comision from public.perfiles_cliente where id = p_cliente),
    0
  );
$$;


-- ------------------------------------------------------------
-- 5) Cambio masivo
--
--    Con p_clientes en null aplica a todos los clientes activos.
--    Con una lista, solo a esos. Devuelve cuantos se cambiaron.
--
--    Sube la tarifa de un banco para mucha gente de una vez sin
--    tener que abrir ficha por ficha.
-- ------------------------------------------------------------
create or replace function public.asignar_comision_masiva(
  p_banco      text,
  p_porcentaje numeric,
  p_clientes   uuid[] default null,
  p_motivo     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectados integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar comisiones';
  end if;
  if p_porcentaje < 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100';
  end if;

  insert into public.comisiones_cliente
    (cliente_id, banco, porcentaje, motivo, asignado_por)
  select p.id, p_banco, p_porcentaje, p_motivo, auth.uid()
  from public.perfiles_cliente p
  join public.users u on u.id = p.user_id
  where u.estado = 'activo'
    and (p_clientes is null or p.id = any(p_clientes))
  on conflict (cliente_id, banco) do update
    set porcentaje   = excluded.porcentaje,
        motivo       = excluded.motivo,
        asignado_por = excluded.asignado_por,
        updated_at   = now();

  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;


-- ------------------------------------------------------------
-- 6) Quitar la comision especial y volver a la general del banco
-- ------------------------------------------------------------
create or replace function public.quitar_comision_especial(
  p_banco    text,
  p_clientes uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectados integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar comisiones';
  end if;

  delete from public.comisiones_cliente
  where banco = p_banco
    and (p_clientes is null or cliente_id = any(p_clientes));

  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;


-- ------------------------------------------------------------
-- 7) Permisos
--
--    El cliente necesita ver su propio porcentaje en la app, asi
--    que puede leer las tarifas generales y las suyas. Cambiarlas
--    es solo del administrador.
-- ------------------------------------------------------------
alter table public.comisiones_banco enable row level security;

drop policy if exists comisiones_banco_lectura on public.comisiones_banco;
create policy comisiones_banco_lectura on public.comisiones_banco
  for select to authenticated using (true);

drop policy if exists comisiones_banco_escritura on public.comisiones_banco;
create policy comisiones_banco_escritura on public.comisiones_banco
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.comisiones_cliente enable row level security;

drop policy if exists comisiones_cliente_lectura on public.comisiones_cliente;
create policy comisiones_cliente_lectura on public.comisiones_cliente
  for select to authenticated
  using (cliente_id = public.mi_cliente_id() or public.es_staff());

drop policy if exists comisiones_cliente_escritura on public.comisiones_cliente;
create policy comisiones_cliente_escritura on public.comisiones_cliente
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

revoke execute on function public.asignar_comision_masiva(text, numeric, uuid[], text) from anon;
revoke execute on function public.quitar_comision_especial(text, uuid[]) from anon;


-- ------------------------------------------------------------
-- 8) Comprobacion
-- ------------------------------------------------------------
select banco, porcentaje, activa from public.comisiones_banco order by banco;
