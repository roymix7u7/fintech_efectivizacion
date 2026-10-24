import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import COLORS from "../theme/colors";
import TIPO from "../theme/tipografia";
import { CURVA, useReducirMovimiento } from "../lib/movimiento";

/**
 * Bloque de carga con latido.
 *
 * Se le da la forma de lo que va a aparecer, no una rueda en medio de
 * la pantalla: asi el salto al llegar los datos es minimo y la
 * pantalla no se reacomoda delante del usuario.
 */
export function Esqueleto({ alto = 14, ancho = "100%", radio = 8, estilo }) {
  const latido = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(latido, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);

  return (
    <Animated.View
      style={[
        {
          height: alto,
          width: ancho,
          borderRadius: radio,
          backgroundColor: COLORS.borderLight,
          opacity: latido,
        },
        estilo,
      ]}
    />
  );
}

/** Tarjetas de lista mientras cargan. */
export function EsqueletoLista({ filas = 4, alto = 92 }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: filas }).map((_, i) => (
        <View key={i} style={[s.tarjeta, { minHeight: alto }]}>
          <View style={s.fila}>
            <Esqueleto alto={12} ancho={90} />
            <Esqueleto alto={12} ancho={54} />
          </View>
          <Esqueleto alto={16} ancho="65%" estilo={{ marginTop: 12 }} />
          <Esqueleto alto={12} ancho="40%" estilo={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

/** Bloque de tres cifras, para el resumen del inicio. */
export function EsqueletoResumen() {
  return (
    <View style={s.resumen}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.resumenItem}>
          <Esqueleto alto={34} ancho={34} radio={17} />
          <Esqueleto alto={20} ancho={28} estilo={{ marginTop: 10 }} />
          <Esqueleto alto={10} ancho={52} estilo={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

/**
 * Pantalla completa de espera. Solo para la primera carga, cuando
 * todavia no hay nada que mostrar con forma.
 */
export function PantallaCargando({ mensaje }) {
  return (
    <View style={s.pantalla}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      {mensaje ? <Text style={s.mensaje}>{mensaje}</Text> : null}
    </View>
  );
}

/**
 * Entrada suave. Envuelve contenido que acaba de llegar para que
 * aparezca en vez de saltar de golpe.
 */
export function Aparece({ children, retraso = 0, estilo }) {
  const reducir = useReducirMovimiento();
  const valor = useRef(new Animated.Value(0)).current;

  // El "fadeUp" del prototipo: sube 12 px mientras aparece, en 320 ms.
  useEffect(() => {
    Animated.timing(valor, {
      toValue: 1,
      duration: reducir ? 0 : 320,
      delay: reducir ? 0 : retraso,
      easing: CURVA,
      useNativeDriver: true,
    }).start();
  }, [valor, retraso, reducir]);

  return (
    <Animated.View
      style={[
        {
          opacity: valor,
          transform: [
            {
              translateY: valor.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
        estilo,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  fila: { flexDirection: "row", justifyContent: "space-between" },
  resumen: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  resumenItem: { flex: 1, alignItems: "center" },
  pantalla: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.background,
  },
  mensaje: { ...TIPO.apoyo, textAlign: "center" },
});
