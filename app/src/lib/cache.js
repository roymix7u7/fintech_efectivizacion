import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const PREFIJO = "atk:";

/**
 * Datos guardados en el teléfono, que solo se vuelven a descargar si
 * cambiaron.
 *
 * Cada pantalla pinta al instante la última copia que tiene (primero de
 * la memoria, si no del teléfono) y pregunta a la base solo una huella
 * por grupo de datos: perfil, comisiones, tarjetas, cuentas,
 * solicitudes, noticias, guías, avisos (mis_versiones, migración 49).
 * Si las huellas de sus grupos son las mismas que cuando guardó la
 * copia, no descarga nada. Si alguna cambió (el gestor aprobó una
 * tarjeta, cambió una comisión, publicó una noticia), descarga solo esa
 * pantalla y la reemplaza sin mostrar "cargando".
 *
 * La huella se pregunta como mucho una vez cada 20 segundos para toda
 * la app, y de nuevo cada vez que la app vuelve al frente. Los cambios
 * que la app ve en vivo (realtime) o que hace el propio cliente llaman
 * a invalidar(), que obliga a preguntar ya.
 *
 * Al cerrar sesión se borra todo (limpiarCache). Además cada copia
 * lleva el id del usuario: si otra persona entra en el mismo teléfono,
 * no ve nada del anterior aunque la limpieza hubiera fallado.
 */

/** Cronómetro de desarrollo: solo escribe en la consola en modo dev. */
function medir(etiqueta) {
  if (!__DEV__) return () => {};
  const inicio = Date.now();
  return () => console.log("[cache] " + etiqueta + ": " + (Date.now() - inicio) + " ms");
}

// ── Copia en memoria ──────────────────────────────────────────
// Para que cambiar de pestaña sea inmediato: leer el teléfono es
// asíncrono y dejaba un parpadeo de "cargando".
const memoria = new Map();

async function usuarioActual() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function leerCache(clave) {
  try {
    const fin = medir(`leer ${clave}`);
    const crudo = await AsyncStorage.getItem(PREFIJO + clave);
    fin();
    if (!crudo) return null;
    return JSON.parse(crudo);
  } catch {
    // Una cache ilegible no debe romper la pantalla: se ignora y se
    // consulta al servidor como si no existiera.
    return null;
  }
}

export async function guardarCache(clave, datos, extra = {}) {
  const entrada = { datos, guardadoEn: Date.now(), ...extra };
  memoria.set(clave, entrada);
  try {
    await AsyncStorage.setItem(PREFIJO + clave, JSON.stringify(entrada));
  } catch {
    // Sin espacio en disco, por ejemplo. No es motivo para fallar.
  }
}

export async function borrarCache(clave) {
  memoria.delete(clave);
  try {
    await AsyncStorage.removeItem(PREFIJO + clave);
  } catch {}
}

/**
 * Borra todo lo guardado. Se llama al cerrar sesion: los datos de una
 * persona no deben quedar visibles para la siguiente que entre.
 */
export async function limpiarCache() {
  memoria.clear();
  huellas = null;
  try {
    const claves = await AsyncStorage.getAllKeys();
    const mias = claves.filter((k) => k.startsWith(PREFIJO));
    if (mias.length > 0) await AsyncStorage.multiRemove(mias);
  } catch {}
}

// ── Huellas ───────────────────────────────────────────────────
const HUELLAS_VALIDAS_MS = 20 * 1000;
let huellas = null; // { promesa, en }

/**
 * Huella de cada grupo. Varias pantallas que preguntan a la vez
 * comparten la misma consulta.
 */
export function versiones({ forzar } = {}) {
  const ahora = Date.now();
  if (!forzar && huellas && ahora - huellas.en < HUELLAS_VALIDAS_MS) return huellas.promesa;
  const fin = medir("huellas");
  const promesa = supabase.rpc("mis_versiones").then(({ data, error }) => {
    fin();
    if (error) throw error;
    return data || {};
  });
  huellas = { promesa, en: ahora };
  // Si falla (sin internet), la próxima pregunta vuelve a intentar.
  promesa.catch(() => {
    if (huellas?.promesa === promesa) huellas = null;
  });
  return promesa;
}

// Pantallas abiertas que dependen de cada grupo.
const oyentes = new Set();

/**
 * Algo de estos grupos cambió: el propio cliente lo modificó o llegó
 * un aviso en vivo. Las pantallas abiertas que dependen de ellos
 * vuelven a mirar la huella ya, sin esperar los 20 segundos.
 * Sin grupos, vale para todos.
 */
export function invalidar(...grupos) {
  huellas = null;
  for (const o of oyentes) {
    if (!grupos.length || o.grupos.some((g) => grupos.includes(g))) o.revisar();
  }
}

// Al volver al frente, lo que cambió mientras la app estaba en segundo
// plano (una aprobación, una comisión nueva) se ve al abrirla.
AppState.addEventListener("change", (estado) => {
  if (estado === "active") invalidar();
});

/**
 * Datos de una pantalla, guardados en el teléfono.
 *
 *   clave       nombre de la copia ("perfil", "inicio"...)
 *   consultar   descarga los datos completos
 *   grupos      de qué huellas depende; sin grupos se descarga siempre
 *               (pero igual pinta antes la copia guardada)
 *
 * Devuelve:
 *   datos        lo último que se sabe
 *   cargando     true solo cuando no hay nada guardado que mostrar
 *   refrescando  true mientras descarga teniendo ya algo en pantalla
 *   error        el último error, si la descarga falló
 *   recargar     descarga sí o sí (el gesto de tirar hacia abajo)
 */
export function useDatos(clave, consultar, { grupos = [], activo = true } = {}) {
  const inicial = memoria.get(clave);
  const [datos, setDatos] = useState(inicial ? inicial.datos : null);
  const [cargando, setCargando] = useState(!inicial);
  const [refrescando, setRefrescando] = useState(false);
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
  const gruposClave = grupos.join(",");
  const enCurso = useRef(null);

  const revisar = useCallback(
    (forzar = false) => {
      // Una revisión a la vez: el foco y un aviso en vivo pueden llegar
      // juntos y no tiene sentido descargar dos veces.
      if (enCurso.current) return enCurso.current;
      const tarea = (async () => {
        const uid = await usuarioActual();
        if (!uid) return;

        // 1. Pintar lo guardado, si es de esta persona.
        let entrada = memoria.get(clave);
        if (!entrada || entrada.uid !== uid) {
          const delTelefono = await leerCache(clave);
          entrada = delTelefono && delTelefono.uid === uid ? delTelefono : null;
          if (entrada) memoria.set(clave, entrada);
        }
        if (entrada && vivo.current) {
          setDatos(entrada.datos);
          setCargando(false);
        }

        // 2. ¿Cambió algo? Solo la huella.
        const lista = gruposClave ? gruposClave.split(",") : [];
        let firma = null;
        if (lista.length) {
          try {
            const v = await versiones({ forzar });
            firma = lista.map((g) => v[g] ?? "").join("|");
          } catch {
            // Sin conexión: si hay copia, se queda la copia. Unos datos
            // de hace un rato son mejores que una pantalla en blanco.
            if (entrada) return;
          }
        }
        if (!forzar && entrada && firma && entrada.firma === firma) return;

        // 3. Cambió (o no hay copia, o se pidió): descargar.
        if (vivo.current && entrada) setRefrescando(true);
        try {
          const fin = medir(`servidor ${clave}`);
          const frescos = await consultarRef.current();
          fin();
          await guardarCache(clave, frescos, { firma, uid });
          if (!vivo.current) return;
          setDatos(frescos);
          setError(null);
        } catch (e) {
          if (vivo.current) setError(e);
        }
      })().finally(() => {
        enCurso.current = null;
        if (!vivo.current) return;
        setCargando(false);
        setRefrescando(false);
      });
      enCurso.current = tarea;
      return tarea;
    },
    [clave, gruposClave],
  );

  // Cada vez que la pantalla toma el foco se mira la huella (que no
  // cuesta nada si se preguntó hace menos de 20 s).
  useFocusEffect(
    useCallback(() => {
      if (activo) revisar(false);
    }, [activo, revisar]),
  );

  // Avisos de invalidar() mientras la pantalla está abierta.
  useEffect(() => {
    if (!activo) return;
    const o = { grupos: gruposClave ? gruposClave.split(",") : [], revisar: () => revisar(false) };
    oyentes.add(o);
    return () => oyentes.delete(o);
  }, [activo, gruposClave, revisar]);

  const recargar = useCallback(() => {
    huellas = null;
    return revisar(true);
  }, [revisar]);

  return { datos, cargando, refrescando, error, recargar };
}
