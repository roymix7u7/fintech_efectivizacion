import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/tokens";
import { Toque } from "./ui/Toque";
import { useReducirMovimiento } from "../lib/movimiento";

/**
 * El círculo grande de la huella (o el rostro), con un anillo que late
 * suave para decir "tócame". Con menos movimiento pedido, queda quieto.
 * Lo usan el ingreso y la pantalla de bloqueo.
 */
export default function BotonBiometria({
  icono = "finger-print",
  cargando,
  onPress,
  etiqueta,
}) {
  const reducir = useReducirMovimiento();
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducir || cargando) {
      pulso.setValue(0);
      return;
    }
    const ciclo = Animated.loop(
      Animated.timing(pulso, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [reducir, cargando, pulso]);

  const escala = pulso.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const opacidad = pulso.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.45, 0.12, 0],
  });

  return (
    <Toque
      onPress={onPress}
      disabled={cargando}
      accessibilityLabel={etiqueta}
      escala={0.94}
      style={s.toque}
    >
      <View style={s.caja}>
        <Animated.View
          style={[
            s.anillo,
            { opacity: opacidad, transform: [{ scale: escala }] },
          ]}
        />
        <View style={s.circulo}>
          <Ionicons name={icono} size={52} color={colors.navy} />
        </View>
      </View>
    </Toque>
  );
}

const s = StyleSheet.create({
  toque: { alignSelf: "center" },
  caja: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  anillo: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.gold,
  },
  circulo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.goldCream,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
});
