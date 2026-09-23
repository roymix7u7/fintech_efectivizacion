-- ============================================================
--  EL CLIENTE NO SE EDITA SUS PROPIAS CONDICIONES
--
--  perfiles_cliente tiene politica de UPDATE para el titular: la
--  necesita para reenviar sus documentos cuando lo observan. Un
--  trigger ya congelaba validado_por, fecha_validacion,
--  tasa_comision, user_id y dni.
--
--  Faltaban dos grupos de columnas que se agregaron despues:
--
--  1) bloque_id (bloques de comision). Sin esto, un cliente podia
--     hacer un PATCH a su propia fila y ponerse el bloque mas
--     barato. comision_efectiva lee ese bloque, asi que se cobraba
--     lo que el cliente eligiera.
--
--  2) motivo_bloqueo, bloqueado_por y bloqueado_en. No cambian su
--     estado, que vive en users, pero un bloqueado alcanza a
--     autenticarse antes de que el app lo saque, y en ese momento
--     podria borrar el motivo que el supervisor escribio.
--
--  Se congelan igual que las demas: no se rechaza el UPDATE, se
--  devuelve el valor anterior, para que reenviar documentos siga
--  funcionando.
-- ============================================================

create or replace function public.perfiles_proteger_validacion()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then
    new.validado_por    := old.validado_por;
    new.fecha_validacion := old.fecha_validacion;
    new.tasa_comision   := old.tasa_comision;
    new.user_id         := old.user_id;
    -- El DNI no se cambia solo: identifica al titular ya verificado.
    new.dni             := old.dni;
    -- Sus condiciones comerciales las pone el staff.
    new.bloque_id       := old.bloque_id;
    -- El motivo del bloqueo lo escribe quien bloquea.
    new.motivo_bloqueo  := old.motivo_bloqueo;
    new.bloqueado_por   := old.bloqueado_por;
    new.bloqueado_en    := old.bloqueado_en;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_perfiles_proteger on public.perfiles_cliente;
create trigger tr_perfiles_proteger
  before update on public.perfiles_cliente
  for each row execute function public.perfiles_proteger_validacion();

notify pgrst, 'reload schema';
