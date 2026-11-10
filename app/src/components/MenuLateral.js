import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  BackHandler,
  Platform,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme/tokens";
import { GlassPanel } from "./ui/GlassPanel";
import { Toque } from "./ui/Toque";
import { useAvisosSinLeer } from "../lib/avisos";
import { listarAlertas } from "../lib/alertas";
import {
  CURVA,
  DURACION,
  duracion,
  useReducirMovimiento,
} from "../lib/movimiento";

const ANCHO = 296;
const MARGEN = 12;
// La curva del diseño es la misma al entrar y al salir; lo que cambia
// es el tiempo. Salir más rápido que entrar: abrir es una decisión que
// se acompaña, cerrar es querer irse y hacerse esperar ahí molesta.
const VELOCIDAD_ENTRA = DURACION.drawer;
const VELOCIDAD_SALE = Math.round(DURACION.drawer * 0.55);
const FUERA = -(ANCHO + MARGEN * 2);

function iniciales(perfil) {
  const a = (perfil?.nombres || "").trim().charAt(0);
  const b = (perfil?.apellidos || "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

function nombreCorto(perfil) {
  if (!perfil) return "Mi cuenta";
  const n = (perfil.nombres || "").trim().split(/\s+/)[0] || "";
  const a = (perfil.apellidos || "").trim().split(/\s+/)[0] || "";
  return `${n} ${a}`.trim() || "Mi cuenta";
}

/**
 * Menú lateral de cristal.
 *
 * Entra deslizándose y sale por el mismo camino, y el componente se
 * mantiene montado hasta que la salida termina: sin eso, el panel se
 * borraría antes de poder animarse.
 *
 * Mis avisos lleva el contador de sin leer y Noticias un punto rojo si
 * hay una alerta urgente sin abrir: así se ve qué espera sin tener que
 * entrar a cada sección.
 */
export default function MenuLateral({ visible, onClose, perfil }) {
  const router = useRouter();
  const ruta = usePathname();
  const insets = useSafeAreaInsets();
  const [montado, setMontado] = useState(visible);
  const [urgente, setUrgente] = useState(false);
  const avisosSinLeer = useAvisosSinLeer();
  const reducir = useReducirMovimiento();

  const desliz = useRef(new Animated.Value(visible ? 0 : FUERA)).current;
  const fondo = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMontado(true);
      // Lo que muestra el menú se lee al abrirlo, no al montar la
      // pantalla: entre una apertura y otra pudo llegar una alerta.
      listarAlertas().then(({ alertas }) =>
        setUrgente(alertas.some((a) => a.tipo === "critico" && !a.vista)),
      );

      Animated.parallel([
        Animated.timing(desliz, {
          toValue: 0,
          duration: duracion(VELOCIDAD_ENTRA, reducir),
          easing: CURVA,
          useNativeDriver: true,
        }),
        Animated.timing(fondo, {
          toValue: 1,
          duration: duracion(VELOCIDAD_ENTRA, reducir),
          easing: CURVA,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(desliz, {
        toValue: FUERA,
        duration: duracion(VELOCIDAD_SALE, reducir),
        easing: CURVA,
        useNativeDriver: true,
      }),
      Animated.timing(fondo, {
        toValue: 0,
        duration: duracion(VELOCIDAD_SALE, reducir),
        easing: CURVA,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMontado(false);
    });
  }, [visible, desliz, fondo, reducir]);

  // El botón atrás de Android debe cerrar el menú antes que salir de la
  // pantalla, que es lo que la gente espera.
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!montado) return null;

  /**
   * Se cierra primero y se navega después. Si se navegara de inmediato,
   * la pantalla nueva entraría con el menú todavía encima.
   */
  function navegar(destino) {
    onClose();
    setTimeout(() => router.push(destino), Math.max(0, VELOCIDAD_SALE - 60));
  }

  const opciones = [
    { label: "Inicio", ruta: "/(tabs)/inicio", clave: "/inicio", icon: "home-outline" },
    { label: "Solicitudes", ruta: "/(tabs)/solicitudes", clave: "/solicitudes", icon: "receipt-outline" },
    { label: "Tarjetas y cuentas", ruta: "/(tabs)/tarjetas", clave: "/tarjetas", icon: "card-outline" },
    {
      label: "Mis avisos",
      ruta: "/notificaciones",
      clave: "/notificaciones",
      icon: "notifications-outline",
      contador: avisosSinLeer,
    },
    {
      label: "Noticias",
      ruta: "/(tabs)/noticias",
      clave: "/noticias",
      icon: "newspaper-outline",
      punto: urgente,
    },
    { label: "Sobre la empresa", ruta: "/empresa", clave: "/empresa", icon: "information-circle-outline" },
    { label: "Mi cuenta", ruta: "/(tabs)/perfil", clave: "/perfil", icon: "person-outline" },
  ];

  const verificada = Boolean(perfil?.validado_por);

  return (
    <View style={s.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, s.velo, { opacity: fondo }]}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar menú"
        />
      </Animated.View>

      <Animated.View
        style={[
          s.panelPosicion,
          {
            top: insets.top + MARGEN,
            bottom: insets.bottom + MARGEN,
            transform: [{ translateX: desliz }],
          },
        ]}
      >
        <GlassPanel variant="sheet" radius={30} style={s.panel}>
          <View accessibilityRole="menu" style={{ flex: 1 }}>
            <View style={s.perfil}>
              <View style={s.avatar}>
                <Text style={s.avatarTexto}>{iniciales(perfil)}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {nombreCorto(perfil)}
                </Text>
                {verificada ? (
                  <View style={s.verificada}>
                    <Ionicons name="shield-checkmark-outline" size={12} color={colors.goldText} />
                    <Text style={s.verificadaTexto}>Verificada</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {opciones.map((op) => {
                const activa = ruta === op.clave || ruta.endsWith(op.clave);
                return (
                  <Toque
                    key={op.label}
                    onPress={() => (activa ? onClose() : navegar(op.ruta))}
                    accessibilityRole="menuitem"
                    accessibilityLabel={
                      op.contador > 0 ? `${op.label}, ${op.contador} sin leer` : op.label
                    }
                    accessibilityState={{ selected: activa }}
                    style={[s.item, activa && s.itemActivo]}
                  >
                    <Ionicons
                      name={op.icon}
                      size={20}
                      color={activa ? colors.gold : colors.text}
                    />
                    <Text style={[s.itemTexto, activa && s.itemTextoActivo]}>{op.label}</Text>
                    {op.contador > 0 ? (
                      <View style={s.contador}>
                        <Text style={s.contadorTexto}>
                          {op.contador > 9 ? "9+" : op.contador}
                        </Text>
                      </View>
                    ) : null}
                    {op.punto ? <View style={s.puntoRojo} /> : null}
                  </Toque>
                );
              })}

              {/* Legal: siempre a mano, más discreto que las opciones. */}
              <View style={s.legal}>
                {[
                  { label: "Términos y condiciones", ruta: "/legal/terminos" },
                  { label: "Política de privacidad", ruta: "/legal/privacidad" },
                  { label: "Libro de Reclamaciones", ruta: "/reclamaciones" },
                ].map((l) => (
                  <Toque
                    key={l.ruta}
                    onPress={() => navegar(l.ruta)}
                    accessibilityRole="menuitem"
                    accessibilityLabel={l.label}
                    style={s.legalItem}
                  >
                    <Text style={s.legalTexto}>{l.label}</Text>
                  </Toque>
                ))}
              </View>
            </ScrollView>

            <View style={s.sesion}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.text2} />
              <Text style={s.sesionTexto}>Se bloquea tras 10 min sin uso</Text>
            </View>
          </View>
        </GlassPanel>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  velo: { backgroundColor: "rgba(15,27,51,0.18)" },
  panelPosicion: { position: "absolute", left: MARGEN, width: ANCHO },
  panel: {
    flex: 1,
    paddingVertical: 22,
    paddingHorizontal: 14,
    shadowColor: colors.night,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  perfil: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    paddingBottom: 18,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: { fontFamily: fonts.display, fontSize: 20, color: colors.gold },
  nombre: { fontFamily: fonts.strong, fontSize: 16, color: colors.text },
  verificada: { flexDirection: "row", alignItems: "center", gap: 4 },
  verificadaTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.goldText },

  legal: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft, gap: 2 },
  legalItem: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  legalTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: 50,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  itemActivo: { backgroundColor: colors.navy },
  itemTexto: { flex: 1, fontFamily: fonts.label, fontSize: 15, color: colors.text },
  itemTextoActivo: { fontFamily: fonts.strong, color: colors.gold },
  contador: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  contadorTexto: { fontFamily: fonts.heavy, fontSize: 11, color: colors.night },
  puntoRojo: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.errorStrong },

  sesion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sesionTexto: { fontFamily: fonts.body, fontSize: 12, color: colors.text2 },
});
