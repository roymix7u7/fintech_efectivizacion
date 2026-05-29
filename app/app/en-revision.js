import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function EnRevisionScreen() {
  const router = useRouter();

  async function verificarEstado() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.replace("/");

    const { data } = await supabase
      .from("users")
      .select("estado")
      .eq("id", user.id)
      .single();

    if (data?.estado === "activo") {
      router.replace("/(tabs)/inicio");
    } else {
      if (typeof window !== "undefined") {
        window.alert("Tu cuenta aún está en revisión. Intenta más tarde.");
      }
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={styles.title}>Cuenta en revisión</Text>
      <Text style={styles.mensaje}>
        Tu cuenta está siendo revisada por nuestro equipo. Te notificaremos
        cuando sea aprobada.
      </Text>
      <Text style={styles.sub}>Este proceso puede tomar unas horas.</Text>

      <TouchableOpacity style={styles.btnVerificar} onPress={verificarEstado}>
        <Text style={styles.btnVerificarText}>Verificar estado</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnLogout} onPress={cerrarSesion}>
        <Text style={styles.btnLogoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  icon: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 12 },
  mensaje: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: "#999", marginBottom: 32 },
  btnVerificar: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  btnVerificarText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnLogout: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    width: "100%",
    alignItems: "center",
  },
  btnLogoutText: { color: "#666", fontSize: 15 },
});
