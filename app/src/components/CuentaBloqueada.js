import { Modal, View, Text, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/tokens";
import { Boton } from "./ui/Boton";
import { Toque } from "./ui/Toque";

const WHATSAPP = "51995766986";

/**
 * "Tu cuenta esta bloqueada", con el motivo.
 *
 * Es una ventana y no un aviso flotante a proposito: los avisos se van
 * solos a los pocos segundos, y aqui la persona necesita leer el motivo
 * entero, pensarlo y tener a mano como reclamar. Un mensaje que
 * desaparece deja a alguien golpeando el boton de ingresar sin entender
 * que pasa.
 *
 * El motivo lo escribe el supervisor al bloquear y llega tal cual, asi
 * que el texto se muestra completo en vez de resumirse.
 */
export default function CuentaBloqueada({ visible, motivo, onCerrar }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View style={s.fondo}>
        <View style={s.tarjeta} accessibilityViewIsModal>
          <View style={s.icono}>
            <Ionicons name="lock-closed" size={26} color={colors.errorText} />
          </View>

          <Text style={s.titulo} accessibilityRole="header">Tu cuenta está bloqueada</Text>
          <Text style={s.bajada}>Por ahora no puedes ingresar ni enviar operaciones.</Text>

          <View style={s.motivo}>
            {motivo ? <Text style={s.motivoEtiqueta}>MOTIVO</Text> : null}
            <Text style={s.motivoTexto}>
              {motivo || "Escríbenos para conocer el detalle y resolverlo."}
            </Text>
          </View>

          <Text style={s.nota}>Si crees que es un error, escríbenos y lo revisamos contigo.</Text>

          <Boton
            titulo="Escribir a soporte"
            iconoIzq="logo-whatsapp"
            onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)}
            style={{ alignSelf: "stretch", height: 54, marginTop: 18 }}
          />

          <Toque onPress={onCerrar} accessibilityLabel="Entendido" style={s.cerrar}>
            <Text style={s.cerrarTexto}>Entendido</Text>
          </Toque>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 10,
    alignItems: "center",
  },
  icono: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.errorBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  titulo: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: colors.text, textAlign: "center" },
  bajada: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2, textAlign: "center", marginTop: 6 },
  motivo: {
    alignSelf: "stretch",
    backgroundColor: colors.errorBg,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 4,
  },
  motivoEtiqueta: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.4, color: colors.errorText },
  motivoTexto: { fontFamily: fonts.label, fontSize: 15, lineHeight: 22, color: colors.text },
  nota: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.text3, textAlign: "center", marginTop: 14 },
  cerrar: { minHeight: 48, justifyContent: "center", paddingHorizontal: 20, marginTop: 4 },
  cerrarTexto: { fontFamily: fonts.strong, fontSize: 15, color: colors.text2 },
});
