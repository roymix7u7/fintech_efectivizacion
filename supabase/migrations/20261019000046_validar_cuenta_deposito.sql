-- ============================================================
--  UNA SOLICITUD SOLO ENTRA SI HAY A DONDE PAGARLA
--
--  Hasta ahora la base aceptaba cualquier solicitud que el cliente
--  insertara: no comprobaba que la tarjeta fuera suya ni que estuviera
--  aprobada, guardaba el banco que mandara el app sin mirarlo, y no
--  verificaba que existiera una cuenta donde depositar. Todo eso solo
--  lo revisaba el app, y el banco decide en que grupo de Pagos cae la
--  operacion.
--
--  Reglas de deposito (las mismas que app/src/lib/deposito.js y que
--  admin/src/lib/bancos.js):
--
--    1. Recibe la cuenta NORMAL (ahorros). La interbancaria (CCI) es
--       opcional: sola no alcanza.
--    2. Tarjeta de banco principal -> cuenta normal del mismo banco.
--    3. Tarjeta CMR u "Otros" -> cuenta normal de cualquier banco.
--
--  Solo se aplica a lo que inserta un cliente. El personal y los
--  procesos de servicio (semillas, correcciones) quedan fuera.
-- ============================================================

create or replace function public.solicitudes_validar_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_banco      text;
  v_estado     text;
  v_activa     boolean;
  v_dueno      uuid;
  v_principal  boolean;
begin
  if public.es_staff() then
    return new;
  end if;

  select t.banco, t.estado::text, t.activa, t.cliente_id
    into v_banco, v_estado, v_activa, v_dueno
  from public.tarjetas t
  where t.id = new.tarjeta_id;

  if v_banco is null or v_dueno is distinct from new.cliente_id then
    raise exception 'Esa tarjeta no está registrada a tu nombre.'
      using errcode = 'P0001';
  end if;

  if not coalesce(v_activa, false) or v_estado <> 'aprobado' then
    raise exception 'Tu tarjeta % todavía no está verificada.', v_banco
      using errcode = 'P0001';
  end if;

  -- El banco sale de la tarjeta, no del app: es el que decide que
  -- pagador ve la operacion y cual comision se aplica.
  new.banco := v_banco;

  v_principal := v_banco in ('BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif');

  if not exists (
    select 1
    from public.cuentas_bancarias c
    where c.cliente_id = new.cliente_id
      and c.activa = true
      and coalesce(c.tipo, 'ahorros') <> 'interbancaria'
      and (not v_principal or c.banco = v_banco)
  ) then
    if v_principal then
      raise exception 'Registra tu cuenta de ahorros % antes de enviar: ahí te depositamos.', v_banco
        using errcode = 'P0001';
    else
      raise exception 'Registra una cuenta de ahorros en cualquier banco antes de enviar: ahí te depositamos.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_solicitudes_validar_alta on public.solicitudes;
create trigger tr_solicitudes_validar_alta
  before insert on public.solicitudes
  for each row execute function public.solicitudes_validar_alta();

notify pgrst, 'reload schema';
