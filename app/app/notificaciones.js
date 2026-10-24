import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import { useDatos, invalidar } from "../src/lib/cache";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { EsqueletoLista, Aparece } from "../src/components/Cargando";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { Toque } from "../src/components/ui/Toque";
import { BotonIcono, Tarjeta } from "../src/components/ui/Piezas";
import { colors, fonts } from "../src/theme/tokens";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -70, right: -100 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -170, left: -110 },
];

// Lo de los últimos tres días va en "Recientes"; lo demás, en "Anteriores".
const RECIENTE_MS = 3 * 24 * 60 * 60 * 1000;

function fechaRelativa(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "Ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  if (Math.floor(horas / 24) === 1) return "Ayer";
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

/**
 * Ícono del aviso, con los mismos colores que los estados de la app:
 * crema para aprobado, azul para en revisión, verde para el pago y rojo
 * para lo rechazado u observado. Lo deciden el tipo y el título, que
 * escribe la base al cambiar el estado.
 */
function estiloAviso(a) {
  const t = `${a.titulo || ""} ${a.cuerpo || ""}`.toLowerCase();
  if (/rechaz|observ|bloque/.test(t)) return { icono: "close", bg: colors.errorBg, fg: colors.error };
  if (/pag|deposit/.test(t)) return { icono: "paper-plane-outline", bg: colors.successBg, fg: colors.success };
  if (/aprob|verificad|activ/.test(t)) return { icono: "checkmark", bg: colors.goldCream, fg: colors.goldText };
  return { icono: "time-outline", bg: colors.infoBg, fg: colors.navyLight };
}

/**
 * Mis avisos: lo que el equipo le respondió al cliente (identidad,
 * tarjetas, solicitudes, pagos). Cada aviso se marca como leído al
 * tocarlo, como en el prototipo: abrir la pantalla no basta para decir
 * que se leyó todo.
 */
export default function NotificacionesScreen() {
  const [abierto, setAbierto] = useState(null);
  // Leídos en este rato: se apagan en pantalla al instante, sin esperar
  // a que la copia guardada se actualice.
  const [leidosAqui, setLeidosAqui] = useState([]);
  const { mostrar } = useAviso();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Guardados en el teléfono: solo se vuelven a descargar si llegó un
  // aviso nuevo o cambió alguno (huella "avisos").
  const {
    datos,
    cargando,
    refrescando: refreshing,
    error,
    recargar,
  } = useDatos(
    "avisos",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error: e } = await supabase
        .from("notificaciones")
        .select("id, tipo, titulo, cuerpo, leida, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (e) throw e;
      return data || [];
    },
    { grupos: ["avisos"] },
  );
  useEffect(() => {
    if (error) mostrar(mensajeError(error), "error");
  }, [error]);

  const avisos = useMemo(
    () => (datos || []).map((a) => (leidosAqui.includes(a.id) ? { ...a, leida: true } : a)),
    [datos, leidosAqui],
  );

  async function leer(aviso) {
    setAbierto(abierto === aviso.id ? null : aviso.id);
    if (aviso.leida) return;
    // Se marca en pantalla de inmediato; si la base falla, solo vuelve a
    // aparecer el punto la próxima vez.
    setLeidosAqui((l) => [...l, aviso.id]);
    await supabase.from("notificaciones").update({ leida: true }).eq("id", aviso.id);
    invalidar("avisos");
  }

  async function leerTodos() {
    const ids = avisos.filter((a) => !a.leida).map((a) => a.id);
    if (!ids.length) return;
    setLeidosAqui((l) => [...l, ...ids]);
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
    invalidar("avisos");
  }

  const ahora = Date.now();
  const recientes = avisos.filter((a) => ahora - new Date(a.created_at).getTime() < RECIENTE_MS);
  const anteriores = avisos.filter((a) => ahora - new Date(a.created_at).getTime() >= RECIENTE_MS);
  const sinLeer = avisos.filter((a) => !a.leida).length;

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inicio"));

  const lista = (items) => (
    <Tarjeta style={s.lista}>
      {items.map((a, i) => {
        const e = estiloAviso(a);
        const nuevo = !a.leida;
        return (
          <Toque
            key={a.id}
            onPress={() => leer(a)}
            escala={0.99}
            accessibilityLabel={`${nuevo ? "Sin leer. " : ""}${a.titulo}`}
            accessibilityState={{ expanded: abierto === a.id }}
            style={[s.fila, i > 0 && s.separador, nuevo && s.filaNueva]}
          >
            <View style={[s.icono, { backgroundColor: e.bg }]}>
              <Ionicons name={e.icono} size={18} color={e.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.titulo, nuevo && { fontFamily: fonts.heavy }]}>{a.titulo}</Text>
              {a.cuerpo ? (
                <Text style={s.cuerpo} numberOfLines={abierto === a.id ? 0 : 1}>
                  {a.cuerpo}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={s.fecha}>{fechaRelativa(a.created_at)}</Text>
              {nuevo ? <View style={s.punto} /> : null}
            </View>
          </Toque>
        );
      })}
    </Tarjeta>
  );

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={recargar}
            tintColor={colors.white}
            colors={[colors.navy]}
          />
        }
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={s.barra}>
            <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
            <Text style={s.barraTitulo} accessibilityRole="header">
              Mis avisos
            </Text>
            <Toque onPress={leerTodos} disabled={!sinLeer} accessibilityLabel={sinLeer ? `${sinLeer} sin leer. Marcar todos como leídos` : "Todo leído"}>
              <GlassPanel variant="onNight" radius={999} style={s.sinLeer}>
                <Text style={s.sinLeerTexto}>{sinLeer ? `${sinLeer} sin leer` : "Al día"}</Text>
              </GlassPanel>
            </Toque>
          </View>
        </CabeceraNoche>

        <View style={s.cuerpoPantalla}>
          {cargando ? (
            <EsqueletoLista filas={4} alto={70} />
          ) : avisos.length === 0 ? (
            <View style={s.vacio}>
              <View style={s.vacioIcono}>
                <Ionicons name="notifications-outline" size={28} color={colors.goldText} />
              </View>
              <Text style={s.vacioTitulo}>Sin avisos todavía</Text>
              <Text style={s.vacioTexto}>Aquí te contamos cada vez que revisemos algo tuyo.</Text>
            </View>
          ) : (
            <>
              {recientes.length ? (
                <Aparece>
                  <Text style={s.seccion}>Recientes</Text>
                  {lista(recientes)}
                </Aparece>
              ) : null}
              {anteriores.length ? (
                <Aparece retraso={80}>
                  <Text style={s.seccion}>Anteriores</Text>
                  {lista(anteriores)}
                </Aparece>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 26, gap: 16 },
  barra: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barraTitulo: { fontFamily: fonts.heavy, fontSize: 17, color: colors.white },
  sinLeer: { height: 32, paddingHorizontal: 12, justifyContent: "center" },
  sinLeerTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.white },

  cuerpoPantalla: { paddingHorizontal: 16, paddingTop: 6 },
  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 8 },
  lista: { borderRadius: 20, overflow: "hidden" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  filaNueva: { backgroundColor: "#FFFBEB" },
  separador: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  icono: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  titulo: { fontFamily: fonts.label, fontSize: 15, color: colors.text },
  cuerpo: { fontFamily: fonts.label, fontSize: 13, lineHeight: 18, color: colors.text2 },
  fecha: { fontFamily: fonts.strong, fontSize: 12, color: colors.text3 },
  punto: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold },
  vacio: { alignItems: "center", marginTop: 40, gap: 10, paddingHorizontal: 30 },
  vacioIcono: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  vacioTitulo: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  vacioTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2, textAlign: "center" },
});
