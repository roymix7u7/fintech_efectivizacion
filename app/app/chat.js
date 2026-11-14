import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  ActivityIndicator,
  Linking,
  AppState,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  createAudioPlayer,
} from "expo-audio";
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
import { Hoja } from "../src/components/ui/Hoja";
import { capturarFoto, esperarCierre } from "../src/components/ui/HojaFoto";
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
 * Se puede enviar texto, fotos (reducidas con lib/imagen.js, como el DNI
 * y los comprobantes), documentos y audios grabados aquí mismo. El
 * micrófono se pide recién al grabar el primer audio.
 *
 * Teclado: con Expo 57 Android dibuja de borde a borde y la ventana ya no
 * se achica sola, así que el KeyboardAvoidingView empuja el redactor en
 * los dos sistemas (si algún teléfono sí la achica, la cuenta da cero).
 */
const LUCES = [
  { color: colors.glowGold, opacity: 0.32, size: 220, top: -80, right: -90 },
  { color: colors.glowBlue, opacity: 0.7, size: 260, bottom: -170, left: -100 },
];
const MAX_ADJUNTOS = 4;
const MAX_MB = 40;

const hora = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
const reloj = (seg) => `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, "0")}`;
const peso = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
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

/** Audio de un mensaje: se carga recién al tocarlo y se suelta al terminar o al salir. */
function AudioMensaje({ url, mio }) {
  const [sonando, setSonando] = useState(false);
  const [avance, setAvance] = useState({ actual: 0, total: 0 });
  const reproductor = useRef(null);
  const escucha = useRef(null);

  const soltar = useCallback(() => {
    escucha.current?.remove?.();
    escucha.current = null;
    try {
      reproductor.current?.remove();
    } catch {}
    reproductor.current = null;
  }, []);
  useEffect(() => soltar, [soltar]);

  function alternar() {
    if (reproductor.current) {
      if (sonando) reproductor.current.pause();
      else reproductor.current.play();
      return;
    }
    const p = createAudioPlayer(url);
    reproductor.current = p;
    escucha.current = p.addListener("playbackStatusUpdate", (e) => {
      setSonando(Boolean(e.playing));
      setAvance({ actual: e.currentTime || 0, total: e.duration || 0 });
      if (e.didJustFinish) {
        setSonando(false);
        setAvance((a) => ({ actual: 0, total: a.total }));
        soltar();
      }
    });
    p.play();
  }

  const color = mio ? colors.white : colors.navy;
  const fraccion = avance.total > 0 ? Math.min(1, avance.actual / avance.total) : 0;
  return (
    <Toque
      onPress={alternar}
      accessibilityLabel={sonando ? "Pausar el audio" : "Escuchar el audio"}
      escala={0.98}
      style={[s.audio, mio ? s.burbujaMia : s.burbujaSuya]}
    >
      <Ionicons name={sonando ? "pause" : "play"} size={20} color={color} />
      <View style={[s.audioRiel, { backgroundColor: mio ? colors.navyLight : colors.track }]}>
        <View style={[s.audioAvance, { width: `${fraccion * 100}%`, backgroundColor: mio ? colors.gold : colors.navy }]} />
      </View>
      <Text style={[s.audioTiempo, { color }]}>{avance.total ? reloj(sonando || avance.actual ? avance.actual : avance.total) : "Audio"}</Text>
    </Toque>
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
  const [adjuntos, setAdjuntos] = useState([]); // { uri, nombre, tipo, clase: "foto" | "doc", peso }
  const [enviando, setEnviando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [viendo, setViendo] = useState(null);
  const [grabando, setGrabando] = useState(false);
  const avisoEscribiendo = useRef(0);
  const temporizador = useRef(null);

  const grabadora = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const grabacion = useAudioRecorderState(grabadora, 500);

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

  async function mandar({ contenido = "", archivos = [] }) {
    setEnviando(true);
    try {
      const r = await enviarMensaje({ texto: contenido, archivos });
      agregar(r.message);
      return true;
    } catch (e) {
      mostrar(e.message, "error");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function enviar() {
    const contenido = texto.trim();
    if ((!contenido && !adjuntos.length) || enviando) return;
    if (await mandar({ contenido, archivos: adjuntos.map(({ uri, nombre, tipo }) => ({ uri, nombre, tipo })) })) {
      setTexto("");
      setAdjuntos([]);
      avisarEscribiendo(false);
      avisoEscribiendo.current = 0;
    }
  }

  // ── Adjuntar: foto (cámara o galería) o documento ──
  const lleno = adjuntos.length >= MAX_ADJUNTOS;
  function abrirAdjuntar() {
    if (lleno) return mostrar(`Puedes enviar hasta ${MAX_ADJUNTOS} archivos por mensaje.`, "info");
    setHoja(true);
  }
  async function elegirFoto(desdeCamara) {
    setHoja(false);
    await esperarCierre();
    const f = await capturarFoto({ desdeCamara, onPreparando: setPreparando });
    if (f === false) return mostrar("No pudimos leer la imagen. Inténtalo otra vez.", "error");
    if (f) setAdjuntos((l) => [...l, { uri: f.uri, nombre: `foto-${Date.now()}.jpg`, tipo: "image/jpeg", clase: "foto" }].slice(0, MAX_ADJUNTOS));
  }
  async function elegirDocumento() {
    setHoja(false);
    await esperarCierre();
    try {
      const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const d = r.assets[0];
      if (d.size && d.size > MAX_MB * 1048576) return mostrar(`El archivo pesa más de ${MAX_MB} MB. Envía uno más liviano.`, "error");
      setAdjuntos((l) =>
        [...l, { uri: d.uri, nombre: d.name || "documento", tipo: d.mimeType || "application/octet-stream", clase: "doc", peso: d.size }].slice(0, MAX_ADJUNTOS),
      );
    } catch {
      mostrar("No pudimos abrir tus archivos. Inténtalo otra vez.", "error");
    }
  }

  // ── Audio: grabar aquí mismo y enviar ──
  async function empezarAudio() {
    try {
      const permiso = await requestRecordingPermissionsAsync();
      if (!permiso.granted) return mostrar("Para enviar un audio, permite el micrófono en los ajustes del teléfono.", "atencion");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await grabadora.prepareToRecordAsync();
      grabadora.record();
      setGrabando(true);
    } catch {
      mostrar("No pudimos empezar a grabar. Inténtalo otra vez.", "error");
    }
  }
  async function terminarAudio(enviarlo) {
    setGrabando(false);
    try {
      await grabadora.stop();
    } catch {}
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = grabadora.uri;
    if (!enviarlo || !uri) return;
    if ((grabacion.durationMillis || 0) < 1000) return mostrar("El audio fue muy corto. Mantén la grabación un poco más.", "info");
    await mandar({ archivos: [{ uri, nombre: `audio-${Date.now()}.m4a`, tipo: "audio/mp4" }] });
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
  const hayAlgo = texto.trim().length > 0 || adjuntos.length > 0;

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
    return (
      <View style={[s.mensaje, mio ? s.mensajeMio : s.mensajeSuyo]}>
        {!mio ? <Text style={s.quien}>{m.sender?.name || ajustes?.agent_name || "AlToque"}</Text> : null}
        {m.deleted ? (
          <View style={[s.burbuja, s.burbujaBorrada]}>
            <Text style={s.textoBorrado}>Este mensaje fue eliminado.</Text>
          </View>
        ) : (
          <>
            {(m.attachments || []).map((a) =>
              a.file_type === "image" ? (
                <Toque key={a.id} onPress={() => setViendo(a.data_url)} accessibilityLabel="Ver la foto" escala={0.98}>
                  <Image source={{ uri: a.data_url }} style={s.foto} resizeMode="cover" />
                </Toque>
              ) : a.file_type === "audio" ? (
                <AudioMensaje key={a.id} url={a.data_url} mio={mio} />
              ) : (
                <Toque key={a.id} onPress={() => Linking.openURL(a.data_url).catch(() => {})} accessibilityLabel={`Abrir ${a.file_name}`} style={s.archivo}>
                  <View style={s.archivoIcono}>
                    <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={s.archivoNombre} numberOfLines={1}>
                      {a.file_name}
                    </Text>
                    {a.file_size ? <Text style={s.archivoPeso}>{peso(a.file_size)}</Text> : null}
                  </View>
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

  const opcion = (icono, titulo, detalle, alTocar) => (
    <Toque onPress={alTocar} accessibilityLabel={titulo} style={s.opcion}>
      <View style={s.opcionIcono}>
        <Ionicons name={icono} size={21} color={colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.opcionTitulo}>{titulo}</Text>
        <Text style={s.opcionDetalle}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Toque>
  );

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior="padding">
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
          {/* Sin mensajes, la bienvenida va fuera de la lista: la lista está
              invertida y en Android voltea lo que tiene dentro. */}
          {filas.length === 0 ? (
            <View style={s.centro}>
              <View style={s.vacioIcono}>
                <Ionicons name="chatbubbles-outline" size={26} color={colors.goldText} />
              </View>
              <Text style={s.vacioTitulo}>¿En qué te ayudamos?</Text>
              <Text style={s.centroTexto}>
                {fueraDeHorario
                  ? ajustes?.out_of_office_message || "Ahora estamos fuera de horario. Déjanos tu mensaje y te respondemos al volver."
                  : "Escríbenos tu consulta. Un asesor te responde por aquí."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filas}
              inverted
              style={{ flex: 1 }}
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
            />
          )}

          {conversacion?.status === "resolved" && mensajes.length > 0 ? (
            <Text style={s.cerrada}>Esta conversación se cerró. Si escribes, abrimos una nueva.</Text>
          ) : null}

          <View style={[s.redactor, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
            {bloqueado ? (
              <Text style={s.cerrada}>Por ahora no puedes enviar mensajes por el chat.</Text>
            ) : grabando ? (
              <View style={s.redactorFila}>
                <Toque onPress={() => terminarAudio(false)} accessibilityLabel="Descartar el audio" style={s.adjuntar}>
                  <Ionicons name="trash-outline" size={21} color={colors.error} />
                </Toque>
                <View style={s.grabando} accessibilityLiveRegion="polite">
                  <View style={[s.punto, { backgroundColor: colors.errorStrong }]} />
                  <Text style={s.grabandoTexto}>Grabando {reloj((grabacion.durationMillis || 0) / 1000)}</Text>
                </View>
                <Toque onPress={() => terminarAudio(true)} accessibilityLabel="Enviar el audio" style={s.enviar}>
                  <Ionicons name="arrow-up" size={22} color={colors.white} />
                </Toque>
              </View>
            ) : (
              <>
                {adjuntos.length > 0 || preparando ? (
                  <View style={s.adjuntas}>
                    {adjuntos.map((f, i) => (
                      <View key={f.uri} style={f.clase === "doc" ? s.docPendiente : null}>
                        {f.clase === "foto" ? (
                          <Image source={{ uri: f.uri }} style={s.miniatura} />
                        ) : (
                          <>
                            <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                            <Text style={s.docNombre} numberOfLines={1}>
                              {f.nombre}
                            </Text>
                          </>
                        )}
                        <Toque onPress={() => setAdjuntos((l) => l.filter((_, j) => j !== i))} accessibilityLabel="Quitar el archivo" hitSlop={8} style={s.quitar}>
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
                  <Toque onPress={abrirAdjuntar} accessibilityLabel="Adjuntar una foto o un documento" style={s.adjuntar}>
                    <Ionicons name="add" size={24} color={colors.navy} />
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
                  {hayAlgo || enviando ? (
                    <Toque onPress={enviar} disabled={enviando} accessibilityLabel="Enviar" accessibilityState={{ busy: enviando }} style={s.enviar}>
                      {enviando ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="arrow-up" size={22} color={colors.white} />}
                    </Toque>
                  ) : (
                    <Toque onPress={empezarAudio} accessibilityLabel="Grabar un audio" style={s.enviar}>
                      <Ionicons name="mic-outline" size={22} color={colors.white} />
                    </Toque>
                  )}
                </View>
              </>
            )}
          </View>
        </>
      )}

      <Hoja visible={hoja} onCerrar={() => setHoja(false)} titulo="Adjuntar">
        <View style={{ gap: space.sm }}>
          {opcion("camera-outline", "Tomar foto", "Con buena luz y sin reflejos", () => elegirFoto(true))}
          {opcion("images-outline", "Elegir de la galería", "Una foto o una captura que ya tengas", () => elegirFoto(false))}
          {opcion("document-text-outline", "Documento", `PDF u otro archivo, hasta ${MAX_MB} MB`, elegirDocumento)}
        </View>
      </Hoja>
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

  lista: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
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
    minHeight: hit.button,
    maxWidth: 270,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  archivoIcono: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.infoBg, alignItems: "center", justifyContent: "center" },
  archivoNombre: { fontFamily: fonts.label, fontSize: 14, color: colors.text },
  archivoPeso: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  audio: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: hit.min, width: 220, borderRadius: radius.lg, paddingHorizontal: space.md },
  audioRiel: { flex: 1, height: 4, borderRadius: radius.pill, overflow: "hidden" },
  audioAvance: { height: 4, borderRadius: radius.pill },
  audioTiempo: { fontFamily: fonts.strong, fontSize: 12, fontVariant: ["tabular-nums"] },

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
  grabando: {
    flex: 1,
    minHeight: hit.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.errorBg,
    paddingHorizontal: space.md,
  },
  grabandoTexto: { fontFamily: fonts.strong, fontSize: 15, color: colors.errorText, fontVariant: ["tabular-nums"] },
  adjuntas: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.xs },
  miniatura: { width: 58, height: 58, borderRadius: radius.sm, backgroundColor: colors.muted },
  miniaturaCarga: { alignItems: "center", justifyContent: "center" },
  docPendiente: {
    height: 58,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.infoBg,
  },
  docNombre: { flexShrink: 1, fontFamily: fonts.label, fontSize: 13, color: colors.text },
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
  opcion: { minHeight: 68, borderRadius: radius.lg, backgroundColor: colors.ground, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", gap: space.md + 2 },
  opcionIcono: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  opcionTitulo: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  opcionDetalle: { fontFamily: fonts.label, fontSize: 12, color: colors.text2 },
});
