import { useCallback, useEffect, useState } from "react";
import { SUPABASE_URL } from "./supabase";

/**
 * Comprueba si se puede hablar con el servidor.
 *
 * No pregunta si hay wifi, sino si la app alcanza a Supabase, que es lo
 * que de verdad importa: un telefono puede estar conectado a una red
 * sin salida a internet, o al portal cautivo de un hotel, y el wifi
 * dira que todo esta bien mientras nada funciona.
 *
 * Cualquier respuesta HTTP sirve como prueba, incluso un 401: significa
 * que el servidor contesto. Solo se considera caida si la peticion
 * falla o se agota el tiempo.
 */
export async function hayConexion(msEspera = 6000) {
  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), msEspera);
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      signal: corte.signal,
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Traduce a lenguaje humano el fallo de red mas comun. */
export function esFalloDeRed(error) {
  const msg = error?.message || String(error || "");
  return (
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("ERR_INTERNET") ||
    msg.includes("aborted") ||
    msg.includes("timeout")
  );
}

/**
 * Estado de la conexion para una pantalla.
 *
 * Devuelve "revisando" mientras comprueba, para que la pantalla pueda
 * esperar en vez de mostrar un error que quiza no exista.
 */
export function useConexion() {
  const [estado, setEstado] = useState("revisando");

  const revisar = useCallback(async () => {
    setEstado("revisando");
    const ok = await hayConexion();
    setEstado(ok ? "conectado" : "sin_conexion");
    return ok;
  }, []);

  useEffect(() => {
    let vivo = true;
    hayConexion().then((ok) => {
      if (vivo) setEstado(ok ? "conectado" : "sin_conexion");
    });
    return () => {
      vivo = false;
    };
  }, []);

  return { estado, revisar };
}
