import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIJO = "atk:";

/**
 * Guarda la ultima respuesta en el telefono y la muestra de inmediato
 * la proxima vez, mientras consulta en segundo plano.
 *
 * La idea: al abrir la app ya hay algo que leer. Si los datos siguen
 * igual, el usuario no nota nada. Si cambiaron, la pantalla se
 * actualiza sola un instante despues.
 *
 * No sirve para dinero ni para estados que deban ser exactos al
 * segundo. Para eso se refresca siempre y se espera.
 */

export async function leerCache(clave) {
  try {
    const crudo = await AsyncStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const { datos, guardadoEn } = JSON.parse(crudo);
    return { datos, guardadoEn };
  } catch {
    // Una cache ilegible no debe romper la pantalla: se ignora y se
    // consulta al servidor como si no existiera.
    return null;
  }
}

export async function guardarCache(clave, datos) {
  try {
    await AsyncStorage.setItem(
      PREFIJO + clave,
      JSON.stringify({ datos, guardadoEn: Date.now() }),
    );
  } catch {
    // Sin espacio en disco, por ejemplo. No es motivo para fallar.
  }
}

export async function borrarCache(clave) {
  try {
    await AsyncStorage.removeItem(PREFIJO + clave);
  } catch {}
}

/**
 * Borra todo lo guardado. Se llama al cerrar sesion: los datos de una
 * persona no deben quedar visibles para la siguiente que entre.
 */
export async function limpiarCache() {
  try {
    const claves = await AsyncStorage.getAllKeys();
    const mias = claves.filter((k) => k.startsWith(PREFIJO));
    if (mias.length > 0) await AsyncStorage.multiRemove(mias);
  } catch {}
}

/**
 * Datos con pintado inmediato y refresco en segundo plano.
 *
 * Devuelve:
 *   datos        lo ultimo que se sabe, de la cache o del servidor
 *   cargando     true solo la primera vez, cuando no hay nada que pintar
 *   refrescando  true mientras consulta teniendo ya algo en pantalla
 *   desactualizado  true si lo que se ve viene de la cache
 *   recargar     para el gesto de tirar hacia abajo
 */
export function useDatos(clave, consultar, { activo = true } = {}) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [desactualizado, setDesactualizado] = useState(false);
  const [error, setError] = useState(null);

  // Evita escribir en un componente que ya se desmonto.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const consultarRef = useRef(consultar);
  consultarRef.current = consultar;

  const traer = useCallback(
    async (mostrarRefresco) => {
      if (mostrarRefresco && vivo.current) setRefrescando(true);
      try {
        const frescos = await consultarRef.current();
        if (!vivo.current) return;
        setDatos(frescos);
        setDesactualizado(false);
        setError(null);
        guardarCache(clave, frescos);
      } catch (e) {
        if (!vivo.current) return;
        // Si ya hay algo en pantalla, se deja: unos datos de hace un
        // minuto son mejores que un error en blanco.
        setError(e);
      } finally {
        if (!vivo.current) return;
        setCargando(false);
        setRefrescando(false);
      }
    },
    [clave],
  );

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;

    (async () => {
      const guardado = await leerCache(clave);
      if (cancelado || !vivo.current) return;

      if (guardado) {
        // Pintar primero, consultar despues.
        setDatos(guardado.datos);
        setDesactualizado(true);
        setCargando(false);
        traer(true);
      } else {
        traer(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [clave, activo, traer]);

  const recargar = useCallback(() => traer(true), [traer]);

  return { datos, cargando, refrescando, desactualizado, error, recargar };
}
