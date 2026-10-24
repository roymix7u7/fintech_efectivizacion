// La línea entre una tarjeta y su cuenta (Tarjetas y cuentas).
//
//   listo — línea dorada sólida, flecha y la moneda "S/" que la recorre
//           al aparecer: el dinero ya tiene por dónde llegar.
//   falta — punteada dorada: hay tarjeta pero no cuenta que reciba.
//   vacia — punteada gris: hay cuenta pero no tarjeta de ese banco.
//
// Es la explicación de la regla "el depósito va a la cuenta del mismo
// banco" sin escribirla en un párrafo.
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fonts } from "../../theme/tokens";
import { CURVA, useReducirMovimiento } from "../../lib/movimiento";

export function LineaDeposito({ tipo = "listo" }) {
  const reducir = useReducirMovimiento();
  const avance = useRef(new Animated.Value(reducir ? 1 : 0)).current;

  useEffect(() => {
    if (tipo !== "listo" || reducir) return;
    Animated.timing(avance, {
      toValue: 1,
      duration: 1100,
      delay: 200,
      easing: CURVA,
      useNativeDriver: true,
    }).start();
  }, [tipo, avance, reducir]);

  if (tipo !== "listo") {
    return (
      <View style={{ flex: 1, height: 84, justifyContent: "center" }} accessibilityElementsHidden>
        <View
          style={{
            borderTopWidth: 3,
            borderStyle: "dashed",
            borderColor: tipo === "falta" ? "#D9B84A" : "#D5D9E1",
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, height: 84, flexDirection: "row", alignItems: "center" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.gold }} />
      <Svg width={10} height={14} viewBox="0 0 10 14" style={{ marginLeft: -1 }}>
        <Path d="M0 0l10 7-10 7z" fill={colors.gold} />
      </Svg>
      <Animated.View
        style={{
          position: "absolute",
          left: "50%",
          marginLeft: -15,
          opacity: avance.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [
            {
              translateX: avance.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }),
            },
          ],
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.gold,
          borderWidth: 4,
          borderColor: colors.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 9, color: colors.night }}>S/</Text>
      </Animated.View>
    </View>
  );
}

export default LineaDeposito;
