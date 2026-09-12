import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  BackHandler,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../theme/colors";
import TIPO from "../theme/tipografia";

const ANCHO = 288;
const VELOCIDAD_ENTRA = 260;
const VELOCIDAD_SALE = 200;

/**
 * Menú lateral.
 *
 * Antes aparecía y desaparecía de golpe, porque se desmontaba en cuanto
 * visible pasaba a false. Ahora entra deslizándose y sale por el mismo
 * camino, y el componente se mantiene montado hasta que la salida
 * termina: sin eso, el panel se borraría antes de poder animarse.
 *
 * El cierre es más rápido que la apertura. Abrir es una decisión que se
 * acompaña; cerrar es querer irse, y hacerse esperar ahí molesta.
 */
export default function MenuLateral({ visible, onClose, perfil }) {
  const router = useRouter();
  const [montado, setMontado] = useState(visible);

  const desliz = useRef(new Animated.Value(visible ? 0 : -ANCHO)).current;
  const fondo = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMontado(true);
      Animated.parallel([
        Animated.timing(desliz, {
          toValue: 0,
          duration: VELOCIDAD_ENTRA,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fondo, {
          toValue: 1,
          duration: VELOCIDAD_ENTRA,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(desliz, {
        toValue: -ANCHO,
        duration: VELOCIDAD_SALE,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fondo, {
        toValue: 0,
        duration: VELOCIDAD_SALE,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMontado(false);
    });
  }, [visible, desliz, fondo]);

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
  function navegar(ruta) {
    onClose();
    setTimeout(() => router.push(ruta), VELOCIDAD_SALE - 60);
  }

  const opciones = [
    { label: "Inicio", ruta: "/(tabs)/inicio", icon: "home-outline" },
    {
      label: "Solicitudes",
      ruta: "/(tabs)/solicitudes",
      icon: "document-text-outline",
    },
    {
      label: "Tarjetas y cuentas",
      ruta: "/(tabs)/tarjetas",
      icon: "card-outline",
    },
    { tipo: "separador" },
    {
      label: "Mis avisos",
      ruta: "/notificaciones",
      icon: "notifications-outline",
    },
    { label: "Noticias", ruta: "/(tabs)/noticias", icon: "megaphone-outline" },
    { label: "Sobre la empresa", ruta: "/empresa", icon: "business-outline" },
    { tipo: "separador" },
    { label: "Mi cuenta", ruta: "/(tabs)/perfil", icon: "person-outline" },
  ];

  return (
    <View style={s.overlay}>
      <Animated.View style={[s.backdropCapa, { opacity: fondo }]}>
        <TouchableOpacity
          style={s.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel="Cerrar menú"
        />
      </Animated.View>

      <Animated.View
        style={[s.menu, { transform: [{ translateX: desliz }] }]}
      >
        <View style={s.menuHeader}>
          <Image
            source={require("../../assets/LOGOATK.png")}
            style={s.menuLogo}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={s.menuBrand}>ALTOQUE PERÚ WK</Text>
            <Text style={s.menuUser} numberOfLines={1}>
              {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Mi cuenta"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.menuBody} showsVerticalScrollIndicator={false}>
          {opciones.map((op, i) => {
            if (op.tipo === "separador") {
              return <View key={`sep-${i}`} style={s.separador} />;
            }
            return (
              <TouchableOpacity
                key={op.label}
                style={s.menuItem}
                onPress={() => navegar(op.ruta)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={op.icon}
                  size={20}
                  color={COLORS.primary}
                  style={{ width: 28 }}
                />
                <Text style={s.menuItemText}>{op.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={COLORS.textLight}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.menuFooter}>
          <Text style={s.footerText}>AlToque Perú WK v1.0</Text>
        </View>
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
    flexDirection: "row",
  },
  backdropCapa: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,20,38,0.55)",
  },
  backdrop: { flex: 1 },
  menu: {
    width: ANCHO,
    backgroundColor: COLORS.white,
    height: "100%",
    // Sombra hacia la derecha: despega el panel del contenido y deja
    // claro que está por encima, no al lado.
    shadowColor: "#0B1426",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 16,
  },
  menuHeader: {
    backgroundColor: COLORS.primary,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLogo: { width: 40, height: 40 },
  menuBrand: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.secondary,
    letterSpacing: 1.2,
  },
  menuUser: {
    ...TIPO.apoyo,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  closeBtn: { padding: 4 },
  menuBody: { flex: 1, paddingTop: 10 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  menuItemText: { ...TIPO.cuerpo, fontWeight: "500", flex: 1 },
  separador: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 6,
    marginHorizontal: 20,
  },
  menuFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  footerText: { ...TIPO.micro },
});
