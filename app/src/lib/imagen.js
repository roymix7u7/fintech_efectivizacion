import * as ImageManipulator from "expo-image-manipulator";

/**
 * Achica y comprime una foto antes de subirla.
 *
 * Por que hace falta: la camara de un telefono moderno saca imagenes de
 * varios megapixeles, y para leer un DNI o un voucher sobra con mucho
 * menos. Subir el original cuesta tiempo al cliente, espacio en el
 * servidor y otra espera al revisor cuando la abre.
 *
 * 1600 pixeles de ancho es el punto donde un numero de operacion sigue
 * leyendose con claridad y el archivo ya pesa la mitad.
 *
 * Devuelve el mismo objeto que entrega el selector, con uri y base64
 * reemplazados, para que el resto del codigo no cambie.
 */
const ANCHO_MAXIMO = 1600;
const CALIDAD = 0.7;

export async function prepararImagen(asset, anchoMaximo = ANCHO_MAXIMO) {
  if (!asset?.uri) return asset;

  // Si ya es pequena, redimensionarla solo la empeoraria.
  const acciones =
    asset.width && asset.width > anchoMaximo
      ? [{ resize: { width: anchoMaximo } }]
      : [];

  try {
    const resultado = await ImageManipulator.manipulateAsync(
      asset.uri,
      acciones,
      {
        compress: CALIDAD,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );

    return {
      ...asset,
      uri: resultado.uri,
      width: resultado.width,
      height: resultado.height,
      base64: resultado.base64,
    };
  } catch {
    // Si el procesado falla, se sube el original. Vale mas una imagen
    // pesada que un comprobante que no se puede enviar.
    return asset;
  }
}

/** Tamano aproximado en KB de una cadena base64, para mostrarlo o medir. */
export function pesoKb(base64) {
  if (!base64) return 0;
  return Math.round((base64.length * 3) / 4 / 1024);
}
