-- ============================================================
--  SEGUNDA FOTO DE LA TARJETA
--
--  Hasta ahora se guardaba una sola imagen. Pero los datos que
--  hay que verificar no siempre estan en la misma cara: en
--  muchas tarjetas el nombre del titular va al frente y los
--  ultimos digitos al reverso, o al reves.
--
--  Se agrega una columna en vez de convertir la existente en
--  lista, para no tener que migrar las filas que ya existen:
--  siguen siendo validas, con su unica foto como frente.
--
--  El reverso es opcional. Si la tarjeta muestra todo en una
--  cara, obligar a una segunda foto solo daria trabajo de mas.
-- ============================================================

alter table public.tarjetas
  add column if not exists foto_reverso text;

comment on column public.tarjetas.foto_tarjeta is
  'Ruta del objeto en el bucket tarjetas-fotos. Cara principal.';

comment on column public.tarjetas.foto_reverso is
  'Ruta de la segunda cara. Opcional: solo si los datos a verificar
   no caben en una sola foto.';

-- Comprobacion
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tarjetas'
  and column_name in ('foto_tarjeta', 'foto_reverso');
