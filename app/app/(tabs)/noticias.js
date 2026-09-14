import { useCallback, useMemo, useRef, useState } from "react";
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
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { urlPublica } from "../../src/lib/storage";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import { EsqueletoLista, Aparece } from "../../src/components/Cargando";

const BUCKET_NOTICIAS = "noticias-fotos";

/**
 * Como se presenta cada tipo. El color no es decoracion: separa de un
 * vistazo lo que es una oferta de lo que es un aviso que hay que leer.
 */
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
// El ancho util de la tarjeta: la pantalla menos el padding del scroll.
const ANCHO_IMAGEN = ANCHO_PANTALLA - 40;
const ALTO_IMAGEN = Math.round(ANCHO_IMAGEN * 0.56); // 16:9

const MES_DIA = { day: "numeric", month: "short" };

/** Dias completos que faltan para una fecha. Negativo si ya paso. */
function diasHasta(fecha) {
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

/**
 * Carrusel de las imagenes de una noticia.
 *
 * Con una sola imagen no dibuja puntos ni permite deslizar: un carrusel
 * de un elemento solo confunde.
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
          <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => onAbrir(i)}>
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
  const [noticias, setNoticias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [ampliada, setAmpliada] = useState(null);

  // El perfil solo alimenta el menu lateral: no hace falta volver a
  // pedirlo cada vez que se entra a la pantalla.
  const perfilPedido = useRef(false);

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

    // La vigencia la aplica la politica de la base: aqui no llega nada
    // vencido ni programado para mas adelante.
    const { data } = await supabase
      .from("alertas_sistema")
      .select("id, titulo, mensaje, tipo, imagenes, fecha_inicio, fecha_fin")
      .order("fecha_inicio", { ascending: false });

    setNoticias(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // Las URLs se arman una sola vez y no en cada render: getPublicUrl no
  // llama al servidor, pero rehacer el mapa en cada pintado haria que
  // las Image perdieran su cache y parpadearan.
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
        {loading ? (
          <EsqueletoLista filas={2} alto={280} />
        ) : noticias.length === 0 ? (
          <View style={s.vacio}>
            <View style={s.vacioIcono}>
              <Ionicons
                name="megaphone-outline"
                size={30}
                color={COLORS.primaryLight}
              />
            </View>
            <Text style={s.vacioTitulo}>Nada nuevo por ahora</Text>
            <Text style={s.vacioTexto}>
              Aquí verás las promociones y avisos cuando los publiquemos.
            </Text>
          </View>
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
                            // Los ultimos tres dias se avisan en rojo:
                            // es cuando el dato cambia una decision.
                            quedan <= 3 && s.vigenciaUrge,
                          ]}
                        >
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={quedan <= 3 ? COLORS.error : COLORS.textSecondary}
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },

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

  vacio: { alignItems: "center", marginTop: 70, paddingHorizontal: 30 },
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
