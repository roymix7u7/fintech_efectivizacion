import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../theme/colors";
import TIPO from "../theme/tipografia";

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
        <View style={s.tarjeta}>
          <View style={s.icono}>
            <Ionicons name="lock-closed" size={26} color={COLORS.error} />
          </View>

          <Text style={s.titulo}>Tu cuenta está bloqueada</Text>
          <Text style={s.bajada}>
            Por ahora no puedes ingresar ni enviar operaciones.
          </Text>

          {motivo ? (
            <View style={s.motivo}>
              <Text style={s.motivoEtiqueta}>Motivo</Text>
              <Text style={s.motivoTexto}>{motivo}</Text>
            </View>
          ) : (
            <View style={s.motivo}>
              <Text style={s.motivoTexto}>
                Escríbenos para conocer el detalle y resolverlo.
              </Text>
            </View>
          )}

          <Text style={s.nota}>
            Si crees que es un error, escríbenos y lo revisamos contigo.
          </Text>

          <TouchableOpacity
            style={s.whatsapp}
            onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={19} color={COLORS.white} />
            <Text style={s.whatsappTexto}>Escribir a soporte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.cerrar}
            onPress={onCerrar}
            activeOpacity={0.7}
          >
            <Text style={s.cerrarTexto}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  tarjeta: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
  },
  icono: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.errorLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  titulo: { ...TIPO.seccion, textAlign: "center" },
  bajada: { ...TIPO.apoyo, textAlign: "center", marginTop: 4 },
  motivo: {
    alignSelf: "stretch",
    backgroundColor: COLORS.errorLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  motivoEtiqueta: { ...TIPO.etiqueta, color: COLORS.error, marginBottom: 4 },
  motivoTexto: { ...TIPO.cuerpo, color: COLORS.text },
  nota: { ...TIPO.micro, textAlign: "center", marginTop: 14 },
  whatsapp: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25D366",
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  whatsappTexto: { ...TIPO.tarjeta, color: COLORS.white },
  cerrar: { paddingVertical: 12, marginTop: 2 },
  cerrarTexto: { ...TIPO.tarjeta, color: COLORS.textSecondary },
});
