import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Image, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDatos } from "../../src/lib/cache";
import { useAvisosSinLeer } from "../../src/lib/avisos";
import { listarAlertas } from "../../src/lib/alertas";
import { urlPublica } from "../../src/lib/storage";
import { tituloDia, hora, quedanTexto } from "../../src/lib/fechas";
import { faltaParaRecibir, esBancoPrincipal } from "../../src/lib/deposito";
import { Esqueleto, Aparece } from "../../src/components/Cargando";
import { useAviso } from "../../src/components/Avisos";
import MenuLateral from "../../src/components/MenuLateral";
import DetalleSolicitud from "../../src/components/DetalleSolicitud";
import { Logo } from "../../src/components/brand/Logo";
import { BankBadge } from "../../src/components/ui/BankBadge";
import { StatusChip } from "../../src/components/ui/StatusChip";
import { GlassPanel } from "../../src/components/ui/GlassPanel";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { Boton } from "../../src/components/ui/Boton";
import { Toque } from "../../src/components/ui/Toque";
import { useEspacioPestanas } from "../../src/components/ui/BarraPestanas";
import { Tarjeta, BotonIcono } from "../../src/components/ui/Piezas";
import { bancoDe, colors, fonts } from "../../src/theme/tokens";

const BUCKET_NOTICIAS = "noticias-fotos";
const ANCHO_NOVEDAD = Math.min(272, Dimensions.get("window").width - 80);

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

/** "Hoy · 14:32", "Ayer · 09:10" o "Lunes, 12 de septiembre". */
function cuando(iso) {
  const t = tituloDia(iso);
  return t === "Hoy" || t === "Ayer" ? `${t} · ${hora(iso)}` : t;
}

// Luces de la cabecera del Inicio: dorada a la derecha, azul abajo a
// la izquierda (prototipo, pantalla Inicio).
const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 280, top: 110, right: -110 },
  { color: colors.glowBlue, opacity: 0.75, size: 320, bottom: -150, left: -120 },
];

/** Sobretítulo y fondo de cada tipo de noticia en el carrusel. */
const TIPOS_NOVEDAD = {
  promocion: { etiqueta: "PROMOCIÓN", color: colors.goldText, fondo: "#F6E7B0" },
  info: { etiqueta: "AVISO", color: colors.navyLight, fondo: "#D9E2F2" },
  advertencia: { etiqueta: "IMPORTANTE", color: colors.successText, fondo: "#CDEBDD" },
  critico: { etiqueta: "URGENTE", color: colors.errorText, fondo: colors.errorBg },
};

// ── Piezas ────────────────────────────────────────────────────

/**
 * Línea de avance de la última solicitud, con las cuatro etapas
 * escritas. El cliente abre el app para saber en qué va su dinero; esto
 * se lo dice sin entrar al historial.
 */
function Avance({ estado }) {
  const rechazada = estado === "rechazado";
  // Etapa en curso: 1 revisión, 2 aprobada, 3 depósito hecho.
  const etapa = estado === "pagado" ? 3 : estado === "aprobado" || rechazada ? 2 : 1;
  const nombres = ["Enviada", "Revisión", rechazada ? "Rechazada" : "Aprobada", "Depósito"];

  return (
    <View style={{ gap: 8, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {nombres.map((_, i) => {
          const hecho = i < etapa || (estado === "pagado" && i === 3);
          const actual = i === etapa && estado !== "pagado";
          const rojo = rechazada && i === 2;
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", flex: i < 3 ? 1 : 0 }}>
              <View
                style={
                  actual || rojo
                    ? {
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: rojo ? colors.error : colors.gold,
                        borderWidth: 4,
                        borderColor: rojo ? "rgba(196,41,31,0.25)" : "rgba(232,184,0,0.3)",
                      }
                    : {
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: hecho ? colors.navy : "transparent",
                        borderWidth: hecho ? 0 : 2,
                        borderColor: "#C5CFDE",
                      }
                }
              />
              {i < 3 ? (
                <View style={{ flex: 1, height: 2, backgroundColor: i + 1 <= etapa ? colors.navy : colors.track }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {nombres.map((n, i) => (
          <Text
            key={n}
            style={{
              fontFamily: i === etapa ? fonts.heavy : fonts.strong,
              fontSize: 10,
              color: i === etapa && rechazada ? colors.errorText : i === etapa ? colors.goldCreamText : colors.text3,
            }}
          >
            {n}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Número de paso en círculo noche con la cifra dorada. */
function NumeroPaso({ n }) {
  return (
    <View style={s.pasoNumero}>
      <Text style={s.pasoNumeroTexto}>{n}</Text>
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────

export default function InicioScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  // Operacion abierta en la hoja de detalle, o null.
  const [detalle, setDetalle] = useState(null);
  const router = useRouter();
  const espacioPestanas = useEspacioPestanas();
  const { mostrar } = useAviso();
  const avisosSinLeer = useAvisosSinLeer();

  /**
   * Todo el inicio en una sola carga, guardada en el teléfono. Al abrir
   * se pinta la copia al instante; solo se vuelve a descargar si cambió
   * alguno de sus grupos (una solicitud pagada, una tarjeta aprobada,
   * una noticia nueva...). Antes eran cinco consultas en cada visita.
   */
  const { datos, cargando, refrescando, error, recargar } = useDatos(
    "inicio",
    async () => {
      const { data: resumen, error: e } = await supabase.rpc("resumen_inicio");
      if (e) throw e;
      const perfilId = resumen?.perfil?.id;

      const [medios, { alertas }, { data: novedades }] = await Promise.all([
        // Tarjetas y cuentas: hacen falta para los avisos "Falta tu cuenta".
        perfilId
          ? Promise.all([
              supabase.from("tarjetas").select("banco, estado").eq("cliente_id", perfilId).eq("activa", true),
              supabase.from("cuentas_bancarias").select("banco, tipo").eq("cliente_id", perfilId).eq("activa", true),
            ]).then(([t, c]) => ({ tarjetas: t.data || [], cuentas: c.data || [] }))
          : { tarjetas: [], cuentas: [] },
        listarAlertas(),
        // Las novedades las publica la empresa desde el panel; la
        // vigencia la filtra la política de la base.
        supabase
          .from("alertas_sistema")
          .select("id, titulo, tipo, imagenes, fecha_fin")
          .eq("categoria", "noticia")
          .order("fecha_inicio", { ascending: false })
          .limit(6),
      ]);

      return {
        ...resumen,
        medios,
        // La alerta urgente va encima del saludo hasta que el cliente la
        // abre: si se fuera sola, quien no la vio a tiempo opera sin saberlo.
        urgente: alertas.find((a) => a.tipo === "critico" && !a.vista) || null,
        novedades: novedades || [],
      };
    },
    { grupos: ["perfil", "solicitudes", "tarjetas", "cuentas", "noticias", "guias"] },
  );

  const perfil = datos?.perfil || null;
  const medios = datos?.medios || { tarjetas: [], cuentas: [] };
  const urgente = datos?.urgente || null;
  const novedades = datos?.novedades || [];
  const refrescarTodo = recargar;

  const stats = { pendientes: 0, por_pagar: 0, pagadas: 0, rechazadas: 0, tarjetas: 0, ...(datos?.stats || {}) };
  const recientes = datos?.recientes || [];
  const guias = datos?.guias || [];
  const bancos = datos?.bancos || [];
  const cuentas = Number(datos?.cuentas || 0);
  const tarjetasEnVerificacion = Number(datos?.tarjetas_en_verificacion || 0);
  const hayGuias = Boolean(datos?.hay_guias);

  const identidadOk = Boolean(perfil?.validado_por);
  const tarjetaOk = stats.tarjetas > 0;
  const cuentaOk = cuentas > 0;

  // ── Validaciones antes de enviar ──
  // Cada una dice que falta y lleva a donde se resuelve, en vez de dejar
  // entrar a un formulario que no va a poder completar.
  function irANuevaSolicitud() {
    if (!perfil) {
      return mostrar("No pudimos cargar tu cuenta. Desliza hacia abajo para actualizar.", "error");
    }
    if (!identidadOk) {
      return mostrar("Tu identidad aún está en revisión. Te avisaremos al aprobarla.", "atencion");
    }
    if (!tarjetaOk) {
      if (tarjetasEnVerificacion > 0) {
        return mostrar("Tu tarjeta se está verificando. Podrás enviar apenas se apruebe.", "info");
      }
      mostrar("Primero registra la tarjeta con la que operas.", "atencion");
      return router.push("/tarjeta-nueva");
    }
    if (!cuentaOk) {
      // Sin cuenta no hay donde depositarle: se detiene aqui en vez de
      // dejarlo llenar un formulario que no va a poder enviar.
      mostrar("Registra la cuenta donde recibirás tu pago antes de enviar.", "atencion");
      return router.push({ pathname: "/cuenta-nueva", params: { tipo: "ahorros" } });
    }
    router.push("/nueva-solicitud");
  }

  // "Nueva solicitud" se apaga mientras falte algo: antes llevaba a
  // registrar la tarjeta, igual que el botón del paso 1, y eran dos
  // botones haciendo lo mismo. Apagado solo explica qué falta.
  const bloqueoEnvio = !perfil
    ? null
    : !identidadOk
      ? "Disponible cuando aprobemos tu identidad"
      : !tarjetaOk
        ? tarjetasEnVerificacion > 0
          ? "Disponible cuando se verifique tu tarjeta"
          : "Disponible cuando registres tu tarjeta"
        : !cuentaOk
          ? "Disponible cuando agregues tu cuenta de ahorros"
          : null;

  // Lo que falta para operar. Solo se muestra si falta algo: con todo
  // en orden, recordarle que está verificado es ruido.
  const pendientes = [
    !identidadOk && { clave: "identidad", titulo: "Identidad en revisión", icono: "time-outline" },
    !tarjetaOk && {
      clave: "tarjeta",
      titulo: tarjetasEnVerificacion > 0 ? "Tarjeta en verificación" : "Registra tu tarjeta",
      icono: tarjetasEnVerificacion > 0 ? "time-outline" : "add",
      ruta: tarjetasEnVerificacion > 0 ? null : "/tarjeta-nueva",
    },
    !cuentaOk && {
      clave: "cuenta",
      titulo: "Agrega tu cuenta de ahorros",
      icono: "add",
      ruta: { pathname: "/cuenta-nueva", params: { tipo: "ahorros" } },
    },
  ].filter(Boolean);

  // Bancos con tarjeta verificada a los que les falta dónde depositar.
  const faltas = bancos.map((b) => faltaParaRecibir(b, medios.cuentas) && b).filter(Boolean);

  // Las guías que se muestran primero son las de los bancos del cliente;
  // si aún no tiene ninguno, todas las publicadas.
  // Solo las guías de los bancos con tarjeta verificada (las trae el
  // resumen). Antes, sin ninguna tarjeta, se mostraban las de todos los
  // bancos: un cliente nuevo veía guías de bancos que no usa y no sabía
  // que primero tenía que registrar su tarjeta.
  const guiasVisibles = guias.slice(0, 4);
  const bancosEnRevision = [
    ...new Set(medios.tarjetas.filter((t) => t.estado === "pendiente").map((t) => bancoDe(t.banco).name)),
  ];

  const ultima = recientes[0];
  const nombre = primerNombre(perfil?.nombres);
  const sinDatos = !datos;

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: espacioPestanas }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={refrescarTodo} tintColor={colors.white} colors={[colors.navy]} />
        }
      >
        {/* ── Cabecera azul noche ── */}
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={s.cabeceraFila}>
            <BotonIcono variante="noche" icono="menu" onPress={() => setMenuVisible(true)} accessibilityLabel="Abrir menú" />
            <Logo width={56} />
            <BotonIcono
              variante="noche"
              icono="notifications-outline"
              punto={avisosSinLeer > 0}
              onPress={() => router.push("/notificaciones")}
              accessibilityLabel={avisosSinLeer > 0 ? `Mis avisos, ${avisosSinLeer} sin leer` : "Mis avisos"}
            />
          </View>

          {/* Alerta urgente, encima del saludo */}
          {urgente ? (
            <Aparece>
              <Toque
                onPress={() => router.push("/(tabs)/noticias?seccion=alertas")}
                accessibilityLabel={`Alerta urgente: ${urgente.titulo}`}
                style={s.urgente}
              >
                <Ionicons name="warning-outline" size={18} color={colors.white} />
                <Text style={s.urgenteTitulo} numberOfLines={1}>
                  {urgente.titulo}
                </Text>
                <Text style={s.urgenteSello}>URGENTE</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.white} />
              </Toque>
            </Aparece>
          ) : null}

          <Aparece retraso={60}>
            <View style={s.saludoBloque}>
              <Text style={s.saludo}>{saludo()}</Text>
              {sinDatos && cargando ? (
                <View style={s.nombreEsqueleto} />
              ) : (
                <Text style={s.nombre} numberOfLines={1}>
                  {nombre || "Bienvenido"}
                </Text>
              )}
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {/* ── Cristal: los dos pasos para operar ── */}
          <Aparece retraso={120}>
            <GlassPanel variant="light" radius={28} style={s.panel}>
              {/* Línea punteada que une los dos pasos */}
              <View style={s.conector} />
              <View style={s.pasoFila}>
                <NumeroPaso n={1} />
                <Text style={s.pasoTitulo}>Sigue la guía de tu banco</Text>
              </View>
              {guiasVisibles.length ? (
                <View style={s.guias}>
                  {guiasVisibles.map((g) => (
                    <Toque
                      key={g.id || g.banco}
                      onPress={() => router.push(`/guia/${g.banco}`)}
                      accessibilityLabel={`Guía ${bancoDe(g.banco).name}`}
                      style={s.guia}
                    >
                      <BankBadge bank={g.banco} size={30} />
                      <Text style={s.guiaTexto} numberOfLines={1}>
                        {bancoDe(g.banco).name}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                    </Toque>
                  ))}
                </View>
              ) : !tarjetaOk && bancosEnRevision.length ? (
                <Text style={s.sinGuias}>
                  Tu tarjeta {bancosEnRevision.join(" y ")} se está verificando. Su guía aparecerá al aprobarla.
                </Text>
              ) : !tarjetaOk ? (
                <View style={s.sinGuiasCaja}>
                  <Text style={[s.sinGuias, { paddingLeft: 0, paddingBottom: 0, paddingTop: 0 }]}>
                    Registra tu tarjeta para ver la guía de tu banco.
                  </Text>
                  <Toque
                    onPress={() => router.push("/tarjeta-nueva")}
                    accessibilityLabel="Registrar tarjeta"
                    style={s.registrar}
                  >
                    <Ionicons name="add" size={16} color={colors.night} />
                    <Text style={s.registrarTexto}>Registrar tarjeta</Text>
                  </Toque>
                </View>
              ) : (
                <Text style={s.sinGuias}>
                  {hayGuias
                    ? "Pronto publicaremos la guía de tu banco."
                    : "Pronto publicaremos las guías de cada banco."}
                </Text>
              )}
              <View style={s.pasoFila}>
                <NumeroPaso n={2} />
                <Text style={s.pasoTitulo}>Envía tu comprobante</Text>
              </View>
              <View style={{ paddingLeft: 42, paddingTop: 10 }}>
                <Boton
                  variante="dinero"
                  grande
                  titulo="Nueva solicitud"
                  icono={bloqueoEnvio ? "lock-closed-outline" : "arrow-forward"}
                  apagado={Boolean(bloqueoEnvio)}
                  accessibilityLabel={bloqueoEnvio ? `Nueva solicitud, no disponible. ${bloqueoEnvio}` : "Nueva solicitud"}
                  onPress={() => (bloqueoEnvio ? mostrar(`${bloqueoEnvio}.`, "info") : irANuevaSolicitud())}
                />
                {bloqueoEnvio ? <Text style={s.bloqueoEnvio}>{bloqueoEnvio}</Text> : null}
              </View>
            </GlassPanel>
          </Aparece>

          {/* ── Lo que le falta a un banco para recibir ── */}
          {faltas.map((b) => (
            <Aparece key={b} retraso={150}>
              <Toque
                onPress={() =>
                  router.push({
                    pathname: "/cuenta-nueva",
                    params: esBancoPrincipal(b) ? { banco: b, tipo: "ahorros" } : { tipo: "ahorros" },
                  })
                }
                accessibilityLabel={faltaParaRecibir(b, medios.cuentas)?.titulo}
                style={s.falta}
              >
                <BankBadge bank={b} size={28} />
                <Text style={s.faltaTexto} numberOfLines={1}>
                  {esBancoPrincipal(b) ? `Falta tu cuenta ${bancoDe(b).name}` : "Falta una cuenta de ahorros"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.goldCreamText} />
              </Toque>
            </Aparece>
          ))}

          {/* ── Estado de los datos ── */}
          {error && datos ? (
            <View style={s.desconectado}>
              <Ionicons name="cloud-offline-outline" size={15} color={colors.text2} />
              <Text style={s.desconectadoTexto}>Sin conexión · lo último guardado</Text>
              <Toque onPress={refrescarTodo} hitSlop={10}>
                <Text style={s.desconectadoAccion}>Reintentar</Text>
              </Toque>
            </View>
          ) : null}

          {error && !datos ? (
            <Tarjeta style={s.errorCaja}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.text3} />
              <Text style={s.errorTitulo}>No pudimos cargar tu inicio</Text>
              <Text style={s.errorTexto}>Revisa tu conexión e inténtalo otra vez.</Text>
              <Boton titulo="Reintentar" onPress={refrescarTodo} style={{ marginTop: 14, alignSelf: "stretch" }} />
            </Tarjeta>
          ) : null}

          {sinDatos && cargando && !error ? (
            <View style={{ gap: 10, marginTop: 10 }}>
              <Esqueleto alto={140} radio={24} />
              <Esqueleto alto={80} radio={18} />
            </View>
          ) : null}

          {/* ── Lo que falta para operar ── */}
          {datos && pendientes.length > 0 ? (
            <Aparece retraso={160}>
              <Text style={s.seccion}>Para empezar</Text>
              <Tarjeta style={s.listaTarjeta}>
                {pendientes.map((p, i) => {
                  const fila = (
                    <View style={[s.pendienteFila, i > 0 && s.separador]}>
                      <View style={s.pendienteIcono}>
                        <Ionicons name={p.icono} size={16} color={colors.goldText} />
                      </View>
                      <Text style={s.pendienteTitulo}>{p.titulo}</Text>
                      {p.ruta ? <Ionicons name="chevron-forward" size={18} color={colors.text3} /> : null}
                    </View>
                  );
                  return p.ruta ? (
                    <Toque key={p.clave} onPress={() => router.push(p.ruta)} accessibilityLabel={p.titulo}>
                      {fila}
                    </Toque>
                  ) : (
                    <View key={p.clave}>{fila}</View>
                  );
                })}
              </Tarjeta>
            </Aparece>
          ) : null}

          {/* ── Última solicitud ── */}
          {datos && ultima ? (
            <Aparece retraso={200}>
              <Text style={s.seccion}>Última solicitud</Text>
              <Toque onPress={() => setDetalle(ultima)} accessibilityLabel={`Ver detalle de la solicitud ${ultima.codigo}`}>
                <Tarjeta style={s.ultima}>
                  <View style={s.ultimaFila}>
                    <BankBadge bank={ultima.banco} size={42} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.ultimaTitulo} numberOfLines={1}>
                        {ultima.ultimos_4 ? `Con tarjeta ···· ${ultima.ultimos_4}` : bancoDe(ultima.banco).name}
                      </Text>
                      <Text style={s.ultimaHora}>{cuando(ultima.created_at)}</Text>
                    </View>
                    <StatusChip status={ultima.estado} />
                  </View>
                  <Avance estado={ultima.estado} />
                </Tarjeta>
              </Toque>
            </Aparece>
          ) : null}

          {/* ── Novedades: lo que la empresa publica desde el panel ── */}
          {novedades.length ? (
            <Aparece retraso={240}>
              <View style={s.cabeceraBloque}>
                <Text style={[s.seccion, { paddingTop: 0 }]}>Novedades</Text>
                <Toque
                  onPress={() => router.push("/(tabs)/noticias?seccion=noticias")}
                  hitSlop={10}
                  accessibilityLabel="Ver todas las noticias"
                  style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                >
                  <Text style={s.verTodas}>Ver todas</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.goldText} />
                </Toque>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={ANCHO_NOVEDAD + 10}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}
                style={{ marginHorizontal: -16 }}
              >
                {novedades.map((n) => {
                  const t = TIPOS_NOVEDAD[n.tipo] || TIPOS_NOVEDAD.info;
                  const portada = n.imagenes?.[0] ? urlPublica(BUCKET_NOTICIAS, n.imagenes[0]) : null;
                  const quedan = quedanTexto(n.fecha_fin);
                  return (
                    <Toque
                      key={n.id}
                      // Abre esa noticia, no solo la lista.
                      onPress={() => router.push({ pathname: "/(tabs)/noticias", params: { seccion: "noticias", noticia: n.id } })}
                      accessibilityLabel={`${t.etiqueta}: ${n.titulo}`}
                      escala={0.98}
                      style={[s.novedad, { backgroundColor: t.fondo }]}
                    >
                      {portada ? (
                        <Image source={{ uri: portada }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <View style={s.novedadSinImagen}>
                          <Ionicons name="image-outline" size={28} color="rgba(15,27,51,0.3)" />
                        </View>
                      )}
                      <View style={s.novedadSello}>
                        <Text style={[s.novedadSelloTexto, { color: t.color }]}>{t.etiqueta}</Text>
                      </View>
                      <View style={s.novedadPie}>
                        <Text style={s.novedadTitulo} numberOfLines={1}>
                          {n.titulo}
                        </Text>
                        {quedan ? <Text style={s.novedadQuedan}>{quedan}</Text> : null}
                      </View>
                    </Toque>
                  );
                })}
              </ScrollView>
            </Aparece>
          ) : null}
        </View>
      </ScrollView>

      <DetalleSolicitud solicitud={detalle} onCerrar={() => setDetalle(null)} />

      <MenuLateral visible={menuVisible} onClose={() => setMenuVisible(false)} perfil={perfil} />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },

  cabecera: { paddingHorizontal: 16, paddingBottom: 104, gap: 16 },
  cabeceraFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  urgente: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.errorStrong,
  },
  urgenteTitulo: { flex: 1, fontFamily: fonts.strong, fontSize: 14, color: colors.white },
  urgenteSello: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.1, color: colors.white, opacity: 0.9 },
  saludoBloque: { gap: 2, paddingHorizontal: 6, paddingTop: 4 },
  saludo: { fontFamily: fonts.body, fontSize: 14, color: "rgba(255,255,255,0.7)" },
  nombre: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8, color: colors.white },
  nombreEsqueleto: { width: 140, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },

  cuerpo: { marginTop: -80, paddingHorizontal: 16, gap: 12 },
  panel: { paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 },
  conector: {
    position: "absolute",
    left: 30,
    top: 44,
    height: 84,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    borderColor: "#C5CFDE",
  },
  pasoFila: { flexDirection: "row", alignItems: "center", gap: 12 },
  pasoNumero: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
  pasoNumeroTexto: { fontFamily: fonts.heavy, fontSize: 14, color: colors.gold },
  pasoTitulo: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  guias: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 42, paddingTop: 10, paddingBottom: 18 },
  guia: {
    flexGrow: 1,
    flexBasis: "45%",
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  guiaTexto: { flex: 1, fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  bloqueoEnvio: { fontFamily: fonts.label, fontSize: 12, color: colors.text3, textAlign: "center", paddingTop: 8 },
  sinGuiasCaja: { paddingLeft: 42, paddingTop: 8, paddingBottom: 18, gap: 10, alignItems: "flex-start" },
  registrar: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  registrarTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.night },
  sinGuias: { fontFamily: fonts.label, fontSize: 13, color: colors.text2, paddingLeft: 42, paddingTop: 8, paddingBottom: 18 },

  falta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.goldCream,
    paddingLeft: 10,
    paddingRight: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  faltaTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 14, color: colors.goldCreamText },

  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8 },
  cabeceraBloque: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8 },
  verTodas: { fontFamily: fonts.heavy, fontSize: 13, color: colors.goldText },
  separador: { borderTopWidth: 1, borderTopColor: colors.lineSoft },

  listaTarjeta: { borderRadius: 22, paddingHorizontal: 16 },
  pendienteFila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  pendienteIcono: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  pendienteTitulo: { flex: 1, fontFamily: fonts.strong, fontSize: 15, color: colors.text },

  ultima: { borderRadius: 24, padding: 16, gap: 16 },
  ultimaFila: { flexDirection: "row", alignItems: "center", gap: 12 },
  ultimaTitulo: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },
  ultimaHora: { fontFamily: fonts.body, fontSize: 12, color: colors.text3 },

  novedad: {
    width: ANCHO_NOVEDAD,
    height: 168,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: colors.night,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  novedadSinImagen: { position: "absolute", top: 34, left: 0, right: 0, alignItems: "center" },
  novedadSello: {
    position: "absolute",
    top: 12,
    left: 12,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.88)",
    justifyContent: "center",
  },
  novedadSelloTexto: { fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 0.8 },
  novedadPie: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  novedadTitulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  novedadQuedan: { fontFamily: fonts.strong, fontSize: 12, color: colors.text3 },

  desconectado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  desconectadoTexto: { flex: 1, fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  desconectadoAccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.goldText },
  errorCaja: { borderRadius: 24, padding: 22, alignItems: "center", gap: 6 },
  errorTitulo: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  errorTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2, textAlign: "center" },
});
