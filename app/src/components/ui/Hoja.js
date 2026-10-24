// Hoja que sube desde abajo, sobre un velo azul noche.
//
// Es la superficie para decisiones cortas que no merecen pantalla
// propia: elegir departamento, "¿Qué quieres agregar?", "¿Salir de la
// solicitud?", cámara o galería. Sube en 450 ms con la curva del
// diseño; tocar el velo o el botón atrás del teléfono la cierra.
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, motion } from "../../theme/tokens";
import { CURVA, useReducirMovimiento } from "../../lib/movimiento";
import { useAlturaTeclado } from "../../lib/teclado";
import { useArrastreCerrar } from "../../lib/arrastre";

const ALTO = Dimensions.get("window").height;

export function Hoja({ visible, onCerrar, titulo, children, altoMax = 0.72, etiqueta }) {
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  // Con un buscador dentro (ubigeo), el teclado no debe taparla. En
  // Android la ventana ya se achica sola ("resize" en app.json).
  const teclado = useAlturaTeclado();
  const y = useRef(new Animated.Value(ALTO)).current;
  const velo = useRef(new Animated.Value(0)).current;
  // Se mantiene montada mientras baja, para que la salida también se vea.
  const [montada, setMontada] = useState(visible);
  // Arrastrar la barrita hacia abajo la cierra. Al soltar, la salida la
  // hace la animación de siempre, que sigue desde donde quedó el dedo.
  const arrastre = useArrastreCerrar({ alCerrar: onCerrar, deslizar: false });

  useEffect(() => {
    if (visible) {
      setMontada(true);
      arrastre.reiniciar();
      y.setValue(reducir ? 0 : ALTO);
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: reducir ? 0 : motion.sheet, easing: CURVA, useNativeDriver: true }),
        Animated.timing(velo, { toValue: 1, duration: reducir ? 0 : motion.fade, useNativeDriver: true }),
      ]).start();
    } else if (montada) {
      Animated.parallel([
        Animated.timing(y, { toValue: ALTO, duration: reducir ? 0 : 300, easing: CURVA, useNativeDriver: true }),
        Animated.timing(velo, { toValue: 0, duration: reducir ? 0 : 250, useNativeDriver: true }),
      ]).start(() => setMontada(false));
    }
  }, [visible]);

  if (!montada) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: Platform.OS === "ios" ? teclado : 0 }}>
        <Animated.View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,27,51,0.45)", opacity: velo }}
        >
          <Pressable style={{ flex: 1 }} onPress={onCerrar} accessibilityLabel="Cerrar" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={etiqueta || titulo}
          style={{
            maxHeight: ALTO * altoMax,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 26,
            gap: 12,
            transform: [{ translateY: Animated.add(y, arrastre.y) }],
          }}
        >
          {/* Barrita y título: la zona que se arrastra para cerrar. */}
          <View {...arrastre.gestos} style={{ gap: 12, marginTop: -12, paddingTop: 12 }}>
            <View
              style={{ alignItems: "center", paddingVertical: 8, marginVertical: -8 }}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              accessibilityHint="Desliza hacia abajo para cerrar"
              onAccessibilityTap={onCerrar}
            >
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "#C9D3E2" }} />
            </View>
            {titulo ? (
              <Text
                accessibilityRole="header"
                style={{ fontFamily: fonts.display, fontSize: 23, lineHeight: 26, color: colors.text, paddingHorizontal: 4 }}
              >
                {titulo}
              </Text>
            ) : null}
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export default Hoja;
