// Barra fija inferior de cristal, para la acción principal de un flujo
// (Enviar solicitud, Continuar, Guardar cuenta...).
//
// Fija abajo y no al final del formulario: con el teclado o con mucho
// contenido el botón quedaba fuera de pantalla y la gente no sabía que
// tenía que bajar para enviar.
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassPanel } from "./GlassPanel";
import { CURVA, DURACION, SUBIDA_MODAL, useReducirMovimiento } from "../../lib/movimiento";

export function BarraFija({ children }) {
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  const entrada = useRef(new Animated.Value(reducir ? 1 : 0)).current;
  const [teclado, setTeclado] = useState(0);

  useEffect(() => {
    Animated.timing(entrada, {
      toValue: 1,
      duration: reducir ? 0 : DURACION.modalUp,
      easing: CURVA,
      useNativeDriver: true,
    }).start();
  }, [entrada, reducir]);

  // En iOS el teclado tapa la barra; se sube con él. En Android las
  // pantallas la ocultan mientras el teclado está abierto: con Expo 57
  // la ventana ya no se achica sola (ver ScrollConTeclado).
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const a = Keyboard.addListener("keyboardWillShow", (e) => setTeclado(e.endCoordinates.height));
    const b = Keyboard.addListener("keyboardWillHide", () => setTeclado(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: (teclado ? teclado - insets.bottom : 0) + insets.bottom + 14,
        opacity: entrada,
        transform: [
          {
            translateY: entrada.interpolate({
              inputRange: [0, 1],
              outputRange: [SUBIDA_MODAL, 0],
            }),
          },
        ],
      }}
    >
      <GlassPanel variant="light" radius={26} style={{ padding: 8 }}>
        {children}
      </GlassPanel>
    </Animated.View>
  );
}

/** Espacio que hay que dejar al final del contenido para no tapar nada. */
export const ALTO_BARRA_FIJA = 110;

export default BarraFija;
