import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import { alerta, mensajeError } from "../src/lib/ui";
import { EsqueletoLista, Aparece } from "../src/components/Cargando";

/** Icono y color segun el tipo de aviso que manda el panel. */
const ESTILOS = {
  kyc_aprobado: { icon: "checkmark-circle", color: COLORS.success },
  kyc_observado: { icon: "alert-circle", color: COLORS.warning },
  tarjeta_aprobada: { icon: "card", color: COLORS.success },
  tarjeta_rechazada: { icon: "close-circle", color: COLORS.error },
  solicitud_aprobada: { icon: "checkmark-done-circle", color: COLORS.success },
  solicitud_rechazada: { icon: "close-circle", color: COLORS.error },
};

function estiloDe(tipo) {
  return ESTILOS[tipo] || { icon: "notifications", color: COLORS.primary };
}

function fechaRelativa(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "Hace un momento";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
  });
}

export default function NotificacionesScreen() {
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, []),
  );

  async function cargar() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("notificaciones")
        .select("id, tipo, titulo, cuerpo, leida, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        alerta(mensajeError(error));
        return;
      }
      setAvisos(data || []);

      // Se marcan como leidas al abrir la pantalla. Si falla, no pasa
      // nada grave: solo sigue apareciendo el punto azul.
      const sinLeer = (data || []).filter((a) => !a.leida).map((a) => a.id);
      if (sinLeer.length > 0) {
        await supabase
          .from("notificaciones")
          .update({ leida: true })
          .in("id", sinLeer);
      }
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }

  if (cargando) {
    return (
      <View style={s.container}>
        <View style={s.content}>
          <EsqueletoLista filas={5} alto={86} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
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
    >
      {avisos.length === 0 ? (
        <View style={s.vacio}>
          <Ionicons
            name="notifications-off-outline"
            size={44}
            color={COLORS.textLight}
          />
          <Text style={s.vacioTitulo}>Sin avisos</Text>
          <Text style={s.vacioTexto}>
            Aquí te avisaremos cuando revisemos tus documentos, tus tarjetas o
            tus solicitudes.
          </Text>
        </View>
      ) : (
        avisos.map((a, i) => {
          const est = estiloDe(a.tipo);
          return (
            <Aparece key={a.id} retraso={Math.min(i, 8) * 45}>
              <View style={[s.card, !a.leida && s.cardSinLeer]}>
              <View style={[s.iconoBg, { backgroundColor: est.color + "1A" }]}>
                <Ionicons name={est.icon} size={20} color={est.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.tituloRow}>
                  <Text style={s.titulo}>{a.titulo}</Text>
                  {!a.leida && <View style={s.punto} />}
                </View>
                <Text style={s.cuerpo}>{a.cuerpo}</Text>
                <Text style={s.fecha}>{fechaRelativa(a.created_at)}</Text>
              </View>
              </View>
            </Aparece>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centrado: { justifyContent: "center", alignItems: "center" },
  content: { padding: 18, paddingBottom: 40, gap: 10 },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardSinLeer: { borderColor: COLORS.primary, borderWidth: 1.5 },
  iconoBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  tituloRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  titulo: { fontSize: 15, fontWeight: "700", color: COLORS.text, flex: 1 },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  cuerpo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 3,
  },
  fecha: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
  vacio: { alignItems: "center", paddingTop: 80, gap: 10 },
  vacioTitulo: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  vacioTexto: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
