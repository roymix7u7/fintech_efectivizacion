import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDatos } from "../../src/lib/cache";
import { urlPublica } from "../../src/lib/storage";
import { EsqueletoResumen } from "../../src/components/Cargando";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";

const BANCO_COLORS = {
  BCP: { bg: "#FFF3E0", border: "#E67E00", text: "#BF5F00" },
  BBVA: { bg: "#E3E8F4", border: "#004481", text: "#003366" },
  Interbank: { bg: "#E3F2E8", border: "#00855A", text: "#006344" },
  Scotiabank: { bg: "#FCE4E4", border: "#CC0000", text: "#990000" },
  BanBif: { bg: "#E0F0FA", border: "#0077C0", text: "#005A94" },
  CMR: { bg: "#E0F5ED", border: "#00897B", text: "#00695C" },
};

export default function InicioScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  /**
   * Una sola consulta para toda la pantalla.
   *
   * Antes se hacian siete viajes al servidor, uno detras de otro, y el
   * tiempo total era la suma de los siete. Ahora el servidor arma el
   * resumen completo y lo devuelve de una vez.
   *
   * Ademas useDatos pinta lo ultimo que se guardo en el telefono antes
   * de consultar, asi que al abrir la app ya hay algo que leer.
   */
  const { datos, cargando, refrescando, recargar } = useDatos(
    "inicio",
    async () => {
      const { data, error } = await supabase.rpc("resumen_inicio");
      if (error) throw error;
      return data;
    },
  );

  const perfil = datos?.perfil || null;
  const stats = datos?.stats || { pendientes: 0, aprobadas: 0, tarjetas: 0 };
  const alertas = datos?.alertas || [];
  const alertasSinVer = datos?.alertas_sin_ver || 0;
  const guias = datos?.guias || [];
  const hayGuias = Boolean(datos?.hay_guias);

  // Al volver de crear una solicitud, los contadores deben reflejarla.
  // La primera vez no se repite: useDatos ya consulto al montar.
  const primeraVisita = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVisita.current) {
        primeraVisita.current = false;
        return;
      }
      recargar();
    }, [recargar]),
  );

  // El servidor ya devuelve solo las guias de los bancos donde el
  // cliente tiene tarjeta verificada.
  const guiasFiltradas = guias;

  const alertaStyles = {
    promocion: {
      bg: COLORS.secondaryLight,
      border: COLORS.secondary,
      accent: COLORS.secondaryDark,
    },
    info: { bg: "#E8F0FE", border: "#4285F4", accent: "#1A73E8" },
    advertencia: {
      bg: COLORS.warningLight,
      border: COLORS.warning,
      accent: COLORS.warning,
    },
    critico: {
      bg: COLORS.errorLight,
      border: COLORS.error,
      accent: COLORS.error,
    },
  };

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} />

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={recargar}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {cargando && <EsqueletoResumen />}

        {/* Saludo */}
        <View style={s.saludoRow}>
          <View>
            <Text style={s.saludoText}>
              Hola, {perfil?.nombres || "Usuario"}
            </Text>
            <Text style={s.saludoSub}>Bienvenido a AlToque Perú</Text>
          </View>
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
              {perfil?.validado_por ? "Verificado" : "En revisión"}
            </Text>
          </View>
        </View>

        {/* Resumen de actividad */}
        <View style={s.resumenCard}>
          <Text style={s.resumenTitulo}>Tu actividad</Text>
          <View style={s.resumenGrid}>
            <TouchableOpacity
              style={s.resumenItem}
              onPress={() => router.push("/(tabs)/solicitudes")}
            >
              <View
                style={[
                  s.resumenIconBg,
                  { backgroundColor: COLORS.warningLight },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={COLORS.warning}
                />
              </View>
              <Text style={s.resumenNumero}>{stats.pendientes}</Text>
              <Text style={s.resumenLabel}>En revisión</Text>
            </TouchableOpacity>

            <View style={s.resumenDivider} />

            <TouchableOpacity
              style={s.resumenItem}
              onPress={() => router.push("/(tabs)/solicitudes")}
            >
              <View
                style={[
                  s.resumenIconBg,
                  { backgroundColor: COLORS.successLight },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={COLORS.success}
                />
              </View>
              <Text style={s.resumenNumero}>{stats.aprobadas}</Text>
              <Text style={s.resumenLabel}>Aprobadas</Text>
            </TouchableOpacity>

            <View style={s.resumenDivider} />

            <TouchableOpacity
              style={s.resumenItem}
              onPress={() => router.push("/(tabs)/tarjetas")}
            >
              <View style={[s.resumenIconBg, { backgroundColor: "#E3E8F4" }]}>
                <Ionicons
                  name="card-outline"
                  size={18}
                  color={COLORS.primary}
                />
              </View>
              <Text style={s.resumenNumero}>{stats.tarjetas}</Text>
              <Text style={s.resumenLabel}>Tarjetas</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Acción principal */}
        {perfil?.validado_por && stats.tarjetas > 0 && (
          <TouchableOpacity
            style={s.btnAccion}
            onPress={() => router.push("/nueva-solicitud")}
          >
            <View style={s.btnAccionLeft}>
              <Ionicons
                name="add-circle"
                size={24}
                color={COLORS.primaryDark}
              />
              <View>
                <Text style={s.btnAccionTitle}>Enviar comprobante</Text>
                <Text style={s.btnAccionSub}>Nueva solicitud de operación</Text>
              </View>
            </View>
            <Ionicons
              name="arrow-forward"
              size={20}
              color={COLORS.primaryDark}
            />
          </TouchableOpacity>
        )}

        {/* CTA registrar tarjeta */}
        {perfil?.validado_por && stats.tarjetas === 0 && (
          <TouchableOpacity
            style={s.ctaRegistrar}
            onPress={() => router.push("/(tabs)/tarjetas")}
          >
            <View style={s.ctaIconBg}>
              <Ionicons
                name="card-outline"
                size={22}
                color={COLORS.secondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>Registra tu tarjeta</Text>
              <Text style={s.ctaSub}>
                Verifica una tarjeta para comenzar a operar
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textLight}
            />
          </TouchableOpacity>
        )}

        {/* Guías de bancos del cliente */}
        {guiasFiltradas.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Pasos para operar</Text>
            <View style={s.guiasGrid}>
              {guiasFiltradas.map((guia) => {
                const bc = BANCO_COLORS[guia.banco] || {
                  bg: "#ECEFF1",
                  border: "#607D8B",
                  text: "#455A64",
                };
                return (
                  <TouchableOpacity
                    key={guia.id}
                    style={[s.guiaCard, { borderColor: bc.border }]}
                    onPress={() => router.push(`/guia/${guia.banco}`)}
                  >
                    <View style={[s.guiaDot, { backgroundColor: bc.border }]} />
                    <Text style={[s.guiaBanco, { color: bc.text }]}>
                      {guia.banco}
                    </Text>
                    <View style={s.guiaVerRow}>
                      <Text style={[s.guiaVer, { color: bc.border }]}>
                        Ver pasos
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={bc.border}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Info cuando no tiene tarjetas */}
        {perfil?.validado_por && stats.tarjetas === 0 && hayGuias && (
          <View style={s.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={COLORS.textLight}
            />
            <Text style={s.infoText}>
              Al verificar tu tarjeta, verás aquí los pasos de tu banco
            </Text>
          </View>
        )}

        {/* Alertas sin ver.
            La burbuja se cierra por reflejo y el cliente se queda sin
            saber que paso. Esta franja es la red debajo: sigue aqui
            hasta que entre a leerlas. */}
        {alertasSinVer > 0 && (
          <TouchableOpacity
            style={s.franjaAlerta}
            onPress={() => router.push("/(tabs)/noticias?seccion=alertas")}
            activeOpacity={0.85}
          >
            <Ionicons name="warning" size={19} color={COLORS.error} />
            <View style={{ flex: 1 }}>
              <Text style={s.franjaTitulo}>
                {alertasSinVer === 1
                  ? "Tienes 1 alerta sin leer"
                  : `Tienes ${alertasSinVer} alertas sin leer`}
              </Text>
              <Text style={s.franjaTexto}>Toca para ver de qué se trata</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={COLORS.error}
            />
          </TouchableOpacity>
        )}

        {/* Noticias */}
        {alertas.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Noticias</Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/noticias")}
                style={s.verTodoBtn}
              >
                <Text style={s.verTodoText}>Ver todo</Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>
            {alertas.map((alerta) => {
              const as = alertaStyles[alerta.tipo] || alertaStyles.info;
              return (
                <View
                  key={alerta.id}
                  style={[
                    s.alertaCard,
                    { backgroundColor: as.bg, borderLeftColor: as.border },
                  ]}
                >
                  {alerta.portada && (
                    <Image
                      source={{
                        uri: urlPublica("noticias-fotos", alerta.portada),
                      }}
                      style={s.alertaPortada}
                      resizeMode="cover"
                    />
                  )}
                  <Text style={[s.alertaTitulo, { color: as.accent }]}>
                    {alerta.titulo}
                  </Text>
                  <Text style={s.alertaMensaje} numberOfLines={2}>
                    {alerta.mensaje}
                  </Text>
                  <Text style={s.alertaFecha}>
                    {new Date(alerta.created_at).toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Accesos rápidos */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Accesos rápidos</Text>
          <View style={s.quickGrid}>
            <TouchableOpacity
              style={s.quickCard}
              onPress={() => router.push("/(tabs)/solicitudes")}
            >
              <View
                style={[
                  s.quickIconBg,
                  { backgroundColor: COLORS.secondaryLight },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color={COLORS.primaryDark}
                />
              </View>
              <Text style={s.quickLabel}>Solicitudes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickCard}
              onPress={() => router.push("/(tabs)/tarjetas")}
            >
              <View style={[s.quickIconBg, { backgroundColor: "#E3E8F4" }]}>
                <Ionicons
                  name="card-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>
              <Text style={s.quickLabel}>Tarjetas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickCard}
              onPress={() => router.push("/empresa")}
            >
              <View style={[s.quickIconBg, { backgroundColor: "#E3F2E8" }]}>
                <Ionicons name="business-outline" size={20} color="#00855A" />
              </View>
              <Text style={s.quickLabel}>Empresa</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickCard}
              onPress={() => router.push("/(tabs)/noticias")}
            >
              <View style={[s.quickIconBg, { backgroundColor: "#FCE4E4" }]}>
                <Ionicons name="megaphone-outline" size={20} color="#CC0000" />
              </View>
              <Text style={s.quickLabel}>Noticias</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 16 },
  // Saludo
  saludoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  saludoText: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  saludoSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  estadoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  estadoActivo: { backgroundColor: COLORS.successLight },
  estadoPendiente: { backgroundColor: COLORS.warningLight },
  estadoTexto: { fontSize: 12, fontWeight: "600" },
  // Resumen
  resumenCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  resumenTitulo: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  resumenGrid: { flexDirection: "row", alignItems: "center" },
  resumenItem: { flex: 1, alignItems: "center" },
  resumenIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  resumenNumero: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  resumenLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  resumenDivider: { width: 1, height: 50, backgroundColor: COLORS.borderLight },
  // Acción principal
  btnAccion: {
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  btnAccionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  btnAccionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  btnAccionSub: {
    fontSize: 12,
    color: COLORS.primaryDark,
    opacity: 0.7,
    marginTop: 1,
  },
  // CTA registrar
  ctaRegistrar: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1.5,
    borderColor: COLORS.secondary,
    borderStyle: "dashed",
  },
  ctaIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primaryDark,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  ctaSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  // Info box
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  infoText: { fontSize: 13, color: COLORS.textLight, flex: 1 },
  // Secciones
  section: { marginBottom: 22 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 10,
  },
  verTodoBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  verTodoText: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
  // Guías
  guiasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  guiaCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    width: "47%",
  },
  guiaDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 8 },
  guiaBanco: { fontSize: 15, fontWeight: "600", marginBottom: 6 },
  guiaVerRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  guiaVer: { fontSize: 12, fontWeight: "500" },
  // Alertas
  alertaCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  franjaAlerta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: COLORS.errorLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F5C6C2",
    padding: 13,
    marginBottom: 18,
  },
  franjaTitulo: { fontSize: 14, fontWeight: "700", color: COLORS.error },
  franjaTexto: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  alertaPortada: {
    width: "100%",
    height: 110,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: COLORS.inputBg,
  },
  alertaTitulo: { fontWeight: "600", fontSize: 14, marginBottom: 4 },
  alertaMensaje: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  alertaFecha: { fontSize: 11, color: COLORS.textLight, marginTop: 6 },
  // Quick access
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: {
    width: "47%",
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  quickIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  quickLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "500" },
});
