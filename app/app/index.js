import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { hayConexion } from "../src/lib/conexion";
import {
  cerrarSesion,
  entrarA,
  motivoDelBloqueo,
} from "../src/lib/sesion";
import CuentaBloqueada from "../src/components/CuentaBloqueada";
import { capacidad, estadoBiometria } from "../src/lib/biometria";
import { colors, fonts } from "../src/theme/tokens";
import { Logo } from "../src/components/brand/Logo";
import { AmbientGlow, heroLights } from "../src/components/ui/AmbientGlow";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { Boton } from "../src/components/ui/Boton";
import { useFranjaNoche } from "../src/components/ui/FranjaSistema";
import { CURVA, DURACION, duracion, useReducirMovimiento } from "../src/lib/movimiento";

/**
 * Pantalla de entrada.
 *
 * Hace tres cosas antes de decidir qué mostrar: comprueba que se
 * alcance el servidor, mira si ya hay una sesión guardada y, si la hay,
 * lleva al usuario directo a donde le corresponde. Solo cuando no hay
 * sesión aparece la bienvenida.
 *
 * Eso evita que alguien que ya entró tenga que volver a escribir su
 * contraseña cada vez que abre la app.
 */
export default function Bienvenida() {
  const [fase, setFase] = useState("revisando");
  // Quien vuelve con la sesión guardada y ya está bloqueado también
  // merece saber por qué, en vez de aparecer en la bienvenida sin
  // explicación y creer que se le borró la cuenta.
  const [bloqueo, setBloqueo] = useState(null);
  const router = useRouter();
  // "quedarse": vino de cerrar sesión o del botón volver del ingreso.
  // Ahí se muestra la bienvenida en vez de mandar otra vez al ingreso.
  const { quedarse } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  // Cargando o sin conexión, la pantalla es azul noche entera.
  useFranjaNoche(fase !== "bienvenida");

  // Entrada del contenido. Se anima una sola vez, cuando se decide
  // mostrar la bienvenida.
  const entrada = useRef(new Animated.Value(0)).current;

  // Sin sesión (o vencida) y con la huella activa: directo al ingreso,
  // que la pide sola. Quien entra con su dedo no necesita la bienvenida.
  const sinSesion = useCallback(async () => {
    if (!quedarse) {
      const [estado, c] = await Promise.all([estadoBiometria(), capacidad()]);
      if (estado && c.disponible) {
        router.replace("/login");
        return;
      }
    }
    setFase("bienvenida");
  }, [quedarse, router]);

  const arrancar = useCallback(async () => {
    setFase("revisando");

    if (!(await hayConexion())) {
      setFase("sin_conexion");
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        await sinSesion();
        return;
      }

      // Con sesión, el app abre bloqueada: BloqueoApp pide la huella o
      // la contraseña encima de la pantalla a la que se entra aquí.
      const { data: usuario } = await supabase
        .from("users")
        .select("rol, estado")
        .eq("id", session.user.id)
        .maybeSingle();

      // Una sesión de staff no sirve en la app: el panel es aparte.
      if (!usuario || usuario.rol !== "cliente") {
        await cerrarSesion();
        setFase("bienvenida");
        return;
      }
      if (usuario.estado === "bloqueado") {
        // El motivo se lee con la sesión todavía abierta: después RLS
        // ya no deja ver el perfil.
        const motivo = await motivoDelBloqueo(session.user.id);
        await cerrarSesion();
        setBloqueo({ motivo });
        setFase("bienvenida");
        return;
      }

      entrarA(
        router,
        usuario.estado === "activo" ? "/(tabs)/inicio" : "/en-revision",
      );
    } catch {
      // Si algo falla al leer la sesión, se muestra la bienvenida en
      // lugar de dejar la pantalla colgada.
      setFase("bienvenida");
    }
  }, [router, sinSesion]);

  useEffect(() => {
    arrancar();
  }, [arrancar]);

  useEffect(() => {
    if (fase !== "bienvenida") return;

    Animated.timing(entrada, {
      toValue: 1,
      duration: duracion(DURACION.screen, reducir),
      easing: CURVA,
      useNativeDriver: true,
    }).start();
  }, [fase, entrada, reducir]);

  const sube = entrada.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });

  // Mientras se comprueba la sesión, o sin conexión: pantalla azul noche
  // entera con el logo, como el splash, para que no haya un salto.
  if (fase !== "bienvenida") {
    return (
      <View style={s.pantallaNoche}>
        <StatusBar barStyle="light-content" backgroundColor={colors.night} />
        <AmbientGlow lights={heroLights} />
        <CuentaBloqueada
          visible={bloqueo !== null}
          motivo={bloqueo?.motivo}
          onCerrar={() => setBloqueo(null)}
        />
        {fase === "revisando" ? (
          <View style={s.centro}>
            <Logo width={140} />
            <ActivityIndicator size="small" color={colors.gold} style={{ marginTop: 28 }} />
          </View>
        ) : (
          <View style={s.centro}>
            <View style={s.iconoAviso}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.gold} />
            </View>
            <Text style={s.tituloAviso}>Sin conexión</Text>
            <Text style={s.textoAviso}>Revisa tu internet e inténtalo de nuevo.</Text>
            <Boton
              variante="claro"
              titulo="Reintentar"
              iconoIzq="refresh"
              onPress={arrancar}
              style={{ marginTop: 22, alignSelf: "stretch" }}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={s.pantalla}>
      <StatusBar barStyle="light-content" backgroundColor={colors.night} />
      <CuentaBloqueada
        visible={bloqueo !== null}
        motivo={bloqueo?.motivo}
        onCerrar={() => setBloqueo(null)}
      />

      {/* Cabecera de marca: ~70% del alto, esquinas inferiores de 40. */}
      <View style={[s.portada, { paddingTop: insets.top }]}>
        <AmbientGlow
          lights={[
            { color: colors.glowGold, opacity: 0.35, size: 320, top: -90, right: -120 },
            { color: colors.glowBlue, opacity: 0.8, size: 360, bottom: -180, left: -150 },
          ]}
        />
        <Animated.View
          style={[s.marca, { opacity: entrada, transform: [{ translateY: sube }] }]}
        >
          <Logo width={200} />
          <Text style={s.peruWk}>PERÚ WK</Text>
          <Text style={s.lema}>
            Tu aliado{"\n"}
            <Text style={{ color: "#F4DC8A" }}>financiero.</Text>
          </Text>
        </Animated.View>

        <GlassPanel variant="onNight" radius={999} style={s.pastilla}>
          <View style={s.pastillaItem}>
            <Ionicons name="person-outline" size={14} color={colors.white} />
            <Text style={s.pastillaTexto}>Revisión humana</Text>
          </View>
          <View style={s.pastillaSeparador} />
          <View style={s.pastillaItem}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.white} />
            <Text style={s.pastillaTexto}>Datos cifrados</Text>
          </View>
        </GlassPanel>
      </View>

      <Animated.View
        style={[
          s.acciones,
          { paddingBottom: insets.bottom + 34, opacity: entrada },
        ]}
      >
        <Boton
          variante="dinero"
          titulo="Crear cuenta"
          onPress={() => router.push("/registro")}
          style={{ height: 58 }}
        />
        <Boton
          variante="contorno"
          titulo="Ingresar"
          onPress={() => router.push("/login")}
          style={{ height: 58 }}
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  pantallaNoche: {
    flex: 1,
    backgroundColor: colors.night,
    overflow: "hidden",
    paddingHorizontal: 28,
  },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconoAviso: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  tituloAviso: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.white,
    marginTop: 18,
  },
  textoAviso: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginTop: 6,
  },

  portada: {
    height: "70%",
    backgroundColor: colors.night,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  marca: { alignItems: "center", gap: 18 },
  peruWk: {
    fontFamily: fonts.heavy,
    fontSize: 11,
    letterSpacing: 3.5,
    color: "rgba(255,255,255,0.7)",
  },
  lema: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: colors.white,
    textAlign: "center",
    marginTop: 6,
  },
  pastilla: {
    position: "absolute",
    bottom: 28,
    height: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  pastillaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  pastillaTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.white },
  pastillaSeparador: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.3)" },

  acciones: {
    flex: 1,
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 24,
  },
});
