import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Pressable,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { useDatos, invalidar } from "../../src/lib/cache";
import { urlPublica } from "../../src/lib/storage";
import { listarAlertas, marcarVistas, nombreCanal } from "../../src/lib/alertas";
import MenuLateral from "../../src/components/MenuLateral";
import DetalleNoticia from "../../src/components/DetalleNoticia";
import { EsqueletoLista, Aparece } from "../../src/components/Cargando";
import { CURVA, useReducirMovimiento } from "../../src/lib/movimiento";
import { Toque } from "../../src/components/ui/Toque";
import { BotonIcono, Tarjeta } from "../../src/components/ui/Piezas";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../../src/components/ui/GlassPanel";
import { quedanTexto } from "../../src/lib/fechas";
import { alertLevel, colors, fonts } from "../../src/theme/tokens";

const BUCKET_NOTICIAS = "noticias-fotos";

/**
 * Dos cosas distintas en la misma pantalla, separadas a proposito.
 *
 * Una noticia se navega: promociones, feriados, descuentos. Una alerta
 * interrumpe: si el cliente se entera manana, ya no le sirvio. Antes
 * estaban mezcladas en una sola lista, asi que una caida del BCP se
 * veia igual de urgente que un 10% de descuento.
 *
 * Por eso tienen formas distintas: la alerta es un bloque de color
 * sólido con ícono; la noticia, una tarjeta blanca con imagen. Nunca se
 * mezclan.
 */
// Noticias primero: es lo que la persona viene a mirar. Las alertas
// no se pierden por ir segundas: tienen su globo rojo en el selector, la
// burbuja en vivo y la franja urgente del Inicio, que abren directo ahí.
const SECCIONES = [
  { clave: "noticias", titulo: "Noticias" },
  { clave: "alertas", titulo: "Alertas" },
];

/** Sobretítulo de cada tipo de noticia. */
const TIPOS_NOTICIA = {
  promocion: { etiqueta: "PROMOCIÓN", icono: "pricetag-outline", color: colors.goldText, fondo: colors.goldCream },
  info: { etiqueta: "AVISO", icono: "information-circle-outline", color: colors.navyLight, fondo: colors.infoBg },
  advertencia: { etiqueta: "IMPORTANTE", icono: "alert-circle-outline", color: colors.goldText, fondo: colors.goldCream },
  critico: { etiqueta: "URGENTE", icono: "warning-outline", color: colors.errorText, fondo: colors.errorBg },
};
const tipoDe = (n) => TIPOS_NOTICIA[n?.tipo] || TIPOS_NOTICIA.info;

/** Gravedad de la alerta -> bloque del diseño (tokens.alertLevel). */
const NIVEL = {
  critico: alertLevel.urgente,
  advertencia: alertLevel.importante,
  info: alertLevel.aviso,
};
const nivelDe = (tipo) => NIVEL[tipo] || NIVEL.info;

const ANCHO_PANTALLA = Dimensions.get("window").width;
const ALTO_PORTADA = Math.round((ANCHO_PANTALLA - 32) * 0.56);

// Publicada en los últimos tres días: lleva la marca "NUEVA".
const NUEVA_MS = 3 * 24 * 60 * 60 * 1000;
const esNueva = (n) => n?.fecha_inicio && Date.now() - new Date(n.fecha_inicio).getTime() < NUEVA_MS;

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -70, right: -100 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -170, left: -110 },
];

const MES_DIA = { day: "numeric", month: "short" };

function haceCuanto(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "Ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  return new Date(iso).toLocaleDateString("es-PE", MES_DIA);
}

/** "Hace 5 min", "Hace 3 h", "Ayer", "12 oct". */
function publicada(iso) {
  if (!iso) return "";
  const t = haceCuanto(iso);
  return /min$| h$/.test(t) ? `Hace ${t}` : t;
}

// ── Piezas ────────────────────────────────────────────────────

/** Pastilla sobre la imagen de una noticia (tipo, NUEVA, fotos). */
function Pastilla({ texto, icono, fondo, color, style }) {
  return (
    <View style={[s.pastilla, { backgroundColor: fondo }, style]}>
      {icono ? <Ionicons name={icono} size={12} color={color} /> : null}
      <Text style={[s.pastillaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

/** Selector Noticias | Alertas con el indicador que se desliza. */
function Selector({ activa, onCambio, sinVer }) {
  const reducir = useReducirMovimiento();
  const idx = SECCIONES.findIndex((x) => x.clave === activa);
  const pos = useRef(new Animated.Value(idx)).current;
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    Animated.timing(pos, { toValue: idx, duration: reducir ? 0 : 380, easing: CURVA, useNativeDriver: true }).start();
  }, [idx, pos, reducir]);

  const anchoOpcion = ancho ? ancho / 2 : 0;

  // El indicador vive dentro de la fila (no del cristal), así que se
  // mide y se ubica contra ella, sin el relleno del panel.
  return (
    <GlassPanel variant="onNight" radius={16} style={s.selector}>
      <View style={{ flexDirection: "row" }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)} accessibilityRole="tablist">
        {anchoOpcion ? (
          <Animated.View
            style={[
              s.selectorIndicador,
              { top: 0, bottom: 0, left: 0, width: anchoOpcion, transform: [{ translateX: Animated.multiply(pos, anchoOpcion) }] },
            ]}
          />
        ) : null}
      {SECCIONES.map((sec) => {
        const puesta = activa === sec.clave;
        return (
          <Pressable
            key={sec.clave}
            onPress={() => onCambio(sec.clave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: puesta }}
            style={s.selectorOpcion}
          >
            <Text style={[s.selectorTexto, { color: puesta ? colors.night : "rgba(255,255,255,0.85)" }]}>{sec.titulo}</Text>
            {sec.clave === "alertas" && sinVer > 0 ? (
              <View style={s.globo}>
                <Text style={s.globoTexto}>{sinVer > 9 ? "9+" : sinVer}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
    </GlassPanel>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function NoticiasScreen() {
  const { seccion, noticia: noticiaPedida } = useLocalSearchParams();
  const router = useRouter();
  const [activa, setActiva] = useState(seccion === "alertas" ? "alertas" : "noticias");
  const [menuVisible, setMenuVisible] = useState(false);
  // Noticia abierta en su hoja de detalle, o null.
  const [abierta, setAbierta] = useState(null);
  // Alerta anterior desplegada para leer el mensaje entero.
  const [leyendo, setLeyendo] = useState(null);
  const insets = useSafeAreaInsets();

  // La burbuja manda aqui con ?seccion=alertas. Si la pantalla ya
  // estaba montada, el estado inicial no se vuelve a calcular solo.
  useEffect(() => {
    if (seccion === "alertas" || seccion === "noticias") setActiva(seccion);
  }, [seccion]);

  // Noticias y alertas guardadas en el teléfono: solo se vuelven a
  // descargar si el panel publicó, editó o retiró algo, o si venció
  // alguna (huella "noticias"). La vigencia la aplica la política de la
  // base: aquí no llega nada vencido ni programado para más adelante.
  const {
    datos,
    cargando: loading,
    refrescando: refreshing,
    recargar,
  } = useDatos(
    "noticias",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Las tres en paralelo: son independientes.
      const [resPerfil, resNoticias, resAlertas] = await Promise.all([
        user
          ? supabase
              .from("perfiles_cliente")
              .select("nombres, apellidos, dni, validado_por")
              .eq("user_id", user.id)
              .maybeSingle()
          : { data: null },
        supabase
          .from("alertas_sistema")
          .select("id, titulo, mensaje, tipo, imagenes, fecha_inicio, fecha_fin")
          .eq("categoria", "noticia")
          .order("fecha_inicio", { ascending: false }),
        listarAlertas(),
      ]);
      if (resNoticias.error) throw resNoticias.error;
      return { perfil: resPerfil.data || null, noticias: resNoticias.data || [], alertas: resAlertas.alertas };
    },
    { grupos: ["noticias", "perfil"] },
  );
  const perfil = datos?.perfil || null;
  const noticias = datos?.noticias || [];

  // Alertas que eran nuevas al abrir la pestaña: siguen con su punto
  // mientras se leen aunque ya se hayan marcado como vistas en la base
  // (y la copia guardada ya lo sepa). Desaparecen la próxima vez.
  const [nuevasAlEntrar, setNuevasAlEntrar] = useState(null);
  const [entendidas, setEntendidas] = useState([]);
  const alertasCrudas = datos?.alertas;
  const alertas = useMemo(
    () =>
      (alertasCrudas || []).map((a) =>
        entendidas.includes(a.id)
          ? { ...a, vista: true }
          : nuevasAlEntrar?.has(a.id)
            ? { ...a, vista: false }
            : a,
      ),
    [alertasCrudas, nuevasAlEntrar, entendidas],
  );
  useFocusEffect(
    useCallback(
      () => () => {
        setNuevasAlEntrar(null);
        setEntendidas([]);
      },
      [],
    ),
  );

  // Si el cliente esta parado en esta pantalla cuando sale una alerta,
  // volver a la pantalla no ocurre nunca y la lista se quedaria vieja.
  useEffect(() => {
    const canal = supabase
      .channel(nombreCanal("noticias-en-vivo"))
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas_sistema" }, () => invalidar("noticias"))
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const sinVer = useMemo(() => alertas.filter((a) => !a.vista).length, [alertas]);

  /**
   * Abrir la pestaña marca como vistas las alertas que no son urgentes.
   * La urgente no: se marca recién al tocar "Entendido". Si se marcara
   * al entrar, quien abrió la pestaña sin leerla dejaría de verla en el
   * Inicio, y la urgente es justo la que no se puede perder.
   *
   * El estado local no se toca: se deja el punto dibujado mientras la
   * esta leyendo, y desaparece la proxima vez que entre.
   */
  useEffect(() => {
    if (activa !== "alertas") return;
    const nuevas = (alertasCrudas || []).filter((a) => !a.vista && a.tipo !== "critico").map((a) => a.id);
    if (!nuevas.length) return;
    setNuevasAlEntrar((previas) => new Set([...(previas || []), ...nuevas]));
    marcarVistas(nuevas);
  }, [activa, alertasCrudas]);

  function entendido(alerta) {
    marcarVistas([alerta.id]);
    setEntendidas((lista) => [...lista, alerta.id]);
  }

  const urlsPorNoticia = useMemo(() => {
    const mapa = {};
    for (const n of noticias) {
      mapa[n.id] = (n.imagenes || []).map((p) => urlPublica(BUCKET_NOTICIAS, p)).filter(Boolean);
    }
    return mapa;
  }, [noticias]);

  // Desde una novedad del Inicio llega ?noticia=<id>: se abre directo.
  // Se limpia el parámetro para que volver a la pestaña no la reabra.
  useEffect(() => {
    if (!noticiaPedida || !noticias.some((n) => n.id === noticiaPedida)) return;
    setActiva("noticias");
    setAbierta(noticiaPedida);
    router.setParams({ noticia: undefined });
  }, [noticiaPedida, noticias]);

  // Sin filtros: hay pocas noticias a la vez y se leen todas de un vistazo.
  const portada = noticias[0] || null;
  const resto = noticias.slice(1);
  const detalle = noticias.find((n) => n.id === abierta) || null;

  // Arriba lo que pide atención; abajo, lo ya leído.
  const urgentesNuevas = alertas.filter((a) => a.tipo === "critico" && !a.vista);
  const urgentesLeidas = alertas.filter((a) => a.tipo === "critico" && a.vista);
  const otrasNuevas = alertas.filter((a) => a.tipo !== "critico" && !a.vista);
  const anteriores = alertas.filter((a) => a.tipo !== "critico" && a.vista);

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              recargar();
            }}
            tintColor={colors.white}
            colors={[colors.navy]}
          />
        }
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={s.barra}>
            <BotonIcono variante="noche" icono="menu" onPress={() => setMenuVisible(true)} accessibilityLabel="Abrir menú" />
            <Text style={s.titulo} accessibilityRole="header">
              Noticias y alertas
            </Text>
            <View style={{ width: 44 }} />
          </View>
          <Selector activa={activa} onCambio={setActiva} sinVer={urgentesNuevas.length + otrasNuevas.length} />
        </CabeceraNoche>

        <View style={s.contenido}>

        {loading ? (
          <EsqueletoLista filas={2} alto={activa === "noticias" ? 280 : 110} />
        ) : activa === "alertas" ? (
          <View style={s.lista}>
            <View style={s.cabeceraLista}>
              <Text style={s.seccion}>Activas</Text>
              <View style={s.enVivo}>
                <View style={s.enVivoPunto} />
                <Text style={s.enVivoTexto}>En vivo</Text>
              </View>
            </View>

            {alertas.length === 0 ? (
              <Vacio icono="shield-checkmark-outline" titulo="Todo funcionando" />
            ) : null}

            {urgentesNuevas.map((a) => (
              <Aparece key={a.id}>
                <View style={[s.bloqueUrgente, { backgroundColor: alertLevel.urgente.bg }]}>
                  <View style={s.bloqueFila}>
                    <Ionicons name="warning-outline" size={20} color={colors.white} />
                    <Text style={s.bloqueTitulo}>{a.titulo}</Text>
                    <Text style={s.bloqueHora}>{haceCuanto(a.fecha_inicio)}</Text>
                  </View>
                  {a.mensaje ? <Text style={s.bloqueMensaje}>{a.mensaje}</Text> : null}
                  <View style={s.bloquePie}>
                    <Text style={s.bloqueSello}>URGENTE</Text>
                    <Toque onPress={() => entendido(a)} accessibilityLabel="Entendido" style={s.entendido}>
                      <Text style={s.entendidoTexto}>Entendido</Text>
                    </Toque>
                  </View>
                </View>
              </Aparece>
            ))}

            {urgentesLeidas.map((a) => (
              <Toque
                key={a.id}
                onPress={() => setLeyendo(leyendo === a.id ? null : a.id)}
                accessibilityLabel={`${a.titulo}, urgente activa`}
                escala={0.99}
              >
                <Tarjeta style={s.urgenteActiva}>
                  <View style={s.bloqueFila}>
                    <View style={s.urgenteIcono}>
                      <Ionicons name="warning-outline" size={18} color={colors.error} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.bloqueTitulo, { color: colors.text }]}>{a.titulo}</Text>
                      <Text style={s.urgenteActivaSello}>Urgente · leída · sigue activa</Text>
                    </View>
                  </View>
                  {leyendo === a.id && a.mensaje ? <Text style={s.leidaMensaje}>{a.mensaje}</Text> : null}
                </Tarjeta>
              </Toque>
            ))}

            {otrasNuevas.map((a) => {
              const n = nivelDe(a.tipo);
              return (
                <Aparece key={a.id}>
                  <View style={[s.bloque, { backgroundColor: n.bg }]}>
                    <View style={s.bloqueFila}>
                      <Ionicons name={n.icon} size={20} color={n.fg} />
                      <Text style={[s.bloqueTitulo, { color: n.fg }]}>{a.titulo}</Text>
                      <Text style={[s.bloqueSello, { color: n.fg }]}>{n.label}</Text>
                    </View>
                    {a.mensaje ? <Text style={[s.bloqueMensaje, { color: n.fg, opacity: 0.85 }]}>{a.mensaje}</Text> : null}
                  </View>
                </Aparece>
              );
            })}

            {anteriores.length ? (
              <>
                <Text style={s.seccion}>Anteriores</Text>
                <Tarjeta style={s.anteriores}>
                  {anteriores.map((a, i) => (
                    <Toque
                      key={a.id}
                      onPress={() => setLeyendo(leyendo === a.id ? null : a.id)}
                      escala={0.99}
                      accessibilityLabel={a.titulo}
                      accessibilityState={{ expanded: leyendo === a.id }}
                    >
                      <View style={[s.anterior, i < anteriores.length - 1 && s.separador]}>
                        <View style={s.anteriorFila}>
                          <View
                            style={[
                              s.anteriorPunto,
                              { backgroundColor: a.tipo === "advertencia" ? colors.gold : colors.navyLight },
                            ]}
                          />
                          <Text style={s.anteriorTitulo} numberOfLines={leyendo === a.id ? 0 : 1}>
                            {a.titulo}
                          </Text>
                          <Text style={s.anteriorFecha}>{haceCuanto(a.fecha_inicio)}</Text>
                        </View>
                        {leyendo === a.id && a.mensaje ? <Text style={s.leidaMensaje}>{a.mensaje}</Text> : null}
                      </View>
                    </Toque>
                  ))}
                </Tarjeta>
              </>
            ) : null}
          </View>
        ) : noticias.length === 0 ? (
          <Vacio icono="newspaper-outline" titulo="Nada nuevo por ahora" />
        ) : (
          <View style={s.lista}>
            {/* La más reciente, grande: imagen, tipo y un adelanto. */}
            {portada ? (
              <Aparece key={`portada-${portada.id}`}>
                <Toque
                  onPress={() => setAbierta(portada.id)}
                  escala={0.99}
                  accessibilityLabel={`${tipoDe(portada).etiqueta}. ${portada.titulo}. Leer noticia`}
                >
                  <Tarjeta style={s.portada}>
                    <View style={[s.portadaImagen, { backgroundColor: tipoDe(portada).fondo }]}>
                      {urlsPorNoticia[portada.id]?.[0] ? (
                        <Image
                          source={{ uri: urlsPorNoticia[portada.id][0] }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name={tipoDe(portada).icono} size={40} color={tipoDe(portada).color} />
                      )}
                      <View style={s.pastillasArriba}>
                        <Pastilla texto={tipoDe(portada).etiqueta} fondo={tipoDe(portada).fondo} color={tipoDe(portada).color} />
                        {esNueva(portada) ? <Pastilla texto="NUEVA" fondo={colors.gold} color={colors.night} /> : null}
                      </View>
                      {(urlsPorNoticia[portada.id] || []).length > 1 ? (
                        <Pastilla
                          texto={String(urlsPorNoticia[portada.id].length)}
                          icono="images-outline"
                          fondo="rgba(15,27,51,0.7)"
                          color={colors.white}
                          style={s.pastillaFotos}
                        />
                      ) : null}
                    </View>
                    <View style={s.portadaCuerpo}>
                      <Text style={s.portadaTitulo} numberOfLines={3}>
                        {portada.titulo}
                      </Text>
                      {portada.mensaje ? (
                        <Text style={s.portadaResumen} numberOfLines={2}>
                          {portada.mensaje}
                        </Text>
                      ) : null}
                      <View style={s.portadaPie}>
                        <Text style={s.meta} numberOfLines={1}>
                          {publicada(portada.fecha_inicio)}
                          {quedanTexto(portada.fecha_fin) ? ` · ${quedanTexto(portada.fecha_fin)}` : ""}
                        </Text>
                        <View style={s.leer}>
                          <Text style={s.leerTexto}>Leer</Text>
                          <Ionicons name="arrow-forward" size={15} color={colors.goldText} />
                        </View>
                      </View>
                    </View>
                  </Tarjeta>
                </Toque>
              </Aparece>
            ) : null}

            {resto.length ? <Text style={s.seccion}>Más noticias</Text> : null}
            {resto.map((n, i) => {
              const t = tipoDe(n);
              const urls = urlsPorNoticia[n.id] || [];
              const quedan = quedanTexto(n.fecha_fin);
              return (
                <Aparece key={n.id} retraso={Math.min(i, 4) * 60}>
                  <Toque onPress={() => setAbierta(n.id)} accessibilityLabel={`${t.etiqueta}. ${n.titulo}`} escala={0.99}>
                    <Tarjeta style={s.compacta}>
                      <View style={[s.miniatura, { backgroundColor: t.fondo }]}>
                        {urls[0] ? (
                          <Image source={{ uri: urls[0] }} style={s.miniaturaImagen} resizeMode="cover" />
                        ) : (
                          <Ionicons name={t.icono} size={24} color={t.color} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <View style={s.compactaSobre}>
                          <Text style={[s.sobretitulo, { color: t.color }]}>{t.etiqueta}</Text>
                          {esNueva(n) ? <View style={s.puntoNueva} accessibilityLabel="Nueva" /> : null}
                        </View>
                        <Text style={s.compactaTitulo} numberOfLines={2}>
                          {n.titulo}
                        </Text>
                        <Text style={s.meta} numberOfLines={1}>
                          {publicada(n.fecha_inicio)}
                          {quedan ? ` · ${quedan}` : ""}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                    </Tarjeta>
                  </Toque>
                </Aparece>
              );
            })}
          </View>
        )}
        </View>
      </ScrollView>

      <DetalleNoticia
        noticia={detalle ? { ...detalle, urls: urlsPorNoticia[detalle.id] || [] } : null}
        tipo={tipoDe(detalle)}
        onCerrar={() => setAbierta(null)}
      />

      <MenuLateral visible={menuVisible} onClose={() => setMenuVisible(false)} perfil={perfil} />
    </View>
  );
}

/** Estado vacío: ícono y una línea, sin párrafos. */
function Vacio({ icono, titulo }) {
  return (
    <View style={s.vacio}>
      <View style={s.vacioIcono}>
        <Ionicons name={icono} size={28} color={colors.goldText} />
      </View>
      <Text style={s.vacioTitulo}>{titulo}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  contenido: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  cabecera: { paddingHorizontal: 20, paddingBottom: 22, gap: 16 },
  barra: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titulo: { fontFamily: fonts.heavy, fontSize: 17, color: colors.white },
  cabeceraLista: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 8 },
  lista: { gap: 10, paddingTop: 6 },
  etiqueta: { paddingHorizontal: 6, paddingTop: 12 },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },

  selector: { padding: 4 },
  selectorIndicador: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    shadowColor: colors.night,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  selectorOpcion: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  selectorTexto: { fontFamily: fonts.heavy, fontSize: 14 },
  globo: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.errorStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  globoTexto: { fontFamily: fonts.heavy, fontSize: 11, color: colors.white },

  enVivo: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6, paddingTop: 4 },
  enVivoPunto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  enVivoTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.successText },

  bloqueUrgente: {
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: colors.errorStrong,
    shadowOpacity: 0.28,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  bloque: { borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  bloqueFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  bloqueTitulo: { flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.white },
  bloqueHora: { fontFamily: fonts.body, fontSize: 12, color: colors.white, opacity: 0.9 },
  bloqueMensaje: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.white, opacity: 0.95 },
  bloquePie: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bloqueSello: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.4, color: colors.white, opacity: 0.9 },
  entendido: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  entendidoTexto: { fontFamily: fonts.heavy, fontSize: 13, color: "#9A1E15" },

  urgenteActiva: { borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, gap: 8, borderColor: "#F1C4BF" },
  urgenteActivaSello: { fontFamily: fonts.strong, fontSize: 12, color: colors.errorText },
  urgenteIcono: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.errorBg,
    alignItems: "center",
    justifyContent: "center",
  },

  anteriores: { borderRadius: 20, paddingHorizontal: 16 },
  anterior: { paddingVertical: 13, gap: 6 },
  anteriorFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  anteriorPunto: { width: 8, height: 8, borderRadius: 4 },
  anteriorTitulo: { flex: 1, fontFamily: fonts.label, fontSize: 14, color: colors.text },
  anteriorFecha: { fontFamily: fonts.body, fontSize: 12, color: colors.text3 },
  leidaMensaje: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text2, paddingLeft: 18 },

  portada: { borderRadius: 26, overflow: "hidden" },
  portadaImagen: { height: ALTO_PORTADA, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pastillasArriba: { position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6 },
  pastilla: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pastillaTexto: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.1 },
  pastillaFotos: { position: "absolute", right: 12, bottom: 12 },
  portadaCuerpo: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 16, gap: 8 },
  portadaTitulo: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3, color: colors.text },
  portadaResumen: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text2 },
  portadaPie: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 4 },
  meta: { flexShrink: 1, fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  leer: { flexDirection: "row", alignItems: "center", gap: 4 },
  leerTexto: { fontFamily: fonts.heavy, fontSize: 14, color: colors.goldText },
  sobretitulo: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.5 },

  compacta: { borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 14 },
  compactaSobre: { flexDirection: "row", alignItems: "center", gap: 6 },
  puntoNueva: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  miniatura: {
    width: 84,
    height: 84,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  miniaturaImagen: { width: "100%", height: "100%" },
  compactaTitulo: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, color: colors.text },

  vacio: { alignItems: "center", marginTop: 40, gap: 12 },
  vacioIcono: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  vacioTitulo: { fontFamily: fonts.display, fontSize: 19, color: colors.text },

});
