import { useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/tokens";
import { Boton } from "./ui/Boton";
import { Toque } from "./ui/Toque";
import { Campo } from "./ui/Campos";

/**
 * Ventana para activar la entrada con huella o rostro.
 *
 * Dos usos:
 *   · "ofrecer": justo después de ingresar con la contraseña. Solo
 *     pregunta; la contraseña ya la escribió.
 *   · "clave": desde Mi cuenta. Pide la contraseña una vez para
 *     guardarla protegida con la huella.
 *
 * Es una ventana y no un aviso: el cliente tiene que entender qué está
 * activando y poder decir que no con la misma facilidad.
 *
 * onActivar(clave) es de quien la abre: devuelve un texto de error para
 * mostrarlo aquí, o null si salió bien (o si el cliente canceló el
 * lector, en cuyo caso la ventana sigue abierta para volver a intentar).
 */
export default function OfertaBiometria({ visible, oculta, modo = "ofrecer", cap, reemplaza, onActivar, onCerrar }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [senal, setSenal] = useState(0);

  // Cada vez que se abre, empieza limpia.
  useEffect(() => {
    if (visible) {
      setClave("");
      setError(null);
      setTrabajando(false);
    }
  }, [visible]);

  if (!cap) return null;
  const esRostro = cap.tipo === "rostro";
  const titulo = modo === "clave" ? `Activar ${cap.nombre}` : `¿Entrar con ${cap.nombre} la próxima vez?`;

  async function activar() {
    if (trabajando) return;
    if (modo === "clave" && !clave) {
      setError("Escribe tu contraseña.");
      setSenal((n) => n + 1);
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      const fallo = await onActivar(clave);
      if (fallo) {
        setError(fallo);
        setSenal((n) => n + 1);
      }
    } finally {
      setTrabajando(false);
    }
  }

  return (
    // "oculta" la esconde sin olvidar lo escrito mientras el lector de
    // huella está en pantalla (ver ocultarDuranteLector).
    <Modal visible={visible && !oculta} transparent animationType="fade" onRequestClose={trabajando ? undefined : onCerrar} statusBarTranslucent>
      <KeyboardAvoidingView style={s.fondo} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.tarjeta} accessibilityViewIsModal>
          <View style={s.icono}>
            <Ionicons name={cap.icono} size={34} color={colors.navy} />
          </View>

          <Text style={s.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <Text style={s.bajada}>
            {modo === "clave"
              ? "Escribe tu contraseña una sola vez. La guardamos protegida en tu teléfono y después solo pones " +
                (esRostro ? "tu rostro." : "tu dedo.")
              : "Así no tienes que escribir tu contraseña cada vez. " + (esRostro ? "Solo mira la pantalla." : "Solo pon tu dedo.")}
          </Text>

          <View style={s.puntos}>
            <Punto icono="phone-portrait-outline" texto={`${esRostro ? "Tu rostro" : "Tu huella"} no sale de tu teléfono: nosotros nunca la vemos.`} />
            <Punto icono="shield-checkmark-outline" texto="Si alguien agrega otra huella o rostro al teléfono, se apaga sola." />
            <Punto icono="toggle-outline" texto="Puedes apagarla cuando quieras en Mi cuenta." />
          </View>

          {reemplaza ? (
            <Text style={s.reemplaza}>Reemplaza a la cuenta {reemplaza} en este teléfono.</Text>
          ) : null}

          {modo === "clave" ? (
            <View style={{ alignSelf: "stretch", marginTop: 16 }}>
              <Campo
                etiqueta="Tu contraseña"
                value={clave}
                onChangeText={(t) => {
                  setClave(t);
                  if (error) setError(null);
                }}
                secreto
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={activar}
                placeholder="••••••••"
                error={error}
                senal={senal}
              />
            </View>
          ) : error ? (
            <View style={s.error} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.errorText} />
              <Text style={s.errorTexto}>{error}</Text>
            </View>
          ) : null}

          <Boton
            titulo={trabajando ? "Activando..." : modo === "clave" ? "Continuar" : "Sí, activar"}
            iconoIzq={trabajando ? undefined : cap.icono}
            cargando={trabajando}
            onPress={activar}
            style={{ alignSelf: "stretch", height: 56, marginTop: 18 }}
          />

          <Toque onPress={onCerrar} disabled={trabajando} accessibilityLabel={modo === "clave" ? "Cancelar" : "Ahora no"} style={s.cerrar}>
            <Text style={s.cerrarTexto}>{modo === "clave" ? "Cancelar" : "Ahora no"}</Text>
          </Toque>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * En Android 9 o anterior, el lector de huella es una ventana del app y
 * puede quedar detrás de esta: el cliente vería la ventana sin el lector
 * y creería que el app se colgó. Desde Android 10 el lector lo dibuja el
 * sistema encima de todo, y en iPhone también.
 */
export const ocultarDuranteLector = Platform.OS === "android" && Platform.Version < 29;

function Punto({ icono, texto }) {
  return (
    <View style={s.punto}>
      <Ionicons name={icono} size={17} color={colors.goldText} style={{ marginTop: 1 }} />
      <Text style={s.puntoTexto}>{texto}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(15,27,51,0.6)", justifyContent: "center", padding: 20 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 10,
    alignItems: "center",
  },
  icono: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  titulo: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, letterSpacing: -0.4, color: colors.text, textAlign: "center" },
  bajada: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text2, textAlign: "center", marginTop: 8 },
  puntos: { alignSelf: "stretch", backgroundColor: colors.ground, borderRadius: 18, padding: 14, gap: 10, marginTop: 18 },
  punto: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  puntoTexto: { flex: 1, fontFamily: fonts.label, fontSize: 13, lineHeight: 18, color: colors.text },
  reemplaza: { fontFamily: fonts.strong, fontSize: 12, lineHeight: 17, color: colors.text3, textAlign: "center", marginTop: 12 },
  error: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.errorBg,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  errorTexto: { flex: 1, fontFamily: fonts.label, fontSize: 13, lineHeight: 18, color: colors.errorText },
  cerrar: { minHeight: 48, justifyContent: "center", paddingHorizontal: 20, marginTop: 4 },
  cerrarTexto: { fontFamily: fonts.strong, fontSize: 15, color: colors.text2 },
});
