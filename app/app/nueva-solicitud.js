import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { useDatos } from "../src/lib/cache";
import { invalidar } from "../src/lib/cache";
import { bancoDe, colors, fonts } from "../src/theme/tokens";
import { useReducirMovimiento } from "../src/lib/movimiento";
import { BankIcon } from "../src/components/brand/BankIcon";
import { BankBadge } from "../src/components/ui/BankBadge";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { AmbientGlow } from "../src/components/ui/AmbientGlow";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { BarraFija, ALTO_BARRA_FIJA } from "../src/components/ui/BarraFija";
import {
  BotonIcono,
  Etiqueta,
  Segmentos,
  Tarjeta,
  TituloPantalla,
} from "../src/components/ui/Piezas";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { HojaFoto, capturarFoto } from "../src/components/ui/HojaFoto";
import { useFranjaNoche } from "../src/components/ui/FranjaSistema";
import { useArrastreCerrar } from "../src/lib/arrastre";
import { esFalloDeRed } from "../src/lib/conexion";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { Esqueleto, Aparece } from "../src/components/Cargando";
import { useAlturaTeclado } from "../src/lib/teclado";
import { alertasUrgentes, marcarVistas } from "../src/lib/alertas";
import {
  cuentasDeDeposito,
  esBancoPrincipal,
  faltaParaRecibir,
} from "../src/lib/deposito";

const BUCKET = "comprobantes";
const MAX_NOTA = 300;

/**
 * Codigo legible para el cliente. El sufijo aleatorio evita las
 * colisiones que tenia la version basada solo en la hora.
 */
function generarCodigo() {
  const d = new Date();
  const fecha =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  let sufijo = "";
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 6; i++)
    sufijo += abc[Math.floor(Math.random() * abc.length)];
  return `SOL-${fecha}-${sufijo}`;
}

function haceCuanto(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

// ── Pantalla ──────────────────────────────────────────────────

export default function NuevaSolicitudScreen() {
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [nota, setNota] = useState("");
  const [notaEnfocada, setNotaEnfocada] = useState(false);
  const [cambiarFoto, setCambiarFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // Alertas urgentes que hay que mostrar antes de enviar. null: sin modal.
  const [urgentes, setUrgentes] = useState(null);
  // Candado contra el doble toque. El estado de React tarda un render en
  // deshabilitar el boton, y en ese intervalo un segundo toque lanzaba
  // otra verificacion y otro envio.
  const enCurso = useRef(false);

  // Código de la solicitud ya enviada: muestra la pantalla de éxito.
  const [enviada, setEnviada] = useState(null);
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  const altoTeclado = useAlturaTeclado();
  // "Solicitud enviada" es azul noche entera.
  useFranjaNoche(Boolean(enviada));
  const { mostrar } = useAviso();
  const router = useRouter();
  const navigation = useNavigation();

  // Tarjetas verificadas y cuentas, guardadas en el teléfono: el
  // formulario abre ya lleno y solo se vuelve a descargar si cambió algo
  // (huellas "tarjetas" y "cuentas"). El esqueleto sale solo la primera
  // vez que no hay nada guardado; después se refresca en silencio.
  const { datos, cargando, error: errorDatos } = useDatos(
    "nueva-solicitud",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { sinSesion: true };

      const { data: perfilData, error: e1 } = await supabase
        .from("perfiles_cliente")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!perfilData) return { perfil: null, tarjetas: [], cuentas: [] };

      const [{ data: tarjetasData, error: e2 }, { data: cuentasData, error: e3 }] = await Promise.all([
        supabase
          .from("tarjetas")
          .select("id, banco, ultimos_4")
          .eq("cliente_id", perfilData.id)
          .eq("activa", true)
          .eq("estado", "aprobado")
          .order("created_at", { ascending: false }),
        // Hacen falta para saber a donde se le depositaria: sin cuenta
        // del mismo banco, la operacion no se puede pagar. El tipo hace
        // falta: la CCI sola no recibe depósitos.
        supabase
          .from("cuentas_bancarias")
          .select("id, banco, tipo, numero_cuenta")
          .eq("cliente_id", perfilData.id)
          .eq("activa", true),
      ]);
      if (e2 || e3) throw e2 || e3;
      return { perfil: perfilData, tarjetas: tarjetasData || [], cuentas: cuentasData || [] };
    },
    { grupos: ["tarjetas", "cuentas", "perfil"] },
  );
  const perfil = datos?.perfil || null;
  const tarjetas = useMemo(() => datos?.tarjetas || [], [datos]);
  const cuentas = datos?.cuentas || [];

  useEffect(() => {
    if (datos?.sinSesion) router.replace("/login");
  }, [datos?.sinSesion]);
  useEffect(() => {
    if (errorDatos) mostrar(mensajeError(errorDatos), "error");
  }, [errorDatos]);

  // Si la tarjeta elegida ya no esta disponible, se limpia. Y si solo
  // hay una, se elige sola: preguntar cuando no hay nada que decidir es
  // un paso de mas.
  useEffect(() => {
    setTarjetaSeleccionada((actual) => {
      if (actual && tarjetas.some((t) => t.id === actual.id)) return actual;
      return tarjetas.length === 1 ? tarjetas[0] : null;
    });
  }, [tarjetas]);

  // A donde se le deposita lo decide src/lib/deposito.js: la cuenta
  // normal (no la CCI) del mismo banco de la tarjeta, o de cualquier
  // banco si la tarjeta es CMR u "Otros". Sin esa cuenta no hay a donde
  // mandar el dinero.
  const bancoTarjeta = tarjetaSeleccionada?.banco || null;
  const destinos = cuentasDeDeposito(bancoTarjeta, cuentas);
  const tieneCuentaDelBanco = destinos.length > 0;
  const falta = faltaParaRecibir(bancoTarjeta, cuentas);
  // Lo que se le dice en la barra de abajo: a qué banco va su dinero.
  const destinoTexto = !tieneCuentaDelBanco
    ? null
    : esBancoPrincipal(bancoTarjeta)
      ? `tu cuenta ${bancoTarjeta}`
      : destinos.length === 1
        ? `tu cuenta ${destinos[0].banco}`
        : "una de tus cuentas de ahorros";

  const listo = Boolean(tarjetaSeleccionada && comprobante && tieneCuentaDelBanco);
  const ocupado = enviando || verificando;

  // ── Salir sin perder lo cargado ──
  //
  // Lo que cuesta rehacer es el comprobante (volver a fotografiarlo) y
  // la nota. La tarjeta no cuenta: se elige con un toque, y si el
  // cliente tiene una sola ya viene elegida sin que haya hecho nada.
  const tieneDatos = Boolean(comprobante) || nota.trim().length > 0;

  // Salida pendiente de confirmar: { continuar } o null.
  const [salida, setSalida] = useState(null);
  // Bajar la hoja de salida con el dedo es "Seguir aquí": la opción segura.
  const arrastreSalida = useArrastreCerrar({ alCerrar: () => setSalida(null) });
  // Cuando la salida la decide el propio flujo (se envio, o el cliente
  // ya confirmo), el aviso no debe volver a aparecer.
  const salidaPermitida = useRef(false);
  const ocupadoRef = useRef(ocupado);
  ocupadoRef.current = ocupado;

  /**
   * Intercepta TODAS las salidas, no solo la flecha de la cabecera: el
   * boton atras de Android, el gesto de deslizar en iPhone y el atras
   * del navegador. Cubrir solo la flecha dejaba perder el comprobante
   * con el gesto mas comun, que es el boton del telefono.
   */
  usePreventRemove(tieneDatos || ocupado, ({ data }) => {
    const accion = data.action;

    // Salidas que no son del cliente: la sesion vencio y se le manda al
    // login. Retenerlo en un formulario que ya no puede enviar no sirve.
    if (
      salidaPermitida.current ||
      accion.type === "REPLACE" ||
      accion.type === "RESET"
    ) {
      navigation.dispatch(accion);
      return;
    }

    // Con el envio en marcha no se sale: la solicitud se crearia igual y
    // el cliente creeria que la cancelo.
    if (ocupadoRef.current) {
      mostrar("Espera a que termine el envío.", "info");
      return;
    }

    arrastreSalida.reiniciar();
    setSalida({ continuar: () => navigation.dispatch(accion) });
  });

  function confirmarSalida() {
    const pendiente = salida;
    salidaPermitida.current = true;
    setSalida(null);
    pendiente?.continuar();
  }

  /** Flecha de la cabecera. */
  function volver() {
    const irse = () => {
      salidaPermitida.current = true;
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/solicitudes");
    };
    if (ocupado) return;
    if (tieneDatos) {
      arrastreSalida.reiniciar();
      setSalida({ continuar: irse });
    } else {
      irse();
    }
  }

  // Avance: dos pasos obligatorios. La tarjeta cuenta solo si puede
  // recibir el depósito; elegida sin cuenta todavía no está resuelta.
  const completos = (tarjetaSeleccionada && tieneCuentaDelBanco ? 1 : 0) + (comprobante ? 1 : 0);

  // Un solo comprobante, de la cámara o de la galería (muchos bancos
  // entregan el voucher como captura). Lo de la galería se sube entero,
  // sin recorte: un número de operación cortado no sirve.
  async function elegirFoto(desdeCamara) {
    if (ocupado || procesando) return;
    // Reducir una foto de camara tarda un momento: sin indicador, parece
    // que el toque no hizo nada y el cliente vuelve a intentarlo.
    const lista = await capturarFoto({ desdeCamara, onPreparando: setProcesando });
    if (lista === false) return mostrar("No pudimos leer la imagen. Inténtalo otra vez.", "error");
    if (lista) setComprobante(lista);
  }

  /**
   * Toque en "Enviar solicitud".
   *
   * Si hay una alerta urgente al aire, se muestra antes de enviar. El
   * cliente puede estar a punto de mandar un comprobante de un banco que
   * justo esta caido: tiene que enterarse antes, no despues.
   */
  async function alPresionarEnviar() {
    if (enCurso.current || enviando || verificando) return;
    enCurso.current = true;
    setVerificando(true);

    const { alertas } = await alertasUrgentes();

    setVerificando(false);
    if (alertas.length > 0) {
      // El candado se suelta aqui: mientras el modal esta abierto no hay
      // nada en curso, y la decision la toma el cliente.
      enCurso.current = false;
      setUrgentes(alertas);
      return;
    }
    await enviarSolicitud();
    enCurso.current = false;
  }

  async function continuarPeseAlerta() {
    if (enCurso.current) return;
    enCurso.current = true;
    const ids = (urgentes || []).map((a) => a.id);
    setUrgentes(null);
    // Ya la leyo en el modal: no tiene sentido que la burbuja vuelva a
    // interrumpirlo con lo mismo.
    marcarVistas(ids);
    await enviarSolicitud();
    enCurso.current = false;
  }

  async function enviarSolicitud() {
    if (!perfil) return mostrar("No pudimos cargar tu perfil. Reintenta.", "error");
    // El boton ya exige ambas cosas, pero el envio puede llegar desde el
    // modal despues de que algo cambio: se comprueba de nuevo.
    if (!tarjetaSeleccionada) return mostrar("Elige la tarjeta de la operación.", "error");
    if (!comprobante?.base64) return mostrar("Adjunta el comprobante otra vez.", "error");
    if (!tieneCuentaDelBanco)
      return mostrar(`${falta?.titulo || "Falta tu cuenta"}. Regístrala antes de enviar.`, "atencion");

    setEnviando(true);
    let pathSubido = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const codigo = generarCodigo();
      const path = `${user.id}/${codigo}.jpg`;
      await subirImagen(BUCKET, path, comprobante);
      pathSubido = path;

      // Se guarda el path del objeto, no una URL firmada: las firmadas
      // caducan y el admin termina viendo un enlace roto.
      const { error: solError } = await supabase.from("solicitudes").insert({
        codigo,
        cliente_id: perfil.id,
        tarjeta_id: tarjetaSeleccionada.id,
        banco: tarjetaSeleccionada.banco,
        comprobante_url: path,
        nota_cliente: nota.trim() || null,
        estado: "pendiente",
      });
      if (solError) throw solError;

      // La auditoria no debe tumbar la solicitud si falla.
      const { error: auditError } = await supabase
        .from("auditoria_logs")
        .insert({
          usuario_id: user.id,
          accion: "CREAR_SOLICITUD",
          entidad: "solicitudes",
          datos_despues: { codigo, banco: tarjetaSeleccionada.banco },
        });
      if (auditError) console.warn("Auditoria:", auditError.message);

      // Ya se envio: el comprobante sigue en el estado, pero no hay nada
      // que perder, asi que no debe saltar el aviso de salida.
      salidaPermitida.current = true;
      // La pantalla de exito sale con dismissTo y no replace. Esta
      // pantalla esta encima de las pestanas; replace creaba una segunda
      // copia de ellas, con una segunda burbuja de alertas escuchando el
      // mismo canal, y eso tumbaba el app justo al enviar.
      invalidar("solicitudes");
      setEnviada(codigo);
    } catch (err) {
      // Sin esto la imagen quedaba huerfana en Storage.
      await borrarImagenes(BUCKET, [pathSubido]);
      mostrar(
        esFalloDeRed(err)
          ? "Se cortó la conexión. Tu comprobante sigue aquí: revisa tu internet y vuelve a enviar."
          : mensajeError(err),
        "error",
      );
    } finally {
      setEnviando(false);
    }
  }

  // ── Solicitud enviada ──
  // Pantalla propia en azul noche: cierra el ciclo con algo más que un
  // aviso que se va en dos segundos. Es el momento en que el cliente
  // necesita saber que llegó y qué sigue.
  if (enviada) {
    return (
      <View style={[s.enviada, { paddingTop: insets.top, paddingBottom: insets.bottom + 34 }]}>
        <StatusBar style="light" />
        <AmbientGlow
          lights={[
            { color: colors.glowGold, opacity: 0.4, size: 320, top: 120, left: 30 },
            { color: colors.glowBlue, opacity: 0.75, size: 360, bottom: -140, right: -160 },
          ]}
        />
        <View style={s.enviadaCentro}>
          <Aparece>
            <GlassPanel variant="onNight" radius={60} style={s.anillo}>
              <View style={s.checkOro}>
                <Ionicons name="checkmark" size={40} color={colors.night} />
              </View>
            </GlassPanel>
          </Aparece>
          <Aparece retraso={200}>
            <Text style={s.enviadaTitulo}>Solicitud enviada</Text>
          </Aparece>
          <Aparece retraso={300}>
            <View style={s.enviadaChip}>
              <Ionicons name="time-outline" size={14} color="#C3D3F7" />
              <Text style={s.enviadaChipTexto}>En revisión</Text>
            </View>
          </Aparece>
          <Text style={s.enviadaTexto}>Te avisaremos en cada paso.</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Boton
            variante="claro"
            titulo="Ver mis solicitudes"
            onPress={() => router.dismissTo("/(tabs)/solicitudes")}
          />
          <Toque
            onPress={() => router.dismissTo("/(tabs)/inicio")}
            accessibilityLabel="Volver al inicio"
          >
            <GlassPanel variant="onNight" radius={18} style={s.volverInicio}>
              <Text style={s.volverInicioTexto}>Volver al inicio</Text>
            </GlassPanel>
          </Toque>
        </View>
      </View>
    );
  }

  // ── Carga ──
  if (cargando) {
    return (
      <View style={[s.pantalla, { paddingTop: insets.top + 18 }]}>
        <View style={s.contenido}>
          <Esqueleto alto={44} ancho={44} radio={14} />
          <Esqueleto alto={36} ancho={220} radio={10} estilo={{ marginTop: 12 }} />
          <Esqueleto alto={68} radio={22} estilo={{ marginTop: 14 }} />
          <Esqueleto alto={120} radio={22} estilo={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  const motivoEnvio = ocupado
    ? verificando
      ? "Verificando…"
      : "Enviando…"
    : !tarjetaSeleccionada
      ? tarjetas.length
        ? "Elige la tarjeta de la operación"
        : "Registra una tarjeta para enviar"
      : !tieneCuentaDelBanco
        ? esBancoPrincipal(bancoTarjeta)
          ? `Agrega una cuenta ${bancoTarjeta} o elige otra tarjeta`
          : "Agrega una cuenta de ahorros o elige otra tarjeta"
        : procesando
          ? "Preparando la imagen…"
          : !comprobante
            ? "Adjunta el comprobante para enviar"
            : null;

  /** "Depósito a BCP ···· 7730" para la tarjeta elegida. */
  const lineaDeposito = !tieneCuentaDelBanco
    ? null
    : destinos.length === 1
      ? `Depósito a ${destinos[0].banco} ···· ${String(destinos[0].numero_cuenta || "").slice(-4)}`
      : `Depósito a ${destinoTexto}`;

  return (
    <View style={s.pantalla}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          s.contenido,
          {
            paddingTop: insets.top + 18,
            paddingBottom: ALTO_BARRA_FIJA + insets.bottom + 20 + altoTeclado,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.arriba}>
          {/* Con el envío en marcha no se sale: el cliente creería que lo
              canceló, y la solicitud se crearía igual. */}
          <BotonIcono
            icono="close"
            onPress={volver}
            accessibilityLabel="Salir de la solicitud"
            tamano={18}
          />
          <View style={s.pasos} accessibilityLabel={`${completos} de 2 pasos`}>
            <Text style={s.pasosTexto}>{completos} de 2</Text>
            <Segmentos total={2} completos={completos} />
          </View>
          <View style={{ width: 44 }} />
        </View>

        <TituloPantalla tamano={31} style={s.titulo}>
          Nueva solicitud
        </TituloPantalla>

        {/* ── 1 · Tarjeta ── */}
        <Etiqueta style={s.etiqueta}>1 · ¿Con qué tarjeta?</Etiqueta>
        {tarjetas.length === 0 ? (
          <Tarjeta style={s.sinTarjetas}>
            <Text style={s.sinTarjetasTitulo}>Aún no tienes tarjetas verificadas</Text>
            <Boton
              titulo="Registrar tarjeta"
              onPress={() => router.push("/tarjeta-nueva")}
              style={{ height: 48 }}
            />
          </Tarjeta>
        ) : (
          tarjetas.map((t) => {
            const activa = tarjetaSeleccionada?.id === t.id;
            const sinCuenta = activa && !tieneCuentaDelBanco;
            return (
              <Aparece key={t.id + (activa ? "-a" : "")}>
                <Toque
                  onPress={() => !ocupado && setTarjetaSeleccionada(activa ? null : t)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activa, disabled: ocupado }}
                  accessibilityLabel={`Tarjeta ${bancoDe(t.banco).name} terminada en ${t.ultimos_4}`}
                  style={[s.opcion, activa && s.opcionActiva]}
                >
                  <View style={s.opcionFila}>
                    <BankBadge bank={t.banco} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.opcionDigitos}>···· {t.ultimos_4}</Text>
                      {activa && lineaDeposito ? (
                        <View style={s.opcionDeposito}>
                          <BankIcon size={13} color={colors.successText} />
                          <Text style={s.opcionDepositoTexto} numberOfLines={1}>
                            {lineaDeposito}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[s.radio, activa && s.radioActivo]} />
                  </View>

                  {/* Bloqueo dentro de la misma tarjeta: lo que falta y
                      el botón para resolverlo, sin mandar a buscar. */}
                  {sinCuenta ? (
                    <View style={s.bloqueo}>
                      <BankIcon size={20} color={colors.errorText} />
                      <Text style={s.bloqueoTexto}>
                        {esBancoPrincipal(bancoTarjeta)
                          ? `Necesitas una cuenta ${bancoDe(bancoTarjeta).name}`
                          : "Necesitas una cuenta de ahorros"}
                      </Text>
                      <Toque
                        // Se abre encima y al guardar vuelve aquí: la
                        // solicitud recarga sus cuentas al recuperar el foco.
                        onPress={() =>
                          router.push({
                            pathname: "/cuenta-nueva",
                            params: esBancoPrincipal(bancoTarjeta)
                              ? { banco: bancoTarjeta, tipo: "ahorros" }
                              : { tipo: "ahorros" },
                          })
                        }
                        accessibilityLabel={falta?.titulo || "Agregar cuenta"}
                        style={s.bloqueoBoton}
                      >
                        <Text style={s.bloqueoBotonTexto}>Agregar</Text>
                      </Toque>
                    </View>
                  ) : null}
                </Toque>
              </Aparece>
            );
          })
        )}

        {/* ── 2 · Comprobante ── */}
        <Etiqueta style={[s.etiqueta, { paddingTop: 10 }]}>2 · Comprobante</Etiqueta>
        {procesando ? (
          <Tarjeta style={[s.voucherVacio, { borderStyle: "solid" }]}>
            <ActivityIndicator color={colors.navy} />
            <Text style={s.voucherTexto}>Preparando la imagen…</Text>
          </Tarjeta>
        ) : comprobante ? (
          <Aparece key={comprobante.uri}>
            <Tarjeta style={s.voucher}>
              {/* Se ve entero (contain): el gestor lo va a leer así, y la
                  persona tiene que poder confirmar que se lee. */}
              <View style={s.voucherMarco}>
                <Image
                  source={{ uri: comprobante.uri }}
                  style={s.voucherImagen}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={s.voucherPie}>
                <View style={s.voucherListo}>
                  <Ionicons name="checkmark" size={14} color={colors.successText} />
                  <Text style={s.voucherListoTexto}>Comprobante listo</Text>
                </View>
                <Toque
                  onPress={() => setCambiarFoto(true)}
                  disabled={ocupado}
                  accessibilityLabel="Cambiar comprobante"
                  style={s.voucherCambiar}
                >
                  <Ionicons name="swap-horizontal" size={15} color={colors.text} />
                  <Text style={s.voucherCambiarTexto}>Cambiar</Text>
                </Toque>
              </View>
            </Tarjeta>
          </Aparece>
        ) : (
          <View style={s.voucherOpciones}>
            <Toque
              onPress={() => elegirFoto(true)}
              disabled={ocupado}
              accessibilityLabel="Tomar foto del voucher"
              style={s.voucherVacio}
            >
              <View style={s.camara}>
                <Ionicons name="camera-outline" size={22} color={colors.gold} />
              </View>
              <Text style={s.voucherTexto}>Tomar foto</Text>
              <Text style={s.voucherDetalle}>Del voucher impreso</Text>
            </Toque>
            <Toque
              onPress={() => elegirFoto(false)}
              disabled={ocupado}
              accessibilityLabel="Elegir comprobante de la galería"
              style={s.voucherVacio}
            >
              <View style={s.camara}>
                <Ionicons name="images-outline" size={22} color={colors.gold} />
              </View>
              <Text style={s.voucherTexto}>Galería</Text>
              <Text style={s.voucherDetalle}>Foto o captura</Text>
            </Toque>
          </View>
        )}

        {/* ── Nota · opcional ── */}
        <Etiqueta style={[s.etiqueta, { paddingTop: 10 }]}>Nota · opcional</Etiqueta>
        {/* El borde del foco va en la caja de afuera: cambiar el estilo
            del propio TextInput al enfocarlo le quita el foco en Android. */}
        <View style={[s.notaCaja, notaEnfocada && s.notaEnfocada]}>
        <TextInput
          style={s.nota}
          placeholder="Algo que debamos saber"
          value={nota}
          onChangeText={(v) => setNota(v.slice(0, MAX_NOTA))}
          onFocus={() => setNotaEnfocada(true)}
          onBlur={() => setNotaEnfocada(false)}
          multiline
          maxLength={MAX_NOTA}
          editable={!ocupado}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Nota opcional"
        />
        </View>
        {nota.length > MAX_NOTA * 0.8 ? (
          <Text style={s.contador}>
            {nota.length} / {MAX_NOTA}
          </Text>
        ) : null}
      </ScrollView>

      {/* Barra fija con el envío. Se oculta con el teclado abierto: en
          Android la pantalla se encoge y la barra taparía la nota. */}
      {altoTeclado === 0 ? (
        <BarraFija>
          <Boton
            variante="dinero"
            titulo="Enviar solicitud"
            icono="arrow-forward"
            onPress={alPresionarEnviar}
            deshabilitado={Boolean(motivoEnvio)}
            motivo={motivoEnvio}
            style={{ height: 58 }}
          />
        </BarraFija>
      ) : null}

      {/* ── Salir con el comprobante cargado: hoja desde abajo ── */}
      <Modal
        visible={Boolean(salida)}
        transparent
        animationType={reducir ? "none" : "fade"}
        // El botón atrás con el aviso abierto lo cierra y se queda: es la
        // opción segura.
        onRequestClose={() => setSalida(null)}
        statusBarTranslucent
      >
        <Pressable style={s.veloAbajo} onPress={() => setSalida(null)}>
          <Animated.View style={{ transform: [{ translateY: arrastreSalida.y }] }}>
          <Pressable
            onPress={() => {}}
            style={[s.hojaSalida, { paddingBottom: insets.bottom + 30 }]}
            accessibilityRole="alert"
          >
            <View {...arrastreSalida.gestos} style={{ gap: 14 }}>
              <View
                style={{ alignItems: "center", paddingVertical: 8, marginVertical: -8 }}
                accessibilityRole="button"
                accessibilityLabel="Seguir aquí"
                accessibilityHint="Desliza hacia abajo para cerrar el aviso"
                onAccessibilityTap={() => setSalida(null)}
              >
                <View style={s.asa} />
              </View>
              <Text style={s.dialogoTitulo}>¿Salir de la solicitud?</Text>
            </View>
            {/* Solo texto: el aviso no vuelve a cargar la imagen ni repite
                la nota. Basta con decir qué se pierde. */}
            <Text style={s.dialogoTexto}>
              {comprobante && nota.trim()
                ? "Perderás el comprobante y la nota."
                : comprobante
                  ? "Perderás el comprobante que cargaste."
                  : "Perderás la nota que escribiste."}
            </Text>
            <View style={s.dialogoBotones}>
              <Boton variante="peligro" titulo="Salir" onPress={confirmarSalida} style={s.dialogoBoton} />
              <Boton titulo="Seguir aquí" onPress={() => setSalida(null)} style={s.dialogoBoton} />
            </View>
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ── Alerta urgente antes de enviar ── */}
      <Modal
        visible={Boolean(urgentes?.length)}
        transparent
        animationType={reducir ? "none" : "fade"}
        onRequestClose={() => setUrgentes(null)}
        statusBarTranslucent
      >
        <View style={s.veloCentro}>
          <View style={s.dialogo} accessibilityRole="alert">
            <View style={s.dialogoRojo}>
              <Ionicons name="warning-outline" size={22} color={colors.white} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.dialogoRojoSello}>
                  {urgentes?.length > 1 ? "ALERTAS URGENTES ACTIVAS" : "ALERTA URGENTE ACTIVA"}
                </Text>
                <Text style={s.dialogoRojoTitulo} numberOfLines={2}>
                  {urgentes?.[0]?.titulo}
                </Text>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={s.dialogoCuerpo}>
              {(urgentes || []).map((a, i) => (
                <View key={a.id} style={{ gap: 4 }}>
                  {i > 0 ? <Text style={s.dialogoAlertaTitulo}>{a.titulo}</Text> : null}
                  {a.mensaje ? <Text style={s.dialogoTexto}>{a.mensaje}</Text> : null}
                  <Text style={s.dialogoFecha}>{haceCuanto(a.fecha_inicio)}</Text>
                </View>
              ))}
              <Text style={s.dialogoPregunta}>¿Enviar de todos modos?</Text>
              <Text style={s.dialogoTexto}>Tu depósito podría demorar más.</Text>
            </ScrollView>
            <View style={[s.dialogoBotones, { paddingHorizontal: 20, paddingBottom: 20 }]}>
              <Boton
                variante="contorno"
                titulo="Esperar"
                onPress={() => setUrgentes(null)}
                style={s.dialogoBoton}
              />
              <Boton titulo="Enviar" onPress={continuarPeseAlerta} style={s.dialogoBoton} />
            </View>
          </View>
        </View>
      </Modal>

      <HojaFoto
        visible={cambiarFoto}
        titulo="Cambiar comprobante"
        ayuda="Que se lean el monto y el número de operación."
        onCerrar={() => setCambiarFoto(false)}
        onPreparando={setProcesando}
        onFoto={setComprobante}
      />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  contenido: { paddingHorizontal: 16, gap: 12 },

  arriba: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pasos: { flexDirection: "row", alignItems: "center", gap: 10 },
  pasosTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.text2 },
  titulo: { marginTop: 12, marginHorizontal: 6, marginBottom: 6 },
  etiqueta: { paddingHorizontal: 6 },

  sinTarjetas: { borderRadius: 22, padding: 16, gap: 12 },
  sinTarjetasTitulo: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },

  opcion: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  opcionActiva: { borderWidth: 2, borderColor: colors.navy },
  opcionFila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  opcionDigitos: { fontFamily: fonts.strong, fontSize: 15, letterSpacing: 0.6, color: colors.text },
  opcionDeposito: { flexDirection: "row", alignItems: "center", gap: 4 },
  opcionDepositoTexto: { flex: 1, fontFamily: fonts.label, fontSize: 12, color: colors.successText },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#D8D1C1" },
  radioActivo: { borderWidth: 7, borderColor: colors.navy },

  bloqueo: {
    marginHorizontal: 10,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.errorBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bloqueoTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 13, color: "#6A1A14" },
  bloqueoBoton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  bloqueoBotonTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.white },

  voucherOpciones: { flexDirection: "row", gap: 10 },
  voucherVacio: {
    flex: 1,
    height: 132,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C9BE9E",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  camara: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  voucherTexto: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  voucherDetalle: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  voucher: { borderRadius: 22, padding: 10, gap: 10 },
  voucherMarco: {
    height: 260,
    borderRadius: 16,
    backgroundColor: colors.ground,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  voucherImagen: { width: "100%", height: "100%" },
  voucherPie: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  voucherListo: { flexDirection: "row", alignItems: "center", gap: 6 },
  voucherListoTexto: { fontFamily: fonts.strong, fontSize: 14, color: colors.successText },
  voucherCambiar: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.ground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  voucherCambiarTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text },

  notaCaja: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    // Grosor fijo: al enfocar solo cambia el color.
    borderWidth: 2,
    borderColor: colors.line,
  },
  nota: {
    minHeight: 72,
    maxHeight: 140,
    padding: 13,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },
  notaEnfocada: { borderColor: colors.navy },
  contador: {
    alignSelf: "flex-end",
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text3,
    fontVariant: ["tabular-nums"],
  },

  // Diálogos
  veloAbajo: { flex: 1, backgroundColor: "rgba(15,27,51,0.45)", justifyContent: "flex-end" },
  veloCentro: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  hojaSalida: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 14,
  },
  asa: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#DCD6C8" },
  dialogo: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 16,
  },
  dialogoRojo: {
    backgroundColor: colors.errorStrong,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dialogoRojoSello: {
    fontFamily: fonts.heavy,
    fontSize: 11,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.9)",
  },
  dialogoRojoTitulo: { fontFamily: fonts.heavy, fontSize: 16, color: colors.white },
  dialogoCuerpo: { padding: 20, gap: 12 },
  dialogoAlertaTitulo: { fontFamily: fonts.strong, fontSize: 14, color: colors.text },
  dialogoFecha: { fontFamily: fonts.body, fontSize: 12, color: colors.text3 },
  dialogoTitulo: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24, color: colors.text },
  dialogoPregunta: { fontFamily: fonts.display, fontSize: 19, lineHeight: 22, color: colors.text, marginTop: 4 },
  dialogoTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 },
  dialogoBotones: { flexDirection: "row", gap: 8 },
  dialogoBoton: { flex: 1, height: 52 },

  // Enviada
  enviada: {
    flex: 1,
    backgroundColor: colors.night,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  enviadaCentro: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 },
  anillo: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  checkOro: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  enviadaTitulo: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.white, textAlign: "center" },
  enviadaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(195,211,247,0.18)",
  },
  enviadaChipTexto: { fontFamily: fonts.heavy, fontSize: 13, color: "#C3D3F7" },
  enviadaTexto: { fontFamily: fonts.body, fontSize: 14, color: "rgba(255,255,255,0.72)" },
  volverInicio: { height: 56, alignItems: "center", justifyContent: "center" },
  volverInicioTexto: { fontFamily: fonts.strong, fontSize: 16, color: colors.white },
});
