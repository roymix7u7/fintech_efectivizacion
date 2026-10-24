// Imagen a pantalla completa (el comprobante de una solicitud).
//
// Se acerca pellizcando o con dos toques, y acercada se recorre
// arrastrando: un número de operación se tiene que poder leer en un
// teléfono chico. Está hecho con PanResponder y no con una librería de
// gestos porque vive dentro de un Modal, donde esas librerías piden
// configuración aparte en Android.
import { useRef, useState } from "react";
import { Animated, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../../theme/tokens";
import { useReducirMovimiento } from "../../lib/movimiento";
import { Toque } from "./Toque";

const MAXIMO = 4;
const DOBLE_TOQUE = 2.5;
const VENTANA_DOBLE_MS = 280;

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const distancia = (t) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);

export function VisorImagen({ url, titulo, subtitulo, onCerrar }) {
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  const [acercada, setAcercada] = useState(false);

  const escala = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  // Estado del gesto fuera de React: cambia en cada cuadro.
  const g = useRef({ e: 1, x: 0, y: 0, e0: 1, x0: 0, y0: 0, d0: 0, dedos: 0, movio: false, ultimo: 0 }).current;
  const area = useRef({ x: 0, y: 0, ancho: 1, alto: 1 }).current;

  // Cuánto se puede correr la imagen acercada sin dejar ver el vacío.
  const tope = (e) => ({ x: (area.ancho * (e - 1)) / 2, y: (area.alto * (e - 1)) / 2 });

  function fijar(e, nx, ny) {
    g.e = e;
    g.x = nx;
    g.y = ny;
    escala.setValue(e);
    x.setValue(nx);
    y.setValue(ny);
  }

  function irA(e, nx, ny) {
    const t = tope(e);
    g.e = e;
    g.x = limitar(nx, -t.x, t.x);
    g.y = limitar(ny, -t.y, t.y);
    setAcercada(e > 1.02);
    if (reducir) return fijar(g.e, g.x, g.y);
    const resorte = (v, a) => Animated.spring(v, { toValue: a, useNativeDriver: true, friction: 9, tension: 80 });
    Animated.parallel([resorte(escala, g.e), resorte(x, g.x), resorte(y, g.y)]).start();
  }

  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const t = evt.nativeEvent.touches;
        g.e0 = g.e;
        g.x0 = g.x;
        g.y0 = g.y;
        g.d0 = t.length >= 2 ? distancia(t) : 0;
        g.dedos = t.length;
        g.movio = false;
      },
      onPanResponderMove: (evt, d) => {
        const t = evt.nativeEvent.touches;
        if (Math.abs(d.dx) > 6 || Math.abs(d.dy) > 6) g.movio = true;

        if (t.length >= 2) {
          // Entró el segundo dedo a mitad del gesto: se toma de base.
          if (g.dedos < 2 || !g.d0) {
            g.d0 = distancia(t);
            g.e0 = g.e;
          }
          g.dedos = 2;
          g.movio = true;
          fijar(limitar((g.e0 * distancia(t)) / g.d0, 1, MAXIMO), g.x, g.y);
          return;
        }

        // Se soltó un dedo del pellizco: el arrastre sigue desde aquí,
        // no desde donde empezó el gesto (si no, la imagen salta).
        if (g.dedos >= 2) {
          g.dedos = 1;
          g.x0 = g.x - d.dx;
          g.y0 = g.y - d.dy;
        }
        if (g.e > 1) fijar(g.e, g.x0 + d.dx, g.y0 + d.dy);
      },
      onPanResponderRelease: (evt, d) => {
        if (!g.movio) {
          const ahora = Date.now();
          if (ahora - g.ultimo < VENTANA_DOBLE_MS) {
            g.ultimo = 0;
            if (g.e > 1.02) return irA(1, 0, 0);
            // Acerca hacia donde tocó, no al centro.
            const cx = area.x + area.ancho / 2;
            const cy = area.y + area.alto / 2;
            return irA(DOBLE_TOQUE, -(d.x0 - cx) * (DOBLE_TOQUE - 1), -(d.y0 - cy) * (DOBLE_TOQUE - 1));
          }
          g.ultimo = ahora;
          return;
        }
        if (g.e <= 1.02) return irA(1, 0, 0);
        irA(g.e, g.x, g.y);
      },
      onPanResponderTerminate: () => irA(g.e <= 1.02 ? 1 : g.e, g.x, g.y),
    }),
  ).current;

  return (
    <View style={s.fondo} accessibilityViewIsModal>
      <View
        style={[s.area, { top: insets.top + 72, bottom: insets.bottom + 56 }]}
        onLayout={(e) => {
          const l = e.nativeEvent.layout;
          area.x = l.x;
          area.y = l.y;
          area.ancho = l.width;
          area.alto = l.height;
        }}
        {...gestos.panHandlers}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: x }, { translateY: y }, { scale: escala }] },
          ]}
        >
          <Image
            source={{ uri: url }}
            style={s.imagen}
            resizeMode="contain"
            accessibilityLabel={titulo}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </View>

      <View style={[s.barra, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {subtitulo ? (
            <Text style={s.subtitulo} numberOfLines={1}>
              {subtitulo}
            </Text>
          ) : null}
        </View>
        <Toque onPress={onCerrar} accessibilityLabel="Cerrar comprobante" hitSlop={6} style={s.cerrar}>
          <Ionicons name="close" size={22} color={colors.white} />
        </Toque>
      </View>

      <View style={[s.pie, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        {acercada ? (
          <Toque onPress={() => irA(1, 0, 0)} accessibilityLabel="Ver la imagen completa" style={s.restablecer}>
            <Ionicons name="contract-outline" size={15} color={colors.white} />
            <Text style={s.pista}>Ver completa</Text>
          </Toque>
        ) : (
          <Text style={s.pista}>Pellizca o toca dos veces para acercar</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#070D1A" },
  area: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  imagen: { width: "100%", height: "100%" },
  barra: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(7,13,26,0.82)",
  },
  titulo: { fontFamily: fonts.heavy, fontSize: 17, color: colors.white },
  subtitulo: { fontFamily: fonts.label, fontSize: 12, color: "rgba(255,255,255,0.65)", fontVariant: ["tabular-nums"] },
  cerrar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  pie: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingTop: 10 },
  pista: { fontFamily: fonts.strong, fontSize: 13, color: "rgba(255,255,255,0.72)" },
  restablecer: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});

export default VisorImagen;
