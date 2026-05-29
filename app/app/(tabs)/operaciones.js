import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function OperacionesScreen() {
  const [operaciones, setOperaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarOperaciones();
  }, []);

  async function cargarOperaciones() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await supabase
      .from("perfiles_cliente")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!perfil) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("operaciones")
      .select(
        "id, codigo, monto_bruto, monto_neto, estado, created_at, tarjetas(banco, ultimos_4)",
      )
      .eq("cliente_id", perfil.id)
      .order("created_at", { ascending: false });

    setOperaciones(data || []);
    setLoading(false);
  }

  const estadoLabel = {
    pendiente_verificacion: {
      text: "En revisión",
      color: "#F59E0B",
      bg: "#FFFBEB",
    },
    pendiente_deposito: {
      text: "Por depositar",
      color: "#3B82F6",
      bg: "#EFF6FF",
    },
    observado: { text: "Observado", color: "#EF4444", bg: "#FEF2F2" },
    depositado: { text: "Depositado", color: "#10B981", bg: "#F0FDF4" },
    cancelado: { text: "Cancelado", color: "#6B7280", bg: "#F3F4F6" },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <Text style={styles.empty}>Cargando...</Text>
      ) : operaciones.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Sin operaciones</Text>
          <Text style={styles.empty}>
            Aún no has realizado ninguna operación.
          </Text>
        </View>
      ) : (
        operaciones.map((op) => {
          const estado = estadoLabel[op.estado] || estadoLabel.cancelado;
          return (
            <View key={op.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.codigo}>{op.codigo}</Text>
                <View style={[styles.badge, { backgroundColor: estado.bg }]}>
                  <Text style={[styles.badgeText, { color: estado.color }]}>
                    {estado.text}
                  </Text>
                </View>
              </View>
              <Text style={styles.banco}>
                {op.tarjetas?.banco} •••• {op.tarjetas?.ultimos_4}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.monto}>
                  S/ {op.monto_bruto?.toFixed(2)}
                </Text>
                <Text style={styles.fecha}>
                  {new Date(op.created_at).toLocaleDateString("es-PE")}
                </Text>
              </View>
              {op.estado === "depositado" && (
                <Text style={styles.neto}>
                  Recibiste: S/ {op.monto_neto?.toFixed(2)}
                </Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  codigo: {
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "600",
    color: "#111",
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  banco: { fontSize: 14, color: "#666", marginBottom: 8 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monto: { fontSize: 20, fontWeight: "700", color: "#111" },
  fecha: { fontSize: 13, color: "#999" },
  neto: { fontSize: 13, color: "#10B981", fontWeight: "600", marginTop: 6 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  empty: { fontSize: 14, color: "#999", textAlign: "center" },
});
