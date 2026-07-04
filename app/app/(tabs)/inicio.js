import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function InicioScreen() {
  const [perfil, setPerfil] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [guias, setGuias] = useState([]);
  const router = useRouter();

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setPerfil(perfilData);

    // Últimas 3 noticias
    const { data: alertasData } = await supabase
      .from("alertas_sistema")
      .select("*")
      .eq("activa", true)
      .order("created_at", { ascending: false })
      .limit(3);
    setAlertas(alertasData || []);

    // Guías de banco activas
    const { data: guiasData } = await supabase
      .from("guias_banco")
      .select("id, banco, imagen_portada, activa")
      .eq("activa", true)
      .order("banco");
    setGuias(guiasData || []);
  }

  const alertaColors = {
    info: { bg: "#EBF5FF", border: "#93C5FD", text: "#1E40AF" },
    advertencia: { bg: "#FFF7ED", border: "#FDBA74", text: "#9A3412" },
    critico: { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B" },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Saludo */}
      <Text style={styles.saludo}>Hola, {perfil?.nombres || "Usuario"} 👋</Text>

      {/* Estado de cuenta */}
      <View
        style={[
          styles.estadoCard,
          perfil?.validado_por ? styles.estadoActivo : styles.estadoPendiente,
        ]}
      >
        <Text style={styles.estadoTexto}>
          {perfil?.validado_por ? "✅ Cuenta activa" : "⏳ Cuenta en revisión"}
        </Text>
        {!perfil?.validado_por && (
          <Text style={styles.estadoSub}>
            Tu cuenta está siendo revisada por nuestro equipo.
          </Text>
        )}
      </View>

      {/* Accesos rápidos */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push("/(tabs)/noticias")}
        >
          <Text style={styles.quickIcon}>📢</Text>
          <Text style={styles.quickLabel}>Noticias</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push("/(tabs)/tarjetas")}
        >
          <Text style={styles.quickIcon}>💳</Text>
          <Text style={styles.quickLabel}>Tarjetas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push("/empresa")}
        >
          <Text style={styles.quickIcon}>🏢</Text>
          <Text style={styles.quickLabel}>Empresa</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push("/(tabs)/perfil")}
        >
          <Text style={styles.quickIcon}>👤</Text>
          <Text style={styles.quickLabel}>Mi cuenta</Text>
        </TouchableOpacity>
      </View>

      {/* Últimas noticias */}
      {alertas.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Últimas noticias</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/noticias")}>
              <Text style={styles.verTodo}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          {alertas.map((alerta) => {
            const c = alertaColors[alerta.tipo] || alertaColors.info;
            return (
              <View
                key={alerta.id}
                style={[
                  styles.noticiaCard,
                  { backgroundColor: c.bg, borderColor: c.border },
                ]}
              >
                <Text style={[styles.noticiaTitulo, { color: c.text }]}>
                  {alerta.titulo}
                </Text>
                <Text
                  style={[styles.noticiaMensaje, { color: c.text }]}
                  numberOfLines={2}
                >
                  {alerta.mensaje}
                </Text>
              </View>
            );
          })}
        </>
      )}

      {/* Guías de banco */}
      {guias.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Guías de bancos</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.guiasRow}
          >
            {guias.map((guia) => (
              <TouchableOpacity
                key={guia.id}
                style={styles.guiaCard}
                onPress={() => router.push(`/guia/${guia.banco}`)}
              >
                <Text style={styles.guiaIcon}>🏦</Text>
                <Text style={styles.guiaBanco}>{guia.banco}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40 },
  saludo: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 16 },
  estadoCard: { borderRadius: 12, padding: 16, marginBottom: 24 },
  estadoActivo: { backgroundColor: "#F0FDF4" },
  estadoPendiente: { backgroundColor: "#FFFBEB" },
  estadoTexto: { fontSize: 16, fontWeight: "600", color: "#111" },
  estadoSub: { fontSize: 13, color: "#666", marginTop: 4 },
  quickActions: { flexDirection: "row", gap: 12, marginBottom: 28 },
  quickBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
  quickIcon: { fontSize: 28, marginBottom: 6 },
  quickLabel: { fontSize: 12, color: "#666", fontWeight: "500" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  verTodo: { fontSize: 14, color: "#3B82F6", fontWeight: "500" },
  noticiaCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  noticiaTitulo: { fontWeight: "600", fontSize: 14, marginBottom: 4 },
  noticiaMensaje: { fontSize: 13 },
  guiasRow: { marginBottom: 20 },
  guiaCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginRight: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    width: 100,
  },
  guiaIcon: { fontSize: 32, marginBottom: 8 },
  guiaBanco: { fontSize: 13, fontWeight: "600", color: "#111" },
});
