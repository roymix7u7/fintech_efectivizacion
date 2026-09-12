import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../theme/colors";

export default function MenuLateral({ visible, onClose, perfil }) {
  const router = useRouter();

  if (!visible) return null;

  function navegar(ruta) {
    onClose();
    router.push(ruta);
  }

  const opciones = [
    { label: "Inicio", ruta: "/(tabs)/inicio", icon: "home-outline" },
    {
      label: "Solicitudes",
      ruta: "/(tabs)/solicitudes",
      icon: "document-text-outline",
    },
    {
      label: "Tarjetas y cuentas",
      ruta: "/(tabs)/tarjetas",
      icon: "card-outline",
    },
    { tipo: "separador" },
    {
      label: "Mis avisos",
      ruta: "/notificaciones",
      icon: "notifications-outline",
    },
    {
      label: "Noticias",
      ruta: "/(tabs)/noticias",
      icon: "megaphone-outline",
    },
    { label: "Sobre la empresa", ruta: "/empresa", icon: "business-outline" },
    { tipo: "separador" },
    { label: "Mi cuenta", ruta: "/(tabs)/perfil", icon: "person-outline" },
  ];

  return (
    <View style={s.overlay}>
      <TouchableOpacity
        style={s.backdrop}
        onPress={onClose}
        activeOpacity={1}
      />
      <View style={s.menu}>
        {/* Header */}
        <View style={s.menuHeader}>
          <Image
            source={require("../../assets/LOGOATK.png")}
            style={s.menuLogo}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={s.menuBrand}>ALTOQUE PERÚ WK</Text>
            <Text style={s.menuUser}>
              {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Mi cuenta"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.menuBody}>
          {opciones.map((op, i) => {
            if (op.tipo === "separador") {
              return <View key={`sep-${i}`} style={s.separador} />;
            }
            return (
              <TouchableOpacity
                key={op.label}
                style={s.menuItem}
                onPress={() => navegar(op.ruta)}
              >
                <Ionicons
                  name={op.icon}
                  size={20}
                  color={COLORS.primary}
                  style={{ width: 28 }}
                />
                <Text style={s.menuItemText}>{op.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.menuFooter}>
          <Text style={s.footerText}>AlToque Perú WK v1.0</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    flexDirection: "row",
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  menu: { width: 280, backgroundColor: COLORS.white, height: "100%" },
  menuHeader: {
    backgroundColor: COLORS.primary,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLogo: { width: 40, height: 40 },
  menuBrand: { fontSize: 14, fontWeight: "700", color: COLORS.secondary },
  menuUser: { fontSize: 13, color: COLORS.white, marginTop: 2, opacity: 0.8 },
  closeBtn: { padding: 4 },
  menuBody: { flex: 1, paddingTop: 10 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  menuItemText: { fontSize: 15, color: COLORS.text, fontWeight: "500" },
  separador: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 6,
    marginHorizontal: 20,
  },
  menuFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  footerText: { fontSize: 12, color: COLORS.textLight },
});
