import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { useRouter, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import TIPO, { CIFRAS } from "../src/theme/tipografia";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { pedirPermiso } from "../src/lib/permisos";
import { prepararImagen } from "../src/lib/imagen";
import { esFalloDeRed } from "../src/lib/conexion";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { Esqueleto, Aparece } from "../src/components/Cargando";
import CabeceraFlujo from "../src/components/CabeceraFlujo";
import { useAlturaTeclado } from "../src/lib/teclado";
import { alertasUrgentes, marcarVistas } from "../src/lib/alertas";

const BUCKET = "comprobantes";
const MAX_NOTA = 300;

/** Opciones del selector. El base64 lo entrega prepararImagen, ya achicada. */
const OPCIONES_FOTO = {
  mediaTypes: ["images"],
  quality: 1,
  allowsEditing: true,
};

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

// ── Piezas ────────────────────────────────────────────────────

/**
 * Encabezado de un paso. El numero se vuelve una marca verde al
 * completarse: el cliente ve de un vistazo que le falta, sin leer.
 */
function EncabezadoPaso({ numero, titulo, detalle, listo, opcional }) {
  return (
    <View style={s.pasoCabecera}>
      <View style={[s.pasoNumero, listo && s.pasoNumeroListo]}>
        {listo ? (
          <Ionicons name="checkmark" size={15} color={COLORS.white} />
        ) : (
          <Text style={s.pasoNumeroTexto}>{numero}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.pasoTituloFila}>
          <Text style={s.pasoTitulo}>{titulo}</Text>
          {opcional && <Text style={s.opcional}>Opcional</Text>}
        </View>
        {detalle ? <Text style={s.pasoDetalle}>{detalle}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Tarjeta elegible, dibujada como una tarjeta de verdad. Se hunde un
 * poco al presionarla: la respuesta llega antes de soltar el dedo.
 */
function TarjetaMini({ tarjeta, activa, onPress, disabled }) {
  const escala = useRef(new Animated.Value(1)).current;
  const animar = (valor) =>
    Animated.spring(escala, {
      toValue: valor,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animar(0.95)}
      onPressOut={() => animar(1)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa, disabled }}
      accessibilityLabel={`Tarjeta ${tarjeta.banco} terminada en ${tarjeta.ultimos_4}`}
    >
      <Animated.View
        style={[
          s.tarjeta,
          activa && s.tarjetaActiva,
          { transform: [{ scale: escala }] },
        ]}
      >
        <View style={s.tarjetaBrillo} />
        <View style={s.tarjetaArriba}>
          <Text style={s.tarjetaBanco} numberOfLines={1}>
            {tarjeta.banco}
          </Text>
          <View style={s.tarjetaChip} />
        </View>
        <Text style={s.tarjetaNumero}>•••• {tarjeta.ultimos_4}</Text>

        {activa && (
          <View style={s.tarjetaCheck}>
            <Ionicons name="checkmark" size={13} color={COLORS.primaryDark} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function NuevaSolicitudScreen() {
  const [perfil, setPerfil] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [nota, setNota] = useState("");
  const [notaEnfocada, setNotaEnfocada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // Alertas urgentes que hay que mostrar antes de enviar. null: sin modal.
  const [urgentes, setUrgentes] = useState(null);
  // Candado contra el doble toque. El estado de React tarda un render en
  // deshabilitar el boton, y en ese intervalo un segundo toque lanzaba
  // otra verificacion y otro envio.
  const enCurso = useRef(false);
  // Solo la primera carga muestra el esqueleto. Al volver a esta
  // pantalla se refresca en silencio: tapar con esqueletos un formulario
  // ya lleno haria parpadear lo que el cliente estaba haciendo.
  const yaCargo = useRef(false);

  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const router = useRouter();
  const navigation = useNavigation();

  const listo = Boolean(tarjetaSeleccionada && comprobante);
  const ocupado = enviando || verificando;

  // ── Salir sin perder lo cargado ──
  //
  // Lo que cuesta rehacer es el comprobante (volver a fotografiarlo) y
  // la nota. La tarjeta no cuenta: se elige con un toque, y si el
  // cliente tiene una sola ya viene elegida sin que haya hecho nada.
  const tieneDatos = Boolean(comprobante) || nota.trim().length > 0;

  // Salida pendiente de confirmar: { continuar } o null.
  const [salida, setSalida] = useState(null);
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
    if (tieneDatos) setSalida({ continuar: irse });
    else irse();
  }

  // Barra de avance: se llena a medida que se completan los pasos
  // obligatorios. Anima el ancho, asi que no puede usar el driver nativo.
  const avance = useRef(new Animated.Value(0)).current;
  const completos = (tarjetaSeleccionada ? 1 : 0) + (comprobante ? 1 : 0);
  useEffect(() => {
    Animated.timing(avance, {
      toValue: completos / 2,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [completos, avance]);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, []),
  );

  async function cargarDatos() {
    if (!yaCargo.current) setCargando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!perfilData) return;
      setPerfil(perfilData);

      const { data: tarjetasData, error } = await supabase
        .from("tarjetas")
        .select("id, banco, ultimos_4")
        .eq("cliente_id", perfilData.id)
        .eq("activa", true)
        .eq("estado", "aprobado")
        .order("created_at", { ascending: false });
      if (error) {
        mostrar(mensajeError(error), "error");
        return;
      }
      const lista = tarjetasData || [];
      setTarjetas(lista);

      // Si la tarjeta elegida ya no esta disponible, se limpia. Y si solo
      // hay una, se elige sola: preguntar cuando no hay nada que decidir
      // es un paso de mas.
      setTarjetaSeleccionada((actual) => {
        if (actual && lista.some((t) => t.id === actual.id)) return actual;
        return lista.length === 1 ? lista[0] : null;
      });
    } finally {
      yaCargo.current = true;
      setCargando(false);
    }
  }

  async function elegirFoto(desdeCamara) {
    if (ocupado || procesando) return;
    if (!(await pedirPermiso(desdeCamara ? "camara" : "galeria"))) return;
    const r = desdeCamara
      ? await ImagePicker.launchCameraAsync(OPCIONES_FOTO)
      : await ImagePicker.launchImageLibraryAsync(OPCIONES_FOTO);
    if (r.canceled || !r.assets?.[0]) return;

    // Reducir una foto de camara tarda un momento: sin indicador, parece
    // que el toque no hizo nada y el cliente vuelve a intentarlo.
    setProcesando(true);
    try {
      const lista = await prepararImagen(r.assets[0]);
      if (!lista?.base64) {
        mostrar("No pudimos leer la imagen. Inténtalo otra vez.", "error");
        return;
      }
      setComprobante(lista);
    } finally {
      setProcesando(false);
    }
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

      mostrar(`Solicitud ${codigo} enviada`, "exito");
      // Ya se envio: el comprobante sigue en el estado, pero no hay nada
      // que perder, asi que no debe saltar el aviso de salida.
      salidaPermitida.current = true;
      // dismissTo y no replace. Esta pantalla esta encima de las
      // pestanas; replace creaba una segunda copia de ellas, con una
      // segunda burbuja de alertas escuchando el mismo canal, y eso
      // tumbaba el app justo al enviar.
      router.dismissTo("/(tabs)/solicitudes");
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

  // ── Carga ──
  if (cargando) {
    return (
      <View style={s.pantalla}>
        <CabeceraFlujo
          titulo="Nueva solicitud"
          subtitulo="Envía tu comprobante"
        />
        <View style={s.contenido}>
          <Esqueleto alto={150} radio={16} />
          <Esqueleto alto={190} radio={16} estilo={{ marginTop: 14 }} />
          <Esqueleto alto={110} radio={16} estilo={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  const textoBoton = verificando
    ? "Verificando…"
    : enviando
      ? "Enviando…"
      : "Enviar solicitud";

  return (
    <View style={s.pantalla}>
      <CabeceraFlujo
        titulo="Nueva solicitud"
        subtitulo="Envía tu comprobante"
        // Con el envio en marcha no se sale: el cliente creeria que lo
        // cancelo, y la solicitud se crearia igual.
        volverDeshabilitado={ocupado}
        onVolver={volver}
      >
        <View style={s.avanceFila}>
          <View style={s.avancePista}>
            <Animated.View
              style={[
                s.avanceRelleno,
                {
                  width: avance.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={s.avanceTexto}>
            {completos === 2 ? "Listo para enviar" : `${completos} de 2 pasos`}
          </Text>
        </View>
      </CabeceraFlujo>

      <ScrollView
        contentContainerStyle={[
          s.contenido,
          { paddingBottom: 24 + altoTeclado },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Paso 1: tarjeta ── */}
        <Aparece retraso={80}>
          <View style={s.bloque}>
            <EncabezadoPaso
              numero={1}
              titulo="¿Con qué tarjeta hiciste la operación?"
              detalle="Solo aparecen tus tarjetas verificadas."
              listo={Boolean(tarjetaSeleccionada)}
            />

            {tarjetas.length === 0 ? (
              <View style={s.sinTarjetas}>
                <Ionicons
                  name="card-outline"
                  size={26}
                  color={COLORS.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.sinTarjetasTitulo}>
                    Aún no tienes tarjetas verificadas
                  </Text>
                  <Text style={s.sinTarjetasTexto}>
                    Regístrala primero. La verificamos en pocas horas.
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.sinTarjetasBtn}
                  onPress={() => router.dismissTo("/(tabs)/tarjetas")}
                >
                  <Text style={s.sinTarjetasBtnTexto}>Registrar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tarjetasFila}
                // Las tarjetas quedan pegadas al borde del bloque, sin
                // que el padding corte la sombra de la primera.
                style={s.tarjetasScroll}
              >
                {tarjetas.map((t) => {
                  const activa = tarjetaSeleccionada?.id === t.id;
                  return (
                    <TarjetaMini
                      key={t.id}
                      tarjeta={t}
                      activa={activa}
                      disabled={ocupado}
                      onPress={() => setTarjetaSeleccionada(activa ? null : t)}
                    />
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Aparece>

        {/* ── Paso 2: comprobante ── */}
        <Aparece retraso={160}>
          <View style={s.bloque}>
            <EncabezadoPaso
              numero={2}
              titulo="Adjunta el comprobante"
              detalle="Foto clara del voucher o captura de la transferencia."
              listo={Boolean(comprobante)}
            />

            {procesando ? (
              <View style={[s.zona, s.zonaCentro]}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={s.zonaAyuda}>Preparando la imagen…</Text>
              </View>
            ) : comprobante ? (
              <Aparece key={comprobante.uri}>
                <View style={s.vista}>
                  <Image
                    source={{ uri: comprobante.uri }}
                    style={s.vistaImagen}
                    resizeMode="contain"
                  />
                  <View style={s.vistaListo}>
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={COLORS.success}
                    />
                    <Text style={s.vistaListoTexto}>Comprobante listo</Text>
                  </View>
                </View>
                <View style={s.vistaAcciones}>
                  <TouchableOpacity
                    style={s.vistaAccion}
                    onPress={() => elegirFoto(true)}
                    disabled={ocupado}
                  >
                    <Ionicons
                      name="camera-outline"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={s.vistaAccionTexto}>Otra foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.vistaAccion}
                    onPress={() => elegirFoto(false)}
                    disabled={ocupado}
                  >
                    <Ionicons
                      name="images-outline"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={s.vistaAccionTexto}>Galería</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.vistaAccion}
                    onPress={() => setComprobante(null)}
                    disabled={ocupado}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={COLORS.error}
                    />
                    <Text style={[s.vistaAccionTexto, { color: COLORS.error }]}>
                      Quitar
                    </Text>
                  </TouchableOpacity>
                </View>
              </Aparece>
            ) : (
              <View style={s.zona}>
                <View style={s.zonaIcono}>
                  <Ionicons
                    name="receipt-outline"
                    size={26}
                    color={COLORS.primaryLight}
                  />
                </View>
                <Text style={s.zonaAyuda}>
                  Que se lean el monto, la fecha y el número de operación.
                </Text>
                <View style={s.zonaBotones}>
                  <TouchableOpacity
                    style={[s.zonaBtn, s.zonaBtnPrincipal]}
                    onPress={() => elegirFoto(true)}
                    disabled={ocupado}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="camera" size={18} color={COLORS.white} />
                    <Text style={s.zonaBtnPrincipalTexto}>Tomar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.zonaBtn}
                    onPress={() => elegirFoto(false)}
                    disabled={ocupado}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="images-outline"
                      size={18}
                      color={COLORS.primary}
                    />
                    <Text style={s.zonaBtnTexto}>Galería</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Aparece>

        {/* ── Paso 3: nota ── */}
        <Aparece retraso={240}>
          <View style={s.bloque}>
            <EncabezadoPaso
              numero={3}
              titulo="Nota adicional"
              detalle="Algo que debamos saber sobre la operación."
              listo={Boolean(nota.trim())}
              opcional
            />
            <TextInput
              style={[s.nota, notaEnfocada && s.notaEnfocada]}
              placeholder="Ej: la hice desde la app del banco a las 3 p. m."
              value={nota}
              onChangeText={(v) => setNota(v.slice(0, MAX_NOTA))}
              onFocus={() => setNotaEnfocada(true)}
              onBlur={() => setNotaEnfocada(false)}
              multiline
              maxLength={MAX_NOTA}
              editable={!ocupado}
              placeholderTextColor={COLORS.textLight}
            />
            <Text
              style={[
                s.contador,
                nota.length > MAX_NOTA * 0.9 && { color: COLORS.warning },
              ]}
            >
              {nota.length} / {MAX_NOTA}
            </Text>
          </View>
        </Aparece>
      </ScrollView>

      {/* ── Pie fijo con el envío ──
          Se oculta con el teclado abierto: en Android la pantalla se
          encoge y el pie taparia justo la nota que se esta escribiendo. */}
      {altoTeclado === 0 && (
        <View style={s.pie}>
          <View style={s.pieResumen}>
            <Ionicons
              name={listo ? "checkmark-circle" : "information-circle-outline"}
              size={16}
              color={listo ? COLORS.success : COLORS.textLight}
            />
            <Text style={s.pieResumenTexto} numberOfLines={1}>
              {listo
                ? `${tarjetaSeleccionada.banco} •••• ${tarjetaSeleccionada.ultimos_4} · comprobante adjunto`
                : !tarjetaSeleccionada && !comprobante
                  ? "Elige la tarjeta y adjunta el comprobante"
                  : !tarjetaSeleccionada
                    ? "Falta elegir la tarjeta"
                    : "Falta adjuntar el comprobante"}
            </Text>
          </View>

          <TouchableOpacity
            style={[s.btnEnviar, (!listo || ocupado) && s.btnDeshabilitado]}
            onPress={alPresionarEnviar}
            disabled={!listo || ocupado || procesando}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !listo || ocupado }}
          >
            {ocupado ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons
                name="paper-plane"
                size={17}
                color={listo ? COLORS.white : COLORS.textLight}
              />
            )}
            <Text style={[s.btnEnviarTexto, !listo && !ocupado && s.btnEnviarTextoOff]}>
              {textoBoton}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Aviso al salir con informacion cargada ── */}
      <Modal
        visible={Boolean(salida)}
        transparent
        animationType="fade"
        // El boton atras con el aviso abierto lo cierra y se queda: es
        // la opcion segura.
        onRequestClose={() => setSalida(null)}
      >
        <View style={s.modalFondo}>
          <View style={s.modalCaja}>
            <View style={[s.modalIcono, { backgroundColor: COLORS.warningLight }]}>
              <Ionicons name="alert-circle" size={28} color={COLORS.warning} />
            </View>
            <Text style={s.modalTitulo}>¿Salir sin enviar?</Text>
            {/* Solo texto: el aviso no vuelve a cargar la imagen ni repite
                la nota. Basta con decir que se pierde. */}
            <Text style={[s.modalTexto, s.salidaTexto]}>
              Tu solicitud todavía no se envió.{" "}
              {comprobante && nota.trim()
                ? "Si sales, se perderán el comprobante y la nota que agregaste."
                : comprobante
                  ? "Si sales, se perderá el comprobante y tendrás que volver a subirlo."
                  : "Si sales, se perderá la nota que escribiste."}
            </Text>

            {/* La opcion segura va primero y es la mas visible. */}
            <TouchableOpacity
              style={s.modalBtn}
              onPress={() => setSalida(null)}
              activeOpacity={0.85}
            >
              <Text style={s.modalBtnText}>Seguir con mi solicitud</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modalBtnSecundario}
              onPress={confirmarSalida}
            >
              <Text style={[s.modalBtnSecundarioText, { color: COLORS.error }]}>
                Salir y descartar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Alerta urgente antes de enviar ── */}
      <Modal
        visible={Boolean(urgentes?.length)}
        transparent
        animationType="fade"
        onRequestClose={() => setUrgentes(null)}
      >
        <View style={s.modalFondo}>
          <View style={s.modalCaja}>
            <View style={s.modalIcono}>
              <Ionicons name="warning" size={26} color={COLORS.error} />
            </View>
            <Text style={s.modalTitulo}>
              {urgentes?.length > 1
                ? "Hay avisos urgentes"
                : "Hay un aviso urgente"}
            </Text>
            <Text style={s.modalTexto}>Léelo antes de enviar tu solicitud.</Text>

            <ScrollView
              style={s.modalLista}
              contentContainerStyle={{ gap: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {(urgentes || []).map((a) => (
                <View key={a.id} style={s.modalAlerta}>
                  <Text style={s.modalAlertaTitulo}>{a.titulo}</Text>
                  <Text style={s.modalAlertaMensaje}>{a.mensaje}</Text>
                  <Text style={s.modalAlertaFecha}>
                    {haceCuanto(a.fecha_inicio)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={s.modalBtn}
              onPress={continuarPeseAlerta}
              activeOpacity={0.85}
            >
              <Text style={s.modalBtnText}>Enviar de todas formas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modalBtnSecundario}
              onPress={() => setUrgentes(null)}
            >
              <Text style={s.modalBtnSecundarioText}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  contenido: { padding: 20, gap: 14 },

  // Avance, dentro de la cabecera
  avanceFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avancePista: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  avanceRelleno: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
  },
  avanceTexto: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    ...CIFRAS,
  },

  // Bloques de paso
  bloque: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pasoCabecera: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  pasoNumero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  pasoNumeroListo: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  pasoNumeroTexto: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  pasoTituloFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  pasoTitulo: { ...TIPO.tarjeta, flexShrink: 1 },
  pasoDetalle: { ...TIPO.apoyo, marginTop: 2 },
  opcional: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.textLight,
    backgroundColor: COLORS.inputBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },

  // Tarjetas
  tarjetasScroll: { marginHorizontal: -16 },
  tarjetasFila: { paddingHorizontal: 16, gap: 10, paddingVertical: 2 },
  tarjeta: {
    width: 150,
    height: 92,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    padding: 12,
    justifyContent: "space-between",
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  tarjetaActiva: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.secondary,
  },
  tarjetaBrillo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    bottom: -60,
    right: -30,
  },
  tarjetaArriba: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tarjetaBanco: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
    flexShrink: 1,
  },
  tarjetaChip: {
    width: 22,
    height: 16,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
    opacity: 0.85,
  },
  tarjetaNumero: {
    fontSize: 14,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.9)",
    ...CIFRAS,
  },
  tarjetaCheck: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },

  sinTarjetas: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.warningLight,
    borderRadius: 12,
    padding: 13,
  },
  sinTarjetasTitulo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  sinTarjetasTexto: { ...TIPO.apoyo, fontSize: 12, marginTop: 1 },
  sinTarjetasBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sinTarjetasBtnTexto: { color: COLORS.white, fontSize: 13, fontWeight: "700" },

  // Comprobante
  zona: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
    padding: 18,
    alignItems: "center",
  },
  zonaCentro: { minHeight: 170, justifyContent: "center", gap: 10 },
  zonaIcono: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  zonaAyuda: { ...TIPO.apoyo, textAlign: "center", marginTop: 10 },
  zonaBotones: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    alignSelf: "stretch",
  },
  zonaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 11,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  zonaBtnPrincipal: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  zonaBtnTexto: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  zonaBtnPrincipalTexto: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
  },

  vista: {
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
    overflow: "hidden",
  },
  vistaImagen: { width: "100%", height: 240 },
  vistaListo: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  vistaListoTexto: { fontSize: 11, fontWeight: "700", color: COLORS.success },
  vistaAcciones: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  vistaAccion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  vistaAccionTexto: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  // Nota
  nota: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: "top",
  },
  notaEnfocada: {
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.card,
  },
  contador: { ...TIPO.micro, textAlign: "right", marginTop: 6, ...CIFRAS },

  // Pie
  pie: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 10,
  },
  pieResumen: { flexDirection: "row", alignItems: "center", gap: 6 },
  pieResumenTexto: { ...TIPO.micro, flex: 1, color: COLORS.textSecondary },
  btnEnviar: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  btnDeshabilitado: { backgroundColor: COLORS.border },
  btnEnviarTexto: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  btnEnviarTextoOff: { color: COLORS.textLight },

  // Modal de alerta urgente
  modalFondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.72)",
    justifyContent: "center",
    padding: 22,
  },
  modalCaja: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    maxHeight: "86%",
  },
  modalIcono: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.errorLight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginTop: 12,
  },
  modalTexto: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  modalLista: { flexGrow: 0 },
  salidaTexto: { fontSize: 14, lineHeight: 21, marginBottom: 4 },
  modalAlerta: {
    backgroundColor: COLORS.errorLight,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    padding: 13,
  },
  modalAlertaTitulo: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  modalAlertaMensaje: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  modalAlertaFecha: { fontSize: 11, color: COLORS.textLight, marginTop: 6 },
  modalBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 18,
  },
  modalBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  modalBtnSecundario: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  modalBtnSecundarioText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
});
