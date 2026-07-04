import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

export default function NoticiasScreen() {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarNoticias();
  }, []);

  async function cargarNoticias() {
    const { data } = await supabase
      .from("alertas_sistema")
      .select("*")
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setAlertas(data || []);
    setLoading(false);
  }

  const colores = {
    info: { bg: "#EBF5FF", border: "#93C5FD", text: "#1E40AF", icon: "ℹ️" },
    advertencia: {
      bg: "#FFF7ED",
      border: "#FDBA74",
      text: "#9A3412",
      icon: "⚠️",
    },
    critico: { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B", icon: "🚨" },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Noticias y avisos</Text>
      <Text style={styles.subtitulo}>
        Mantente al día con las novedades de la empresa
      </Text>

      {loading ? (
        <Text style={styles.empty}>Cargando...</Text>
      ) : alertas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>Sin noticias</Text>
          <Text style={styles.empty}>
            No hay noticias ni avisos por el momento.
          </Text>
        </View>
      ) : (
        alertas.map((alerta) => {
          const c = colores[alerta.tipo] || colores.info;
          return (
            <View
              key={alerta.id}
              style={[
                styles.card,
                { backgroundColor: c.bg, borderColor: c.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardIcon}>{c.icon}</Text>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitulo, { color: c.text }]}>
                    {alerta.titulo}
                  </Text>
                  <Text style={styles.cardFecha}>
                    {new Date(alerta.created_at).toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardMensaje, { color: c.text }]}>
                {alerta.mensaje}
              </Text>
              {alerta.fecha_fin && (
                <Text style={styles.cardExpira}>
                  Vigente hasta:{" "}
                  {new Date(alerta.fecha_fin).toLocaleDateString("es-PE")}
                </Text>
              )}
            </View>
          );
        })
      )}

      <TouchableOpacity
        style={styles.btnRefresh}
        onPress={() => {
          setLoading(true);
          cargarNoticias();
        }}
      >
        <Text style={styles.btnRefreshText}>Actualizar noticias</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40 },
  titulo: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 4 },
  subtitulo: { fontSize: 14, color: "#666", marginBottom: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  cardIcon: { fontSize: 24, marginTop: 2 },
  cardHeaderText: { flex: 1 },
  cardTitulo: { fontSize: 16, fontWeight: "700" },
  cardFecha: { fontSize: 12, color: "#999", marginTop: 2 },
  cardMensaje: { fontSize: 14, lineHeight: 22 },
  cardExpira: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
    fontStyle: "italic",
  },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },
  empty: { fontSize: 14, color: "#999", textAlign: "center" },
  btnRefresh: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 20,
  },
  btnRefreshText: { color: "#666", fontSize: 14, fontWeight: "500" },
});
