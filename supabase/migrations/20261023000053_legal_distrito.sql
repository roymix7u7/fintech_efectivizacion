-- ============================================================
--  DOMICILIO COMPLETO EN TÉRMINOS Y PRIVACIDAD (versión 0.9.2)
--
--  La 0.9.1 tenía el domicilio sin distrito. Se completa como figura
--  en la ficha RUC: Lince, Lima, Perú. Mismo texto, nueva versión
--  (una publicada no se edita). Sigue siendo borrador.
-- ============================================================

insert into public.documentos_legales (tipo, version, titulo, resumen, borrador, contenido)
select
  d.tipo,
  '0.9.2',
  d.titulo,
  d.resumen,
  true,
  replace(d.contenido,
    'Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403',
    'Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403, Lince, Lima, Perú')
from public.documentos_legales d
where d.tipo in ('terminos', 'privacidad')
  and d.version = '0.9.1'
on conflict (tipo, version) do nothing;
