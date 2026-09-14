import { supabase } from "./supabase";

/** Lo que acepta el bucket. Debe coincidir con la migracion. */
export const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];

/** Ancho maximo al que se guardan las imagenes de noticias. */
const ANCHO_MAX = 1400;

/** Calidad del JPEG resultante. */
const CALIDAD = 0.82;

/**
 * Reduce una imagen antes de subirla.
 *
 * Las imagenes generadas con IA suelen venir en 2048 px y varios megas.
 * En el telefono se muestran a unos 350 px de ancho, asi que subirlas
 * tal cual solo hace que cada cliente descargue diez veces mas datos de
 * los que va a ver.
 *
 * Si el navegador no puede procesarla, se devuelve el archivo original:
 * es mejor una imagen pesada que ninguna.
 */
export async function reducirImagen(file) {
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= ANCHO_MAX) {
      bitmap.close?.();
      return file;
    }

    const ancho = ANCHO_MAX;
    const alto = Math.round(bitmap.height * (ancho / bitmap.width));

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise((r) =>
      lienzo.toBlob(r, "image/jpeg", CALIDAD),
    );
    return blob || file;
  } catch {
    return file;
  }
}

/**
 * Sube varias imagenes a un bucket y devuelve { paths, error }.
 *
 * Si una falla se borran las que ya subieron: dejar la mitad de las
 * fotos de una promocion guardadas y la otra mitad no solo produce
 * archivos huerfanos que nadie va a encontrar despues.
 */
export async function subirImagenes(bucket, files, carpeta = "") {
  const paths = [];
  try {
    for (const file of files) {
      if (!TIPOS_ACEPTADOS.includes(file.type)) {
        throw new Error(`${file.name}: solo se aceptan JPG, PNG o WebP.`);
      }

      const reducida = await reducirImagen(file);
      const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const path = carpeta ? `${carpeta}/${nombre}` : nombre;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, reducida, {
          contentType: reducida.type || "image/jpeg",
          upsert: false,
        });
      if (error) throw error;
      paths.push(path);
    }
    return { paths, error: null };
  } catch (e) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
    return { paths: [], error: e.message || "No se pudo subir la imagen." };
  }
}

/** Borra objetos sin hacer ruido si alguno ya no existe. */
export async function borrarImagenes(bucket, paths) {
  const limpios = (paths || []).filter(Boolean);
  if (!limpios.length) return;
  const { error } = await supabase.storage.from(bucket).remove(limpios);
  if (error) console.warn("No se pudieron borrar imagenes:", error.message);
}

/**
 * URL publica de un objeto. No llama al servidor ni caduca, asi que
 * puede guardarse en el estado y usarse en un src directamente.
 */
export function urlPublica(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}
