import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { urlPublica } from "../../src/lib/storage";
import { listarAlertas, marcarVistas, gravedadDe } from "../../src/lib/alertas";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import { EsqueletoLista, Aparece } from "../../src/components/Cargando";

const BUCKET_NOTICIAS = "noticias-fotos";

/**
 * Dos cosas distintas en la misma pantalla, separadas a proposito.
 *
 * Una noticia se navega: promociones, feriados, descuentos. Una alerta
 * interrumpe: si el cliente se entera manana, ya no le sirvio. Antes
 * estaban mezcladas en una sola lista, asi que una caida del BCP se
 * veia igual de urgente que un 10% de descuento.
 */
const SECCIONES = [
  { clave: "noticias", titulo: "Noticias" },
  { clave: "alertas", titulo: "Alertas" },
];

/** Como se presenta cada tipo de noticia. */
const TIPOS = {
  promocion: {
    etiqueta: "Promoción",
    icono: "pricetag",
    color: COLORS.secondaryDark,
    fondo: COLORS.secondaryLight,
  },
  info: {
    etiqueta: "Aviso",
    icono: "information-circle",
    color: "#1A73E8",
    fondo: "#E8F0FE",
  },
  advertencia: {
    etiqueta: "Importante",
    icono: "alert-circle",
    color: COLORS.warning,
    fondo: COLORS.warningLight,
  },
  critico: {
    etiqueta: "Urgente",
    icono: "warning",
    color: COLORS.error,
    fondo: COLORS.errorLight,
  },
};

const ANCHO_PANTALLA = Dimensions.get("window").width;
const ANCHO_IMAGEN = ANCHO_PANTALLA - 40;
const ALTO_IMAGEN = Math.round(ANCHO_IMAGEN * 0.56); // 16:9

const MES_DIA = { day: "numeric", month: "short" };

/** Dias completos que faltan para una fecha. Negativo si ya paso. */
function diasHasta(fecha) {
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
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
  return new Date(iso).toLocaleDateString("es-PE", MES_DIA);
}

/**
 * Carrusel de las imagenes de una noticia. Con una sola imagen no
 * dibuja puntos ni permite deslizar: un carrusel de un elemento solo
 * confunde.
 */
function Carrusel({ urls, onAbrir }) {
  const [indice, setIndice] = useState(0);

  if (urls.length === 1) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => onAbrir(0)}>
        <Image source={{ uri: urls[0] }} style={s.imagen} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndice(Math.round(e.nativeEvent.contentOffset.x / ANCHO_IMAGEN))
        }
      >
        {urls.map((url, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.9}
            onPress={() => onAbrir(i)}
          >
            <Image source={{ uri: url }} style={s.imagen} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.puntos}>
        {urls.map((_, i) => (
          <View key={i} style={[s.punto, i === indice && s.puntoActivo]} />
        ))}
      </View>

      <View style={s.contador}>
        <Text style={s.contadorText}>
          {indice + 1}/{urls.length}
        </Text>
      </View>
    </View>
  );
}

export default function NoticiasScreen() {
  const { seccion } = useLocalSearchParams();
  const [activa, setActiva] = useState(
    seccion === "alertas" ? "alertas" : "noticias",
  );
  const [noticias, setNoticias] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [ampliada, setAmpliada] = useState(null);

  const perfilPedido = useRef(false);

  // La burbuja manda aqui con ?seccion=alertas. Si la pantalla ya
  // estaba montada, el estado inicial no se vuelve a calcular solo.
  useEffect(() => {
    if (seccion === "alertas" || seccion === "noticias") setActiva(seccion);
  }, [seccion]);

  const cargar = useCallback(async () => {
    if (!perfilPedido.current) {
      perfilPedido.current = true;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("perfiles_cliente")
          .select("nombres, apellidos, dni")
          .eq("user_id", user.id)
          .maybeSingle();
        setPerfil(data);
      }
    }

    // Las dos listas en paralelo: son independientes y esperarlas una
    // detras de otra solo duplicaria el tiempo de carga.
    // La vigencia la aplica la politica de la base: aqui no llega nada
    // vencido ni programado para mas adelante.
    const [resNoticias, resAlertas] = await Promise.all([
      supabase
        .from("alertas_sistema")
        .select("id, titulo, mensaje, tipo, imagenes, fecha_inicio, fecha_fin")
        .eq("categoria", "noticia")
        .order("fecha_inicio", { ascending: false }),
      listarAlertas(),
    ]);

    setNoticias(resNoticias.data || []);
    setAlertas(resAlertas.alertas);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const sinVer = useMemo(() => alertas.filter((a) => !a.vista).length, [alertas]);

  /**
   * Abrir la pestana es lo que marca las alertas como vistas, no que la
   * burbuja haya aparecido. Asi, si el cliente perdio la burbuja, el
   * punto de "nueva" sigue esperandolo.
   *
   * El estado local no se toca: se deja el punto dibujado mientras la
   * esta leyendo, y desaparece la proxima vez que entre.
   */
  useEffect(() => {
    if (activa !== "alertas") return;
    const nuevas = alertas.filter((a) => !a.vista).map((a) => a.id);
    if (nuevas.length) marcarVistas(nuevas);
  }, [activa, alertas]);

  const urlsPorNoticia = useMemo(() => {
    const mapa = {};
    for (const n of noticias) {
      mapa[n.id] = (n.imagenes || [])
        .map((p) => urlPublica(BUCKET_NOTICIAS, p))
        .filter(Boolean);
    }
    return mapa;
  }, [noticias]);

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Noticias" />

      {/* Selector de seccion */}
      <View style={s.selector}>
        {SECCIONES.map((sec) => {
          const puesta = activa === sec.clave;
          return (
            <TouchableOpacity
              key={sec.clave}
              onPress={() => setActiva(sec.clave)}
              style={[s.pestana, puesta && s.pestanaActiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: puesta }}
            >
              <Text style={[s.pestanaText, puesta && s.pestanaTextActiva]}>
                {sec.titulo}
              </Text>
              {sec.clave === "alertas" && sinVer > 0 && (
                <View style={s.globo}>
                  <Text style={s.globoText}>{sinVer > 9 ? "9+" : sinVer}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
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
        <Text style={s.explicacion}>
          {activa === "noticias"
            ? "Promociones, feriados y novedades."
            : "Avisos urgentes. Se quedan aquí aunque no llegues a ver el mensaje que aparece en pantalla."}
        </Text>

        {loading ? (
          <EsqueletoLista filas={2} alto={activa === "noticias" ? 280 : 110} />
        ) : activa === "noticias" ? (
          noticias.length === 0 ? (
            <Vacio
              icono="megaphone-outline"
              titulo="Nada nuevo por ahora"
              texto="Aquí verás las promociones y avisos cuando los publiquemos."
            />
          ) : (
            noticias.map((n, i) => {
              const t = TIPOS[n.tipo] || TIPOS.info;
              const urls = urlsPorNoticia[n.id] || [];
              const quedan = n.fecha_fin ? diasHasta(n.fecha_fin) : null;

              return (
                <Aparece key={n.id} retraso={Math.min(i, 6) * 70}>
                  <View style={s.card}>
                    {urls.length > 0 ? (
                      <View>
                        <Carrusel
                          urls={urls}
                          onAbrir={(idx) => setAmpliada({ urls, idx })}
                        />
                        <View style={[s.etiqueta, s.etiquetaSobreFoto]}>
                          <Ionicons name={t.icono} size={12} color={t.color} />
                          <Text style={[s.etiquetaText, { color: t.color }]}>
                            {t.etiqueta}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      // Sin imagen, una banda del color del tipo. Asi la
                      // tarjeta sigue teniendo forma y no parece rota.
                      <View style={[s.banda, { backgroundColor: t.fondo }]}>
                        <Ionicons name={t.icono} size={26} color={t.color} />
                        <Text style={[s.bandaText, { color: t.color }]}>
                          {t.etiqueta}
                        </Text>
                      </View>
                    )}

                    <View style={s.cuerpo}>
                      <Text style={s.titulo}>{n.titulo}</Text>
                      <Text style={s.mensaje}>{n.mensaje}</Text>

                      <View style={s.pie}>
                        <Ionicons
                          name="calendar-outline"
                          size={13}
                          color={COLORS.textLight}
                        />
                        <Text style={s.fecha}>
                          {new Date(n.fecha_inicio).toLocaleDateString(
                            "es-PE",
                            MES_DIA,
                          )}
                        </Text>

                        {quedan !== null && (
                          <View
                            style={[
                              s.vigencia,
                              // Los ultimos tres dias en rojo: es cuando
                              // el dato cambia una decision.
                              quedan <= 3 && s.vigenciaUrge,
                            ]}
                          >
                            <Ionicons
                              name="time-outline"
                              size={12}
                              color={
                                quedan <= 3 ? COLORS.error : COLORS.textSecondary
                              }
                            />
                            <Text
                              style={[
                                s.vigenciaText,
                                quedan <= 3 && s.vigenciaTextUrge,
                              ]}
                            >
                              {quedan <= 0
                                ? "Último día"
                                : quedan === 1
                                  ? "Queda 1 día"
                                  : quedan <= 7
                                    ? `Quedan ${quedan} días`
                                    : `Hasta el ${new Date(
                                        n.fecha_fin,
                                      ).toLocaleDateString("es-PE", MES_DIA)}`}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </Aparece>
              );
            })
          )
        ) : alertas.length === 0 ? (
          <Vacio
            icono="shield-checkmark-outline"
            titulo="Todo funcionando"
            texto="Aquí aparecerán los avisos urgentes, como una caída de un banco o una demora en los pagos."
          />
        ) : (
          alertas.map((a, i) => {
            const g = gravedadDe(a.tipo);
            return (
              <Aparece key={a.id} retraso={Math.min(i, 6) * 60}>
                <View
                  style={[
                    s.alerta,
                    { borderLeftColor: g.color },
                    !a.vista && { backgroundColor: g.fondo },
                  ]}
                >
                  <View style={s.alertaFila}>
                    <Ionicons name={g.icono} size={18} color={g.color} />
                    <Text style={[s.alertaEtiqueta, { color: g.color }]}>
                      {g.etiqueta}
                    </Text>
                    {!a.vista && (
                      <View style={s.nueva}>
                        <Text style={s.nuevaText}>Nueva</Text>
                      </View>
                    )}
                  </View>

                  <Text style={s.alertaTitulo}>{a.titulo}</Text>
                  <Text style={s.alertaMensaje}>{a.mensaje}</Text>

                  <View style={s.alertaPie}>
                    <Text style={s.fecha}>{fechaRelativa(a.fecha_inicio)}</Text>
                    {a.fecha_fin && (
                      <Text style={s.fecha}>
                        · Hasta el{" "}
                        {new Date(a.fecha_fin).toLocaleDateString(
                          "es-PE",
                          MES_DIA,
                        )}
                      </Text>
                    )}
                  </View>
                </View>
              </Aparece>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={Boolean(ampliada)}
        transparent
        animationType="fade"
        onRequestClose={() => setAmpliada(null)}
      >
        <Pressable style={s.visorFondo} onPress={() => setAmpliada(null)}>
          {ampliada && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: ampliada.idx * ANCHO_PANTALLA, y: 0 }}
            >
              {ampliada.urls.map((url, i) => (
                <View key={i} style={s.visorPagina}>
                  <Image
                    source={{ uri: url }}
                    style={s.visorImagen}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>
          )}
          <View style={s.visorCerrar}>
            <Ionicons name="close" size={26} color={COLORS.white} />
          </View>
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

/** Estado vacio con una explicacion, no un texto gris suelto. */
function Vacio({ icono, titulo, texto }) {
  return (
    <View style={s.vacio}>
      <View style={s.vacioIcono}>
        <Ionicons name={icono} size={30} color={COLORS.primaryLight} />
      </View>
      <Text style={s.vacioTitulo}>{titulo}</Text>
      <Text style={s.vacioTexto}>{texto}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },

  selector: {
    flexDirection: "row",
    gap: 6,
    padding: 6,
    margin: 20,
    marginBottom: 0,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pestana: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  pestanaActiva: { backgroundColor: COLORS.primary },
  pestanaText: { fontSize: 14, fontWeight: "600", color: COLORS.textSecondary },
  pestanaTextActiva: { color: COLORS.white },
  globo: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  globoText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },

  explicacion: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },

  imagen: {
    width: ANCHO_IMAGEN,
    height: ALTO_IMAGEN,
    backgroundColor: COLORS.inputBg,
  },
  puntos: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  punto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  puntoActivo: { backgroundColor: COLORS.white, width: 16 },
  contador: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(15,27,51,0.6)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contadorText: { color: COLORS.white, fontSize: 11, fontWeight: "600" },

  etiqueta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
    backgroundColor: COLORS.white,
  },
  etiquetaSobreFoto: { position: "absolute", top: 10, left: 10 },
  etiquetaText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },

  banda: {
    height: 74,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bandaText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },

  cuerpo: { padding: 16, gap: 7 },
  titulo: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  mensaje: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21 },

  pie: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  fecha: { fontSize: 12, color: COLORS.textLight },
  vigencia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  vigenciaUrge: { backgroundColor: COLORS.errorLight },
  vigenciaText: { fontSize: 11, fontWeight: "600", color: COLORS.textSecondary },
  vigenciaTextUrge: { color: COLORS.error },

  // Alertas
  alerta: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 4,
    padding: 15,
    marginBottom: 12,
    gap: 5,
  },
  alertaFila: { flexDirection: "row", alignItems: "center", gap: 7 },
  alertaEtiqueta: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  nueva: {
    marginLeft: "auto",
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nuevaText: { color: COLORS.white, fontSize: 10, fontWeight: "700" },
  alertaTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  alertaMensaje: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 20 },
  alertaPie: { flexDirection: "row", gap: 4, marginTop: 3 },

  vacio: { alignItems: "center", marginTop: 60, paddingHorizontal: 30 },
  vacioIcono: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  vacioTitulo: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 14,
  },
  vacioTexto: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 19,
  },

  visorFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
  visorPagina: {
    width: ANCHO_PANTALLA,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  visorImagen: { width: "100%", height: "70%" },
  visorCerrar: { position: "absolute", top: 50, right: 20 },
});
