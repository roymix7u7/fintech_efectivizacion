-- ============================================================
--  ¿YA ESTÁ REGISTRADO? (registro web y app)
--
--  Mientras la persona llena el registro todavía no tiene sesión, y
--  las políticas no dejan leer users ni perfiles_cliente (bien que así
--  sea). Esta función responde solo sí o no, sin devolver ningún dato
--  de la cuenta, para avisar en el mismo formulario y no recién al
--  final, después de pedir el código y las fotos.
--
--  - Correo: cuenta con el correo ya CONFIRMADO. Una sin confirmar no
--    cuenta: el registro reenvía el código y la persona la termina.
--  - DNI / carnet: perfil existente con ese número (perfiles_cliente_dni_unico).
--
--  Formato inválido → null (no se consulta nada). Las mismas reglas
--  siguen en la base al guardar: esto solo adelanta el aviso.
-- ============================================================

create or replace function public.verificar_registro(p_email text default null, p_dni text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_dni   text := trim(coalesce(p_dni, ''));
  r_email boolean := null;
  r_dni   boolean := null;
begin
  if v_email ~ '^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$' and length(v_email) <= 254 then
    r_email := exists (
      select 1 from auth.users u
      where lower(u.email) = v_email and u.email_confirmed_at is not null
    );
  end if;

  if v_dni ~ '^\d{8,9}$' then
    r_dni := exists (select 1 from public.perfiles_cliente p where p.dni = v_dni);
  end if;

  return jsonb_build_object('email', r_email, 'dni', r_dni);
end;
$$;

revoke all on function public.verificar_registro(text, text) from public;
grant execute on function public.verificar_registro(text, text) to anon, authenticated;
