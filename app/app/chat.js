import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  AppState,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  abrirSesion,
  configuracion,
  leerMensajes,
  enviarMensaje,
  marcarVisto,
  calificar,
  conectar,
  avisarEscribiendo,
} from "../src/lib/chat";
import { useAviso } from "../src/components/Avisos";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { Toque } from "../src/components/ui/Toque";
import { BotonIcono } from "../src/components/ui/Piezas";
import { HojaFoto } from "../src/components/ui/HojaFoto";
import { VisorImagen } from "../src/components/ui/VisorImagen";
import { colors, fonts, radius, space, hit } from "../src/theme/tokens";

/**
 * Chat con un asesor, dentro del app.
 *
 * El cliente entra ya identificado (lib/chat.js): no escribe su nombre
 * ni su celular, y ve la misma conversación que tendría en otro teléfono.
 * Los mensajes llegan en vivo mientras la pantalla está abierta; con el
 * app cerrado, la respuesta llega como notificación.
 *
 * Fotos: se toman o se eligen con la misma hoja que el DNI y los
 * comprobantes, y viajan ya reducidas (lib/imagen.js).
 */
const LUCES = [
  { color: colors.glowGold, opacity: 0.32, size: 220, top: -80, right: -90 },
  { color: colors.glowBlue, opacity: 0.7, size: 260, bottom: -170, left: -100 },
];
const MAX_FOTOS = 4;

const hora = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
function dia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86400000);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "long" });
}

/** Encuesta al cerrar la conversación: cinco estrellas. */
function Calificacion({ mensaje, onCalificar }) {
  const [nota, setNota] = useState(mensaje.csat_rating || 0);
  const [enviando, setEnviando] = useState(false);
  async function elegir(n) {
    if (enviando) return;
    setEnviando(true);
    const anterior = nota;
    setNota(n);
    try {
      await onCalificar(mensaje.conversation_id, n);
    } catch {
      setNota(anterior);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <View style={s.encuesta}>
      <Text style={s.encuestaTexto}>{mensaje.content || "¿Cómo calificas la atención?"}</Text>
      <View style={s.estrellas} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Toque key={n} onPress={() => elegir(n)} accessibilityLabel={`${n} de 5`} accessibilityState={{ selected: nota === n }} hitSlop={6}>
            <Ionicons name={n <= nota ? "star" : "star-outline"} size={30} color={n <= nota ? colors.gold : colors.textFaint} />
          </Toque>
        ))}
      </View>
      {nota > 0 ? <Text style={s.encuestaGracias}>Gracias por tu calificación.</Text> : null}
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();

  const [estado, setEstado] = useState("cargando"); // cargando | listo | error
  const [error, setError] = useState("");
  const [ajustes, setAjustes] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [conversacion, setConversacion] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [conectado, setConectado] = useState(true);
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [hojaFoto, setHojaFoto] = useState(false);
  const [viendo, setViendo] = useState(null);
  const avisoEscribiendo = useRef(0);
  const temporizador = useRef(null);

  const agregar = useCallback((m) => {
    if (!m) return;
    setMensajes((lista) => (lista.some((x) => x.id === m.id) ? lista.map((x) => (x.id === m.id ? { ...x, ...m } : x)) : [...lista, m]));
  }, []);

  const cargar = useCallback(async () => {
    setError("");
    try {
      await abrirSesion();
      const [cfg, r] = await Promise.all([configuracion().catch(() => null), leerMensajes()]);
      setAjustes(cfg);
      setMensajes(r.messages || []);
      setConversacion(r.conversation || null);
      setBloqueado(Boolean(r.blocked));
      setEstado("listo");
      marcarVisto();
    } catch (e) {
      setError(e.message);
      setEstado((actual) => (actual === "listo" ? "listo" : "error"));
    }
  }, []);

  // Carga inicial y conexión en vivo mientras la pantalla está abierta.
  useEffect(() => {
    let desconectar = null;
    let vigente = true;
    (async () => {
      await cargar();
      if (!vigente) return;
      try {
        desconectar = await conectar((tipo, dato) => {
          if (!vigente) return;
          if (tipo === "mensaje") {
            setEscribiendo(false);
            agregar(dato);
            if (dato?.message_type !== "incoming") marcarVisto();
          } else if (tipo === "cambio") agregar(dato);
          else if (tipo === "escribiendo") {
            setEscribiendo(dato);
            clearTimeout(temporizador.current);
            if (dato) temporizador.current = setTimeout(() => setEscribiendo(false), 6000);
          } else if (tipo === "conversacion") setConversacion(dato);
          else if (tipo === "conectado") {
            setConectado(dato);
            // Al reconectar se pide lo que pudo llegar mientras tanto.
            if (dato) leerMensajes().then((r) => vigente && setMensajes(r.messages || [])).catch(() => {});
          }
        });
      } catch {
        // Sin conexión en vivo el chat sigue: se actualiza al volver a la pantalla.
      }
    })();
    // Al volver al app (estaba en segundo plano) se trae lo nuevo.
    const sub = AppState.addEventListener("change", (e) => {
      if (e === "active") leerMensajes().then((r) => vigente && (setMensajes(r.messages || []), marcarVisto())).catch(() => {});
    });
    return () => {
      vigente = false;
      clearTimeout(temporizador.current);
      sub.remove();
      desconectar?.();
    };
  }, [cargar, agregar]);

  function alEscribir(valor) {
    setTexto(valor);
    const ahora = Date.now();
    if (valor && ahora - avisoEscribiendo.current > 3000) {
      avisoEscribiendo.current = ahora;
      avisarEscribiendo(true);
    }
  }

  async function enviar() {
    const contenido = texto.trim();
    if ((!contenido && !fotos.length) || enviando) return;
    setEnviando(true);
    try {
      const r = await enviarMensaje({
        texto: contenido,
        fotos: fotos.map((f, i) => ({ uri: f.uri, nombre: `foto-${Date.now()}-${i + 1}.jpg`, tipo: "image/jpeg" })),
      });
      agregar(r.message);
      setTexto("");
      setFotos([]);
      avisarEscribiendo(false);
      avisoEscribiendo.current = 0;
    } catch (e) {
      mostrar(e.message, "error");
    } finally {
      setEnviando(false);
    }
  }

  // De más nuevo a más viejo (la lista va invertida), con el día donde cambia.
  const filas = useMemo(() => {
    const salida = [];
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const m = mensajes[i];
      salida.push({ tipo: "mensaje", id: `m${m.id}`, m });
      const anterior = mensajes[i - 1];
      if (!anterior || new Date(anterior.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
        salida.push({ tipo: "dia", id: `d${m.id}`, texto: dia(m.created_at) });
      }
    }
    return salida;
  }, [mensajes]);

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inicio"));
  const fueraDeHorario = ajustes && ajustes.within_hours === false;
  const puedeEnviar = (texto.trim().length > 0 || fotos.length > 0) && !enviando && !bloqueado;

  function fila({ item }) {
    if (item.tipo === "dia") {
      return (
        <View style={s.dia}>
          <Text style={s.diaTexto}>{item.texto}</Text>
        </View>
      );
    }
    const m = item.m;
    if (m.content_type === "csat") return <Calificacion mensaje={m} onCalificar={calificar} />;
    const mio = m.message_type === "incoming";
    const adjuntos = m.attachments || [];
    return (
      <View style={[s.mensaje, mio ? s.mensajeMio : s.mensajeSuyo]}>
        {!mio ? <Text style={s.quien}>{m.sender?.name || ajustes?.agent_name || "AlToque"}</Text> : null}
        {m.deleted ? (
          <View style={[s.burbuja, s.burbujaBorrada]}>
            <Text style={s.textoBorrado}>Este mensaje fue eliminado.</Text>
          </View>
        ) : (
          <>
            {adjuntos.map((a) =>
              a.file_type === "image" ? (
                <Toque key={a.id} onPress={() => setViendo(a.data_url)} accessibilityLabel="Ver la foto" escala={0.98}>
                  <Image source={{ uri: a.data_url }} style={s.foto} resizeMode="cover" />
                </Toque>
              ) : (
                <Toque key={a.id} onPress={() => Linking.openURL(a.data_url).catch(() => {})} accessibilityLabel={`Abrir ${a.file_name}`} style={s.archivo}>
                  <Ionicons name="document-outline" size={18} color={colors.navy} />
                  <Text style={s.archivoNombre} numberOfLines={1}>
                    {a.file_name}
                  </Text>
                </Toque>
              ),
            )}
            {m.content ? (
              <View style={[s.burbuja, mio ? s.burbujaMia : s.burbujaSuya]}>
                <Text style={[s.texto, mio && { color: colors.white }]}>{m.content}</Text>
              </View>
            ) : null}
          </>
        )}
        <Text style={s.hora}>{hora(m.created_at)}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <CabeceraNoche luces={LUCES} radio={28} style={s.cabecera}>
        <View style={s.barra}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.titulo} accessibilityRole="header" numberOfLines={1}>
              Chat con un asesor
            </Text>
            <View style={s.estadoFila}>
              <View style={[s.punto, { backgroundColor: !conectado ? colors.textFaint : fueraDeHorario ? colors.gold : colors.success }]} />
              <Text style={s.estadoTexto} numberOfLines={1}>
                {!conectado ? "Reconectando…" : fueraDeHorario ? "Fuera de horario: te respondemos al volver" : "Te respondemos por aquí"}
              </Text>
            </View>
          </View>
        </View>
      </CabeceraNoche>

      {estado === "cargando" ? (
        <View style={s.centro}>
          <ActivityIndicator color={colors.navy} />
          <Text style={s.centroTexto}>Abriendo el chat…</Text>
        </View>
      ) : estado === "error" ? (
        <View style={s.centro}>
          <View style={s.vacioIcono}>
            <Ionicons name="cloud-offline-outline" size={26} color={colors.goldText} />
          </View>
          <Text style={s.vacioTitulo}>No pudimos abrir el chat</Text>
          <Text style={s.centroTexto}>{error}</Text>
          <Toque
            onPress={() => {
              setEstado("cargando");
              cargar();
            }}
            accessibilityLabel="Reintentar"
            style={s.reintentar}
          >
            <Text style={s.reintentarTexto}>Reintentar</Text>
          </Toque>
        </View>
      ) : (
        <>
          <FlatList
            data={filas}
            inverted
            keyExtractor={(x) => x.id}
            renderItem={fila}
            contentContainerStyle={s.lista}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              escribiendo ? (
                <View style={[s.mensaje, s.mensajeSuyo]}>
                  <View style={[s.burbuja, s.burbujaSuya]}>
                    <Text style={s.escribiendo}>Escribiendo…</Text>
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              // La lista va invertida: el vacío se voltea para verse derecho.
              <View style={[s.vacio, { transform: [{ scaleY: -1 }] }]}>
                <View style={s.vacioIcono}>
                  <Ionicons name="chatbubbles-outline" size={26} color={colors.goldText} />
                </View>
                <Text style={s.vacioTitulo}>{ajustes?.welcome_title && !/hola\s*👋?$/i.test(ajustes.welcome_title) ? ajustes.welcome_title : "¿En qué te ayudamos?"}</Text>
                <Text style={s.centroTexto}>
                  {fueraDeHorario
                    ? ajustes?.out_of_office_message || "Ahora estamos fuera de horario. Déjanos tu mensaje y te respondemos al volver."
                    : "Escríbenos tu consulta. Un asesor te responde por aquí."}
                </Text>
              </View>
            }
          />

          {conversacion?.status === "resolved" && mensajes.length > 0 ? (
            <Text style={s.cerrada}>Esta conversación se cerró. Si escribes, abrimos una nueva.</Text>
          ) : null}

          <View style={[s.redactor, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
            {bloqueado ? (
              <Text style={s.cerrada}>Por ahora no puedes enviar mensajes por el chat.</Text>
            ) : (
              <>
                {fotos.length > 0 || preparando ? (
                  <View style={s.adjuntas}>
                    {fotos.map((f, i) => (
                      <View key={f.uri}>
                        <Image source={{ uri: f.uri }} style={s.miniatura} />
                        <Toque
                          onPress={() => setFotos((l) => l.filter((_, j) => j !== i))}
                          accessibilityLabel="Quitar la foto"
                          hitSlop={8}
                          style={s.quitar}
                        >
                          <Ionicons name="close" size={13} color={colors.white} />
                        </Toque>
                      </View>
                    ))}
                    {preparando ? (
                      <View style={[s.miniatura, s.miniaturaCarga]}>
                        <ActivityIndicator color={colors.navy} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={s.redactorFila}>
                  <Toque
                    onPress={() => (fotos.length >= MAX_FOTOS ? mostrar(`Puedes enviar hasta ${MAX_FOTOS} fotos por mensaje.`, "info") : setHojaFoto(true))}
                    accessibilityLabel="Adjuntar una foto"
                    style={s.adjuntar}
                  >
                    <Ionicons name="camera-outline" size={22} color={colors.navy} />
                  </Toque>
                  <TextInput
                    value={texto}
                    onChangeText={alEscribir}
                    placeholder="Escribe tu mensaje"
                    placeholderTextColor={colors.text3}
                    multiline
                    maxLength={5000}
                    style={s.campo}
                    accessibilityLabel="Mensaje"
                  />
                  <Toque
                    onPress={enviar}
                    disabled={!puedeEnviar}
                    accessibilityLabel="Enviar"
                    accessibilityState={{ disabled: !puedeEnviar, busy: enviando }}
                    style={[s.enviar, !puedeEnviar && { backgroundColor: colors.muted }]}
                  >
                    {enviando ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Ionicons name="arrow-up" size={22} color={puedeEnviar ? colors.white : colors.disabledText} />
                    )}
                  </Toque>
                </View>
              </>
            )}
          </View>
        </>
      )}

      <HojaFoto
        visible={hojaFoto}
        titulo="Enviar una foto"
        ayuda="Por ejemplo, tu comprobante o la pantalla donde tienes el problema."
        onCerrar={() => setHojaFoto(false)}
        onPreparando={setPreparando}
        onFoto={(f) => setFotos((l) => [...l, f].slice(0, MAX_FOTOS))}
      />
      {viendo ? <VisorImagen url={viendo} titulo="Foto del chat" onCerrar={() => setViendo(null)} /> : null}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: space.xl, paddingBottom: space.lg },
  barra: { flexDirection: "row", alignItems: "center", gap: space.md },
  titulo: { fontFamily: fonts.heavy, fontSize: 17, color: colors.white },
  estadoFila: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  punto: { width: 8, height: 8, borderRadius: radius.pill },
  estadoTexto: { flex: 1, fontFamily: fonts.label, fontSize: 12, color: colors.white, opacity: 0.8 },

  centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.xxxl },
  centroTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2, textAlign: "center" },
  vacio: { alignItems: "center", gap: space.sm, paddingHorizontal: space.xxl, paddingVertical: space.xxxl },
  vacioIcono: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  vacioTitulo: { fontFamily: fonts.display, fontSize: 19, color: colors.text, textAlign: "center" },
  reintentar: {
    marginTop: space.sm,
    minHeight: hit.min,
    paddingHorizontal: space.xxl,
    borderRadius: radius.lg,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  reintentarTexto: { fontFamily: fonts.heavy, fontSize: 15, color: colors.white },

  lista: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm, flexGrow: 1 },
  dia: { alignSelf: "center", backgroundColor: colors.infoBg, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 3, marginVertical: space.xs },
  diaTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.text2 },
  mensaje: { maxWidth: "82%", gap: 3 },
  mensajeMio: { alignSelf: "flex-end", alignItems: "flex-end" },
  mensajeSuyo: { alignSelf: "flex-start", alignItems: "flex-start" },
  quien: { fontFamily: fonts.strong, fontSize: 12, color: colors.text3, paddingHorizontal: space.xxs },
  burbuja: { borderRadius: radius.lg, paddingHorizontal: space.md + 2, paddingVertical: space.sm + 1 },
  burbujaMia: { backgroundColor: colors.navy, borderBottomRightRadius: radius.xs },
  burbujaSuya: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: radius.xs },
  burbujaBorrada: { borderWidth: 1, borderColor: colors.dashed, borderStyle: "dashed" },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  textoBorrado: { fontFamily: fonts.body, fontSize: 14, color: colors.text3 },
  escribiendo: { fontFamily: fonts.label, fontSize: 14, color: colors.text3 },
  hora: { fontFamily: fonts.label, fontSize: 11, color: colors.text3, paddingHorizontal: space.xxs },
  foto: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.muted },
  archivo: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: hit.min,
    maxWidth: 260,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  archivoNombre: { flexShrink: 1, fontFamily: fonts.label, fontSize: 14, color: colors.text },

  encuesta: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
    marginVertical: space.xs,
  },
  encuestaTexto: { fontFamily: fonts.strong, fontSize: 15, color: colors.text, textAlign: "center" },
  estrellas: { flexDirection: "row", gap: space.sm },
  encuestaGracias: { fontFamily: fonts.label, fontSize: 13, color: colors.successText },

  cerrada: { fontFamily: fonts.label, fontSize: 13, color: colors.text3, textAlign: "center", paddingHorizontal: space.xl, paddingVertical: space.sm },
  redactor: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm },
  redactorFila: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  adjuntar: { width: hit.min, height: hit.min, borderRadius: radius.md, backgroundColor: colors.ground, alignItems: "center", justifyContent: "center" },
  campo: {
    flex: 1,
    minHeight: hit.min,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.field,
    paddingHorizontal: space.md,
    paddingTop: Platform.OS === "ios" ? 12 : space.sm,
    paddingBottom: Platform.OS === "ios" ? 12 : space.sm,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  enviar: { width: hit.min, height: hit.min, borderRadius: radius.md, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  adjuntas: { flexDirection: "row", gap: space.sm, paddingTop: space.xxs },
  miniatura: { width: 58, height: 58, borderRadius: radius.sm, backgroundColor: colors.muted },
  miniaturaCarga: { alignItems: "center", justifyContent: "center" },
  quitar: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
});
