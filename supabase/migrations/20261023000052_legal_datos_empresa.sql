-- ============================================================
--  DATOS DE LA EMPRESA EN TÉRMINOS Y PRIVACIDAD (versión 0.9.1)
--
--  La 0.9 tenía la razón social, el RUC y el domicilio entre
--  corchetes. Una versión publicada no se edita (es lo que alguien
--  aceptó), así que se publica la 0.9.1 con el mismo texto y esos
--  datos completos. Sigue siendo borrador: faltan plazos de
--  conservación, límites de responsabilidad y la inscripción del banco
--  de datos, que define la asesoría legal.
--
--  La autorización de fotos (biometria) no menciona a la empresa por
--  sus datos legales: se queda en la 0.9.
-- ============================================================

insert into public.documentos_legales (tipo, version, titulo, resumen, borrador, contenido)
select
  d.tipo,
  '0.9.1',
  d.titulo,
  d.resumen,
  true,
  replace(replace(replace(replace(
    d.contenido,
    'AlToque Perú WK ([RAZÓN SOCIAL], RUC [RUC], con domicilio en [DOMICILIO])',
    'ALTOQUE PERU WK S.A.C., con RUC 20611531410 y domicilio en Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403'),
    '[RAZÓN SOCIAL], RUC [RUC], domicilio en [DOMICILIO].',
    'ALTOQUE PERU WK S.A.C., con RUC 20611531410 y domicilio en Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403.'),
    '[RAZÓN SOCIAL]', 'ALTOQUE PERU WK S.A.C.'),
    '[RUC]', '20611531410')
from public.documentos_legales d
where d.tipo in ('terminos', 'privacidad')
  and d.version = '0.9'
on conflict (tipo, version) do nothing;
