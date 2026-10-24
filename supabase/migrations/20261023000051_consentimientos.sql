-- ============================================================
--  TÉRMINOS, PRIVACIDAD Y CONSENTIMIENTO CON REGISTRO
--
--  La prueba de que un cliente aceptó, qué versión aceptó y cuándo.
--  Ante un reclamo por las fotos de su documento, esto es lo que
--  respalda a la empresa (Ley 29733 de Protección de Datos Personales:
--  consentimiento previo, informado, expreso e inequívoco; para la
--  selfie y el documento, que pueden ser datos sensibles, aparte).
--
--  documentos_legales: cada versión de cada documento. Una versión
--    publicada NO se edita ni se borra: es el texto exacto que alguien
--    aceptó. Para cambiarla se publica otra.
--  consentimientos: una fila por persona y versión aceptada. Tampoco
--    se edita ni se borra desde la app ni el panel.
--
--  Tipos:
--    terminos    Términos y condiciones del servicio
--    privacidad  Política de privacidad
--    biometria   Autorización para fotos del documento y selfie
-- ============================================================

create table if not exists public.documentos_legales (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('terminos', 'privacidad', 'biometria')),
  version       text not null check (length(trim(version)) between 1 and 20),
  titulo        text not null check (length(trim(titulo)) between 3 and 120),
  resumen       text check (resumen is null or length(resumen) <= 300),
  contenido     text not null check (length(contenido) >= 50),
  -- Mientras sea borrador (pendiente de revisión legal) la app lo dice.
  borrador      boolean not null default false,
  publicado_en  timestamptz not null default now(),
  publicado_por uuid references public.users(id),
  unique (tipo, version)
);

create index if not exists documentos_legales_vigente_idx
  on public.documentos_legales (tipo, publicado_en desc);

create table if not exists public.consentimientos (
  id            uuid primary key default gen_random_uuid(),
  -- Sin llave foránea a propósito: la constancia sobrevive aunque la
  -- cuenta se elimine después.
  user_id       uuid not null,
  documento_id  uuid not null references public.documentos_legales(id),
  tipo          text not null,
  version       text not null,
  aceptado_en   timestamptz not null default now(),
  -- Plataforma, versión de la app y modelo: ayuda a probar que fue esa
  -- persona desde su teléfono.
  dispositivo   jsonb check (dispositivo is null or length(dispositivo::text) <= 1000),
  unique (user_id, documento_id)
);

create index if not exists consentimientos_usuario_idx on public.consentimientos (user_id, aceptado_en desc);

alter table public.documentos_legales enable row level security;
alter table public.consentimientos enable row level security;

-- Los documentos se leen antes de tener cuenta (desde el registro).
drop policy if exists documentos_legales_lectura on public.documentos_legales;
create policy documentos_legales_lectura on public.documentos_legales
  for select using (true);

drop policy if exists documentos_legales_publicar on public.documentos_legales;
create policy documentos_legales_publicar on public.documentos_legales
  for insert to authenticated with check (public.es_admin());

-- Cada quien ve sus aceptaciones; el equipo, las de todos.
drop policy if exists consentimientos_lectura on public.consentimientos;
create policy consentimientos_lectura on public.consentimientos
  for select to authenticated using (user_id = auth.uid() or public.es_staff());

-- Sin políticas de insert/update/delete: solo se escribe por
-- aceptar_documentos(), y nunca se modifica.

grant select on public.documentos_legales to anon, authenticated;
grant insert on public.documentos_legales to authenticated;
grant select on public.consentimientos to authenticated;

-- ── La versión vigente de cada documento ──
create or replace view public.documentos_vigentes
with (security_invoker = true) as
  select distinct on (tipo)
    id, tipo, version, titulo, resumen, borrador, publicado_en
  from public.documentos_legales
  order by tipo, publicado_en desc;

grant select on public.documentos_vigentes to anon, authenticated;

-- ── Aceptar ──
-- Registra la aceptación de los documentos indicados con la hora del
-- servidor (no la del teléfono, que se puede cambiar). Solo acepta
-- versiones vigentes: aceptar una vieja no sirve de constancia.
create or replace function public.aceptar_documentos(p_documentos uuid[], p_dispositivo jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_n  int;
begin
  if v_yo is null then
    raise exception 'Inicia sesión para aceptar.' using errcode = '42501';
  end if;

  insert into public.consentimientos (user_id, documento_id, tipo, version, dispositivo)
  select v_yo, v.id, v.tipo, v.version, p_dispositivo
  from public.documentos_vigentes v
  where v.id = any(p_documentos)
  on conflict (user_id, documento_id) do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'registrados', v_n);
end;
$$;

revoke all on function public.aceptar_documentos(uuid[], jsonb) from public, anon;
grant execute on function public.aceptar_documentos(uuid[], jsonb) to authenticated;

-- ── Lo que le falta aceptar a quien pregunta ──
create or replace function public.consentimientos_pendientes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'tipo', v.tipo, 'version', v.version, 'titulo', v.titulo,
    'resumen', v.resumen, 'borrador', v.borrador,
    -- Si ya había aceptado una versión anterior, es una actualización.
    'actualizacion', exists (
      select 1 from public.consentimientos c where c.user_id = auth.uid() and c.tipo = v.tipo
    )
  ) order by v.tipo), '[]'::jsonb)
  from public.documentos_vigentes v
  where auth.uid() is not null
    and not exists (
      select 1 from public.consentimientos c where c.user_id = auth.uid() and c.documento_id = v.id
    );
$$;

revoke all on function public.consentimientos_pendientes() from public, anon;
grant execute on function public.consentimientos_pendientes() to authenticated;

-- ============================================================
--  VERSIÓN INICIAL (BORRADOR)
--  Escrita a partir de lo que el sistema hace de verdad. Los datos
--  entre corchetes y los plazos los debe completar la asesoría legal
--  antes de publicar la versión definitiva desde el panel (Legal).
-- ============================================================

insert into public.documentos_legales (tipo, version, titulo, resumen, borrador, contenido) values
('terminos', '0.9', 'Términos y condiciones',
 'Cómo funciona el servicio, qué te pedimos y qué hacemos nosotros.', true,
$t$## 1. Quiénes somos
AlToque Perú WK ([RAZÓN SOCIAL], RUC [RUC], con domicilio en [DOMICILIO]), en adelante "AlToque", ofrece un servicio para convertir en dinero en tu cuenta bancaria el saldo disponible de tu tarjeta de crédito, a cambio de una comisión.

## 2. Requisitos para usar el servicio
- Ser mayor de 18 años y tener DNI o carnet de extranjería vigente.
- Usar solo tarjetas y cuentas bancarias a tu nombre.
- Dar información verdadera y mantenerla actualizada.

## 3. Cómo funciona
- Antes de que puedas operar, una persona de nuestro equipo verifica tu identidad, tus tarjetas y tus cuentas.
- Envías el comprobante de tu operación desde la app. Cuando lo aprobamos, depositamos el monto menos la comisión en tu cuenta de ahorros registrada.
- La comisión que se te aplica está siempre visible en la app, en Mi cuenta, antes de enviar cada solicitud.

## 4. Lo que no está permitido
- Usar tarjetas, cuentas o documentos de otra persona.
- Enviar comprobantes falsos o alterados.
- Usar el servicio para fines ilícitos, incluido el lavado de activos.

Si detectamos alguno de estos casos podemos rechazar operaciones, pedirte información adicional o suspender tu cuenta, e informar a las autoridades cuando la ley lo exija.

## 5. Tu cuenta
Eres responsable de cuidar tu contraseña. Por seguridad, la sesión se cierra sola después de un tiempo. Si crees que alguien entró a tu cuenta, escríbenos de inmediato.

## 6. Responsabilidad
[Alcance y límites de responsabilidad: a definir con asesoría legal.]

## 7. Reclamos
Puedes presentar un reclamo escribiendo a contacto@altoqueperu.com o por WhatsApp al +51 995 766 986. [Libro de Reclamaciones virtual: pendiente.]

## 8. Cambios en estos términos
Si los cambiamos, te lo avisaremos en la app y te pediremos aceptarlos otra vez antes de seguir operando.

## 9. Ley aplicable
Estos términos se rigen por las leyes de la República del Perú.$t$),

('privacidad', '0.9', 'Política de privacidad',
 'Qué datos tuyos tenemos, para qué, quién los ve y cómo los cuidamos.', true,
$p$## 1. Responsable de tus datos
[RAZÓN SOCIAL], RUC [RUC], domicilio en [DOMICILIO]. Contacto: contacto@altoqueperu.com.

## 2. Qué datos recogemos
- Identidad: nombres, apellidos, tipo y número de documento.
- Contacto: correo, celular, dirección, departamento, provincia y distrito.
- Fotos de identidad: tu documento por ambos lados y una selfie sosteniéndolo.
- Tarjetas: banco, nombre impreso, últimos 4 dígitos y la foto que envías. Nunca el número completo ni el código de seguridad.
- Cuentas bancarias: banco, tipo y número de cuenta o CCI.
- Operaciones: los comprobantes que envías, tus notas y el estado de cada solicitud.
- Uso de la app: el identificador de tu teléfono para enviarte notificaciones y los datos de tu sesión.

## 3. Para qué los usamos
- Verificar tu identidad y prevenir la suplantación y el fraude.
- Procesar tus solicitudes y depositarte el dinero.
- Avisarte del estado de tus trámites.
- Cumplir con nuestras obligaciones legales.

No vendemos tus datos ni los usamos para publicidad de terceros.

## 4. Quién puede verlos
- Solo el personal autorizado de AlToque, y cada persona según su función: verificación, pagos o supervisión. Cada revisión queda registrada.
- Los proveedores que nos dan la tecnología, solo para prestarnos ese servicio: Supabase (base de datos y archivos) y Expo con Google Firebase (envío de notificaciones).
- Las autoridades, cuando la ley lo exija.

## 5. Dónde se guardan
Nuestros servidores están en São Paulo, Brasil. Al usar la app aceptas esta transferencia internacional, que se hace con las mismas medidas de seguridad descritas aquí.

## 6. Cómo los protegemos
- Las fotos y comprobantes se guardan en archivos privados y cifrados, que no son públicos.
- El equipo solo accede a lo que su función necesita, mediante enlaces que caducan.
- Registramos cada acción del equipo sobre tus datos.
- Tu sesión se cierra sola después de un tiempo.

## 7. Cuánto tiempo los guardamos
[Plazos de conservación por tipo de dato: a definir con asesoría legal, considerando las obligaciones de prevención del lavado de activos.]

## 8. Tus derechos
Puedes pedir acceder a tus datos, corregirlos, eliminarlos u oponerte a su uso (derechos ARCO). Escríbenos a contacto@altoqueperu.com desde el correo con el que te registraste. Si no estás conforme con nuestra respuesta, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.

## 9. Banco de datos
[Nombre y código de inscripción del banco de datos personales ante la Autoridad Nacional de Protección de Datos Personales: pendiente.]

## 10. Cambios en esta política
Si la cambiamos, te lo avisaremos en la app y te pediremos aceptarla otra vez.$p$),

('biometria', '0.9', 'Autorización para fotos de identidad',
 'Tu permiso, aparte, para usar las fotos de tu documento y tu selfie.', true,
$b$Autorizo a AlToque a recoger y usar las fotos de mi documento de identidad (por ambos lados) y una selfie en la que sostengo mi documento, con una sola finalidad: verificar que soy quien digo ser y prevenir la suplantación y el fraude.

## Lo que esto significa
- Las fotos las revisa una persona del equipo de verificación de AlToque.
- No se usan para ningún otro fin, ni se comparten con terceros, salvo con las autoridades cuando la ley lo exija.
- Se guardan en archivos privados y cifrados.
- Se conservan [plazo a definir con asesoría legal].

## Puedo retirar esta autorización
Puedo hacerlo cuando quiera escribiendo a contacto@altoqueperu.com. Sin ella AlToque no puede verificar mi identidad y, por lo tanto, no podré operar.

Esta autorización es aparte de los Términos y condiciones y de la Política de privacidad.$b$)
on conflict (tipo, version) do nothing;
