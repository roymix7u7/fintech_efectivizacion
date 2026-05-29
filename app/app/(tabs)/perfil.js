import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function PerfilScreen() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const router = useRouter();

  useEffect(() => {
    cargarPerfil();
  }, []);

  async function cargarPerfil() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUsuario(user);

    const { data } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setPerfil(data);
  }

  async function cerrarSesion() {
    if (typeof window !== "undefined") {
      if (window.confirm("¿Estás seguro de cerrar sesión?")) {
        await supabase.auth.signOut();
        router.replace("/");
      }
    } else {
      Alert.alert("Cerrar sesión", "¿Estás seguro?", [
        { text: "Cancelar" },
        {
          text: "Sí",
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace("/");
          },
        },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {perfil ? perfil.nombres[0] + perfil.apellidos[0] : "??"}
          </Text>
        </View>
        <Text style={styles.nombre}>
          {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Cargando..."}
        </Text>
        <Text style={styles.email}>{usuario?.email}</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Teléfono</Text>
          <Text style={styles.infoValue}>{perfil?.telefono || "—"}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Dirección</Text>
          <Text style={styles.infoValue}>{perfil?.direccion || "—"}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Comisión</Text>
          <Text style={styles.infoValue}>
            {perfil?.tasa_comision ? `${perfil.tasa_comision}%` : "—"}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Estado</Text>
          <Text
            style={[
              styles.infoValue,
              { color: perfil?.validado_por ? "#10B981" : "#F59E0B" },
            ]}
          >
            {perfil?.validado_por ? "Activo" : "En revisión"}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.btnLogout} onPress={cerrarSesion}>
        <Text style={styles.btnLogoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9", padding: 20 },
  avatarContainer: { alignItems: "center", marginTop: 20, marginBottom: 32 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  nombre: { fontSize: 20, fontWeight: "700", color: "#111" },
  email: { fontSize: 14, color: "#666", marginTop: 4 },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  infoLabel: { fontSize: 14, color: "#666" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#111" },
  divider: { height: 1, backgroundColor: "#f0f0f0" },
  btnLogout: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  btnLogoutText: { color: "#EF4444", fontSize: 15, fontWeight: "600" },
});
