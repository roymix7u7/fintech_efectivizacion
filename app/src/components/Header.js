import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import COLORS from "../theme/colors";
import { supabase } from "../lib/supabase";

export default function Header({ onMenuPress, titulo }) {
  const [sinLeer, setSinLeer] = useState(0);
  const router = useRouter();

  // Se recuenta al volver a la pantalla, asi la campana se apaga
  // despues de leer los avisos.
  useFocusEffect(
    useCallback(() => {
      contarSinLeer();
    }, []),
  );

  async function contarSinLeer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { count, error } = await supabase
      .from("notificaciones")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("leida", false);

    if (error) return;
    setSinLeer(count || 0);
  }

  return (
    <View style={s.header}>
      <View style={s.left}>
        <Image
          source={require("../../assets/LOGOATK.png")}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.brand}>ALTOQUE PERÚ</Text>
      </View>

      <View style={s.right}>
        <TouchableOpacity
          onPress={() => router.push("/notificaciones")}
          style={s.iconBtn}
        >
          <Ionicons
            name={sinLeer > 0 ? "notifications" : "notifications-outline"}
            size={24}
            color={sinLeer > 0 ? COLORS.secondary : COLORS.white}
          />
          {sinLeer > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{sinLeer > 9 ? "9+" : sinLeer}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onMenuPress} style={s.iconBtn}>
          <Ionicons name="menu-outline" size={26} color={COLORS.white} />
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
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34 },
  brand: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: "700" },
});
