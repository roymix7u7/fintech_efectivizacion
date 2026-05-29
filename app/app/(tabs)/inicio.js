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
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [stats, setStats] = useState({ pendientes: 0, depositadas: 0 });
  const [alertas, setAlertas] = useState([]);
  const router = useRouter();

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUsuario(user);

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setPerfil(perfilData);

    // Contar operaciones
    if (perfilData) {
      const { count: pendientes } = await supabase
        .from("operaciones")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", perfilData.id)
        .in("estado", ["pendiente_verificacion", "pendiente_deposito"]);

      const { count: depositadas } = await supabase
        .from("operaciones")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", perfilData.id)
        .eq("estado", "depositado");

      setStats({ pendientes: pendientes || 0, depositadas: depositadas || 0 });
    }

    // Alertas activas
    const { data: alertasData } = await supabase
      .from("alertas_sistema")
      .select("*")
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setAlertas(alertasData || []);
  }

  const alertaColors = {
    info: { bg: "#EBF5FF", border: "#93C5FD", text: "#1E40AF" },
    advertencia: { bg: "#FFF7ED", border: "#FDBA74", text: "#9A3412" },
    critico: { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B" },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Alertas globales */}
      {alertas.map((alerta) => {
        const c = alertaColors[alerta.tipo] || alertaColors.info;
        return (
          <View
            key={alerta.id}
            style={[
              styles.alerta,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            <Text style={[styles.alertaTitulo, { color: c.text }]}>
              {alerta.titulo}
            </Text>
            <Text style={[styles.alertaMensaje, { color: c.text }]}>
              {alerta.mensaje}
            </Text>
          </View>
        );
      })}

      {/* Saludo */}
      <Text style={styles.saludo}>Hola, {perfil?.nombres || "Usuario"} 👋</Text>

      {/* Estado de cuenta */}
      {usuario && perfil && (
        <View
          style={[
            styles.estadoCard,
            perfil.validado_por ? styles.estadoActivo : styles.estadoPendiente,
          ]}
        >
          <Text style={styles.estadoTexto}>
            {perfil.validado_por ? "✅ Cuenta activa" : "⏳ Cuenta en revisión"}
          </Text>
          {!perfil.validado_por && (
            <Text style={styles.estadoSub}>
              Tu cuenta está siendo revisada por nuestro equipo.
            </Text>
          )}
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.pendientes}</Text>
          <Text style={styles.statLabel}>En proceso</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.depositadas}</Text>
          <Text style={styles.statLabel}>Depositadas</Text>
        </View>
      </View>

      {/* Acción rápida */}
      {perfil?.validado_por && (
        <TouchableOpacity
          style={styles.btnNuevaOp}
          onPress={() => router.push("/nueva-operacion")}
        >
          <Text style={styles.btnNuevaOpText}>+ Nueva operación</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40 },
  saludo: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 16 },
  alerta: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  alertaTitulo: { fontWeight: "600", fontSize: 14, marginBottom: 4 },
  alertaMensaje: { fontSize: 13 },
  estadoCard: { borderRadius: 12, padding: 16, marginBottom: 20 },
  estadoActivo: { backgroundColor: "#F0FDF4" },
  estadoPendiente: { backgroundColor: "#FFFBEB" },
  estadoTexto: { fontSize: 16, fontWeight: "600", color: "#111" },
  estadoSub: { fontSize: 13, color: "#666", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
  statNumber: { fontSize: 28, fontWeight: "700", color: "#111" },
  statLabel: { fontSize: 13, color: "#666", marginTop: 4 },
  btnNuevaOp: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  btnNuevaOpText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
