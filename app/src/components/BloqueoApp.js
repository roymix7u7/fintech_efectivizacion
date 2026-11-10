import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  AppState,
  BackHandler,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { invalidar } from "../lib/cache";
import { cerrarSesion } from "../lib/sesion";
import { hayConexion } from "../lib/conexion";
import { mensajeError, confirmar } from "../lib/ui";
import {
  BLOQUEO_MS,
  bloquear,
  desbloquear,
  sinUsoHace,
  useBloqueada,
} from "../lib/bloqueo";
import {
  capacidad,
  estadoBiometria,
  leerAcceso,
  activarBiometria,
  verificarClave,
  esClaveIncorrecta,
  convieneOfrecer,
  recordarRechazo,
  mensajeBiometria,
  correoOculto,
} from "../lib/biometria";
import { colors, fonts } from "../theme/tokens";
import { Logo } from "./brand/Logo";
import { Boton } from "./ui/Boton";
import { Toque } from "./ui/Toque";
import { Campo } from "./ui/Campos";
import { CabeceraNoche } from "./ui/CabeceraNoche";
import { GlassPanel } from "./ui/GlassPanel";
import { ScrollConTeclado } from "./ui/ScrollConTeclado";
import { useAviso } from "./Avisos";
import BotonBiometria from "./BotonBiometria";
import OfertaBiometria, { ocultarDuranteLector } from "./OfertaBiometria";

// Pantallas donde no hay nada que proteger: todavía no se entra a la cuenta.
const PUBLICAS = ["/", "/login", "/registro", "/recuperar"];
// Contraseñas equivocadas seguidas antes de cerrar la sesión de verdad.
const MAX_INTENTOS = 5;
// Cada cuánto se mira si pasó el plazo con el app al frente.
const CADA = 15 * 1000;

const LUCES = [
  { color: colors.glowGold, opacity: 0.36, size: 280, top: 40, right: -120 },
  {
    color: colors.glowBlue,
    opacity: 0.75,
    size: 320,
    bottom: -170,
    left: -120,
  },
];

/**
 * Vigila el bloqueo del app y dibuja la pantalla para desbloquearla.
 *
 * Vive en el layout raíz. La pantalla de bloqueo es una ventana encima
 * de todo: lo de abajo no se toca, así que al desbloquear el cliente
 * sigue exactamente donde estaba (la solicitud a medio llenar, la foto
 * del comprobante ya elegida).
 */
export default function BloqueoApp() {
  const pathname = usePathname();
  const bloqueada = useBloqueada();
  const [usuario, setUsuario] = useState(null); // { id, email }
  // Tras desbloquear con la contraseña: ¿activar la huella?
  const [oferta, setOferta] = useState(null);
  const [ocultaOferta, setOcultaOferta] = useState(false);
  const { mostrar } = useAviso();
  const rutaRef = useRef(pathname);
  rutaRef.current = pathname;

  // ¿Hay sesión? Solo se guarda id y correo: cada renovación del token
  // trae un objeto nuevo y no tiene por qué volver a dibujar nada.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      const u = sesion?.user;
      setUsuario((antes) =>
        u
          ? antes?.id === u.id
            ? antes
            : { id: u.id, email: (u.email || "").toLowerCase() }
          : null,
      );
    });
    return () => subscription.unsubscribe();
  }, []);

  // 10 minutos sin tocar el app: se bloquea. Se mira cada 15 segundos
  // con el app al frente y al volver del segundo plano (los relojes no
  // corren mientras el teléfono la tiene dormida).
  useEffect(() => {
    if (!usuario) return;
    const revisar = () => {
      if (PUBLICAS.includes(rutaRef.current)) return;
      if (sinUsoHace() >= BLOQUEO_MS) bloquear();
    };
    const reloj = setInterval(revisar, CADA);
    const sub = AppState.addEventListener(
      "change",
      (e) => e === "active" && revisar(),
    );
    return () => {
      clearInterval(reloj);
      sub.remove();
    };
  }, [usuario]);

  const visible = Boolean(usuario) && bloqueada && !PUBLICAS.includes(pathname);

  async function aceptarOferta() {
    const o = oferta;
    if (ocultarDuranteLector) setOcultaOferta(true);
    const r = await activarBiometria({
      email: o.email,
      clave: o.clave,
      nombre: o.nombre,
    });
    setOcultaOferta(false);
    if (!r.ok)
      return r.motivo === "cancelado"
        ? null
        : mensajeBiometria(r.motivo, o.cap.nombre);
    setOferta(null);
    mostrar(
      o.cap.tipo === "rostro"
        ? "Listo. La próxima vez entra con tu rostro."
        : "Listo. La próxima vez entra con tu huella.",
      "exito",
      4000,
    );
    return null;
  }

  return (
    <>
      <PantallaBloqueo
        visible={visible}
        usuario={usuario}
        onOfrecer={setOferta}
      />
      <OfertaBiometria
        visible={oferta !== null}
        oculta={ocultaOferta}
        modo="ofrecer"
        cap={oferta?.cap}
        onActivar={aceptarOferta}
        onCerrar={() => {
          recordarRechazo(oferta?.email);
          setOferta(null);
        }}
      />
    </>
  );
}

function PantallaBloqueo({ visible, usuario, onOfrecer }) {
  const [modo, setModo] = useState("clave");
  const [cap, setCap] = useState(null);
  const [nombre, setNombre] = useState(null);
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [senal, setSenal] = useState(0);
  const [cargando, setCargando] = useState(false);
  // Lo que pasó con la huella. Va dentro de la tarjeta: los avisos
  // flotantes del app quedan debajo de esta ventana y no se verían.
  const [nota, setNota] = useState(null);
  const fallidos = useRef(0);
  const ocupado = useRef(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();

  // Cada vez que se bloquea: empieza limpia, decide si hay huella y, si
  // la hay, la pide sola (como al abrir un app de banco).
  useEffect(() => {
    if (!visible || !usuario) return;
    let vivo = true;
    setClave("");
    setError(null);
    setNota(null);
    fallidos.current = 0;
    (async () => {
      const [estado, c] = await Promise.all([estadoBiometria(), capacidad()]);
      if (!vivo) return;
      // La huella tiene que ser de esta misma cuenta.
      const conBio = Boolean(
        estado && c.disponible && estado.email === usuario.email,
      );
      setCap(conBio ? c : null);
      setModo(conBio ? "bio" : "clave");
      setNombre(estado?.email === usuario.email ? estado.nombre : null);
      if (!(estado?.email === usuario.email && estado.nombre)) {
        supabase
          .from("perfiles_cliente")
          .select("nombres")
          .eq("user_id", usuario.id)
          .maybeSingle()
          .then(
            ({ data }) =>
              vivo &&
              setNombre((data?.nombres || "").trim().split(/\s+/)[0] || null),
          )
          .catch(() => {});
      }
      if (conBio) {
        setTimeout(() => {
          if (vivo && AppState.currentState === "active") conHuella(c);
        }, 450);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, usuario?.id]);

  // El botón atrás de Android no salta el bloqueo: deja el app en segundo plano.
  function alAtras() {
    if (Platform.OS === "android") BackHandler.exitApp();
  }

  function listo(conClave) {
    desbloquear();
    // Lo que cambió mientras estuvo bloqueada (una aprobación, un pago) se ve ya.
    invalidar();
    if (conClave) {
      convieneOfrecer(usuario.email).then((c) => {
        if (c)
          onOfrecer({ cap: c, email: usuario.email, clave: conClave, nombre });
      });
    }
  }

  async function conHuella(c = cap) {
    if (ocupado.current) return;
    ocupado.current = true;
    setCargando(true);
    setNota(null);
    try {
      const acceso = await leerAcceso();
      if (!acceso.ok) {
        if (acceso.motivo === "invalidada" || acceso.motivo === "inactiva") {
          setCap(null);
          setModo("clave");
        }
        setNota(mensajeBiometria(acceso.motivo, c?.nombre));
        return;
      }
      if (acceso.email !== usuario.email) {
        // La huella guardada es de otra cuenta: aquí no sirve.
        setCap(null);
        setModo("clave");
        return;
      }
      listo(null);
    } finally {
      ocupado.current = false;
      setCargando(false);
    }
  }

  async function conClave() {
    if (ocupado.current) return;
    if (!clave) {
      setError("Escribe tu contraseña.");
      setSenal((n) => n + 1);
      return;
    }
    ocupado.current = true;
    setCargando(true);
    setError(null);
    try {
      if (!(await hayConexion())) {
        setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
        return;
      }
      const r = await verificarClave(usuario.email, clave);
      if (!r.ok) {
        if (!esClaveIncorrecta(r.error)) {
          setError(mensajeError(r.error));
          return;
        }
        fallidos.current += 1;
        const quedan = MAX_INTENTOS - fallidos.current;
        if (quedan <= 0) {
          // Alguien está probando contraseñas: se cierra la sesión de verdad.
          await cerrarSesion();
          mostrar(
            "Por seguridad cerramos tu sesión. Ingresa de nuevo con tu correo y contraseña.",
            "atencion",
            6000,
          );
          router.replace("/login");
          return;
        }
        setError(
          quedan === 1
            ? "Contraseña incorrecta. Te queda 1 intento antes de cerrar tu sesión."
            : `Contraseña incorrecta. Te quedan ${quedan} intentos.`,
        );
        setSenal((n) => n + 1);
        return;
      }
      listo(clave);
    } finally {
      ocupado.current = false;
      setCargando(false);
    }
  }

  async function salir(destino) {
    const pregunta =
      destino === "/recuperar"
        ? "Para cambiar tu contraseña salimos de tu cuenta en este teléfono."
        : "Vas a salir de tu cuenta. Para volver tendrás que ingresar con tu correo y contraseña.";
    if (!(await confirmar(pregunta, "Salir de tu cuenta"))) return;
    await cerrarSesion();
    router.replace(destino);
  }

  const esRostro = cap?.tipo === "rostro";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={alAtras}
      statusBarTranslucent
    >
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={s.pantalla}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollConTeclado
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + 28,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CabeceraNoche luces={LUCES} style={s.cabecera}>
            <View style={s.arriba}>
              <Logo width={56} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.titulo} accessibilityRole="header">
                {nombre ? `Hola, ${nombre}.` : "Hola de nuevo."}
              </Text>
              <Text style={s.subtitulo}>
                {modo === "bio"
                  ? esRostro
                    ? "Por tu seguridad, mira la pantalla para seguir."
                    : "Por tu seguridad, pon tu dedo para seguir."
                  : "Por tu seguridad, escribe tu contraseña para seguir."}
              </Text>
            </View>
          </CabeceraNoche>

          <View style={s.cuerpo}>
            <GlassPanel
              variant="light"
              radius={26}
              style={[s.tarjeta, modo === "bio" && s.tarjetaBio]}
            >
              {nota ? (
                <View style={s.nota} accessibilityLiveRegion="polite">
                  <Ionicons
                    name="information-circle"
                    size={18}
                    color={colors.goldText}
                  />
                  <Text style={s.notaTexto}>{nota}</Text>
                </View>
              ) : null}
              {modo === "bio" ? (
                <>
                  <BotonBiometria
                    icono={cap?.icono}
                    cargando={cargando}
                    onPress={() => conHuella()}
                    etiqueta={`Desbloquear con ${cap?.nombre}`}
                  />
                  <Text style={s.cuenta}>{correoOculto(usuario?.email)}</Text>
                  <Boton
                    titulo={`Seguir con ${cap?.nombre}`}
                    iconoIzq={cap?.icono}
                    onPress={() => conHuella()}
                    cargando={cargando}
                    style={{ alignSelf: "stretch", height: 58 }}
                  />
                  <Toque
                    onPress={() => setModo("clave")}
                    disabled={cargando}
                    accessibilityLabel="Usar mi contraseña"
                    style={s.alterno}
                  >
                    <Ionicons
                      name="keypad-outline"
                      size={18}
                      color={colors.navy}
                    />
                    <Text style={s.alternoTexto}>Usar mi contraseña</Text>
                  </Toque>
                </>
              ) : (
                <>
                  <View style={s.fijo}>
                    <Ionicons
                      name="person-circle-outline"
                      size={22}
                      color={colors.navy}
                    />
                    <Text style={s.fijoTexto} numberOfLines={1}>
                      {usuario?.email}
                    </Text>
                  </View>
                  <Campo
                    etiqueta="Contraseña"
                    value={clave}
                    onChangeText={(t) => {
                      setClave(t);
                      if (error) setError(null);
                    }}
                    secreto
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={conClave}
                    placeholder="••••••••"
                    error={error}
                    senal={senal}
                  />
                  <Boton
                    titulo={cargando ? "Revisando..." : "Seguir"}
                    icono={cargando ? undefined : "arrow-forward"}
                    onPress={conClave}
                    cargando={cargando}
                    style={{ height: 58 }}
                  />
                  {cap ? (
                    <Toque
                      onPress={() => setModo("bio")}
                      disabled={cargando}
                      accessibilityLabel={`Usar ${cap.nombre}`}
                      style={s.alterno}
                    >
                      <Ionicons
                        name={cap.icono}
                        size={18}
                        color={colors.navy}
                      />
                      <Text style={s.alternoTexto}>Usar {cap.nombre}</Text>
                    </Toque>
                  ) : (
                    <Toque
                      onPress={() => salir("/recuperar")}
                      disabled={cargando}
                      accessibilityLabel="Olvidé mi contraseña"
                      style={s.alterno}
                    >
                      <Text style={s.alternoTexto}>
                        ¿Olvidaste tu contraseña?
                      </Text>
                    </Toque>
                  )}
                </>
              )}
            </GlassPanel>

            <View style={s.seguro}>
              <Ionicons
                name="lock-closed-outline"
                size={14}
                color={colors.goldText}
              />
              <Text style={s.seguroTexto}>
                Lo que estabas haciendo sigue aquí al desbloquear
              </Text>
            </View>

            <View style={{ flex: 1, minHeight: 24 }} />

            <Toque
              onPress={() => salir("/login")}
              disabled={cargando}
              accessibilityLabel="Salir de mi cuenta"
              style={s.salir}
            >
              <Ionicons name="log-out-outline" size={17} color={colors.text2} />
              <Text style={s.salirTexto}>No soy yo, salir de la cuenta</Text>
            </Toque>
          </View>
        </ScrollConTeclado>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 92, gap: 22 },
  arriba: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: colors.white,
  },
  subtitulo: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: "rgba(255,255,255,0.75)",
  },
  cuerpo: { flexGrow: 1, marginTop: -64, paddingHorizontal: 16, gap: 14 },
  tarjeta: { padding: 18, paddingHorizontal: 16, gap: 14 },
  tarjetaBio: { alignItems: "center", paddingTop: 26 },
  nota: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.goldCream,
    borderRadius: 14,
    padding: 12,
  },
  notaTexto: {
    flex: 1,
    fontFamily: fonts.label,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  cuenta: {
    fontFamily: fonts.strong,
    fontSize: 14,
    color: colors.text2,
    marginTop: -4,
  },
  fijo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ground,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  fijoTexto: {
    flex: 1,
    fontFamily: fonts.strong,
    fontSize: 15,
    color: colors.text,
  },
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
  seguro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  seguroTexto: {
    fontFamily: fonts.strong,
    fontSize: 12,
    color: colors.text2,
    textAlign: "center",
  },
  salir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  salirTexto: { fontFamily: fonts.strong, fontSize: 14, color: colors.text2 },
});
