import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import { confirmar, mensajeError, alerta } from "../../src/lib/ui";
import { limpiarCache } from "../../src/lib/cache";

export default function PerfilScreen() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [comisiones, setComisiones] = useState([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      cargarPerfil();
    }, []),
  );

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
      .maybeSingle();
    setPerfil(data);
    if (data) cargarComisiones(data);
  }

  /**
   * Comision que aplica en cada banco. Lo especial gana sobre lo
   * general, igual que en el panel.
   */
  async function cargarComisiones(perfilData) {
    const [{ data: generales }, { data: especiales }] = await Promise.all([
      supabase
        .from("comisiones_banco")
        .select("banco, porcentaje")
        .eq("activa", true)
        .order("banco"),
      supabase
        .from("comisiones_cliente")
        .select("banco, porcentaje")
        .eq("cliente_id", perfilData.id),
    ]);

    setComisiones(
      (generales || []).map((g) => {
        const especial = (especiales || []).find((e) => e.banco === g.banco);
        return {
          banco: g.banco,
          porcentaje: especial ? especial.porcentaje : g.porcentaje,
          especial: Boolean(especial),
        };
      }),
    );
  }

  // window.confirm no existe en React Native: con el codigo anterior el
  // boton de cerrar sesion no hacia nada en el telefono.
  async function cerrarSesion() {
    if (!(await confirmar("Seguro que quieres cerrar sesion?"))) return;
    const { error } = await supabase.auth.signOut();
    if (error) return alerta(mensajeError(error));
    await limpiarCache();
    router.replace("/");
  }

  // Con nombres vacio, perfil.nombres[0] lanzaba una excepcion.
  const iniciales =
    ((perfil?.nombres || "").trim()[0] || "") +
      ((perfil?.apellidos || "").trim()[0] || "") || "?";

  const campos = [
    { label: "Nombres", valor: perfil?.nombres, icon: "person-outline" },
    { label: "Apellidos", valor: perfil?.apellidos, icon: "person-outline" },
    { label: "DNI", valor: perfil?.dni, icon: "id-card-outline" },
    { label: "Teléfono", valor: perfil?.telefono, icon: "call-outline" },
    { label: "Dirección", valor: perfil?.direccion, icon: "location-outline" },

  ];

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Mi cuenta" />

      <ScrollView contentContainerStyle={s.content}>
        {/* Avatar */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {iniciales}
            </Text>
          </View>
          <Text style={s.nombre}>
            {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Cargando..."}
          </Text>
          <Text style={s.email}>{usuario?.email}</Text>
          <View
            style={[
              s.estadoPill,
              perfil?.validado_por ? s.estadoActivo : s.estadoPendiente,
            ]}
          >
            <Ionicons
              name={perfil?.validado_por ? "checkmark-circle" : "time"}
              size={14}
              color={perfil?.validado_por ? COLORS.success : COLORS.warning}
            />
            <Text
              style={[
                s.estadoTexto,
                {
                  color: perfil?.validado_por ? COLORS.success : COLORS.warning,
                },
              ]}
            >
              {perfil?.validado_por ? "Cuenta verificada" : "En revisión"}
            </Text>
          </View>
        </View>

        {/* Datos */}
        <View style={s.datosCard}>
          {campos.map((c, i) => (
            <View key={c.label}>
              <View style={s.datoRow}>
                <View style={s.datoLeft}>
                  <Ionicons
                    name={c.icon}
                    size={18}
                    color={COLORS.textLight}
                    style={{ width: 24 }}
                  />
                  <Text style={s.datoLabel}>{c.label}</Text>
                </View>
                <Text style={s.datoValor}>{c.valor || "—"}</Text>
              </View>
              {i < campos.length - 1 && <View style={s.datoDivider} />}
            </View>
          ))}
        </View>

        {/* Cerrar sesión */}
        <TouchableOpacity style={s.logoutBtn} onPress={cerrarSesion}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={s.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
        {comisiones.length > 0 && (
          <View style={s.comisionesCard}>
            <View style={s.comisionesHeader}>
              <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
              <Text style={s.comisionesTitulo}>Mis comisiones</Text>
            </View>
            <Text style={s.comisionesSub}>
              Porcentaje que se aplica según el banco de tu tarjeta
            </Text>
            {comisiones.map((c) => (
              <View key={c.banco} style={s.comisionRow}>
                <Text style={s.comisionBanco}>{c.banco}</Text>
                {c.especial && (
                  <View style={s.comisionTag}>
                    <Text style={s.comisionTagTexto}>Especial</Text>
                  </View>
                )}
                <Text style={s.comisionValor}>{c.porcentaje} %</Text>
              </View>
            ))}
          </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20 },
  // Avatar
  avatarSection: { alignItems: "center", marginBottom: 28 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { color: COLORS.secondary, fontSize: 24, fontWeight: "700" },
  nombre: { fontSize: 20, fontWeight: "700", color: COLORS.text },
  email: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  estadoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    marginTop: 10,
  },
  estadoActivo: { backgroundColor: COLORS.successLight },
  estadoPendiente: { backgroundColor: COLORS.warningLight },
  estadoTexto: { fontSize: 12, fontWeight: "600" },
  // Datos
  comisionesCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  comisionesHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  comisionesTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  comisionesSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 10,
  },
  comisionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  comisionBanco: { fontSize: 14, color: COLORS.text, fontWeight: "500" },
  comisionTag: {
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comisionTagTexto: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.secondaryDark,
    textTransform: "uppercase",
  },
  comisionValor: {
    marginLeft: "auto",
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
  },
  datosCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 24,
  },
  datoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  datoLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  datoLabel: { fontSize: 14, color: COLORS.textSecondary },
  datoValor: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: "55%",
    textAlign: "right",
  },
  datoDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 14,
  },
  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
  },
  logoutText: { fontSize: 15, color: COLORS.error, fontWeight: "600" },
});
