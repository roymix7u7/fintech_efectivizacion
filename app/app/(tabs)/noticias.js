import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import TIPO from "../../src/theme/tipografia";
import { EsqueletoLista, Aparece } from "../../src/components/Cargando";

export default function NoticiasScreen() {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    cargarNoticias();
  }, []);

  async function cargarNoticias() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setPerfil(perfilData);
    }

    const { data } = await supabase
      .from("alertas_sistema")
      .select("*")
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setAlertas(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  const colores = {
    info: {
      bg: "#E8F0FE",
      border: "#4285F4",
      text: "#1A73E8",
      icon: "information-circle",
    },
    advertencia: {
      bg: COLORS.warningLight,
      border: COLORS.warning,
      text: COLORS.warning,
      icon: "alert-circle",
    },
    critico: {
      bg: COLORS.errorLight,
      border: COLORS.error,
      text: COLORS.error,
      icon: "warning",
    },
  };

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Noticias" />

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargarNoticias();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        <Text style={s.subtitulo}>Mantente al día con las novedades</Text>

        {loading ? (
          <EsqueletoLista filas={3} alto={104} />
        ) : alertas.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons
              name="megaphone-outline"
              size={48}
              color={COLORS.textLight}
            />
            <Text style={s.emptyTitle}>Sin noticias</Text>
            <Text style={s.empty}>No hay noticias por el momento</Text>
          </View>
        ) : (
          alertas.map((alerta, i) => {
            const c = colores[alerta.tipo] || colores.info;
            return (
              <Aparece key={alerta.id} retraso={Math.min(i, 8) * 60}>
              <View
                style={[s.card, { borderLeftColor: c.border }]}
              >
                <View style={s.cardHeader}>
                  <Ionicons name={c.icon} size={20} color={c.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitulo, { color: c.text }]}>
                      {alerta.titulo}
                    </Text>
                    <Text style={s.cardFecha}>
                      {new Date(alerta.created_at).toLocaleDateString("es-PE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={s.cardMensaje}>{alerta.mensaje}</Text>
                {alerta.fecha_fin && (
                  <Text style={s.cardExpira}>
                    Vigente hasta:{" "}
                    {new Date(alerta.fecha_fin).toLocaleDateString("es-PE")}
                  </Text>
                )}
              </View>
              </Aparece>
            );
          })
        )}
      </ScrollView>

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
  subtitulo: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  cardTitulo: { fontSize: 16, fontWeight: "700" },
  cardFecha: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  cardMensaje: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  cardExpira: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 8,
    fontStyle: "italic",
  },
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
