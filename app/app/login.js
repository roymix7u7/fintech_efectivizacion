import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { colors, fonts } from "../src/theme/tokens";
import { Logo } from "../src/components/brand/Logo";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { BotonIcono } from "../src/components/ui/Piezas";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { Aparece } from "../src/components/Cargando";
import { Campo } from "../src/components/ui/Campos";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { validarEmail } from "../src/lib/validaciones";
import { hayConexion } from "../src/lib/conexion";
import {
  marcarInicioSesion,
  entrarA,
  motivoDelBloqueo,
} from "../src/lib/sesion";
import CuentaBloqueada from "../src/components/CuentaBloqueada";
import { ScrollConTeclado } from "../src/components/ui/ScrollConTeclado";

const LUCES = [
  { color: colors.glowGold, opacity: 0.36, size: 280, top: 40, right: -120 },
  { color: colors.glowBlue, opacity: 0.75, size: 320, bottom: -170, left: -120 },
];

/**
 * Ingreso. Misma estructura que el registro y recuperar acceso: la
 * cabecera azul noche con el logo y, montada sobre su borde, la tarjeta
 * de cristal con los campos.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // El bloqueo se muestra en ventana y no como aviso flotante: el
  // motivo hay que poder leerlo con calma.
  const [bloqueo, setBloqueo] = useState(null);
  // "Siguiente" en el teclado del correo salta directo a la contraseña.
  const refClave = useRef(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();

  async function handleLogin() {
    const errorEmail = validarEmail(email);
    if (errorEmail) return mostrar(errorEmail, "atencion");
    if (!password) return mostrar("Ingresa tu contraseña", "atencion");

    setLoading(true);
    try {
      // Sin esto, un telefono sin internet recibe "correo o contrasena
      // incorrectos", que manda a la persona a dudar de sus datos.
      if (!(await hayConexion())) {
        return mostrar(
          "Sin conexión con el servidor. Revisa tu internet.",
          "error",
        );
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return mostrar(mensajeError(error), "error");

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("rol, estado")
        .eq("id", data.user.id)
        .maybeSingle();

      if (userError) {
        await supabase.auth.signOut();
        return mostrar(mensajeError(userError), "error");
      }

      // Cuentas viejas que quedaron sin fila en users porque el registro
      // se interrumpio. Se repara aqui en vez de dejar al usuario fuera.
      if (!userData) {
        const { error: repararError } = await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          rol: "cliente",
          estado: "pendiente",
        });
        if (repararError) {
          await supabase.auth.signOut();
          return mostrar(
            "Tu registro quedó incompleto. Escríbenos para activarlo.",
            "error",
          );
        }
        await marcarInicioSesion();
        return entrarA(router, "/en-revision");
      }

      if (userData.rol !== "cliente") {
        await supabase.auth.signOut();
        return mostrar("Esta app es solo para clientes", "atencion");
      }

      if (userData.estado === "bloqueado") {
        // El motivo se lee antes de cerrar la sesión: sin ella, RLS ya
        // no deja ver el perfil y solo quedaría el mensaje genérico.
        const motivo = await motivoDelBloqueo(data.user.id);
        await supabase.auth.signOut();
        setBloqueo({ motivo });
        return;
      }

      // Desde aquí empiezan a contar las dos horas de sesión.
      await marcarInicioSesion();

      // entrarA borra el historial: sin eso, el botón atrás del teléfono
      // devolvía a la pantalla de bienvenida y parecía que la sesión se
      // hubiera perdido.
      //
      // pendiente y observado comparten pantalla: en-revision muestra el
      // motivo y deja volver a subir los documentos.
      entrarA(router, userData.estado === "activo" ? "/(tabs)/inicio" : "/en-revision");
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CuentaBloqueada
        visible={bloqueo !== null}
        motivo={bloqueo?.motivo}
        onCerrar={() => setBloqueo(null)}
      />

      <StatusBar style="light" />
      <ScrollConTeclado
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={s.arriba}>
            {/* Al ocultar la cabecera nativa, el botón de volver tiene que
                vivir aquí: sin él no habría forma de regresar al inicio. */}
            <BotonIcono
              variante="noche"
              icono="chevron-back"
              accessibilityLabel="Volver"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            />
            <Logo width={56} />
            <View style={{ width: 44 }} />
          </View>
          <Aparece>
            <View style={{ gap: 6 }}>
              <Text style={s.titulo} accessibilityRole="header">
                Hola de nuevo.
              </Text>
              <Text style={s.subtitulo}>Ingresa con tu correo y tu contraseña.</Text>
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <Aparece retraso={60}>
            <GlassPanel variant="light" radius={26} style={s.tarjeta}>
              {/* El foco lo maneja cada Campo por dentro: así enfocar uno no
                  vuelve a dibujar la pantalla entera mientras el teclado
                  cambia de un campo al otro. */}
              <Campo
                etiqueta="Correo"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => refClave.current?.focus()}
                placeholder="tucorreo@ejemplo.com"
              />

              <Campo
                ref={refClave}
                etiqueta="Contraseña"
                value={password}
                onChangeText={setPassword}
                secreto
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                placeholder="••••••••"
              />

              <Toque
                onPress={() => router.push("/recuperar")}
                hitSlop={8}
                style={s.olvido}
                accessibilityLabel="Olvidé mi contraseña"
              >
                <Text style={s.enlaceGris}>¿Olvidaste tu contraseña?</Text>
              </Toque>

              <Boton
                titulo={loading ? "Ingresando..." : "Ingresar"}
                icono={loading ? undefined : "arrow-forward"}
                onPress={handleLogin}
                cargando={loading}
                style={{ height: 58 }}
              />
            </GlassPanel>
          </Aparece>

          <View style={s.seguro}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.goldText} />
            <Text style={s.seguroTexto}>Tu sesión se cierra sola a las 2 horas</Text>
          </View>

          <View style={{ flex: 1, minHeight: 24 }} />

          <Toque
            onPress={() => router.push("/registro")}
            accessibilityLabel="Crear cuenta"
            style={s.crear}
          >
            <Text style={s.enlaceTexto}>
              ¿No tienes cuenta? <Text style={s.enlaceOro}>Crea una</Text>
            </Text>
          </Toque>
        </View>
      </ScrollConTeclado>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 92, gap: 22 },
  arriba: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titulo: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.7, color: colors.white },
  subtitulo: { fontFamily: fonts.body, fontSize: 15, color: "rgba(255,255,255,0.75)" },
  cuerpo: { flexGrow: 1, marginTop: -64, paddingHorizontal: 16, gap: 14 },
  tarjeta: { padding: 18, paddingHorizontal: 16, gap: 14 },
  olvido: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center", marginTop: -4 },
  enlaceGris: { fontFamily: fonts.strong, fontSize: 13, color: colors.navy },
  seguro: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  seguroTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.text2 },
  crear: { alignSelf: "center", minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  enlaceTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  enlaceOro: { fontFamily: fonts.heavy, color: colors.goldText },
});
