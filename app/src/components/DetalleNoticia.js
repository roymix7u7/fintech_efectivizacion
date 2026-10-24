// Una noticia completa, en una hoja que sube desde abajo.
//
// Antes tocar una noticia de la lista solo la subía a "Destacada", arriba
// de la pantalla: había que volver a subir para leerla y no se sabía qué
// había cambiado. Ahora se abre aquí, con todas sus imágenes, el texto
// entero y hasta cuándo vale. Se cierra con la X, tocando el velo o
// arrastrando la barrita hacia abajo.
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme/tokens";
import { quedanTexto } from "../lib/fechas";
import { useReducirMovimiento } from "../lib/movimiento";
import { useArrastreCerrar } from "../lib/arrastre";
import { Toque } from "./ui/Toque";
import { BotonIcono } from "./ui/Piezas";
import { VisorImagen } from "./ui/VisorImagen";

const ANCHO = Dimensions.get("window").width - 32;
const ALTO = Math.round(ANCHO * 0.62);

const fechaLarga = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "";

/**
 * noticia: { id, titulo, mensaje, tipo, fecha_inicio, fecha_fin, urls }
 * tipo:    { etiqueta, color, fondo } (TIPOS_NOTICIA de la pantalla)
 */
export default function DetalleNoticia({ noticia, tipo, onCerrar }) {
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  const [indice, setIndice] = useState(0);
  const [ampliada, setAmpliada] = useState(null);
  const [arrastrada, setArrastrada] = useState(false);
  const carrusel = useRef(null);
  const arrastre = useArrastreCerrar({
    alCerrar: () => {
      setArrastrada(true);
      onCerrar();
    },
  });

  const id = noticia?.id || null;
  useEffect(() => {
    if (!id) return;
    setIndice(0);
    setAmpliada(null);
    setArrastrada(false);
    arrastre.reiniciar();
  }, [id]);

  const urls = noticia?.urls || [];
  const quedan = noticia ? quedanTexto(noticia.fecha_fin) : null;

  return (
    <Modal
      visible={Boolean(id)}
      transparent
      animationType={reducir || arrastrada ? "none" : "slide"}
      onRequestClose={() => (ampliada ? setAmpliada(null) : onCerrar())}
      statusBarTranslucent
    >
      <Pressable style={s.velo} onPress={onCerrar} accessibilityLabel="Cerrar noticia">
        <Animated.View style={[s.posicion, { transform: [{ translateY: arrastre.y }] }]}>
          <Pressable onPress={() => {}} style={s.hoja} accessibilityViewIsModal>
            {noticia ? (
              <>
                {/* Barrita y cabecera: se arrastran hacia abajo para cerrar. */}
                <View {...arrastre.gestos} style={s.cabecera}>
                  <View style={s.asaZona}>
                    <View style={s.asa} />
                  </View>
                  <View style={s.cabeceraFila}>
                    <View style={[s.tipo, { backgroundColor: tipo.fondo }]}>
                      <Text style={[s.tipoTexto, { color: tipo.color }]}>{tipo.etiqueta}</Text>
                    </View>
                    <BotonIcono icono="close" onPress={onCerrar} accessibilityLabel="Cerrar" tamano={18} />
                  </View>
                </View>

                <ScrollView
                  style={{ flexShrink: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14, paddingBottom: insets.bottom + 24 }}
                >
                  {urls.length ? (
                    <View>
                      <ScrollView
                        ref={carrusel}
                        horizontal
                        pagingEnabled
                        scrollEnabled={urls.length > 1}
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => setIndice(Math.round(e.nativeEvent.contentOffset.x / ANCHO))}
                        style={s.carrusel}
                      >
                        {urls.map((url, i) => (
                          <Pressable
                            key={url}
                            onPress={() => setAmpliada(url)}
                            accessibilityLabel={`Ampliar imagen ${i + 1} de ${urls.length}`}
                          >
                            <Image source={{ uri: url }} style={s.imagen} resizeMode="cover" />
                          </Pressable>
                        ))}
                      </ScrollView>
                      {urls.length > 1 ? (
                        <View style={s.contador} pointerEvents="none">
                          <Ionicons name="images-outline" size={12} color={colors.white} />
                          <Text style={s.contadorTexto}>
                            {indice + 1} / {urls.length}
                          </Text>
                        </View>
                      ) : null}
                      <View style={s.ampliar} pointerEvents="none">
                        <Ionicons name="expand-outline" size={13} color={colors.white} />
                      </View>
                    </View>
                  ) : null}

                  <Text style={s.titulo} accessibilityRole="header">
                    {noticia.titulo}
                  </Text>

                  <View style={s.meta}>
                    <View style={s.metaDato}>
                      <Ionicons name="calendar-outline" size={14} color={colors.text3} />
                      <Text style={s.metaTexto}>Publicada el {fechaLarga(noticia.fecha_inicio)}</Text>
                    </View>
                    {quedan ? (
                      <View style={s.quedan}>
                        <Ionicons name="time-outline" size={13} color={colors.goldText} />
                        <Text style={s.quedanTexto}>{quedan}</Text>
                      </View>
                    ) : null}
                  </View>

                  {noticia.mensaje ? <Text style={s.mensaje}>{noticia.mensaje}</Text> : null}

                  {noticia.fecha_fin ? (
                    <View style={s.vigencia}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.text2} />
                      <Text style={s.vigenciaTexto}>Válida hasta el {fechaLarga(noticia.fecha_fin)}.</Text>
                    </View>
                  ) : null}

                  <Toque onPress={onCerrar} accessibilityLabel="Volver a las noticias" style={s.volver}>
                    <Text style={s.volverTexto}>Volver a las noticias</Text>
                  </Toque>
                </ScrollView>
              </>
            ) : null}
          </Pressable>
        </Animated.View>
      </Pressable>

      {/* Imagen a pantalla completa, con zoom. Dentro del mismo Modal:
          dos Modal abiertos a la vez se comportan distinto en Android e iOS. */}
      {ampliada ? (
        <VisorImagen url={ampliada} titulo={noticia?.titulo || "Imagen"} onCerrar={() => setAmpliada(null)} />
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  velo: { flex: 1, backgroundColor: "rgba(15,27,51,0.55)", justifyContent: "flex-end" },
  posicion: { maxHeight: "92%" },
  hoja: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  cabecera: { gap: 12 },
  asaZona: { alignItems: "center", paddingVertical: 8, marginVertical: -8 },
  asa: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.fieldFilled },
  cabeceraFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tipo: { height: 28, paddingHorizontal: 12, borderRadius: 999, justifyContent: "center" },
  tipoTexto: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.3 },

  carrusel: { borderRadius: 20, overflow: "hidden" },
  imagen: { width: ANCHO, height: ALTO, backgroundColor: colors.muted },
  contador: {
    position: "absolute",
    left: 12,
    bottom: 12,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,27,51,0.7)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  contadorTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.white, fontVariant: ["tabular-nums"] },
  ampliar: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15,27,51,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  titulo: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.4, color: colors.text },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  metaDato: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.text3 },
  quedan: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.goldCream,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  quedanTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.goldText },
  mensaje: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, color: colors.text },
  vigencia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.ground,
  },
  vigenciaTexto: { flex: 1, fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  volver: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  volverTexto: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
});
