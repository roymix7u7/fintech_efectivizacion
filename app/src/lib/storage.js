import { supabase } from "./supabase";
import { base64ToArrayBuffer, extraerPath } from "./binario";

export { base64ToArrayBuffer, extraerPath };

/** Tamano maximo aceptado por imagen, en bytes. */
export const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Sube un asset de expo-image-picker al bucket indicado.
 * Devuelve el PATH del objeto, nunca una URL firmada: las URLs
 * firmadas caducan y no deben guardarse en la base de datos.
 */
export async function subirImagen(bucket, path, asset) {
  if (!asset?.base64) {
    throw new Error(
      "La imagen no se pudo leer. Vuelve a tomarla o eligela de nuevo.",
    );
  }

  const buffer = base64ToArrayBuffer(asset.base64);
  if (buffer.byteLength === 0) {
    throw new Error("La imagen llego vacia. Intentalo de nuevo.");
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("La imagen pesa mas de 5 MB. Toma una foto mas liviana.");
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

  if (error) throw error;
  return path;
}

/** Borra objetos del bucket. Se usa para no dejar archivos huerfanos. */
export async function borrarImagenes(bucket, paths) {
  const limpios = paths.filter(Boolean);
  if (limpios.length === 0) return;
  try {
    await supabase.storage.from(bucket).remove(limpios);
  } catch (e) {
    console.warn("No se pudo limpiar Storage:", e?.message);
  }
}

/** Firma un objeto para poder mostrarlo. Devuelve null si no se puede. */
export async function urlFirmada(bucket, valor, segundos = 3600) {
  const path = extraerPath(bucket, valor);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, segundos);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Firma muchos objetos en una sola llamada y devuelve un mapa
 * path -> url. Mucho mas rapido que firmar uno por uno dentro de un
 * bucle, que era lo que hacian las pantallas antes.
 */
export async function urlsFirmadas(bucket, valores, segundos = 3600) {
  const paths = [
    ...new Set(valores.map((v) => extraerPath(bucket, v)).filter(Boolean)),
  ];
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, segundos);
  if (error || !data) return {};

  const mapa = {};
  for (const item of data) {
    if (item.signedUrl) mapa[item.path] = item.signedUrl;
  }
  return mapa;
}

/**
 * URL de un objeto en un bucket publico.
 *
 * No firma nada ni llama al servidor: arma la ruta y devuelve. Para las
 * imagenes de noticias eso importa, porque las ven todos los clientes y
 * una URL fija la puede cachear la CDN, cosa que una firmada no.
 */
export function urlPublica(bucket, valor) {
  const path = extraerPath(bucket, valor);
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}
