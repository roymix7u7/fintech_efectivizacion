// Luces difuminadas del fondo azul noche (cabeceras).
//
// Sin blur real: son gradientes radiales, que cuestan mucho menos que
// una capa de desenfoque y además no gastan uno de los dos cristales
// que cada pantalla tiene permitidos.
//
// Colócalo como primer hijo de un contenedor con overflow: "hidden".
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

/**
 * luces: [{ color, opacity, size, top?, left?, right?, bottom? }]
 */
export function AmbientGlow({ lights = [] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lights.map((l, i) => (
        <Svg
          key={i}
          width={l.size}
          height={l.size}
          style={{
            position: "absolute",
            top: l.top,
            left: l.left,
            right: l.right,
            bottom: l.bottom,
          }}
        >
          <Defs>
            <RadialGradient id={`g${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={l.color} stopOpacity={l.opacity} />
              <Stop offset="1" stopColor={l.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={l.size / 2} cy={l.size / 2} r={l.size / 2} fill={`url(#g${i})`} />
        </Svg>
      ))}
    </View>
  );
}

/** Preset de las cabeceras del Inicio, Mi cuenta y Sobre la empresa. */
export const heroLights = [
  { color: "#E8B800", opacity: 0.45, size: 340, top: 60, right: -150 },
  { color: "#2F56B0", opacity: 0.9, size: 380, bottom: -200, left: -160 },
];

export default AmbientGlow;
