// Movimiento del rediseño, en un solo lugar (design/DESIGN.md §7).
//
// Todo usa la misma curva: arranca rápido y frena suave, que es lo que
// hace que una pantalla se sienta empujada y no arrastrada. Las
// duraciones viven en tokens.motion.
import { useEffect, useState } from "react";
import { AccessibilityInfo, Easing } from "react-native";
import { motion } from "../theme/tokens";

/** La curva del diseño: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const CURVA = Easing.bezier(...motion.easing);

export const DURACION = motion;

/** Desplazamiento lateral al avanzar o volver, en píxeles. */
export const DESPLAZAMIENTO = 56;

/** Lo que suben los flujos modales al abrirse. */
export const SUBIDA_MODAL = 80;

/**
 * Si la persona pidió menos movimiento en los ajustes del teléfono.
 *
 * No es un lujo de accesibilidad: para alguien con vértigo o
 * sensibilidad vestibular, una pantalla que se desliza y una tarjeta
 * que rebota producen mareo real. Cuando está activado, las
 * animaciones no se reducen: se apagan.
 */
export function useReducirMovimiento() {
  const [reducir, setReducir] = useState(false);

  useEffect(() => {
    let vivo = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => vivo && setReducir(v))
      .catch(() => {});

    // Se puede cambiar con la app abierta, así que hay que escuchar.
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => vivo && setReducir(v),
    );

    return () => {
      vivo = false;
      sub?.remove?.();
    };
  }, []);

  return reducir;
}

/** Duración real a usar: 0 cuando se pidió menos movimiento. */
export const duracion = (ms, reducir) => (reducir ? 0 : ms);
