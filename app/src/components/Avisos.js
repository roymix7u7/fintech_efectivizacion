import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, motion } from "../theme/tokens";
import { CURVA, useReducirMovimiento } from "../lib/movimiento";

/**
 * Avisos que no interrumpen.
 *
 * El dialogo nativo del sistema detiene todo y exige un toque para
 * seguir. Eso tiene sentido cuando hay que decidir algo, pero no para
 * confirmar que una tarjeta se envio: ahi solo estorba, porque el
 * usuario ya sabe lo que hizo y quiere seguir.
 *
 * Esto aparece arriba, se va solo y deja la pantalla utilizable. Los
 * dialogos quedan reservados para lo que de verdad pide una respuesta,
 * como confirmar que se borra algo.
 */

const Contexto = createContext({ mostrar: () => {} });

export function useAviso() {
  return useContext(Contexto);
}

// La píldora es blanca: casi todas las pantallas tienen la cabecera
// azul noche arriba, justo donde aparece el aviso, y una píldora azul
// se perdía contra ella. El tono lo dan el ícono, su círculo y el borde,
// para que no dependa solo del color.
const TONOS = {
  exito: { icono: "checkmark", fondo: colors.success, color: colors.white, borde: "#A9DCC6" },
  error: { icono: "alert", fondo: colors.errorStrong, color: colors.white, borde: "#F1B5AF" },
  info: { icono: "information", fondo: colors.navy, color: colors.white, borde: "#C9D3E6" },
  atencion: { icono: "alert", fondo: colors.gold, color: colors.night, borde: "#EBCF73" },
};

const FUERA = -90;

export function ProveedorAvisos({ children }) {
  const [aviso, setAviso] = useState(null);
  const desliz = useRef(new Animated.Value(FUERA)).current;
  const opacidad = useRef(new Animated.Value(0)).current;
  const temporizador = useRef(null);
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();

  const ocultar = useCallback(() => {
    clearTimeout(temporizador.current);
    Animated.parallel([
      Animated.timing(desliz, {
        toValue: reducir ? 0 : FUERA,
        duration: reducir ? 0 : 220,
        easing: CURVA,
        useNativeDriver: true,
      }),
      Animated.timing(opacidad, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => finished && setAviso(null));
  }, [desliz, opacidad, reducir]);

  const mostrar = useCallback(
    (texto, tono = "info", duracion) => {
      if (!texto) return;
      clearTimeout(temporizador.current);
      setAviso({ texto: String(texto), tono });

      // Con menos movimiento pedido, aparece en su sitio sin deslizarse.
      desliz.setValue(reducir ? 0 : FUERA);
      Animated.parallel([
        Animated.timing(desliz, {
          toValue: 0,
          duration: reducir ? 0 : motion.toast,
          easing: CURVA,
          useNativeDriver: true,
        }),
        Animated.timing(opacidad, { toValue: 1, duration: reducir ? 0 : 200, useNativeDriver: true }),
      ]).start();

      // Un error se lee mas despacio que una confirmacion, y suele
      // traer instrucciones. Por eso dura mas en pantalla.
      const ms = duracion ?? (tono === "error" ? 5000 : 3000);
      temporizador.current = setTimeout(ocultar, ms);
    },
    [desliz, opacidad, ocultar, reducir],
  );

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const t = TONOS[aviso?.tono] || TONOS.info;

  return (
    <Contexto.Provider value={{ mostrar, ocultar }}>
      {children}

      {aviso && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            s.capa,
            { paddingTop: insets.top + 10, opacity: opacidad, transform: [{ translateY: desliz }] },
          ]}
        >
          <Pressable
            onPress={ocultar}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={aviso.texto}
            accessibilityHint="Toca para cerrar"
            style={[s.aviso, { borderColor: t.borde }]}
          >
            <View style={[s.circulo, { backgroundColor: t.fondo }]}>
              <Ionicons name={t.icono} size={15} color={t.color} />
            </View>
            <Text style={s.texto}>{aviso.texto}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Contexto.Provider>
  );
}

const s = StyleSheet.create({
  capa: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    // Por encima de todo lo demas, incluso de los modales de la app.
    zIndex: 999,
    elevation: 999,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 440,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 18,
    backgroundColor: colors.white,
    // Sombra marcada: sobre el fondo claro de una pantalla, es lo que
    // separa la píldora blanca de lo que tiene detrás.
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
  },
  circulo: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  texto: { flexShrink: 1, fontFamily: fonts.strong, fontSize: 14, lineHeight: 19, color: colors.text },
});
