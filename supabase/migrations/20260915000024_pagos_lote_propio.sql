-- ============================================================
--  EL LOTE EN PREPARACION SOBREVIVE A UNA RECARGA
--
--  Lo marcado se guarda en el servidor, pero la pantalla no tenia
--  forma de pedir "solo lo mio": si el encargado recargaba o
--  marcaba en dos bancos, el lote de la derecha se vaciaba aunque
--  las reservas siguieran puestas. Se agrega p_solo_mias.
--
--  Se borra la firma anterior en vez de sobrecargarla: con dos
--  versiones, una llamada sin el parametro nuevo seria ambigua.
-- ============================================================

drop function if exists public.pagos_listar(text, text, text, integer, integer);

create or replace function public.pagos_listar(
  p_banco   text    default null,
  p_estado  text    default 'aprobado',
  p_buscar  text    default null,
  p_limite  integer default 50,
  p_desde   integer default 0,
  p_solo_mias boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_yo     uuid := auth.uid();
  v_mis    text[] := public.mis_bancos_pago();
  v_admin  boolean := public.es_admin();
  v_vence  timestamptz := now() - (public.pagos_reserva_minutos() || ' minutes')::interval;
  v_buscar text := nullif(trim(coalesce(p_buscar, '')), '');
  v_filas  jsonb;
  v_total  bigint;
begin
  if not (public.es_pagos() or v_admin) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  -- Pagos no tiene nada que hacer con lo rechazado.
  if p_estado not in ('pendiente', 'aprobado', 'pagado') then
    raise exception 'Estado no permitido: %', p_estado;
  end if;

  p_limite := least(greatest(coalesce(p_limite, 50), 1), 200);
  p_desde  := greatest(coalesce(p_desde, 0), 0);

  select coalesce(jsonb_agg(x.fila order by x.orden), '[]'::jsonb),
         coalesce(max(x.total), 0)
    into v_filas, v_total
  from (
    select
      jsonb_build_object(
        'id',              s.id,
        'codigo',          s.codigo,
        'banco',           s.banco,
        'estado',          s.estado,
        'created_at',      s.created_at,
        'fecha_revision',  s.fecha_revision,
        'comprobante_url', s.comprobante_url,
        'nota_cliente',    s.nota_cliente,
        'pagado_en',       s.pagado_en,
        'pagado_por',      (select u.email from public.users u where u.id = s.pagado_por),
        'ultimos_4',       t.ultimos_4,
        -- Una marca vencida se trata como si no existiera.
        'marcada_por',     case when s.marcada_en > v_vence
                             then (select u.email from public.users u where u.id = s.marcada_por) end,
        'marcada_por_mi',  coalesce(s.marcada_por = v_yo and s.marcada_en > v_vence, false),
        'puedo_pagar',     (v_admin or s.banco = any(v_mis)),
        'cliente', jsonb_build_object(
          'nombres',   p.nombres,
          'apellidos', p.apellidos,
          'dni',       p.dni,
          'telefono',  p.telefono
        ),
        'cuentas', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'banco', c.banco, 'numero', c.numero_cuenta, 'tipo', c.tipo
                 ) order by c.banco)
          from public.cuentas_bancarias c
          where c.cliente_id = s.cliente_id and c.activa = true
        ), '[]'::jsonb)
      ) as fila,
      row_number() over (
        order by
          case when p_estado = 'pagado' then s.pagado_en end desc nulls last,
          -- Lo que mas tiempo lleva aprobado se paga primero.
          s.fecha_revision asc nulls last,
          s.created_at asc
      ) as orden,
      count(*) over () as total
    from public.solicitudes s
    join public.perfiles_cliente p on p.id = s.cliente_id
    left join public.tarjetas t on t.id = s.tarjeta_id
    where s.estado = p_estado
      and (p_banco is null or s.banco = p_banco)
      -- El lote en preparacion: lo marcado por mi en cualquier banco.
      and (not p_solo_mias or (s.marcada_por = v_yo and s.marcada_en > v_vence))
      and (
        v_buscar is null
        or p.dni like v_buscar || '%'
        or s.codigo ilike v_buscar || '%'
        or (p.nombres || ' ' || p.apellidos) ilike '%' || v_buscar || '%'
      )
    order by orden
    limit p_limite offset p_desde
  ) x;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

grant execute on function public.pagos_listar(text, text, text, integer, integer, boolean) to authenticated;
revoke execute on function public.pagos_listar(text, text, text, integer, integer, boolean) from anon;

notify pgrst, 'reload schema';
