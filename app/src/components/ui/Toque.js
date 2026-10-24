// Superficie tocable que se hunde al presionarla (escala 0.97).
//
// Es la respuesta física que pide el diseño en todos los toques: sin
// ella, en un teléfono lento no se sabe si el toque se registró y la
// gente vuelve a tocar.
import { useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { motion } from "../../theme/tokens";
import { useReducirMovimiento } from "../../lib/movimiento";

// Lo que decide dónde y cuánto ocupa el toque va en el Pressable, que es
// el hijo real del contenedor. Antes todo iba a la vista de adentro y un
// "flex: 1" no hacía nada: en una fila, cada opción medía lo que su
// texto, y los selectores y las caras de la tarjeta se deformaban.
const EXTERIOR = new Set([
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "width",
  "minWidth",
  "maxWidth",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginHorizontal",
  "marginVertical",
  "marginStart",
  "marginEnd",
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "zIndex",
]);

function repartir(style) {
  const plano = StyleSheet.flatten(style) || {};
  const fuera = {};
  const dentro = {};
  for (const k in plano) (EXTERIOR.has(k) ? fuera : dentro)[k] = plano[k];
  // Si el toque crece para llenar su lugar, lo de adentro crece con él.
  if (fuera.flex != null || fuera.flexGrow != null) dentro.flexGrow = 1;
  return { fuera, dentro };
}

export function Toque({
  onPress,
  style,
  children,
  disabled,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  hitSlop,
  escala = 0.97,
}) {
  const valor = useRef(new Animated.Value(1)).current;
  const reducir = useReducirMovimiento();
  const { fuera, dentro } = repartir(style);

  const animar = (v) => {
    if (reducir) return;
    Animated.timing(valor, {
      toValue: v,
      duration: motion.press,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animar(escala)}
      onPressOut={() => animar(1)}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState ?? { disabled: Boolean(disabled) }}
      style={fuera}
    >
      <Animated.View style={[dentro, { transform: [{ scale: valor }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default Toque;
