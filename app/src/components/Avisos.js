import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../theme/colors";
import TIPO from "../theme/tipografia";

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

const TONOS = {
  exito: {
    icono: "checkmark-circle",
    fondo: COLORS.success,
    texto: COLORS.white,
  },
  error: {
    icono: "alert-circle",
    fondo: COLORS.error,
    texto: COLORS.white,
  },
  info: {
    icono: "information-circle",
    fondo: COLORS.primary,
    texto: COLORS.white,
  },
  atencion: {
    icono: "warning",
    fondo: COLORS.secondary,
    texto: COLORS.primaryDark,
  },
};

export function ProveedorAvisos({ children }) {
  const [aviso, setAviso] = useState(null);
  const desliz = useRef(new Animated.Value(-140)).current;
  const temporizador = useRef(null);

  const ocultar = useCallback(() => {
    clearTimeout(temporizador.current);
    Animated.timing(desliz, {
      toValue: -140,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && setAviso(null));
  }, [desliz]);

  const mostrar = useCallback(
    (texto, tono = "info", duracion) => {
      if (!texto) return;
      clearTimeout(temporizador.current);
      setAviso({ texto: String(texto), tono });

      Animated.spring(desliz, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
        mass: 0.9,
      }).start();

      // Un error se lee mas despacio que una confirmacion, y suele
      // traer instrucciones. Por eso dura mas en pantalla.
      const ms = duracion ?? (tono === "error" ? 5000 : 3000);
      temporizador.current = setTimeout(ocultar, ms);
    },
    [desliz, ocultar],
  );

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const t = TONOS[aviso?.tono] || TONOS.info;

  return (
    <Contexto.Provider value={{ mostrar, ocultar }}>
      {children}

      {aviso && (
        <Animated.View
          pointerEvents="box-none"
          style={[s.capa, { transform: [{ translateY: desliz }] }]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={ocultar}
            style={[s.aviso, { backgroundColor: t.fondo }]}
          >
            <Ionicons name={t.icono} size={20} color={t.texto} />
            <Text style={[s.texto, { color: t.texto }]}>{aviso.texto}</Text>
            <Ionicons
              name="close"
              size={17}
              color={t.texto}
              style={{ opacity: 0.65 }}
            />
          </TouchableOpacity>
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
    // Debajo de la barra de estado, por encima de todo lo demas.
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingHorizontal: 14,
    zIndex: 999,
    elevation: 999,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    shadowColor: "#0B1426",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
  },
  texto: {
    ...TIPO.cuerpo,
    flex: 1,
    fontWeight: "500",
    lineHeight: 19,
  },
});
