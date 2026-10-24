// Cristal esmerilado.
//
// Úsalo SOLO en los cuatro lugares de DESIGN.md §4:
//   1. la tarjeta de "Nueva solicitud" sobre la cabecera del Inicio,
//   2. hojas y menú lateral,
//   3. barra de pestañas y barras fijas inferiores de los flujos,
//   4. botones, sellos y avatar dentro de cabeceras azul noche.
//
// Máximo dos por pantalla: cada uno es una capa que Android compone
// aparte, y de ahí para arriba se siente el arrastre al desplazar.
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { glass } from "../../theme/tokens";

const ANDROID = Platform.OS === "android";

/** variante: "light" | "onNight" | "sheet" */
export function GlassPanel({ variant = "light", radius = 24, style, children }) {
  const g = glass[variant] || glass.light;

  return (
    <View
      style={[
        { borderRadius: radius, overflow: "hidden", borderWidth: 1, borderColor: g.border },
        style,
      ]}
    >
      {/* En Android no se monta el desenfoque. Desde expo-blur 57 el
          blur real exige envolver cada pantalla en un BlurTargetView y
          pasarle la referencia a cada panel; sin eso el módulo avisa y
          cae solo a "sin desenfoque". Además, son capas caras de
          componer al desplazar. El velo más opaco cumple la misma
          función: separar el panel de lo que tiene detrás. */}
      {ANDROID ? null : (
        <BlurView intensity={g.intensity} tint={g.tint} style={StyleSheet.absoluteFill} />
      )}
      {/* Velo encima del desenfoque: sin él, sobre una foto oscura el
          texto del panel queda ilegible. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ANDROID ? g.overlayAndroid : g.overlay }]} />
      {children}
    </View>
  );
}

export default GlassPanel;
