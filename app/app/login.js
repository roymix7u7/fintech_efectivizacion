import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  AppState,
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
import { useReducirMovimiento } from "../src/lib/movimiento";
import {
  marcarInicioSesion,
  entrarA,
  motivoDelBloqueo,
} from "../src/lib/sesion";
import {
  capacidad,
  estadoBiometria,
  leerAcceso,
  activarBiometria,
  desactivarBiometria,
  convieneOfrecer,
  recordarRechazo,
  mensajeBiometria,
  esClaveIncorrecta,
  correoOculto,
} from "../src/lib/biometria";
import CuentaBloqueada from "../src/components/CuentaBloqueada";
import OfertaBiometria, { ocultarDuranteLector } from "../src/components/OfertaBiometria";
import { ScrollConTeclado } from "../src/components/ui/ScrollConTeclado";

const LUCES = [
  { color: colors.glowGold, opacity: 0.36, size: 280, top: 40, right: -120 },
  { color: colors.glowBlue, opacity: 0.75, size: 320, bottom: -170, left: -120 },
];

/**
 * Ingreso. Misma estructura que el registro y recuperar acceso: la
 * cabecera azul noche con el logo y, montada sobre su borde, la tarjeta
 * de cristal con los campos.
 *
 * Con la huella (o el rostro) activa en este teléfono, la tarjeta
 * muestra primero el botón grande para entrar con ella, y la pide sola
 * al abrir la pantalla. La contraseña sigue a un toque, por si el lector
 * falla o entra otra persona.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // El bloqueo se muestra en ventana y no como aviso flotante: el
  // motivo hay que poder leerlo con calma.
  const [bloqueo, setBloqueo] = useState(null);
  // Biometría: lo guardado en este teléfono y lo que el teléfono ofrece.
  const [bio, setBio] = useState(null);
  const [cap, setCap] = useState(null);
  // "bio": botón de la huella; "clave": correo y contraseña.
  const [modo, setModo] = useState("clave");
  // Tras ingresar con la contraseña: ¿activar la huella? Guarda a dónde
  // ir cuando el cliente responda.
  const [oferta, setOferta] = useState(null);
  const [ocultaOferta, setOcultaOferta] = useState(false);
  // "Siguiente" en el teclado del correo salta directo a la contraseña.
  const refClave = useRef(null);
  const autoPedida = useRef(false);
  const ocupado = useRef(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();

  // ¿Hay huella activa y el teléfono todavía la ofrece?
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [estado, c] = await Promise.all([estadoBiometria(), capacidad()]);
      if (!vivo) return;
      setCap(c);
      if (estado && c.disponible) {
        setBio(estado);
        setEmail(estado.email);
        setModo("bio");
      } else if (estado && (c.motivo === "sin_inscribir" || c.motivo === "debil")) {
        // Quitó sus huellas: lo guardado ya no se puede leer.
        await desactivarBiometria();
        if (vivo) {
          setEmail(estado.email);
          mostrar(mensajeBiometria("invalidada", c.nombre), "atencion", 6000);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [mostrar]);

  // La pide sola una vez al abrir, como las apps de banco. Se espera a
  // que la pantalla esté dibujada y el app al frente: pedirla en medio
  // de la animación de entrada se ve como un error.
  useEffect(() => {
    if (modo !== "bio" || !bio || autoPedida.current) return;
    autoPedida.current = true;
    const t = setTimeout(() => {
      if (AppState.currentState === "active") entrarConBiometria();
    }, 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, bio]);

  /**
   * Lo que sigue a un ingreso correcto, venga de la contraseña o de la
   * huella. Devuelve a dónde entrar, o null si el ingreso se detuvo
   * (bloqueado, sin permiso, etc.; ya se le explicó al cliente).
   */
  async function despuesDeIngresar(user) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("rol, estado")
      .eq("id", user.id)
      .maybeSingle();

    if (userError) {
      await supabase.auth.signOut();
      mostrar(mensajeError(userError), "error");
      return null;
    }

    // Cuentas viejas que quedaron sin fila en users porque el registro
    // se interrumpio. Se repara aqui en vez de dejar al usuario fuera.
    if (!userData) {
      const { error: repararError } = await supabase.from("users").insert({
        id: user.id,
        email: user.email,
        rol: "cliente",
        estado: "pendiente",
      });
      if (repararError) {
        await supabase.auth.signOut();
        mostrar("Tu registro quedó incompleto. Escríbenos para activarlo.", "error");
        return null;
      }
      await marcarInicioSesion();
      return "/en-revision";
    }

    if (userData.rol !== "cliente") {
      await supabase.auth.signOut();
      mostrar("Esta app es solo para clientes", "atencion");
      return null;
    }

    if (userData.estado === "bloqueado") {
      // El motivo se lee antes de cerrar la sesión: sin ella, RLS ya
      // no deja ver el perfil y solo quedaría el mensaje genérico.
      const motivo = await motivoDelBloqueo(user.id);
      await supabase.auth.signOut();
      setBloqueo({ motivo });
      return null;
    }

    // Desde aquí empiezan a contar las dos horas de sesión.
    await marcarInicioSesion();

    // pendiente y observado comparten pantalla: en-revision muestra el
    // motivo y deja volver a subir los documentos.
    return userData.estado === "activo" ? "/(tabs)/inicio" : "/en-revision";
  }

  /** Para saludar por el nombre la próxima vez. Si falla, no importa. */
  async function nombreDe(userId) {
    try {
      const { data } = await supabase.from("perfiles_cliente").select("nombres").eq("user_id", userId).maybeSingle();
      return (data?.nombres || "").trim().split(/\s+/)[0] || null;
    } catch {
      return null;
    }
  }

  // entrarA borra el historial: sin eso, el botón atrás del teléfono
  // devolvía a la pantalla de bienvenida y parecía que la sesión se
  // hubiera perdido.
  const entrar = (destino) => entrarA(router, destino);

  async function handleLogin() {
    if (ocupado.current) return;
    const errorEmail = validarEmail(email);
    if (errorEmail) return mostrar(errorEmail, "atencion");
    if (!password) return mostrar("Ingresa tu contraseña", "atencion");

    ocupado.current = true;
    setLoading(true);
    try {
      // Sin esto, un telefono sin internet recibe "correo o contrasena
      // incorrectos", que manda a la persona a dudar de sus datos.
      if (!(await hayConexion())) {
        return mostrar("Sin conexión con el servidor. Revisa tu internet.", "error");
      }

      const correo = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
      if (error) return mostrar(mensajeError(error), "error");

      const destino = await despuesDeIngresar(data.user);
      if (!destino) return;

      // ¿Le ofrecemos la huella? Solo si el teléfono la tiene, no está
      // ya activa para este correo y no dijo "Ahora no" antes.
      const c = await convieneOfrecer(correo);
      if (c) {
        const previa = await estadoBiometria();
        setOferta({
          cap: c,
          email: correo,
          clave: password,
          destino,
          userId: data.user.id,
          reemplaza: previa && previa.email !== correo ? correoOculto(previa.email) : null,
        });
        return;
      }
      entrar(destino);
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      ocupado.current = false;
      setLoading(false);
    }
  }

  async function entrarConBiometria() {
    if (ocupado.current) return;
    ocupado.current = true;
    setLoading(true);
    try {
      // Primero la conexión: pedir la huella para luego decir "sin
      // internet" hace sentir que la huella no sirvió.
      if (!(await hayConexion())) {
        return mostrar("Sin conexión con el servidor. Revisa tu internet.", "error");
      }

      const acceso = await leerAcceso();
      if (!acceso.ok) {
        if (acceso.motivo === "invalidada" || acceso.motivo === "inactiva") {
          setBio(null);
          setModo("clave");
        }
        const texto = mensajeBiometria(acceso.motivo, cap?.nombre);
        if (texto) mostrar(texto, "atencion", 6000);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: acceso.email,
        password: acceso.clave,
      });
      if (error) {
        if (esClaveIncorrecta(error)) {
          // Cambió la contraseña (desde la web o recuperando el acceso):
          // lo guardado ya no sirve.
          await desactivarBiometria();
          setBio(null);
          setModo("clave");
          setEmail(acceso.email);
          setPassword("");
          mostrar(mensajeBiometria("clave_cambio", cap?.nombre), "atencion", 6000);
          setTimeout(() => refClave.current?.focus(), 300);
          return;
        }
        return mostrar(mensajeError(error), "error");
      }

      const destino = await despuesDeIngresar(data.user);
      if (destino) entrar(destino);
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      ocupado.current = false;
      setLoading(false);
    }
  }

  // Respuesta a la oferta. Devuelve el texto del error para la ventana,
  // o null (salió bien, o canceló el lector y puede volver a intentar).
  async function aceptarOferta() {
    const o = oferta;
    const nombre = await nombreDe(o.userId);
    if (ocultarDuranteLector) setOcultaOferta(true);
    const r = await activarBiometria({ email: o.email, clave: o.clave, nombre });
    setOcultaOferta(false);
    if (!r.ok) return r.motivo === "cancelado" ? null : mensajeBiometria(r.motivo, o.cap.nombre);
    setOferta(null);
    mostrar(
      o.cap.tipo === "rostro" ? "Listo. La próxima vez entra con tu rostro." : "Listo. La próxima vez entra con tu huella.",
      "exito",
      4000,
    );
    entrar(o.destino);
    return null;
  }

  async function rechazarOferta() {
    const o = oferta;
    setOferta(null);
    await recordarRechazo(o.email);
    entrar(o.destino);
  }

  const nombreBio = cap?.nombre || "tu huella";
  const esRostro = cap?.tipo === "rostro";
  const titulo = modo === "bio" && bio?.nombre ? `Hola de nuevo, ${bio.nombre}.` : "Hola de nuevo.";
  const subtitulo =
    modo === "bio"
      ? esRostro
        ? "Mira la pantalla para entrar."
        : "Pon tu dedo para entrar."
      : "Ingresa con tu correo y tu contraseña.";

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
      <OfertaBiometria
        visible={oferta !== null}
        oculta={ocultaOferta}
        modo="ofrecer"
        cap={oferta?.cap}
        reemplaza={oferta?.reemplaza}
        onActivar={aceptarOferta}
        onCerrar={rechazarOferta}
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
                vivir aquí: sin él no habría forma de regresar al inicio.
                "quedarse" evita que la bienvenida vuelva a mandar aquí. */}
            <BotonIcono
              variante="noche"
              icono="chevron-back"
              accessibilityLabel="Volver"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/?quedarse=1"))}
            />
            <Logo width={56} />
            <View style={{ width: 44 }} />
          </View>
          <Aparece>
            <View style={{ gap: 6 }}>
              <Text style={s.titulo} accessibilityRole="header">
                {titulo}
              </Text>
              <Text style={s.subtitulo}>{subtitulo}</Text>
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <Aparece retraso={60}>
            {modo === "bio" ? (
              <GlassPanel variant="light" radius={26} style={[s.tarjeta, s.tarjetaBio]}>
                <BotonBiometria icono={cap?.icono} cargando={loading} onPress={entrarConBiometria} etiqueta={`Entrar con ${nombreBio}`} />
                <Text style={s.cuenta} accessibilityLabel={`Cuenta ${bio?.email}`}>
                  {correoOculto(bio?.email)}
                </Text>

                <Boton
                  titulo={loading ? "Ingresando..." : `Entrar con ${nombreBio}`}
                  iconoIzq={loading ? undefined : cap?.icono}
                  onPress={entrarConBiometria}
                  cargando={loading}
                  style={{ alignSelf: "stretch", height: 58 }}
                />

                <Toque
                  onPress={() => {
                    setModo("clave");
                    setTimeout(() => refClave.current?.focus(), 250);
                  }}
                  disabled={loading}
                  accessibilityLabel="Ingresar con mi contraseña"
                  style={s.alterno}
                >
                  <Ionicons name="keypad-outline" size={18} color={colors.navy} />
                  <Text style={s.alternoTexto}>Ingresar con mi contraseña</Text>
                </Toque>
              </GlassPanel>
            ) : (
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

                {/* Volver a la huella si está activa (por ejemplo, tocó
                    "contraseña" sin querer). */}
                {bio && cap?.disponible ? (
                  <Toque
                    onPress={() => {
                      setModo("bio");
                      setEmail(bio.email);
                    }}
                    disabled={loading}
                    accessibilityLabel={`Entrar con ${nombreBio}`}
                    style={s.alterno}
                  >
                    <Ionicons name={cap.icono} size={18} color={colors.navy} />
                    <Text style={s.alternoTexto}>Entrar con {nombreBio}</Text>
                  </Toque>
                ) : null}
              </GlassPanel>
            )}
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

/**
 * El círculo grande de la huella, con un anillo que late suave para
 * decir "tócame". Con menos movimiento pedido, queda quieto.
 */
function BotonBiometria({ icono = "finger-print", cargando, onPress, etiqueta }) {
  const reducir = useReducirMovimiento();
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducir || cargando) {
      pulso.setValue(0);
      return;
    }
    const ciclo = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [reducir, cargando, pulso]);

  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacidad = pulso.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.45, 0.12, 0] });

  return (
    <Toque onPress={onPress} disabled={cargando} accessibilityLabel={etiqueta} escala={0.94} style={s.bioToque}>
      <View style={s.bioCaja}>
        <Animated.View style={[s.bioAnillo, { opacity: opacidad, transform: [{ scale: escala }] }]} />
        <View style={s.bioCirculo}>
          <Ionicons name={icono} size={52} color={colors.navy} />
        </View>
      </View>
    </Toque>
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
  tarjetaBio: { alignItems: "center", paddingTop: 26 },
  bioToque: { alignSelf: "center" },
  bioCaja: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  bioAnillo: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.gold,
  },
  bioCirculo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.goldCream,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  cuenta: { fontFamily: fonts.strong, fontSize: 14, color: colors.text2, marginTop: -4 },
  alterno: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    alignSelf: "center",
    paddingHorizontal: 12,
  },
  alternoTexto: { fontFamily: fonts.heavy, fontSize: 15, color: colors.navy },
  olvido: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center", marginTop: -4 },
  enlaceGris: { fontFamily: fonts.strong, fontSize: 13, color: colors.navy },
  seguro: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  seguroTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.text2 },
  crear: { alignSelf: "center", minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  enlaceTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  enlaceOro: { fontFamily: fonts.heavy, color: colors.goldText },
});
