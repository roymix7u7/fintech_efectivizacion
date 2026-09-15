import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import COLORS from "../theme/colors";

/**
 * Cabecera para los flujos directos, como enviar una solicitud.
 *
 * Mismo fondo azul y misma altura que la cabecera principal, para que
 * entrar al flujo no se sienta como salir del app. Pero sin menu ni
 * campana: en un flujo con principio y fin, la unica salida que tiene
 * sentido es volver. Ofrecer el menu invita a abandonar a la mitad.
 *
 * children se dibuja debajo del titulo, dentro del azul: ahi va lo que
 * acompana al flujo, como la barra de avance.
 */
export default function CabeceraFlujo({
  titulo,
  subtitulo,
  onVolver,
  volverDeshabilitado = false,
  children,
}) {
  const router = useRouter();

  function volver() {
    if (volverDeshabilitado) return;
    if (onVolver) return onVolver();
    // Si se entro directo por un enlace no hay pantalla anterior, y
    // back() no haria nada: se lleva al cliente a sus solicitudes.
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/solicitudes");
  }

  return (
    <View style={s.cabecera}>
      {/* Iconos claros sobre el azul. Al salir de la pantalla vuelve el
          estilo que tenia la anterior. */}
      <StatusBar style="light" />
      <View style={s.halo} />

      <View style={s.fila}>
        <TouchableOpacity
          onPress={volver}
          disabled={volverDeshabilitado}
          style={[s.volver, volverDeshabilitado && { opacity: 0.4 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.white} />
        </TouchableOpacity>

        <View style={s.textos}>
          <Text style={s.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {subtitulo ? (
            <Text style={s.subtitulo} numberOfLines={1}>
              {subtitulo}
            </Text>
          ) : null}
        </View>

        <Image
          source={require("../../assets/LOGOATK.png")}
          style={s.logo}
          resizeMode="contain"
        />
      </View>

      {children ? <View style={s.extra}>{children}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  cabecera: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    // La misma distancia al borde superior que la cabecera principal.
    paddingTop: 50,
    paddingBottom: 16,
    overflow: "hidden",
  },
  halo: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.4,
    top: -90,
    right: -60,
  },
  fila: { flexDirection: "row", alignItems: "center", gap: 12 },
  volver: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  textos: { flex: 1, minWidth: 0 },
  titulo: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.white,
    letterSpacing: -0.2,
  },
  subtitulo: { fontSize: 13, color: COLORS.secondary, marginTop: 1 },
  logo: { width: 34, height: 34 },
  extra: { marginTop: 14 },
});
