import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
} from "react-native";

export default function EmpresaScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.icon}>🏢</Text>
      <Text style={styles.titulo}>Fintech Efectivización</Text>
      <Text style={styles.subtitulo}>Tu aliado financiero de confianza</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>¿Quiénes somos?</Text>
        <Text style={styles.cardTexto}>
          Somos una empresa peruana especializada en servicios financieros de
          efectivización de tarjetas de crédito. Facilitamos a nuestros clientes
          la conversión de su línea de crédito disponible en efectivo en su
          cuenta bancaria, de manera rápida, segura y transparente.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>¿Cómo funciona?</Text>
        <Text style={styles.cardTexto}>
          1. Regístrate y completa tu verificación de identidad.{"\n\n"}
          2. Agrega tus tarjetas de crédito y cuentas bancarias.{"\n\n"}
          3. Sigue las guías de tu banco para realizar la operación.{"\n\n"}
          4. Recibe el depósito en tu cuenta descontando una pequeña comisión.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Nuestras tasas</Text>
        <View style={styles.tasaRow}>
          <Text style={styles.tasaLabel}>Cliente nuevo</Text>
          <Text style={styles.tasaValor}>1.00%</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.tasaRow}>
          <Text style={styles.tasaLabel}>Cliente frecuente</Text>
          <Text style={styles.tasaValor}>0.50%</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.tasaRow}>
          <Text style={styles.tasaLabel}>Cliente VIP</Text>
          <Text style={styles.tasaValor}>0.35%</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Contáctanos</Text>
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={() => Linking.openURL("https://wa.me/51995766986")}
        >
          <Text style={styles.contactIcon}>💬</Text>
          <Text style={styles.contactText}>WhatsApp: +51 995 766 986</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={() => Linking.openURL("mailto:contacto@fintech.com")}
        >
          <Text style={styles.contactIcon}>📧</Text>
          <Text style={styles.contactText}>contacto@fintech.com</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Versión 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40, alignItems: "center" },
  icon: { fontSize: 64, marginTop: 10, marginBottom: 12 },
  titulo: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 4 },
  subtitulo: { fontSize: 15, color: "#666", marginBottom: 28 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardTitulo: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 10,
  },
  cardTexto: { fontSize: 14, color: "#555", lineHeight: 22 },
  tasaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  tasaLabel: { fontSize: 14, color: "#666" },
  tasaValor: { fontSize: 16, fontWeight: "700", color: "#111" },
  divider: { height: 1, backgroundColor: "#f0f0f0" },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  contactIcon: { fontSize: 20 },
  contactText: { fontSize: 14, color: "#3B82F6", fontWeight: "500" },
  version: { fontSize: 12, color: "#bbb", marginTop: 20 },
});
