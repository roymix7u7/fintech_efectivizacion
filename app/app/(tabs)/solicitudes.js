import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, SectionList, RefreshControl, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDatos, invalidar } from "../../src/lib/cache";
import MenuLateral from "../../src/components/MenuLateral";
import { EsqueletoLista } from "../../src/components/Cargando";
import { agruparPorDia, hora } from "../../src/lib/fechas";
import { nombreCanal } from "../../src/lib/alertas";
import DetalleSolicitud from "../../src/components/DetalleSolicitud";
import { BankBadge } from "../../src/components/ui/BankBadge";
import { StatusChip } from "../../src/components/ui/StatusChip";
import { Toque } from "../../src/components/ui/Toque";
import { Boton } from "../../src/components/ui/Boton";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { useEspacioPestanas } from "../../src/components/ui/BarraPestanas";
import { BotonIcono } from "../../src/components/ui/Piezas";
import { bancoDe, colors, fonts } from "../../src/theme/tokens";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -70, right: -100 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -170, left: -110 },
];

/** Filtros, con el nombre que ve el cliente para cada estado. */
const FILTROS = [
  { clave: "todas", texto: "Todas" },
  { clave: "pendiente", texto: "En revisión" },
  { clave: "aprobado", texto: "Por pagar" },
  { clave: "pagado", texto: "Pagadas" },
  { clave: "rechazado", texto: "Rechazadas" },
];

/**
 * Historial de solicitudes, agrupado por día.
 *
 * La lista no pide ninguna imagen ni firma nada: el comprobante se
 * carga solo al abrir el detalle. Lo que el gestor o pagos cambien en
 * el panel (aprobar, rechazar, marcar pagada) llega en vivo.
 */
export default function SolicitudesScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  // Solicitud abierta en la hoja de detalle, o null.
  const [detalle, setDetalle] = useState(null);

  const router = useRouter();
  const espacioPestanas = useEspacioPestanas();

  // El historial guardado en el teléfono: solo se vuelve a descargar si
  // alguna solicitud cambió de estado (huella "solicitudes").
  const {
    datos,
    cargando: loading,
    refrescando: refreshing,
    recargar,
  } = useDatos(
    "solicitudes",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { perfil: null, solicitudes: [] };

      const { data: perfilData, error: e1 } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, apellidos, validado_por")
        .eq("user_id", user.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!perfilData) return { perfil: null, solicitudes: [] };

      const { data, error: e2 } = await supabase
        .from("solicitudes")
        // Todas las columnas: así llegan también cuándo se deposita y a
        // qué cuenta se pagó (migración 065), sin romper si aún no está.
        .select("*, tarjetas(banco, ultimos_4)")
        .eq("cliente_id", perfilData.id)
        .order("created_at", { ascending: false });
      if (e2) throw e2;
      return { perfil: perfilData, solicitudes: data || [] };
    },
    { grupos: ["solicitudes", "perfil"] },
  );
  const perfil = datos?.perfil || null;
  const solicitudes = datos?.solicitudes || [];

  // En vivo: cuando el equipo cambia una solicitud, la huella cambia y
  // la copia se reemplaza.
  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(nombreCanal("mis-solicitudes"))
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes", filter: `cliente_id=eq.${perfil.id}` }, () =>
        invalidar("solicitudes", "avisos"),
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [perfil?.id]);

  const conteo = useMemo(() => {
    const c = { todas: solicitudes.length };
    for (const f of FILTROS) if (f.clave !== "todas") c[f.clave] = solicitudes.filter((x) => x.estado === f.clave).length;
    return c;
  }, [solicitudes]);

  const secciones = useMemo(
    () => agruparPorDia(filtro === "todas" ? solicitudes : solicitudes.filter((x) => x.estado === filtro)),
    [solicitudes, filtro],
  );

  const cabecera = (
    <CabeceraNoche luces={LUCES} style={s.cabecera}>
      <View style={s.barra}>
        <BotonIcono variante="noche" icono="menu" onPress={() => setMenuVisible(true)} accessibilityLabel="Abrir menú" />
        <Text style={s.titulo} accessibilityRole="header">
          Solicitudes
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        style={{ marginHorizontal: -20 }}
      >
        {FILTROS.map((f) => {
          const activo = filtro === f.clave;
          return (
            <Toque
              key={f.clave}
              onPress={() => setFiltro(f.clave)}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={`${f.texto}, ${conteo[f.clave] || 0}`}
              style={[s.filtro, activo && s.filtroActivo]}
            >
              <Text style={[s.filtroTexto, activo && { color: colors.night }]}>{f.texto}</Text>
              <View style={[s.filtroCuenta, activo && { backgroundColor: colors.muted }]}>
                <Text style={[s.filtroCuentaTexto, activo && { color: colors.night }]}>{conteo[f.clave] || 0}</Text>
              </View>
            </Toque>
          );
        })}
      </ScrollView>
    </CabeceraNoche>
  );

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />

      {loading ? (
        <View>
          {cabecera}
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <EsqueletoLista filas={5} alto={64} />
          </View>
        </View>
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: espacioPestanas }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={cabecera}
          // Solo se dibuja lo que entra en pantalla: el historial crece
          // para siempre y montarlo entero volveria lenta la pestaña.
          initialNumToRender={14}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={recargar}
              tintColor={colors.white}
              colors={[colors.navy]}
            />
          }
          ListEmptyComponent={
            <View style={s.vacio}>
              <View style={s.vacioIcono}>
                <Ionicons name="receipt-outline" size={28} color={colors.goldText} />
              </View>
              <Text style={s.vacioTitulo}>
                {filtro === "todas" ? "Aún no tienes solicitudes" : "Nada en este filtro"}
              </Text>
              {filtro === "todas" ? (
                <Boton
                  variante="dinero"
                  titulo="Nueva solicitud"
                  icono="arrow-forward"
                  onPress={() => router.push("/nueva-solicitud")}
                  style={{ alignSelf: "stretch", marginTop: 18 }}
                />
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => <Text style={s.dia}>{section.titulo}</Text>}
          renderItem={({ item, index, section }) => {
            const tarjeta = item.tarjetas || { banco: item.banco };
            const primera = index === 0;
            const ultima = index === section.data.length - 1;
            return (
              <Toque
                onPress={() => setDetalle(item)}
                accessibilityLabel={`Solicitud ${bancoDe(tarjeta.banco).name}${
                  tarjeta.ultimos_4 ? ` terminada en ${tarjeta.ultimos_4}` : ""
                }`}
                escala={0.99}
                style={[s.fila, primera && s.filaPrimera, ultima && s.filaUltima]}
              >
                <View style={[s.filaInterna, !ultima && s.filaSeparada]}>
                  <BankBadge bank={tarjeta.banco} size={42} />
                  <View style={s.filaTexto}>
                    <Text style={s.filaTitulo} numberOfLines={1}>
                      {tarjeta.ultimos_4 ? `Tarjeta ···· ${tarjeta.ultimos_4}` : bancoDe(tarjeta.banco).name}
                    </Text>
                    <Text style={s.filaHora}>{hora(item.created_at)}</Text>
                  </View>
                  <StatusChip status={item.estado} />
                </View>
              </Toque>
            );
          }}
        />
      )}

      <DetalleSolicitud solicitud={detalle} onCerrar={() => setDetalle(null)} />

      <MenuLateral visible={menuVisible} onClose={() => setMenuVisible(false)} perfil={perfil} />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },

  cabecera: { paddingHorizontal: 20, paddingBottom: 22, gap: 16 },
  barra: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titulo: { fontFamily: fonts.heavy, fontSize: 17, color: colors.white },
  filtro: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filtroActivo: { backgroundColor: colors.white },
  filtroTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.white },
  filtroCuenta: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  filtroCuentaTexto: { fontFamily: fonts.heavy, fontSize: 11, color: colors.white },

  dia: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8 },

  // Las filas de un mismo día forman una sola tarjeta: la primera y la
  // última redondean, las de en medio solo llevan los bordes laterales.
  fila: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
  },
  filaPrimera: { borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  filaUltima: { borderBottomWidth: 1, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  filaInterna: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  filaSeparada: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  filaTitulo: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },
  filaHora: { fontFamily: fonts.label, fontSize: 13, color: colors.text2, fontVariant: ["tabular-nums"] },

  vacio: { alignItems: "center", marginTop: 40, paddingHorizontal: 28 },
  vacioIcono: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  vacioTitulo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginTop: 14 },
});
