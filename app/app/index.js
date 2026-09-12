import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Easing,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { hayConexion } from "../src/lib/conexion";
import COLORS from "../src/theme/colors";
import TIPO from "../src/theme/tipografia";

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
  const router = useRouter();

  // Entrada del contenido. Se anima una sola vez, cuando se decide
  // mostrar la bienvenida.
  const entrada = useRef(new Animated.Value(0)).current;
  const flote = useRef(new Animated.Value(0)).current;

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
        setFase("bienvenida");
        return;
      }

      const { data: usuario } = await supabase
        .from("users")
        .select("rol, estado")
        .eq("id", session.user.id)
        .maybeSingle();

      // Una sesión de staff no sirve en la app: el panel es aparte.
      if (!usuario || usuario.rol !== "cliente") {
        await supabase.auth.signOut();
        setFase("bienvenida");
        return;
      }
      if (usuario.estado === "bloqueado") {
        await supabase.auth.signOut();
        setFase("bienvenida");
        return;
      }

      router.replace(
        usuario.estado === "activo" ? "/(tabs)/inicio" : "/en-revision",
      );
    } catch {
      // Si algo falla al leer la sesión, se muestra la bienvenida en
      // lugar de dejar la pantalla colgada.
      setFase("bienvenida");
    }
  }, [router]);

  useEffect(() => {
    arrancar();
  }, [arrancar]);

  useEffect(() => {
    if (fase !== "bienvenida") return;

    Animated.timing(entrada, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // El logo respira muy despacio. Es casi imperceptible, y es lo que
    // separa una pantalla viva de una captura de pantalla.
    Animated.loop(
      Animated.sequence([
        Animated.timing(flote, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(flote, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fase, entrada, flote]);

  const sube = entrada.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const flota = flote.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });

  return (
    <View style={s.pantalla}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Halos de fondo. Dos círculos muy tenues dan profundidad sin
          necesitar una librería de degradados. */}
      <View pointerEvents="none" style={[s.halo, s.haloOro]} />
      <View pointerEvents="none" style={[s.halo, s.haloAzul]} />

      {fase === "revisando" ? (
        <View style={s.centro}>
          <Image
            source={require("../assets/LOGOATK.png")}
            style={s.logoChico}
            resizeMode="contain"
          />
          <ActivityIndicator
            size="small"
            color={COLORS.secondary}
            style={{ marginTop: 22 }}
          />
          <Text style={s.cargando}>Conectando...</Text>
        </View>
      ) : fase === "sin_conexion" ? (
        <View style={s.centro}>
          <View style={s.iconoAviso}>
            <Ionicons name="cloud-offline-outline" size={34} color={COLORS.secondary} />
          </View>
          <Text style={s.tituloAviso}>Sin conexión</Text>
          <Text style={s.textoAviso}>
            No pudimos comunicarnos con el servidor. Revisa tu internet e
            inténtalo de nuevo.
          </Text>
          <TouchableOpacity
            style={s.btnReintentar}
            onPress={arrancar}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color={COLORS.primaryDark} />
            <Text style={s.btnReintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            s.contenido,
            { opacity: entrada, transform: [{ translateY: sube }] },
          ]}
        >
          {/* Marca */}
          <View style={s.marca}>
            <Animated.View
              style={[s.logoPlaca, { transform: [{ translateY: flota }] }]}
            >
              <Image
                source={require("../assets/LOGOATK.png")}
                style={s.logo}
                resizeMode="contain"
              />
            </Animated.View>

            <Text style={s.nombre}>ALTOQUE PERÚ</Text>
            <View style={s.linea} />
            <Text style={s.lema}>Efectivización de tarjetas de crédito</Text>
          </View>

          {/* Lo que ofrece, en tres líneas */}
          <View style={s.puntos}>
            {[
              { icono: "flash-outline", texto: "Envía tu comprobante en un minuto" },
              { icono: "shield-checkmark-outline", texto: "Tus documentos viajan cifrados" },
              { icono: "notifications-outline", texto: "Te avisamos apenas se resuelva" },
            ].map((p) => (
              <View key={p.texto} style={s.punto}>
                <View style={s.puntoIcono}>
                  <Ionicons name={p.icono} size={15} color={COLORS.secondary} />
                </View>
                <Text style={s.puntoTexto}>{p.texto}</Text>
              </View>
            ))}
          </View>

          {/* Acciones */}
          <View style={s.acciones}>
            <TouchableOpacity
              style={s.btnPrimario}
              onPress={() => router.push("/login")}
              activeOpacity={0.85}
            >
              <Text style={s.btnPrimarioTexto}>Iniciar sesión</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnSecundario}
              onPress={() => router.push("/registro")}
              activeOpacity={0.7}
            >
              <Text style={s.btnSecundarioTexto}>Crear cuenta nueva</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.enlace}
              onPress={() => router.push("/empresa")}
              activeOpacity={0.6}
            >
              <Text style={s.enlaceTexto}>Conoce la empresa</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    overflow: "hidden",
  },

  // Halos de fondo
  halo: {
    position: "absolute",
    borderRadius: 999,
  },
  haloOro: {
    width: 460,
    height: 460,
    top: -190,
    right: -170,
    backgroundColor: COLORS.secondary,
    opacity: 0.07,
  },
  haloAzul: {
    width: 420,
    height: 420,
    bottom: -170,
    left: -160,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.28,
  },

  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  logoChico: { width: 64, height: 64, opacity: 0.9 },
  cargando: {
    ...TIPO.apoyo,
    color: "rgba(255,255,255,0.55)",
    marginTop: 12,
  },

  // Sin conexión
  iconoAviso: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(232,184,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,184,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  tituloAviso: { ...TIPO.seccion, color: COLORS.white, fontSize: 20 },
  textoAviso: {
    ...TIPO.apoyo,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
  },
  btnReintentar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 26,
    marginTop: 26,
  },
  btnReintentarTexto: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "700",
  },

  // Bienvenida
  contenido: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: Platform.OS === "ios" ? 96 : 78,
    paddingBottom: 40,
  },

  marca: { alignItems: "center" },
  logoPlaca: {
    width: 108,
    height: 108,
    borderRadius: 32,
    // Placa translúcida: deja ver el halo de atrás y despega el logo
    // del fondo sin recortarlo con un borde duro.
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 68, height: 68 },
  nombre: {
    fontSize: 25,
    fontWeight: "800",
    color: COLORS.secondary,
    letterSpacing: 3.2,
    marginTop: 24,
  },
  linea: {
    width: 40,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(232,184,0,0.4)",
    marginTop: 14,
  },
  lema: {
    ...TIPO.apoyo,
    color: "rgba(255,255,255,0.62)",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 21,
  },

  puntos: { gap: 14, paddingHorizontal: 4 },
  punto: { flexDirection: "row", alignItems: "center", gap: 13 },
  puntoIcono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  puntoTexto: {
    ...TIPO.cuerpo,
    color: "rgba(255,255,255,0.78)",
    flex: 1,
  },

  acciones: { gap: 11 },
  btnPrimario: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 17,
  },
  btnPrimarioTexto: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  btnSecundario: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnSecundarioTexto: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "600",
  },
  enlace: { alignItems: "center", paddingVertical: 12 },
  enlaceTexto: {
    ...TIPO.apoyo,
    color: "rgba(255,255,255,0.45)",
  },
});
