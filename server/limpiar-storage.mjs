/**
 * Borra de Storage los archivos que quedaron huerfanos despues de
 * eliminar clientes de prueba.
 *
 * Supabase bloquea el DELETE directo sobre storage.objects desde SQL,
 * asi que hay que pasar por la API de Storage, y eso exige la clave
 * service_role.
 *
 * ESA CLAVE NO SE COMPARTE NI SE GUARDA EN EL REPO. Se pasa por
 * variable de entorno solo mientras corre el script.
 *
 * Uso, desde la carpeta server:
 *
 *   Git Bash:
 *     SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
 *     SUPABASE_SERVICE_ROLE_KEY="ey..." \
 *     node limpiar-storage.mjs
 *
 *   PowerShell:
 *     $env:SUPABASE_URL="https://TU-PROYECTO.supabase.co"
 *     $env:SUPABASE_SERVICE_ROLE_KEY="ey..."
 *     node limpiar-storage.mjs
 *
 * La clave esta en Supabase > Project Settings > API > service_role.
 *
 * Por defecto solo MUESTRA lo que borraria. Para borrar de verdad
 * agrega --confirmar al final.
 */

const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKETS = ["kyc-documentos", "tarjetas-fotos", "comprobantes"];
const CONFIRMADO = process.argv.includes("--confirmar");

if (!URL_BASE || !CLAVE) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Lee las instrucciones al inicio de este archivo.",
  );
  process.exit(1);
}

const cabeceras = {
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  "Content-Type": "application/json",
};

/** Ids de usuario que todavia existen. Sus carpetas no se tocan. */
async function idsVigentes() {
  const r = await fetch(`${URL_BASE}/rest/v1/users?select=id`, {
    headers: cabeceras,
  });
  if (!r.ok) throw new Error(`No se pudo leer users: ${await r.text()}`);
  const filas = await r.json();
  return new Set(filas.map((f) => f.id));
}

/** Lista el contenido de una carpeta del bucket. */
async function listar(bucket, prefijo = "") {
  const r = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: 0 }),
  });
  if (!r.ok) throw new Error(`Error listando ${bucket}: ${await r.text()}`);
  return r.json();
}

async function borrar(bucket, rutas) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: cabeceras,
    body: JSON.stringify({ prefixes: rutas }),
  });
  if (!r.ok) throw new Error(`Error borrando en ${bucket}: ${await r.text()}`);
}

const vigentes = await idsVigentes();
console.log(`Usuarios que siguen existiendo: ${vigentes.size}\n`);

let total = 0;
for (const bucket of BUCKETS) {
  const carpetas = await listar(bucket);
  // Una entrada sin id es una carpeta; con id es un archivo suelto.
  const huerfanas = carpetas
    .filter((c) => c.id === null && !vigentes.has(c.name))
    .map((c) => c.name);

  if (huerfanas.length === 0) {
    console.log(`${bucket}: nada que borrar`);
    continue;
  }

  const rutas = [];
  for (const carpeta of huerfanas) {
    const archivos = await listar(bucket, carpeta);
    for (const a of archivos) {
      if (a.id !== null) rutas.push(`${carpeta}/${a.name}`);
    }
  }

  console.log(
    `${bucket}: ${huerfanas.length} carpetas, ${rutas.length} archivos`,
  );
  rutas.forEach((p) => console.log(`   ${p}`));

  if (CONFIRMADO && rutas.length > 0) {
    await borrar(bucket, rutas);
    console.log(`   borrados`);
  }
  total += rutas.length;
}

console.log(
  CONFIRMADO
    ? `\nListo. ${total} archivos borrados.`
    : `\n${total} archivos se borrarian. Vuelve a correrlo con --confirmar para hacerlo de verdad.`,
);
