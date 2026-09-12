/**
 * Utilidades puras, sin dependencias de React Native ni de Supabase,
 * para que puedan probarse con Node directamente.
 */

const ALFABETO =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Convierte base64 a ArrayBuffer.
 *
 * Por que no usamos fetch(uri).blob(): el polyfill de Blob de React
 * Native no expone los bytes al SDK de Supabase, asi que la subida
 * termina creando archivos de 0 bytes. Con base64 hacia ArrayBuffer el
 * archivo sube completo.
 */
export function base64ToArrayBuffer(base64) {
  const limpio = (base64 || "").replace(/[^A-Za-z0-9+/]/g, "");
  const total = limpio.length;
  const bytes = new Uint8Array(Math.floor((total * 3) / 4));
  let p = 0;

  for (let i = 0; i < total; i += 4) {
    const c0 = ALFABETO.indexOf(limpio[i]);
    const c1 = i + 1 < total ? ALFABETO.indexOf(limpio[i + 1]) : -1;
    const c2 = i + 2 < total ? ALFABETO.indexOf(limpio[i + 2]) : -1;
    const c3 = i + 3 < total ? ALFABETO.indexOf(limpio[i + 3]) : -1;

    if (c0 < 0 || c1 < 0) break;
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 < 0) break;
    bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 < 0) break;
    bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes.buffer.slice(0, p);
}

/**
 * Acepta un path de objeto o una URL firmada antigua y devuelve siempre
 * el path. Las filas creadas antes guardaban la URL completa dentro de
 * la columna, asi que hay que soportar las dos formas.
 */
export function extraerPath(bucket, valor) {
  if (!valor) return null;
  if (!valor.includes("://")) return valor;
  const partes = valor.split(`${bucket}/`);
  if (partes.length < 2) return null;
  return decodeURIComponent(partes[1].split("?")[0]);
}
