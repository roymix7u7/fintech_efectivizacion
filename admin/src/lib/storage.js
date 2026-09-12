import { supabase } from "./supabase";

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

/**
 * Firma varios objetos en una sola llamada.
 *
 * Devuelve { urls, fallos }. Antes esta funcion se tragaba los errores
 * y devolvia un mapa vacio, asi que cuando una imagen no se podia
 * firmar el panel mostraba "Sin comprobante" como si el cliente no
 * hubiera subido nada. Ahora el motivo llega hasta la pantalla.
 */
export async function urlsFirmadas(bucket, valores, segundos = 3600) {
  const paths = [
    ...new Set(valores.map((v) => extraerPath(bucket, v)).filter(Boolean)),
  ];
  if (paths.length === 0) return { urls: {}, fallos: {} };

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, segundos);

  if (error || !data) {
    const motivo = error?.message || "No se pudo contactar a Storage.";
    const fallos = {};
    paths.forEach((p) => (fallos[p] = motivo));
    return { urls: {}, fallos };
  }

  const urls = {};
  const fallos = {};
  for (const item of data) {
    if (item.signedUrl && item.path) urls[item.path] = item.signedUrl;
    else if (item.path) {
      fallos[item.path] =
        item.error ||
        "El archivo no existe en Storage o no tienes permiso para verlo.";
    }
  }
  return { urls, fallos };
}

/**
 * Firma una lista de filas y agrega dos campos: la url para mostrar y,
 * si no se pudo, el motivo.
 */
export async function firmarCampo(bucket, filas, campoOrigen, campoDestino) {
  const { urls, fallos } = await urlsFirmadas(
    bucket,
    filas.map((f) => f[campoOrigen]),
  );
  return filas.map((f) => {
    const path = extraerPath(bucket, f[campoOrigen]);
    return {
      ...f,
      [campoDestino]: path ? urls[path] || null : null,
      [`${campoDestino}_path`]: path,
      [`${campoDestino}_error`]: path
        ? urls[path]
          ? null
          : fallos[path] || "No se pudo firmar el archivo."
        : f[campoOrigen]
          ? "La ruta guardada no apunta a este bucket."
          : null,
    };
  });
}
