import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import COLORS from "../theme/colors";
import { useAvisosSinLeer } from "../lib/avisos";

/**
 * Cabecera de las pestañas.
 *
 * Muestra el nombre de la seccion, no la marca. Antes decia "ALTOQUE
 * PERÚ" en todas las pestañas aunque cada una le pasaba su titulo: el
 * cliente ya sabe en que app esta, lo que necesita saber es en que
 * parte. El logo pequeño basta para la identidad.
 */
export default function Header({ onMenuPress, titulo }) {
  const sinLeer = useAvisosSinLeer();
  const router = useRouter();

  return (
    <View style={s.header}>
      <StatusBar style="light" />
      <View style={s.left}>
        <Image
          source={require("../../assets/LOGOATK.png")}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.titulo} numberOfLines={1}>
          {titulo}
        </Text>
      </View>

      <View style={s.right}>
        <TouchableOpacity
          onPress={() => router.push("/notificaciones")}
          style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={
            sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : "Avisos"
          }
        >
          <Ionicons
            name={sinLeer > 0 ? "notifications" : "notifications-outline"}
            size={21}
            color={COLORS.white}
          />
          {sinLeer > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{sinLeer > 9 ? "9+" : sinLeer}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onMenuPress}
          style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
        >
          <Ionicons name="menu" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 14,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logo: { width: 30, height: 30 },
  titulo: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.white,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  // Botones de cristal: se leen sobre el azul sin competir con el titulo.
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: COLORS.white, fontSize: 9, fontWeight: "800" },
});
