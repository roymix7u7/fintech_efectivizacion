import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import COLORS from "../../src/theme/colors";

export default function SolicitudesScreen() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      cargarSolicitudes();
    }, []),
  );

  async function cargarSolicitudes() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!perfilData) {
      setLoading(false);
      return;
    }
    setPerfil(perfilData);

    const { data } = await supabase
      .from("solicitudes")
      .select(
        "id, codigo, banco, estado, nota_cliente, motivo_rechazo, created_at, tarjetas(banco, ultimos_4)",
      )
      .eq("cliente_id", perfilData.id)
      .order("created_at", { ascending: false });

    setSolicitudes(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  const estadoConfig = {
    pendiente: { text: "En revisión", color: COLORS.warning, bg: "#FFF8E1" },
    aprobado: { text: "Aprobado", color: COLORS.success, bg: "#E8F5E9" },
    rechazado: { text: "Rechazado", color: COLORS.error, bg: "#FFEBEE" },
  };

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargarSolicitudes();
            }}
          />
        }
      >
        {/* Botón nueva solicitud */}
        {perfil && (
          <TouchableOpacity
            style={s.btnNueva}
            onPress={() => router.push("/nueva-solicitud")}
          >
            <Text style={s.btnNuevaText}>+ Nueva solicitud</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <Text style={s.empty}>Cargando...</Text>
        ) : solicitudes.length === 0 ? (
          <View style={s.emptyContainer}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>Sin solicitudes</Text>
            <Text style={s.empty}>
              Envía tu primer comprobante de operación.
            </Text>
          </View>
        ) : (
          solicitudes.map((sol) => {
            const est = estadoConfig[sol.estado] || estadoConfig.pendiente;
            return (
              <View key={sol.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.codigo}>{sol.codigo}</Text>
                  <View style={[s.badge, { backgroundColor: est.bg }]}>
                    <Text style={[s.badgeText, { color: est.color }]}>
                      {est.text}
                    </Text>
                  </View>
                </View>
                <Text style={s.banco}>
                  {sol.tarjetas?.banco} •••• {sol.tarjetas?.ultimos_4}
                </Text>
                {sol.nota_cliente && (
                  <Text style={s.nota} numberOfLines={2}>
                    {sol.nota_cliente}
                  </Text>
                )}
                {sol.estado === "rechazado" && sol.motivo_rechazo && (
                  <View style={s.rechazoBox}>
                    <Text style={s.rechazoLabel}>Motivo del rechazo:</Text>
                    <Text style={s.rechazoTexto}>{sol.motivo_rechazo}</Text>
                  </View>
                )}
                <Text style={s.fecha}>
                  {new Date(sol.created_at).toLocaleDateString("es-PE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  btnNueva: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  btnNuevaText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.text,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  banco: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  nota: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginBottom: 4,
  },
  rechazoBox: {
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  rechazoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.error,
    marginBottom: 2,
  },
  rechazoTexto: { fontSize: 13, color: COLORS.error },
  fecha: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  empty: { fontSize: 14, color: COLORS.textLight, textAlign: "center" },
});
