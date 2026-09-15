import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import TIPO, { CIFRAS } from "../../src/theme/tipografia";
import { EsqueletoLista } from "../../src/components/Cargando";
import { agruparPorDia, hora } from "../../src/lib/fechas";
import { estadoSolicitud } from "../../src/theme/estados";
import DetalleSolicitud from "../../src/components/DetalleSolicitud";

// Colores e iconos por estado: compartidos con el inicio.
const estadoDe = estadoSolicitud;

export default function SolicitudesScreen() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Solicitud abierta en la hoja de detalle, o null.
  const [detalle, setDetalle] = useState(null);

  const router = useRouter();

  const cargar = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, apellidos")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!perfilData) return;
      setPerfil(perfilData);

      // La lista no pide ninguna imagen ni firma nada: el comprobante se
      // carga solo al abrir el detalle. Antes se firmaban y descargaban
      // todas las fotos del historial en cada visita.
      const { data } = await supabase
        .from("solicitudes")
        .select(
          "id, codigo, banco, estado, nota_cliente, motivo_rechazo, comprobante_url, created_at, fecha_revision, pagado_en, tarjetas(banco, ultimos_4)",
        )
        .eq("cliente_id", perfilData.id)
        .order("created_at", { ascending: false });

      setSolicitudes(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const secciones = useMemo(() => agruparPorDia(solicitudes), [solicitudes]);

  const cabecera = perfil ? (
    <TouchableOpacity
      style={s.btnNueva}
      onPress={() => router.push("/nueva-solicitud")}
    >
      <Ionicons name="add-circle" size={22} color={COLORS.primaryDark} />
      <Text style={s.btnNuevaText}>Nueva solicitud</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Solicitudes" />

      {loading ? (
        <View style={s.content}>
          {cabecera}
          <EsqueletoLista filas={5} alto={64} />
        </View>
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.content}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={cabecera}
          // Solo se dibuja lo que entra en pantalla: el historial crece
          // para siempre y montarlo entero volveria lenta la pestaña.
          initialNumToRender={14}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                cargar();
              }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
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
          }
          renderSectionHeader={({ section }) => (
            <View style={s.divisor}>
              <Text style={s.divisorTexto}>{section.titulo}</Text>
              <View style={s.divisorLinea} />
              <Text style={s.divisorCuenta}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const est = estadoDe(item.estado);
            const tarjeta = item.tarjetas || { banco: item.banco };
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setDetalle(item)}
                style={[
                  s.fila,
                  index === 0 && s.filaPrimera,
                  index === section.data.length - 1 && s.filaUltima,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Solicitud ${item.codigo}, ${est.text}`}
              >
                <View style={[s.filaIcono, { backgroundColor: est.bg }]}>
                  <Ionicons name={est.icon} size={18} color={est.color} />
                </View>

                <View style={s.filaTexto}>
                  <Text style={s.filaTitulo} numberOfLines={1}>
                    {tarjeta.banco}
                    {tarjeta.ultimos_4 ? ` •••• ${tarjeta.ultimos_4}` : ""}
                  </Text>
                  <Text style={s.filaCodigo} numberOfLines={1}>
                    {item.codigo}
                  </Text>
                </View>

                <View style={s.filaDerecha}>
                  <Text style={[s.filaEstado, { color: est.color }]}>
                    {est.text}
                  </Text>
                  <Text style={s.filaHora}>{hora(item.created_at)}</Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={COLORS.textLight}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <DetalleSolicitud solicitud={detalle} onCerrar={() => setDetalle(null)} />

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

  btnNueva: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnNuevaText: { color: COLORS.primaryDark, fontSize: 16, fontWeight: "700" },

  // Divisor de dia
  divisor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
  },
  divisorTexto: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  divisorLinea: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divisorCuenta: { fontSize: 12, color: COLORS.textLight, ...CIFRAS },

  // Fila
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
  },
  filaPrimera: {
    borderTopWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  filaUltima: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  filaIcono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filaTexto: { flex: 1, minWidth: 0 },
  filaTitulo: { ...TIPO.tarjeta, fontSize: 14 },
  filaCodigo: { ...TIPO.micro, marginTop: 2, ...CIFRAS },
  filaDerecha: { alignItems: "flex-end" },
  filaEstado: { fontSize: 12, fontWeight: "700" },
  filaHora: { ...TIPO.micro, marginTop: 2, ...CIFRAS },

  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyTitle: { ...TIPO.seccion, marginTop: 12, marginBottom: 4 },
  empty: { ...TIPO.apoyo, textAlign: "center" },

});
