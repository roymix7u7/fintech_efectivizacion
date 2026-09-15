import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import TIPO, { CIFRAS } from "../../src/theme/tipografia";
import { EsqueletoLista } from "../../src/components/Cargando";
import { urlFirmada } from "../../src/lib/storage";
import { agruparPorDia, hora } from "../../src/lib/fechas";

const BUCKET = "comprobantes";

// Una URL firmada dura una hora. Se reutiliza durante 50 minutos para
// que reabrir el mismo detalle sea inmediato y no quede a punto de
// caducar mientras se mira.
const FIRMA_VALIDA_MS = 50 * 60 * 1000;

const ESTADOS = {
  pendiente: {
    text: "En revisión",
    color: COLORS.warning,
    bg: COLORS.warningLight,
    icon: "time",
  },
  aprobado: {
    text: "Aprobado",
    color: COLORS.success,
    bg: COLORS.successLight,
    icon: "checkmark-circle",
  },
  rechazado: {
    text: "Rechazado",
    color: COLORS.error,
    bg: COLORS.errorLight,
    icon: "close-circle",
  },
  // El ultimo paso: ya se le deposito. Es lo que el cliente espera desde
  // que envio el comprobante, asi que se distingue de aprobado.
  pagado: {
    text: "Pago enviado",
    color: COLORS.primary,
    bg: "#E6ECF7",
    icon: "cash",
  },
};

const estadoDe = (e) => ESTADOS[e] || ESTADOS.pendiente;

const fechaLarga = (iso) =>
  new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }) +
  " · " +
  hora(iso);

/** Paso del recorrido de una solicitud dentro del detalle. */
function Paso({ icono, color, titulo, fecha, ultimo }) {
  return (
    <View style={s.paso}>
      <View style={s.pasoRiel}>
        <View style={[s.pasoPunto, { backgroundColor: color }]}>
          <Ionicons name={icono} size={12} color={COLORS.white} />
        </View>
        {!ultimo && <View style={s.pasoLinea} />}
      </View>
      <View style={s.pasoTexto}>
        <Text style={s.pasoTitulo}>{titulo}</Text>
        {fecha ? <Text style={s.pasoFecha}>{fechaLarga(fecha)}</Text> : null}
      </View>
    </View>
  );
}

export default function SolicitudesScreen() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const [detalle, setDetalle] = useState(null);
  const [imagen, setImagen] = useState({ estado: "vacio", url: null });
  const [ampliada, setAmpliada] = useState(false);

  const router = useRouter();

  // Firmas ya pedidas: { path: { url, en } }. Vive mientras la pantalla.
  const firmas = useRef(new Map());
  // Detalle abierto ahora mismo. Si el cliente cierra y abre otro antes
  // de que llegue la firma del primero, esa respuesta tardia no puede
  // pintar la imagen equivocada.
  const abierto = useRef(null);

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

  async function cargarImagen(sol) {
    const path = sol.comprobante_url;
    if (!path) {
      setImagen({ estado: "sin", url: null });
      return;
    }

    const guardada = firmas.current.get(path);
    if (guardada && Date.now() - guardada.en < FIRMA_VALIDA_MS) {
      setImagen({ estado: "listo", url: guardada.url });
      return;
    }

    setImagen({ estado: "cargando", url: null });
    const url = await urlFirmada(BUCKET, path);
    if (abierto.current !== sol.id) return;

    if (!url) {
      setImagen({ estado: "error", url: null });
      return;
    }
    firmas.current.set(path, { url, en: Date.now() });
    setImagen({ estado: "listo", url });
  }

  function abrirDetalle(sol) {
    abierto.current = sol.id;
    setDetalle(sol);
    cargarImagen(sol);
  }

  function cerrarDetalle() {
    abierto.current = null;
    setDetalle(null);
    setAmpliada(false);
    setImagen({ estado: "vacio", url: null });
  }

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
                onPress={() => abrirDetalle(item)}
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

      {/* Detalle */}
      <Modal
        visible={Boolean(detalle)}
        transparent
        animationType="slide"
        onRequestClose={() => (ampliada ? setAmpliada(false) : cerrarDetalle())}
      >
        <Pressable style={s.hojaFondo} onPress={cerrarDetalle}>
          {/* Pressable interno: tocar la hoja no debe cerrarla. */}
          <Pressable style={s.hoja} onPress={() => {}}>
            {detalle && (
              <>
                <View style={s.hojaAsa} />

                <View style={s.hojaCabecera}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.hojaEtiqueta}>Solicitud</Text>
                    <Text style={s.hojaCodigo}>{detalle.codigo}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={cerrarDetalle}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                  >
                    <Ionicons name="close" size={24} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 12 }}
                >
                  <View
                    style={[
                      s.hojaEstado,
                      { backgroundColor: estadoDe(detalle.estado).bg },
                    ]}
                  >
                    <Ionicons
                      name={estadoDe(detalle.estado).icon}
                      size={18}
                      color={estadoDe(detalle.estado).color}
                    />
                    <Text
                      style={[
                        s.hojaEstadoTexto,
                        { color: estadoDe(detalle.estado).color },
                      ]}
                    >
                      {estadoDe(detalle.estado).text}
                    </Text>
                  </View>

                  <View style={s.datos}>
                    <View style={s.dato}>
                      <Text style={s.datoEtiqueta}>Tarjeta</Text>
                      <Text style={s.datoValor}>
                        {(detalle.tarjetas || {}).banco || detalle.banco}
                        {detalle.tarjetas?.ultimos_4
                          ? ` •••• ${detalle.tarjetas.ultimos_4}`
                          : ""}
                      </Text>
                    </View>
                    {detalle.nota_cliente ? (
                      <View style={s.dato}>
                        <Text style={s.datoEtiqueta}>Tu nota</Text>
                        <Text style={s.datoValor}>{detalle.nota_cliente}</Text>
                      </View>
                    ) : null}
                  </View>

                  {detalle.estado === "rechazado" && detalle.motivo_rechazo ? (
                    <View style={s.rechazoBox}>
                      <Text style={s.rechazoLabel}>Motivo del rechazo</Text>
                      <Text style={s.rechazoTexto}>
                        {detalle.motivo_rechazo}
                      </Text>
                    </View>
                  ) : null}

                  {/* Recorrido */}
                  <Text style={s.seccionTitulo}>Recorrido</Text>
                  <View style={s.recorrido}>
                    <Paso
                      icono="paper-plane"
                      color={COLORS.primaryLight}
                      titulo="Enviada"
                      fecha={detalle.created_at}
                      ultimo={detalle.estado === "pendiente"}
                    />
                    {detalle.estado === "pendiente" ? null : (
                      <Paso
                        icono={
                          detalle.estado === "rechazado"
                            ? "close"
                            : "checkmark"
                        }
                        color={
                          detalle.estado === "rechazado"
                            ? COLORS.error
                            : COLORS.success
                        }
                        titulo={
                          detalle.estado === "rechazado"
                            ? "Rechazada"
                            : "Aprobada"
                        }
                        fecha={detalle.fecha_revision}
                        ultimo={detalle.estado !== "pagado"}
                      />
                    )}
                    {detalle.estado === "pagado" && (
                      <Paso
                        icono="cash"
                        color={COLORS.primary}
                        titulo="Pago enviado"
                        fecha={detalle.pagado_en}
                        ultimo
                      />
                    )}
                    {detalle.estado === "pendiente" && (
                      <Text style={s.recorridoPista}>
                        Estamos revisando tu comprobante. Te avisaremos en la
                        campana cuando cambie.
                      </Text>
                    )}
                  </View>

                  {/* Comprobante: se carga recien ahora */}
                  <Text style={s.seccionTitulo}>Comprobante</Text>
                  {imagen.estado === "cargando" || imagen.estado === "vacio" ? (
                    <View style={[s.comprobante, s.comprobanteCentro]}>
                      <ActivityIndicator color={COLORS.primary} />
                      <Text style={s.comprobanteAyuda}>
                        Cargando comprobante…
                      </Text>
                    </View>
                  ) : imagen.estado === "listo" ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setAmpliada(true)}
                    >
                      <Image
                        source={{ uri: imagen.url }}
                        style={s.comprobante}
                        resizeMode="contain"
                      />
                      <Text style={s.comprobanteAmpliar}>
                        Toca para verlo en pantalla completa
                      </Text>
                    </TouchableOpacity>
                  ) : imagen.estado === "sin" ? (
                    <View style={[s.comprobante, s.comprobanteCentro]}>
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color={COLORS.textLight}
                      />
                      <Text style={s.comprobanteAyuda}>
                        Esta solicitud no tiene comprobante guardado.
                      </Text>
                    </View>
                  ) : (
                    <View style={[s.comprobante, s.comprobanteCentro]}>
                      <Ionicons
                        name="cloud-offline-outline"
                        size={28}
                        color={COLORS.textLight}
                      />
                      <Text style={s.comprobanteAyuda}>
                        No pudimos cargar el comprobante.
                      </Text>
                      <TouchableOpacity
                        style={s.reintentar}
                        onPress={() => cargarImagen(detalle)}
                      >
                        <Text style={s.reintentarTexto}>Reintentar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>

        {/* Pantalla completa, dentro del mismo Modal: dos Modal de React
            Native abiertos a la vez se comportan distinto en Android e
            iOS, y uno puede quedar detras del otro. */}
        {ampliada && imagen.url ? (
          <Pressable
            style={s.ampliadaFondo}
            onPress={() => setAmpliada(false)}
          >
            <Image
              source={{ uri: imagen.url }}
              style={s.ampliadaImagen}
              resizeMode="contain"
            />
            <View style={s.ampliadaCerrar}>
              <Ionicons name="close" size={26} color={COLORS.white} />
            </View>
          </Pressable>
        ) : null}
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

  // Hoja de detalle
  hojaFondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.55)",
    justifyContent: "flex-end",
  },
  hoja: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: "90%",
  },
  hojaAsa: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  hojaCabecera: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  hojaEtiqueta: { ...TIPO.micro, textTransform: "uppercase", letterSpacing: 0.6 },
  hojaCodigo: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 2,
    ...CIFRAS,
  },
  hojaEstado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hojaEstadoTexto: { fontSize: 14, fontWeight: "700" },

  datos: { marginTop: 14, gap: 10 },
  dato: {},
  datoEtiqueta: { ...TIPO.micro, marginBottom: 2 },
  datoValor: { fontSize: 14, color: COLORS.text, lineHeight: 20 },

  rechazoBox: {
    backgroundColor: COLORS.errorLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  rechazoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.error,
    marginBottom: 3,
  },
  rechazoTexto: { fontSize: 13.5, color: COLORS.error, lineHeight: 19 },

  seccionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 10,
  },

  recorrido: {},
  recorridoPista: { ...TIPO.apoyo, marginTop: 6 },
  paso: { flexDirection: "row", gap: 12 },
  pasoRiel: { alignItems: "center", width: 22 },
  pasoPunto: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  pasoLinea: { width: 2, flex: 1, minHeight: 16, backgroundColor: COLORS.border },
  pasoTexto: { flex: 1, paddingBottom: 14 },
  pasoTitulo: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  pasoFecha: { ...TIPO.micro, marginTop: 2 },

  comprobante: {
    width: "100%",
    height: 320,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  comprobanteCentro: { alignItems: "center", justifyContent: "center", gap: 8 },
  comprobanteAyuda: { ...TIPO.apoyo, textAlign: "center", paddingHorizontal: 20 },
  comprobanteAmpliar: { ...TIPO.micro, textAlign: "center", marginTop: 8 },
  reintentar: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reintentarTexto: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  ampliadaFondo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  ampliadaImagen: { width: "100%", height: "82%" },
  ampliadaCerrar: { position: "absolute", top: 50, right: 20 },
});
