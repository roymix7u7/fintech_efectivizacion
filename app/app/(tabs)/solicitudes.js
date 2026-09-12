import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import { urlsFirmadas, extraerPath } from "../../src/lib/storage";

const BUCKET = "comprobantes";

export default function SolicitudesScreen() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      cargarSolicitudes();
    }, []),
  );

  async function cargarSolicitudes() {
    try {
      await cargarSolicitudesInterno();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function cargarSolicitudesInterno() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!perfilData) return;
    setPerfil(perfilData);

    const { data } = await supabase
      .from("solicitudes")
      .select(
        "id, codigo, banco, estado, nota_cliente, motivo_rechazo, comprobante_url, created_at, tarjetas(banco, ultimos_4)",
      )
      .eq("cliente_id", perfilData.id)
      .order("created_at", { ascending: false });

    // Las URLs firmadas se generan al leer, no se guardan en la base.
    const lista = data || [];
    const firmadas = await urlsFirmadas(
      BUCKET,
      lista.map((x) => x.comprobante_url),
    );
    setSolicitudes(
      lista.map((x) => ({
        ...x,
        comprobante_vista:
          firmadas[extraerPath(BUCKET, x.comprobante_url)] || null,
      })),
    );
  }

  const estadoConfig = {
    pendiente: {
      text: "En revisión",
      color: COLORS.warning,
      bg: COLORS.warningLight,
      icon: "time-outline",
    },
    aprobado: {
      text: "Aprobado",
      color: COLORS.success,
      bg: COLORS.successLight,
      icon: "checkmark-circle-outline",
    },
    rechazado: {
      text: "Rechazado",
      color: COLORS.error,
      bg: COLORS.errorLight,
      icon: "close-circle-outline",
    },
  };

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Solicitudes" />

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargarSolicitudes();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {perfil && (
          <TouchableOpacity
            style={s.btnNueva}
            onPress={() => router.push("/nueva-solicitud")}
          >
            <Ionicons name="add-circle" size={22} color={COLORS.primaryDark} />
            <Text style={s.btnNuevaText}>Nueva solicitud</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <Text style={s.empty}>Cargando...</Text>
        ) : solicitudes.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={COLORS.textLight}
            />
            <Text style={s.emptyTitle}>Sin solicitudes</Text>
            <Text style={s.empty}>
              Envía tu primer comprobante de operación
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
                    <Ionicons name={est.icon} size={14} color={est.color} />
                    <Text style={[s.badgeText, { color: est.color }]}>
                      {est.text}
                    </Text>
                  </View>
                </View>
                <Text style={s.banco}>
                  {sol.tarjetas?.banco} •••• {sol.tarjetas?.ultimos_4}
                </Text>
                {sol.comprobante_vista ? (
                  <TouchableOpacity
                    onPress={() => setFotoAmpliada(sol.comprobante_vista)}
                  >
                    <Image
                      source={{ uri: sol.comprobante_vista }}
                      style={s.comprobanteMini}
                      resizeMode="cover"
                    />
                    <Text style={s.verComprobante}>Ver comprobante</Text>
                  </TouchableOpacity>
                ) : null}
                {sol.nota_cliente ? (
                  <Text style={s.nota} numberOfLines={2}>
                    {sol.nota_cliente}
                  </Text>
                ) : null}
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

      <Modal
        visible={Boolean(fotoAmpliada)}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <Pressable style={s.modalFondo} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada ? (
            <Image
              source={{ uri: fotoAmpliada }}
              style={s.modalImagen}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      <MenuLateral
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        perfil={perfil}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  comprobanteMini: {
    width: "100%",
    height: 140,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: COLORS.inputBg,
  },
  verComprobante: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "500",
    marginTop: 6,
  },
  modalFondo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalImagen: { width: "100%", height: "80%" },
  btnNueva: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnNuevaText: { color: COLORS.primaryDark, fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  banco: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  nota: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginBottom: 4,
  },
  rechazoBox: {
    backgroundColor: COLORS.errorLight,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 4,
  },
  empty: { fontSize: 14, color: COLORS.textLight, textAlign: "center" },
});
