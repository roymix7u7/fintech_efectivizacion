import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  RefreshControl,
  Image,
  Animated,
  Easing,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDatos } from "../../src/lib/cache";
import { urlPublica } from "../../src/lib/storage";
import { useAvisosSinLeer } from "../../src/lib/avisos";
import { tituloDia, hora } from "../../src/lib/fechas";
import { Esqueleto, Aparece } from "../../src/components/Cargando";
import { useAviso } from "../../src/components/Avisos";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import TIPO, { CIFRAS } from "../../src/theme/tipografia";
import { estadoSolicitud } from "../../src/theme/estados";

/** Color de acento por banco, para los accesos a las guias. */
const BANCO_COLOR = {
  BCP: "#E67E00",
  BBVA: "#004481",
  Interbank: "#00855A",
  Scotiabank: "#CC0000",
  BanBif: "#0077C0",
  CMR: "#00897B",
};

// Alto de la barra superior fija: el contenido de la portada arranca
// debajo de ella.
const ALTO_BARRA = 96;

// ── Utilidades ────────────────────────────────────────────────

function saludo(ahora = new Date()) {
  const h = ahora.getHours();
  if (h < 5) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** "yossi alexandra" -> "Yossi". El primer nombre basta para saludar. */
function primerNombre(nombres) {
  const n = (nombres || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

function iniciales(perfil) {
  const a = (perfil?.nombres || "").trim().charAt(0);
  const b = (perfil?.apellidos || "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

/** "Hoy 14:32", "Ayer 09:10" o "Lunes, 12 de septiembre". */
function cuando(iso) {
  const t = tituloDia(iso);
  return t === "Hoy" || t === "Ayer" ? `${t} · ${hora(iso)}` : t;
}

// ── Piezas ────────────────────────────────────────────────────

/**
 * Numero que sube hasta su valor. Da la sensacion de dato vivo, y al
 * refrescar anima solo la diferencia en vez de saltar.
 */
function Contador({ valor, estilo }) {
  const [mostrado, setMostrado] = useState(valor);
  const anim = useRef(new Animated.Value(valor)).current;
  const primera = useRef(true);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setMostrado(Math.round(value)));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      anim.setValue(0);
    }
    Animated.timing(anim, {
      toValue: valor,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [valor, anim]);

  return <Text style={estilo}>{mostrado}</Text>;
}

/** Boton que se hunde al presionarlo. */
function Pulsable({ onPress, style, children, accessibilityLabel, disabled }) {
  const escala = useRef(new Animated.Value(1)).current;
  const animar = (v) =>
    Animated.spring(escala, {
      toValue: v,
      speed: 40,
      bounciness: 5,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animar(0.94)}
      onPressOut={() => animar(1)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, { transform: [{ scale: escala }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Seguimiento de una operacion: enviada, aprobada, pagada. Es lo que el
 * cliente abre el app para mirar, asi que se ve de un vistazo en vez de
 * obligarlo a entrar al historial.
 */
function Seguimiento({ solicitud }) {
  const rechazada = solicitud.estado === "rechazado";
  const nivel =
    solicitud.estado === "pagado"
      ? 2
      : solicitud.estado === "aprobado" || rechazada
        ? 1
        : 0;

  const relleno = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(relleno, {
      toValue: nivel / 2,
      duration: 800,
      delay: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [nivel, relleno]);

  const pasos = [
    { titulo: "Enviada", fecha: solicitud.created_at },
    {
      titulo: rechazada ? "Rechazada" : "Aprobada",
      fecha: solicitud.fecha_revision,
    },
    { titulo: "Pagada", fecha: solicitud.pagado_en },
  ];
  const colorLinea = rechazada ? COLORS.error : COLORS.success;

  return (
    <View style={s.seguimiento}>
      <View style={s.segRiel}>
        <View style={s.segRielFondo} />
        <Animated.View
          style={[
            s.segRielRelleno,
            {
              backgroundColor: colorLinea,
              width: relleno.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>

      <View style={s.segPasos}>
        {pasos.map((p, i) => {
          const hecho = i <= nivel;
          const esRechazo = rechazada && i === 1;
          const apagado = rechazada && i === 2;
          return (
            <View key={p.titulo} style={[s.segPaso, apagado && { opacity: 0.35 }]}>
              <View
                style={[
                  s.segPunto,
                  hecho && {
                    backgroundColor: esRechazo ? COLORS.error : COLORS.success,
                    borderColor: esRechazo ? COLORS.error : COLORS.success,
                  },
                  i === nivel && !hecho && s.segPuntoActual,
                ]}
              >
                {hecho && (
                  <Ionicons
                    name={esRechazo ? "close" : "checkmark"}
                    size={11}
                    color={COLORS.white}
                  />
                )}
              </View>
              <Text style={[s.segTitulo, hecho && s.segTituloHecho]}>
                {p.titulo}
              </Text>
              <Text style={s.segFecha}>
                {hecho && p.fecha ? hora(p.fecha) : " "}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function InicioScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();
  const { mostrar } = useAviso();
  const avisosSinLeer = useAvisosSinLeer();

  /**
   * Una sola consulta para toda la pantalla. useDatos pinta primero lo
   * ultimo guardado en el telefono y despues consulta, asi que al abrir
   * el app ya hay algo que leer.
   */
  const { datos, cargando, refrescando, desactualizado, error, recargar } =
    useDatos("inicio", async () => {
      const { data, error: e } = await supabase.rpc("resumen_inicio");
      if (e) throw e;
      return data;
    });

  // Al volver de otra pantalla los datos deben reflejar lo que paso. La
  // primera vez no se repite: useDatos ya consulto al montar.
  const primeraVisita = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVisita.current) {
        primeraVisita.current = false;
        return;
      }
      recargar();
    }, [recargar]),
  );

  // Transparencia de la barra: sobre la portada azul es invisible y se
  // funde con ella; al bajar se vuelve solida para seguir leyendose sobre
  // el contenido claro.
  const scrollY = useRef(new Animated.Value(0)).current;
  const fondoBarra = scrollY.interpolate({
    inputRange: [40, 140],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const tituloBarra = scrollY.interpolate({
    inputRange: [110, 170],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  // La portada se mueve un poco mas lento que el contenido: da
  // profundidad sin distraer.
  const paralaje = scrollY.interpolate({
    inputRange: [-100, 0, 300],
    outputRange: [-30, 0, 90],
    extrapolate: "clamp",
  });

  const perfil = datos?.perfil || null;
  const stats = {
    pendientes: 0,
    por_pagar: 0,
    pagadas: 0,
    tarjetas: 0,
    ...(datos?.stats || {}),
  };
  const recientes = datos?.recientes || [];
  const noticias = datos?.alertas || [];
  const alertasSinVer = Number(datos?.alertas_sin_ver || 0);
  const guias = datos?.guias || [];
  const cuentas = Number(datos?.cuentas || 0);
  const tarjetasEnVerificacion = Number(datos?.tarjetas_en_verificacion || 0);

  const identidadOk = Boolean(perfil?.validado_por);
  const tarjetaOk = stats.tarjetas > 0;
  const cuentaOk = cuentas > 0;
  const enCurso = Number(stats.pendientes) + Number(stats.por_pagar || 0);

  // ── Validaciones antes de enviar ──
  // Cada una dice que falta y lleva a donde se resuelve, en vez de dejar
  // entrar a un formulario que no va a poder completar.
  function irANuevaSolicitud() {
    if (!perfil) {
      return mostrar(
        "No pudimos cargar tu cuenta. Desliza hacia abajo para actualizar.",
        "error",
      );
    }
    if (!identidadOk) {
      return mostrar(
        "Tu identidad aún está en revisión. Te avisaremos al aprobarla.",
        "atencion",
      );
    }
    if (!tarjetaOk) {
      if (tarjetasEnVerificacion > 0) {
        return mostrar(
          "Tu tarjeta se está verificando. Podrás enviar apenas se apruebe.",
          "info",
        );
      }
      mostrar("Primero registra la tarjeta con la que operas.", "atencion");
      return router.push("/(tabs)/tarjetas");
    }
    if (!cuentaOk) {
      // No se bloquea: puede registrarla despues. Pero sin cuenta no hay
      // donde depositarle, y tiene que saberlo antes de enviar.
      mostrar(
        "Recuerda registrar la cuenta donde recibirás tu pago.",
        "atencion",
      );
    }
    router.push("/nueva-solicitud");
  }

  const pendientesPerfil = [
    {
      clave: "identidad",
      titulo: "Identidad",
      listo: identidadOk,
      enCurso: !identidadOk,
      detalle: identidadOk ? "Verificada" : "La estamos revisando",
    },
    {
      clave: "tarjeta",
      titulo: "Tarjeta",
      listo: tarjetaOk,
      enCurso: !tarjetaOk && tarjetasEnVerificacion > 0,
      detalle: tarjetaOk
        ? "Lista para operar"
        : tarjetasEnVerificacion > 0
          ? "En verificación"
          : "Registra la tarjeta con la que operas",
      ruta: "/(tabs)/tarjetas",
    },
    {
      clave: "cuenta",
      titulo: "Cuenta para recibir",
      listo: cuentaOk,
      enCurso: false,
      detalle: cuentaOk
        ? "Registrada"
        : "Sin ella no tenemos dónde depositarte",
      ruta: "/(tabs)/tarjetas",
    },
  ];
  // Solo se muestra si falta algo. Con todo en orden, recordarle al
  // cliente que esta verificado es ruido: ya lo sabe.
  const perfilCompleto = pendientesPerfil.every((p) => p.listo);
  const listos = pendientesPerfil.filter((p) => p.listo).length;

  const ultima = recientes[0];
  const nombre = primerNombre(perfil?.nombres);

  // ── Primera carga sin nada guardado ──
  const sinDatos = !datos;

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />

      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={recargar}
            tintColor={COLORS.white}
            colors={[COLORS.primary]}
            progressViewOffset={ALTO_BARRA}
          />
        }
      >
        {/* ── Portada ── */}
        <View style={s.portada}>
          <Animated.View
            style={[s.halos, { transform: [{ translateY: paralaje }] }]}
            pointerEvents="none"
          >
            <View style={[s.halo, s.haloA]} />
            <View style={[s.halo, s.haloB]} />
            <View style={[s.halo, s.haloC]} />
          </Animated.View>

          <Aparece>
            <Text style={s.saludo}>{saludo()},</Text>
            {sinDatos && cargando ? (
              <View style={s.nombreEsqueleto} />
            ) : (
              <Text style={s.nombre} numberOfLines={1}>
                {nombre || "bienvenido"}
              </Text>
            )}
          </Aparece>

          {/* Panel de cristal con las operaciones */}
          <Aparece retraso={90}>
            <Pulsable
              style={s.panel}
              onPress={() => router.push("/(tabs)/solicitudes")}
              accessibilityLabel={`${enCurso} operaciones en curso. Ver solicitudes`}
            >
              <View style={s.panelArriba}>
                <Text style={s.panelEtiqueta}>Operaciones en curso</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="rgba(255,255,255,0.6)"
                />
              </View>

              {sinDatos && cargando ? (
                <View style={s.cifraEsqueleto} />
              ) : (
                <Contador valor={enCurso} estilo={s.panelCifra} />
              )}
              <Text style={s.panelTexto}>
                {sinDatos && cargando
                  ? " "
                  : enCurso === 0
                    ? "No tienes operaciones pendientes"
                    : "Te avisamos cuando cambien de estado"}
              </Text>

              <View style={s.panelSeparador} />

              <View style={s.panelFila}>
                {[
                  {
                    t: "En revisión",
                    v: stats.pendientes,
                    c: COLORS.warning,
                  },
                  {
                    t: "Por pagar",
                    v: stats.por_pagar || 0,
                    c: "#4ADE9A",
                  },
                  { t: "Pagadas", v: stats.pagadas || 0, c: COLORS.secondary },
                ].map((x, i) => (
                  <View
                    key={x.t}
                    style={[s.panelDato, i > 0 && s.panelDatoBorde]}
                  >
                    <View style={s.panelDatoFila}>
                      <View style={[s.punto, { backgroundColor: x.c }]} />
                      <Text style={s.panelDatoValor}>
                        {sinDatos && cargando ? "–" : x.v}
                      </Text>
                    </View>
                    <Text style={s.panelDatoTitulo}>{x.t}</Text>
                  </View>
                ))}
              </View>
            </Pulsable>
          </Aparece>
        </View>

        <View style={s.cuerpo}>
          {/* ── Accesos ── */}
          <Aparece retraso={160}>
            <View style={s.accesos}>
              {[
                {
                  t: "Enviar",
                  i: "paper-plane",
                  principal: true,
                  accion: irANuevaSolicitud,
                },
                {
                  t: "Historial",
                  i: "receipt-outline",
                  accion: () => router.push("/(tabs)/solicitudes"),
                },
                {
                  t: "Tarjetas",
                  i: "card-outline",
                  accion: () => router.push("/(tabs)/tarjetas"),
                },
                {
                  t: "Noticias",
                  i: "megaphone-outline",
                  globo: alertasSinVer,
                  accion: () =>
                    router.push(
                      alertasSinVer > 0
                        ? "/(tabs)/noticias?seccion=alertas"
                        : "/(tabs)/noticias",
                    ),
                },
              ].map((a) => (
                <Pulsable
                  key={a.t}
                  style={s.acceso}
                  onPress={a.accion}
                  accessibilityLabel={a.t}
                >
                  <View
                    style={[s.accesoIcono, a.principal && s.accesoPrincipal]}
                  >
                    <Ionicons
                      name={a.i}
                      size={21}
                      color={a.principal ? COLORS.primaryDark : COLORS.primary}
                    />
                    {a.globo > 0 && (
                      <View style={s.accesoGlobo}>
                        <Text style={s.accesoGloboTexto}>
                          {a.globo > 9 ? "9+" : a.globo}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.accesoTexto}>{a.t}</Text>
                </Pulsable>
              ))}
            </View>
          </Aparece>

          {/* ── Estado de los datos ── */}
          {error && datos ? (
            <View style={s.desconectado}>
              <Ionicons
                name="cloud-offline-outline"
                size={15}
                color={COLORS.textSecondary}
              />
              <Text style={s.desconectadoTexto}>
                Sin conexión · mostrando lo último guardado
              </Text>
              <TouchableOpacity onPress={recargar} hitSlop={10}>
                <Text style={s.desconectadoAccion}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {error && !datos ? (
            <View style={s.errorCaja}>
              <Ionicons
                name="cloud-offline-outline"
                size={30}
                color={COLORS.textLight}
              />
              <Text style={s.errorTitulo}>No pudimos cargar tu inicio</Text>
              <Text style={s.errorTexto}>
                Revisa tu conexión a internet e inténtalo otra vez.
              </Text>
              <TouchableOpacity style={s.errorBtn} onPress={recargar}>
                <Text style={s.errorBtnTexto}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {sinDatos && cargando && !error ? (
            <View style={{ gap: 14 }}>
              <Esqueleto alto={150} radio={18} />
              <Esqueleto alto={210} radio={18} />
            </View>
          ) : null}

          {/* ── Alertas sin leer ── */}
          {alertasSinVer > 0 && (
            <Aparece retraso={200}>
              <Pulsable
                style={s.alerta}
                onPress={() => router.push("/(tabs)/noticias?seccion=alertas")}
                accessibilityLabel="Ver alertas sin leer"
              >
                <View style={s.alertaIcono}>
                  <Ionicons name="warning" size={18} color={COLORS.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alertaTitulo}>
                    {alertasSinVer === 1
                      ? "Tienes 1 alerta sin leer"
                      : `Tienes ${alertasSinVer} alertas sin leer`}
                  </Text>
                  <Text style={s.alertaTexto}>
                    Puede afectar tus operaciones de hoy
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.error}
                />
              </Pulsable>
            </Aparece>
          )}

          {/* ── Lo que falta para operar ── */}
          {datos && !perfilCompleto && (
            <Aparece retraso={240}>
              <View style={s.tarjeta}>
                <View style={s.tarjetaCabecera}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tarjetaTitulo}>Completa tu cuenta</Text>
                    <Text style={s.tarjetaSub}>
                      {listos} de 3 listos para operar
                    </Text>
                  </View>
                  <View style={s.anillo}>
                    <Text style={s.anilloTexto}>{listos}/3</Text>
                  </View>
                </View>

                {pendientesPerfil.map((p) => {
                  const tocable = !p.listo && !p.enCurso && p.ruta;
                  const Contenedor = tocable ? TouchableOpacity : View;
                  return (
                    <Contenedor
                      key={p.clave}
                      style={s.requisito}
                      {...(tocable ? { onPress: () => router.push(p.ruta) } : {})}
                    >
                      <View
                        style={[
                          s.requisitoIcono,
                          p.listo
                            ? { backgroundColor: COLORS.successLight }
                            : p.enCurso
                              ? { backgroundColor: COLORS.warningLight }
                              : { backgroundColor: COLORS.inputBg },
                        ]}
                      >
                        <Ionicons
                          name={
                            p.listo
                              ? "checkmark"
                              : p.enCurso
                                ? "time-outline"
                                : "add"
                          }
                          size={16}
                          color={
                            p.listo
                              ? COLORS.success
                              : p.enCurso
                                ? COLORS.warning
                                : COLORS.primary
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            s.requisitoTitulo,
                            p.listo && { color: COLORS.textSecondary },
                          ]}
                        >
                          {p.titulo}
                        </Text>
                        <Text style={s.requisitoDetalle}>{p.detalle}</Text>
                      </View>
                      {tocable && (
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={COLORS.textLight}
                        />
                      )}
                    </Contenedor>
                  );
                })}
              </View>
            </Aparece>
          )}

          {/* ── Ultima operacion ── */}
          {datos && ultima && (
            <Aparece retraso={280}>
              <View style={s.tarjeta}>
                <View style={s.seccionCabecera}>
                  <Text style={s.seccionTitulo}>Última operación</Text>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/solicitudes")}
                    hitSlop={10}
                  >
                    <Text style={s.verTodo}>Ver historial</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.ultimaFila}>
                  <View
                    style={[
                      s.movIcono,
                      { backgroundColor: estadoSolicitud(ultima.estado).bg },
                    ]}
                  >
                    <Ionicons
                      name={estadoSolicitud(ultima.estado).icon}
                      size={18}
                      color={estadoSolicitud(ultima.estado).color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.movTitulo}>
                      {ultima.banco}
                      {ultima.ultimos_4 ? ` •••• ${ultima.ultimos_4}` : ""}
                    </Text>
                    <Text style={s.movSub}>
                      {ultima.codigo} · {cuando(ultima.created_at)}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.chip,
                      { backgroundColor: estadoSolicitud(ultima.estado).bg },
                    ]}
                  >
                    <Text
                      style={[
                        s.chipTexto,
                        { color: estadoSolicitud(ultima.estado).color },
                      ]}
                    >
                      {estadoSolicitud(ultima.estado).text}
                    </Text>
                  </View>
                </View>

                <Seguimiento solicitud={ultima} />
              </View>
            </Aparece>
          )}

          {/* ── Sin operaciones todavia ── */}
          {datos && !ultima && perfilCompleto && (
            <Aparece retraso={280}>
              <View style={[s.tarjeta, s.primera]}>
                <View style={s.primeraIcono}>
                  <Ionicons
                    name="rocket-outline"
                    size={24}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={s.primeraTitulo}>Todo listo para operar</Text>
                <Text style={s.primeraTexto}>
                  Haz la operación en la app de tu banco y envíanos el
                  comprobante. Te avisamos en cada paso.
                </Text>
                <TouchableOpacity
                  style={s.primeraBtn}
                  onPress={irANuevaSolicitud}
                >
                  <Ionicons name="paper-plane" size={16} color={COLORS.white} />
                  <Text style={s.primeraBtnTexto}>Enviar mi comprobante</Text>
                </TouchableOpacity>
              </View>
            </Aparece>
          )}

          {/* ── Movimientos recientes ── */}
          {recientes.length > 1 && (
            <Aparece retraso={320}>
              <View style={s.tarjeta}>
                <View style={s.seccionCabecera}>
                  <Text style={s.seccionTitulo}>Movimientos recientes</Text>
                </View>
                {recientes.slice(1).map((m, i, lista) => {
                  const e = estadoSolicitud(m.estado);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        s.mov,
                        i < lista.length - 1 && s.movBorde,
                      ]}
                      onPress={() => router.push("/(tabs)/solicitudes")}
                      activeOpacity={0.6}
                    >
                      <View style={[s.movIcono, { backgroundColor: e.bg }]}>
                        <Ionicons name={e.icon} size={17} color={e.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.movTitulo}>
                          {m.banco}
                          {m.ultimos_4 ? ` •••• ${m.ultimos_4}` : ""}
                        </Text>
                        <Text style={s.movSub}>{cuando(m.created_at)}</Text>
                      </View>
                      <Text style={[s.movEstado, { color: e.color }]}>
                        {e.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Aparece>
          )}

          {/* ── Guias de sus bancos ── */}
          {guias.length > 0 && (
            <Aparece retraso={360}>
              <Text style={s.fueraTitulo}>Cómo operar con tu banco</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.carrusel}
                style={s.carruselScroll}
              >
                {guias.map((g) => (
                  <Pulsable
                    key={g.id}
                    style={s.guia}
                    onPress={() => router.push(`/guia/${g.banco}`)}
                    accessibilityLabel={`Guía de ${g.banco}`}
                  >
                    <View
                      style={[
                        s.guiaBarra,
                        { backgroundColor: BANCO_COLOR[g.banco] || COLORS.primary },
                      ]}
                    />
                    <Text style={s.guiaBanco}>{g.banco}</Text>
                    <View style={s.guiaVer}>
                      <Text style={s.guiaVerTexto}>Ver pasos</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={13}
                        color={COLORS.primary}
                      />
                    </View>
                  </Pulsable>
                ))}
              </ScrollView>
            </Aparece>
          )}

          {/* ── Noticias ── */}
          {noticias.length > 0 && (
            <Aparece retraso={400}>
              <View style={s.fueraCabecera}>
                <Text style={s.fueraTitulo}>Novedades</Text>
                <TouchableOpacity
                  onPress={() => router.push("/(tabs)/noticias")}
                  hitSlop={10}
                >
                  <Text style={s.verTodo}>Ver todo</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.carrusel}
                style={s.carruselScroll}
                decelerationRate="fast"
                snapToInterval={262}
              >
                {noticias.map((n) => (
                  <Pulsable
                    key={n.id}
                    style={s.noticia}
                    onPress={() => router.push("/(tabs)/noticias")}
                    accessibilityLabel={n.titulo}
                  >
                    {n.portada ? (
                      <Image
                        source={{ uri: urlPublica("noticias-fotos", n.portada) }}
                        style={s.noticiaImagen}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[s.noticiaImagen, s.noticiaSinImagen]}>
                        <Ionicons
                          name={n.tipo === "promocion" ? "pricetag" : "megaphone"}
                          size={26}
                          color={COLORS.secondary}
                        />
                      </View>
                    )}
                    <View style={s.noticiaCuerpo}>
                      <Text style={s.noticiaTitulo} numberOfLines={2}>
                        {n.titulo}
                      </Text>
                      <Text style={s.noticiaTexto} numberOfLines={2}>
                        {n.mensaje}
                      </Text>
                    </View>
                  </Pulsable>
                ))}
              </ScrollView>
            </Aparece>
          )}

          {/* ── Pie de confianza ── */}
          {datos && (
            <Aparece retraso={440}>
              <View style={s.confianza}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color={COLORS.textLight}
                />
                <Text style={s.confianzaTexto}>
                  Tus datos viajan cifrados y cada operación la revisa una
                  persona.
                </Text>
              </View>
            </Aparece>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── Barra superior fija ──
          Transparente sobre la portada; se vuelve solida al bajar. */}
      <View style={s.barra} pointerEvents="box-none">
        <Animated.View
          style={[s.barraFondo, { opacity: fondoBarra }]}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={s.avatar}
          onPress={() => router.push("/(tabs)/perfil")}
          accessibilityRole="button"
          accessibilityLabel="Mi cuenta"
        >
          <Text style={s.avatarTexto}>{iniciales(perfil)}</Text>
        </TouchableOpacity>

        <Animated.Text
          style={[s.barraTitulo, { opacity: tituloBarra }]}
          numberOfLines={1}
        >
          {nombre ? `Hola, ${nombre}` : "Inicio"}
        </Animated.Text>

        <View style={s.barraDerecha}>
          {desactualizado && refrescando ? (
            <View style={s.sincronizando} />
          ) : null}
          <TouchableOpacity
            style={s.barraBtn}
            onPress={() => router.push("/notificaciones")}
            accessibilityRole="button"
            accessibilityLabel={
              avisosSinLeer > 0 ? `Avisos, ${avisosSinLeer} sin leer` : "Avisos"
            }
          >
            <Ionicons
              name={avisosSinLeer > 0 ? "notifications" : "notifications-outline"}
              size={20}
              color={COLORS.white}
            />
            {avisosSinLeer > 0 && (
              <View style={s.barraGlobo}>
                <Text style={s.barraGloboTexto}>
                  {avisosSinLeer > 9 ? "9+" : avisosSinLeer}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.barraBtn}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir menú"
          >
            <Ionicons name="menu" size={21} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      <MenuLateral
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        perfil={perfil}
      />
    </View>
  );
}

const CRISTAL = "rgba(255,255,255,0.09)";
const CRISTAL_BORDE = "rgba(255,255,255,0.16)";

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },

  // Barra superior
  barra: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ALTO_BARRA,
    paddingTop: 46,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 20,
  },
  barraFondo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatarTexto: { fontSize: 14, fontWeight: "800", color: COLORS.primaryDark },
  barraTitulo: { flex: 1, fontSize: 16, fontWeight: "700", color: COLORS.white },
  barraDerecha: { flexDirection: "row", alignItems: "center", gap: 8 },
  sincronizando: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
    marginRight: 2,
  },
  barraBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CRISTAL,
    borderWidth: 1,
    borderColor: CRISTAL_BORDE,
    alignItems: "center",
    justifyContent: "center",
  },
  barraGlobo: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  barraGloboTexto: { color: COLORS.white, fontSize: 9, fontWeight: "800" },

  // Portada
  portada: {
    backgroundColor: COLORS.primary,
    paddingTop: ALTO_BARRA + 6,
    paddingHorizontal: 20,
    paddingBottom: 58,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  halos: { ...StyleSheet.absoluteFillObject },
  halo: { position: "absolute", borderRadius: 999 },
  haloA: {
    width: 280,
    height: 280,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.55,
    top: -120,
    right: -90,
  },
  haloB: {
    width: 180,
    height: 180,
    backgroundColor: COLORS.secondary,
    opacity: 0.08,
    top: 120,
    left: -70,
  },
  haloC: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.primaryDark,
    opacity: 0.35,
    bottom: -40,
    right: 40,
  },
  saludo: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  nombre: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.white,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  nombreEsqueleto: {
    width: 150,
    height: 30,
    borderRadius: 8,
    backgroundColor: CRISTAL,
    marginTop: 4,
  },

  panel: {
    marginTop: 18,
    backgroundColor: CRISTAL,
    borderWidth: 1,
    borderColor: CRISTAL_BORDE,
    borderRadius: 20,
    padding: 18,
  },
  panelArriba: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelEtiqueta: {
    ...TIPO.etiqueta,
    color: "rgba(255,255,255,0.6)",
  },
  panelCifra: {
    fontSize: 44,
    fontWeight: "800",
    color: COLORS.white,
    letterSpacing: -1.5,
    marginTop: 4,
    ...CIFRAS,
  },
  cifraEsqueleto: {
    width: 70,
    height: 44,
    borderRadius: 10,
    backgroundColor: CRISTAL,
    marginTop: 8,
  },
  panelTexto: { fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 2 },
  panelSeparador: {
    height: 1,
    backgroundColor: CRISTAL_BORDE,
    marginVertical: 14,
  },
  panelFila: { flexDirection: "row" },
  panelDato: { flex: 1, paddingLeft: 12 },
  panelDatoBorde: { borderLeftWidth: 1, borderLeftColor: CRISTAL_BORDE },
  panelDatoFila: { flexDirection: "row", alignItems: "center", gap: 6 },
  punto: { width: 7, height: 7, borderRadius: 4 },
  panelDatoValor: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.white,
    ...CIFRAS,
  },
  panelDatoTitulo: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },

  // Cuerpo: sube sobre la portada para que los accesos floten encima
  cuerpo: { paddingHorizontal: 20, marginTop: -36, gap: 14 },

  accesos: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  acceso: { flex: 1, alignItems: "center", gap: 7 },
  accesoIcono: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  accesoPrincipal: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  accesoTexto: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  accesoGlobo: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  accesoGloboTexto: { color: COLORS.white, fontSize: 9, fontWeight: "800" },

  desconectado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  desconectadoTexto: { ...TIPO.micro, flex: 1, color: COLORS.textSecondary },
  desconectadoAccion: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  errorCaja: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  errorTitulo: { ...TIPO.tarjeta, marginTop: 10 },
  errorTexto: { ...TIPO.apoyo, textAlign: "center", marginTop: 4 },
  errorBtn: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  errorBtnTexto: { color: COLORS.white, fontWeight: "700", fontSize: 14 },

  alerta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.errorLight,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F5C6C2",
  },
  alertaIcono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  alertaTitulo: { fontSize: 14, fontWeight: "700", color: COLORS.error },
  alertaTexto: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Tarjetas de contenido
  tarjeta: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  tarjetaCabecera: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  tarjetaTitulo: { ...TIPO.seccion, fontSize: 16 },
  tarjetaSub: { ...TIPO.micro, marginTop: 2 },
  anillo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  anilloTexto: { fontSize: 12, fontWeight: "800", color: COLORS.text, ...CIFRAS },
  requisito: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  requisitoIcono: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  requisitoTitulo: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  requisitoDetalle: { ...TIPO.micro, marginTop: 1 },

  seccionCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  seccionTitulo: { ...TIPO.seccion, fontSize: 16 },
  verTodo: { fontSize: 13, fontWeight: "700", color: COLORS.primary },

  ultimaFila: { flexDirection: "row", alignItems: "center", gap: 12 },
  chip: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  chipTexto: { fontSize: 11, fontWeight: "700" },

  // Seguimiento
  seguimiento: { marginTop: 18 },
  segRiel: {
    position: "absolute",
    top: 10,
    left: "16.5%",
    right: "16.5%",
    height: 3,
  },
  segRielFondo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
  },
  segRielRelleno: { height: "100%", borderRadius: 2 },
  segPasos: { flexDirection: "row" },
  segPaso: { flex: 1, alignItems: "center" },
  segPunto: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  segPuntoActual: { borderColor: COLORS.warning },
  segTitulo: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textLight,
    marginTop: 6,
  },
  segTituloHecho: { color: COLORS.text },
  segFecha: { fontSize: 11, color: COLORS.textLight, marginTop: 1, ...CIFRAS },

  // Movimientos
  mov: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  movBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  movIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  movTitulo: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  movSub: { ...TIPO.micro, marginTop: 2, ...CIFRAS },
  movEstado: { fontSize: 12, fontWeight: "700" },

  primera: { alignItems: "center", paddingVertical: 22 },
  primeraIcono: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  primeraTitulo: { ...TIPO.seccion, marginTop: 12 },
  primeraTexto: {
    ...TIPO.apoyo,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 10,
  },
  primeraBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },
  primeraBtnTexto: { color: COLORS.white, fontWeight: "700", fontSize: 14 },

  // Carruseles
  fueraCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  fueraTitulo: { ...TIPO.seccion, fontSize: 16, marginTop: 6 },
  carruselScroll: { marginHorizontal: -20, marginTop: 10 },
  carrusel: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },

  guia: {
    width: 138,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  guiaBarra: { width: 26, height: 4, borderRadius: 2, marginBottom: 12 },
  guiaBanco: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  guiaVer: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  guiaVerTexto: { fontSize: 12, fontWeight: "600", color: COLORS.primary },

  noticia: {
    width: 252,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  noticiaImagen: { width: "100%", height: 118, backgroundColor: COLORS.inputBg },
  noticiaSinImagen: {
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  noticiaCuerpo: { padding: 12 },
  noticiaTitulo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  noticiaTexto: { ...TIPO.micro, marginTop: 4, lineHeight: 17 },

  confianza: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  confianzaTexto: { ...TIPO.micro, textAlign: "center", flexShrink: 1 },
});
