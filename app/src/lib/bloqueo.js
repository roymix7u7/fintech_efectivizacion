import { useSyncExternalStore } from "react";

/**
 * Bloqueo del app.
 *
 * La sesión ya no se cierra a las dos horas: el app se bloquea y pide la
 * huella (o la contraseña) para seguir, como las apps de banco. Bloquear
 * no es cerrar sesión: lo que el cliente estaba haciendo queda debajo
 * tal cual (una solicitud a medio llenar sigue ahí al desbloquear) y el
 * teléfono sigue recibiendo las notificaciones.
 *
 * Se bloquea:
 *   · al abrir el app desde cerrada (cada proceso nuevo empieza
 *     bloqueado; ingresar o registrarse lo desbloquea);
 *   · tras BLOQUEO_MS sin tocar el app, esté al frente o en segundo
 *     plano. Cuenta desde el último toque, así que quien va a su app del
 *     banco a transferir y vuelve antes de 10 minutos sigue donde estaba.
 *
 * Cerrar sesión de verdad queda para "Cerrar sesión" y para los casos
 * en que el app lo decide (cuenta bloqueada, demasiados intentos).
 */
export const BLOQUEO_MS = 10 * 60 * 1000;

let bloqueada = true;
let ultimoUso = Date.now();
const oyentes = new Set();

function avisar() {
  for (const o of oyentes) o();
}

/** El cliente tocó el app: el plazo vuelve a empezar. */
export function registrarUso() {
  ultimoUso = Date.now();
}

/** Milisegundos desde el último toque. */
export function sinUsoHace() {
  return Date.now() - ultimoUso;
}

export function bloquear() {
  if (bloqueada) return;
  bloqueada = true;
  avisar();
}

/** Ingresó, se registró o confirmó que es él: el app queda abierta. */
export function desbloquear() {
  ultimoUso = Date.now();
  if (!bloqueada) return;
  bloqueada = false;
  avisar();
}

function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** true mientras el app está bloqueada. */
export function useBloqueada() {
  return useSyncExternalStore(suscribir, () => bloqueada);
}
