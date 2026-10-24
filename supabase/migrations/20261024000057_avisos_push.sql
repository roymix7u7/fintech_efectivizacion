-- ============================================================
--  LOS AVISOS PERSONALES TAMBIÉN LLEGAN AL TELÉFONO
--
--  Hasta ahora solo las alertas del panel salían como notificación
--  (función enviar-alerta-push). Los avisos de cada cliente ("Solicitud
--  aprobada", "Tu pago fue enviado", "Tarjeta verificada"...) quedaban
--  solo en la campana, y quien tenía la app cerrada no se enteraba.
--
--  Ahora, cada fila nueva en notificaciones se envía a los teléfonos
--  del cliente por el servicio de Expo, desde la misma base (pg_net):
--  sirve para todo lo que ya crea avisos (resolver casos, pagos, bajas,
--  pedidos de datos, reclamos) sin tocar cada función.
--
--  pg_net es asíncrono y transaccional: el envío sale recién cuando la
--  operación se confirma, y si se deshace, no sale. Si el envío falla,
--  el aviso igual queda en la campana: nunca se bloquea la operación.
--
--  El servicio de Expo no pide llave: identifica la app por el token
--  del teléfono, y solo los teléfonos de ese cliente tienen el suyo.
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.enviar_aviso_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mensajes jsonb;
  -- Expo rechaza mensajes de más de 4 KB: el texto completo se lee
  -- en la app, en Mis avisos.
  v_cuerpo text := case
    when length(coalesce(new.cuerpo, '')) > 180 then left(new.cuerpo, 177) || '...'
    else coalesce(new.cuerpo, '')
  end;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', left(coalesce(new.titulo, 'AlToque'), 100),
    'body', v_cuerpo,
    'sound', 'default',
    'priority', 'high',
    -- Mismo canal de Android que las alertas: existe en todos los
    -- teléfonos que ya instalaron la app.
    'channelId', 'alertas',
    'data', jsonb_build_object('seccion', 'avisos', 'aviso_id', new.id, 'tipo', new.tipo)
  ))
  into v_mensajes
  from public.push_tokens t
  where t.user_id = new.user_id;

  if v_mensajes is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_mensajes,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      timeout_milliseconds := 8000
    );
  end if;
  return new;
exception when others then
  -- Una falla del envío no puede impedir que el aviso se guarde.
  return new;
end;
$$;

revoke all on function public.enviar_aviso_push() from public, anon, authenticated;

drop trigger if exists tr_notificaciones_push on public.notificaciones;
create trigger tr_notificaciones_push
  after insert on public.notificaciones
  for each row execute function public.enviar_aviso_push();
