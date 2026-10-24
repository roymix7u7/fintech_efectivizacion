// Fondo detrás de la barra de navegación de Android.
//
// Desde Android 15 la app se dibuja de borde a borde: la barra del
// sistema queda transparente encima del contenido. Con los tres botones
// (unos 48 dp) se veían las tarjetas y los campos pasar por detrás de
// los botones, como si la pantalla estuviera comida abajo. Esta franja
// del color de fondo los separa. Con gestos mide lo que la línea de
// gesto (unos 16 dp) y casi no se nota.
//
// En iOS no se dibuja: ahí lo normal es que el contenido pase por
// debajo de la línea de inicio, y una franja cortaría la pantalla.
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/tokens";

// Pantallas enteras en azul noche (cargando, "Solicitud enviada") piden
// la franja del mismo color mientras están abiertas.
let pedidosNoche = 0;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f(pedidosNoche > 0));

/** Mientras `activo`, la franja va en azul noche. */
export function useFranjaNoche(activo = true) {
  useEffect(() => {
    if (!activo) return;
    pedidosNoche += 1;
    avisar();
    return () => {
      pedidosNoche -= 1;
      avisar();
    };
  }, [activo]);
}

export function FranjaSistema() {
  const insets = useSafeAreaInsets();
  const [noche, setNoche] = useState(pedidosNoche > 0);

  useEffect(() => {
    oyentes.add(setNoche);
    return () => oyentes.delete(setNoche);
  }, []);

  if (Platform.OS !== "android" || !insets.bottom) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: insets.bottom,
        backgroundColor: noche ? colors.night : colors.ground,
        borderTopWidth: noche ? 0 : 1,
        borderTopColor: colors.line,
      }}
    />
  );
}

export default FranjaSistema;
