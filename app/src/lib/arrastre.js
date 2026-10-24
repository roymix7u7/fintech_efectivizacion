// Cerrar una hoja arrastrándola hacia abajo desde su barrita.
//
// La barrita gris arriba de una hoja dice "esto se puede bajar": si no
// responde, la gente la arrastra, no pasa nada y busca otra salida. El
// gesto va en la barrita y la cabecera, no en el contenido, para no
// pelear con el desplazamiento de la lista. Un toque sigue llegando a
// los botones de la cabecera (la X): el gesto solo se toma cuando el
// dedo ya se movió hacia abajo.
import { useRef } from "react";
import { Animated, Dimensions, PanResponder } from "react-native";
import { CURVA } from "./movimiento";

// Se cierra si baja más de esto, o si se suelta con un tirón rápido.
const DISTANCIA = 110;
const VELOCIDAD = 0.9;

/**
 * Devuelve:
 *   y          — Animated.Value del desplazamiento (sumarlo al translateY)
 *   gestos     — panHandlers para la barrita y la cabecera
 *   reiniciar  — dejarla en 0 al volver a abrir
 *
 * alCerrar(animada) se llama cuando el gesto decide cerrar. Con
 * deslizar = true la hoja termina de bajar sola antes de avisar.
 */
export function useArrastreCerrar({ alCerrar, deslizar = true }) {
  const y = useRef(new Animated.Value(0)).current;
  // Siempre la última función: el PanResponder se crea una sola vez.
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISTANCIA || g.vy > VELOCIDAD) {
          if (!deslizar) return cerrar.current();
          Animated.timing(y, {
            toValue: Dimensions.get("window").height,
            duration: 220,
            easing: CURVA,
            useNativeDriver: true,
          }).start(() => cerrar.current());
          return;
        }
        Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }).start(),
    }),
  ).current;

  return { y, gestos: gestos.panHandlers, reiniciar: () => y.setValue(0) };
}
