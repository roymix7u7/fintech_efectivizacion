import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Modal,
  Animated,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { urlFirmada } from "../lib/storage";
import { hora, tituloDia, diaDeposito } from "../lib/fechas";
import { cuentasDeDeposito } from "../lib/deposito";
import { useReducirMovimiento } from "../lib/movimiento";
import { useArrastreCerrar } from "../lib/arrastre";
import { useDatos } from "../lib/cache";
import { bancoDe, colors, fonts } from "../theme/tokens";
import { GlassPanel } from "./ui/GlassPanel";
import { BankBadge } from "./ui/BankBadge";
import { Toque } from "./ui/Toque";
import { BotonIcono, Etiqueta, FilaDato, Tarjeta } from "./ui/Piezas";
import { VisorImagen } from "./ui/VisorImagen";

const BUCKET = "comprobantes";

// Una URL firmada dura una hora. Se reutiliza 50 minutos para que
// reabrir un detalle sea inmediato y no quede a punto de caducar.
const FIRMA_VALIDA_MS = 50 * 60 * 1000;

// Firmas compartidas por todas las pantallas: abrir la misma operacion
// desde el inicio y despues desde el historial no vuelve a firmar.
const firmas = new Map();

// Todas las columnas: también la modalidad, la comisión fijada y la
// cuenta donde se pagó (migración 065).
const CAMPOS = "*, tarjetas(banco, ultimos_4)";

/** "Hoy · 10:42", "Ayer · 19:55" o "Jueves 24 set · 15:02". */
function cuando(iso) {
  return `${tituloDia(iso)} · ${hora(iso)}`;
}

/**
 * Hoja con el detalle de una solicitud.
 *
 * Se abre igual desde el historial y desde el inicio, asi que vive aqui
 * y no dentro de una pantalla. Recibe lo que quien la abre ya tiene y lo
 * pinta enseguida; al mismo tiempo pide la fila completa, porque el
 * inicio solo trae un resumen (sin nota, motivo ni comprobante) y porque
 * el estado pudo cambiar desde que se cargo la lista.
 *
 * El comprobante se carga recien al abrir: ninguna lista descarga fotos.
 */
export default function DetalleSolicitud({ solicitud, onCerrar }) {
  const [detalle, setDetalle] = useState(null);
  const [imagen, setImagen] = useState({ estado: "vacio", url: null });
  const [ampliada, setAmpliada] = useState(false);
  // Solicitud abierta ahora. Si se cierra y se abre otra antes de que
  // lleguen las respuestas de la primera, esas respuestas se descartan.
  const abierta = useRef(null);
  // A dónde se deposita y cuánto se cobra: no vienen en la fila de la
  // solicitud, se calculan con las cuentas y la comisión del cliente.
  // Guardadas en el teléfono: solo se descargan si cambiaron (huellas
  // "cuentas" y "comisiones"). Si fallan, la hoja se muestra sin esas
  // filas: no son motivo para tapar el resto del detalle.
  const { datos: deposito } = useDatos(
    "deposito",
    async () => {
      const [{ data: cuentas, error: e1 }, { data: com, error: e2 }] = await Promise.all([
        supabase.from("cuentas_bancarias").select("banco, tipo, numero_cuenta").eq("activa", true),
        supabase.rpc("mis_comisiones"),
      ]);
      if (e1 || e2) throw e1 || e2;
      return { cuentas: cuentas || [], bancos: com?.bancos || [] };
    },
    { grupos: ["cuentas", "comisiones"] },
  );
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();
  // Cerrada arrastrando: la hoja ya bajó con el dedo, así que el Modal
  // se va sin su propia animación (si no, el velo bajaría después).
  const [arrastrada, setArrastrada] = useState(false);
  const arrastre = useArrastreCerrar({
    alCerrar: () => {
      setArrastrada(true);
      onCerrar();
    },
  });

  const id = solicitud?.id || null;

  useEffect(() => {
    abierta.current = id;
    setAmpliada(false);
    if (id) {
      arrastre.reiniciar();
      setArrastrada(false);
    }

    if (!id) {
      setDetalle(null);
      setImagen({ estado: "vacio", url: null });
      return;
    }

    setDetalle(solicitud);
    cargar(solicitud);
    // Solo al cambiar de solicitud: los objetos que llegan de una lista
    // se recrean en cada render aunque sean la misma fila.
  }, [id]);

  /** Pide la fila completa y despues el comprobante. */
  async function cargar(base, forzar = false) {
    const idActual = base.id;
    setImagen({ estado: "cargando", url: null });

    // Desde el historial la fila ya viene completa (y al día: la lista
    // se renueva cuando cambia alguna solicitud). Solo el resumen del
    // inicio llega sin nota, motivo ni comprobante.
    if (!forzar && "comprobante_url" in base) return cargarImagen(base);

    const { data, error } = await supabase
      .from("solicitudes")
      .select(CAMPOS)
      .eq("id", idActual)
      .maybeSingle();
    if (abierta.current !== idActual) return;

    if (!error && data) {
      setDetalle(data);
      return cargarImagen(data);
    }
    // Sin la fila completa no se sabe si hay comprobante: el resumen del
    // inicio no trae la ruta. Decir "no tiene comprobante" seria afirmar
    // algo falso por un corte de conexion.
    if (base.comprobante_url) return cargarImagen(base);
    setImagen({ estado: "error", url: null });
  }

  async function cargarImagen(sol) {
    const path = sol?.comprobante_url;
    if (!path) {
      setImagen({ estado: "sin", url: null });
      return;
    }

    const guardada = firmas.get(path);
    if (guardada && Date.now() - guardada.en < FIRMA_VALIDA_MS) {
      setImagen({ estado: "listo", url: guardada.url });
      return;
    }

    setImagen({ estado: "cargando", url: null });
    const url = await urlFirmada(BUCKET, path);
    if (abierta.current !== sol.id) return;

    if (!url) {
      setImagen({ estado: "error", url: null });
      return;
    }
    firmas.set(path, { url, en: Date.now() });
    setImagen({ estado: "listo", url });
  }

  const tarjeta = detalle?.tarjetas || {
    banco: detalle?.banco,
    ultimos_4: detalle?.ultimos_4,
  };
  const estado = detalle?.estado;
  const rechazada = estado === "rechazado";

  // Recorrido en cuatro etapas. La de "En revisión" no tiene hora
  // propia: la base guarda cuándo se envió y cuándo se resolvió, no
  // cuándo empezó a mirarla alguien.
  const etapas = !detalle
    ? []
    : [
        { titulo: "Enviada", fecha: detalle.created_at, hecho: true },
        {
          titulo: "En revisión",
          hecho: estado !== "pendiente",
          actual: estado === "pendiente",
        },
        {
          titulo: rechazada ? "Rechazada" : "Aprobado",
          fecha: estado !== "pendiente" ? detalle.fecha_revision : null,
          hecho: estado === "pagado",
          actual: estado === "aprobado" || rechazada,
          rojo: rechazada,
        },
        ...(rechazada
          ? []
          : [
              {
                titulo: "Pago enviado",
                fecha: detalle.pagado_en,
                hecho: estado === "pagado",
                actual: false,
              },
            ]),
      ];

  const bancoSolicitud = detalle?.tarjetas?.banco || detalle?.banco;
  const extras = {
    destinos: deposito ? cuentasDeDeposito(bancoSolicitud, deposito.cuentas) : [],
    // La comisión que quedó fijada al enviarla; si es antigua, la de hoy.
    comision:
      detalle?.porcentaje_comision ??
      (deposito?.bancos || []).find((b) => b.banco === bancoSolicitud)?.porcentaje ??
      null,
  };

  // Ya pagada: la cuenta exacta donde se depositó. Si no, la de siempre.
  const pagadaEn = detalle?.deposito_banco
    ? `${detalle.deposito_tipo === "interbancaria" ? "CCI " : ""}${bancoDe(detalle.deposito_banco).name} ···· ${detalle.deposito_ultimos4}`
    : null;
  const destino =
    pagadaEn ||
    (extras.destinos.length === 1
      ? `${bancoDe(extras.destinos[0].banco).name} ···· ${String(extras.destinos[0].numero_cuenta || "").slice(-4)}`
      : extras.destinos.length > 1
        ? "Tu cuenta de ahorros"
        : null);
  // Scotiabank y BanBif: al día siguiente o para hoy.
  const enCurso = estado === "pendiente" || estado === "aprobado";
  const cuandoTexto =
    detalle?.modalidad === "siguiente"
      ? `Al día siguiente${enCurso && detalle.fecha_deposito ? ` · ${diaDeposito(detalle.fecha_deposito)}` : ""}`
      : detalle?.modalidad === "hoy" && ["Scotiabank", "BanBif"].includes(bancoSolicitud)
        ? "Para hoy"
        : null;

  return (
    <Modal
      visible={Boolean(id)}
      transparent
      animationType={reducir || arrastrada ? "none" : "slide"}
      onRequestClose={() => (ampliada ? setAmpliada(false) : onCerrar())}
      statusBarTranslucent
    >
      <Pressable style={s.fondo} onPress={onCerrar} accessibilityLabel="Cerrar detalle">
        <Animated.View style={[s.hojaPosicion, { transform: [{ translateY: arrastre.y }] }]}>
        {/* Pressable interno: tocar la hoja no debe cerrarla. */}
        <Pressable
          onPress={() => {}}
          style={{ flexShrink: 1 }}
          accessibilityViewIsModal
        >
          <GlassPanel variant="sheet" radius={34} style={s.hoja}>
            {detalle && (
              <>
                {/* Barrita y cabecera: se arrastran hacia abajo para
                    cerrar. La X sigue funcionando con un toque. */}
                <View {...arrastre.gestos} style={{ gap: 16 }}>
                <View
                  style={s.asaZona}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar detalle"
                  accessibilityHint="Desliza hacia abajo para cerrar"
                  onAccessibilityTap={onCerrar}
                >
                  <View style={s.asa} />
                </View>

                <View style={s.cabecera}>
                  <BankBadge bank={tarjeta.banco} size={52} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.digitos}>
                      {tarjeta.ultimos_4 ? `···· ${tarjeta.ultimos_4}` : bancoDe(tarjeta.banco).name}
                    </Text>
                    <Text style={s.cuando}>{cuando(detalle.created_at)}</Text>
                  </View>
                  <BotonIcono icono="close" onPress={onCerrar} accessibilityLabel="Cerrar" tamano={18} />
                </View>
                </View>

                <ScrollView
                  style={{ flexShrink: 1 }}
                  showsVerticalScrollIndicator={false}
                  // El espacio de la barra del sistema va dentro de la
                  // hoja: así su fondo llega hasta abajo y no queda una
                  // franja del velo oscuro detrás de los botones.
                  contentContainerStyle={{ gap: 12, paddingBottom: insets.bottom + 20 }}
                >
                  <Tarjeta style={s.recorrido}>
                    {etapas.map((e, i) => {
                      const ultima = i === etapas.length - 1;
                      const lleno = e.hecho || e.actual;
                      return (
                        <View key={e.titulo} style={s.etapa}>
                          <View style={s.riel}>
                            <View
                              style={[
                                s.punto,
                                e.hecho && s.puntoHecho,
                                e.actual && s.puntoActual,
                                e.rojo && s.puntoRojo,
                                !lleno && s.puntoVacio,
                              ]}
                            >
                              {lleno ? (
                                <Ionicons
                                  name={e.rojo ? "close" : e.actual && !e.hecho && i === 1 ? "time-outline" : "checkmark"}
                                  size={11}
                                  color={e.actual && !e.rojo ? colors.night : colors.white}
                                />
                              ) : null}
                            </View>
                            {!ultima ? (
                              <View style={[s.linea, e.hecho && s.lineaHecha]} />
                            ) : null}
                          </View>
                          <View style={s.etapaTexto}>
                            <Text
                              style={[
                                s.etapaTitulo,
                                e.actual && s.etapaActual,
                                e.rojo && { color: colors.errorText },
                                !lleno && { color: colors.text3, fontFamily: fonts.body },
                              ]}
                            >
                              {e.titulo}
                            </Text>
                            {e.fecha ? <Text style={s.etapaHora}>{hora(e.fecha)}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </Tarjeta>

                  {rechazada && detalle.motivo_rechazo ? (
                    <View style={s.motivo}>
                      <Etiqueta color={colors.errorText}>Motivo</Etiqueta>
                      <Text style={s.motivoTexto}>{detalle.motivo_rechazo}</Text>
                    </View>
                  ) : null}

                  {destino || cuandoTexto || extras.comision != null || detalle.nota_cliente ? (
                    <Tarjeta style={s.datos}>
                      {cuandoTexto ? (
                        <FilaDato
                          etiqueta="Depósito"
                          valor={cuandoTexto}
                          ultima={!destino && extras.comision == null && !detalle.nota_cliente}
                        />
                      ) : null}
                      {destino ? (
                        <FilaDato
                          etiqueta={pagadaEn ? "Depositado en" : "Depósito en"}
                          valor={destino}
                          ultima={extras.comision == null && !detalle.nota_cliente}
                        />
                      ) : null}
                      {extras.comision != null ? (
                        <View style={[s.filaComision, detalle.nota_cliente && s.separador]}>
                          <Text style={s.datoEtiqueta}>Comisión</Text>
                          <Text style={s.comision}>{extras.comision}%</Text>
                        </View>
                      ) : null}
                      {detalle.nota_cliente ? (
                        <View style={s.nota}>
                          <Text style={s.datoEtiqueta}>Tu nota</Text>
                          <Text style={s.notaTexto}>{detalle.nota_cliente}</Text>
                        </View>
                      ) : null}
                    </Tarjeta>
                  ) : null}

                  {/* Comprobante grande, entero (contain): es lo que la
                      persona quiere revisar. Al tocarlo se abre a pantalla
                      completa con zoom. Se carga recién al abrir. */}
                  <Tarjeta style={s.comprobante}>
                    <View style={s.comprobanteCabeza}>
                      <Text style={s.comprobanteTitulo}>Comprobante</Text>
                      {imagen.estado === "listo" ? (
                        <Text style={s.comprobanteAyuda}>Toca para ampliar</Text>
                      ) : null}
                    </View>
                    <Toque
                      onPress={() =>
                        imagen.estado === "listo"
                          ? setAmpliada(true)
                          : imagen.estado === "error"
                            ? cargar(detalle, true)
                            : null
                      }
                      escala={0.99}
                      disabled={imagen.estado === "sin" || imagen.estado === "cargando" || imagen.estado === "vacio"}
                      accessibilityLabel={
                        imagen.estado === "error" ? "Reintentar cargar el comprobante" : "Ampliar comprobante"
                      }
                      style={s.vista}
                    >
                      {imagen.estado === "listo" ? (
                        <>
                          <Image
                            source={{ uri: imagen.url }}
                            style={s.vistaImagen}
                            resizeMode="contain"
                            accessibilityIgnoresInvertColors
                          />
                          <View style={s.ampliar}>
                            <Ionicons name="expand-outline" size={15} color={colors.white} />
                            <Text style={s.ampliarTexto}>Ampliar</Text>
                          </View>
                        </>
                      ) : imagen.estado === "cargando" || imagen.estado === "vacio" ? (
                        <ActivityIndicator color={colors.navy} />
                      ) : (
                        <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 20 }}>
                          <Ionicons
                            name={imagen.estado === "sin" ? "image-outline" : "cloud-offline-outline"}
                            size={26}
                            color={colors.text3}
                          />
                          <Text style={[s.comprobanteAyuda, { textAlign: "center" }]}>
                            {imagen.estado === "sin"
                              ? "Sin comprobante guardado"
                              : "No cargó. Toca para reintentar."}
                          </Text>
                        </View>
                      )}
                    </Toque>
                  </Tarjeta>
                </ScrollView>
              </>
            )}
          </GlassPanel>
        </Pressable>
        </Animated.View>
      </Pressable>

      {/* Pantalla completa dentro del mismo Modal: dos Modal abiertos a
          la vez se comportan distinto en Android e iOS. */}
      {ampliada && imagen.url ? (
        <VisorImagen
          url={imagen.url}
          titulo="Comprobante"
          subtitulo={detalle ? [detalle.codigo, cuando(detalle.created_at)].filter(Boolean).join(" · ") : null}
          onCerrar={() => setAmpliada(false)}
        />
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.55)",
    justifyContent: "flex-end",
  },
  hojaPosicion: { maxHeight: "92%" },
  // flexShrink en la hoja y en su lista: sin él, con contenido largo la
  // hoja pasaba el 92% y lo último (el comprobante) quedaba cortado.
  hoja: {
    flexShrink: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  // Zona tocable más alta que la barrita: 5 px no se aciertan con el dedo.
  asaZona: { alignItems: "center", paddingVertical: 8, marginVertical: -8 },
  asa: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.fieldFilled,
    alignSelf: "center",
  },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 14 },
  digitos: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 24,
    color: colors.text,
    letterSpacing: 0.4,
  },
  cuando: { fontFamily: fonts.body, fontSize: 13, color: colors.text3 },

  recorrido: { borderRadius: 24, paddingVertical: 18, paddingHorizontal: 20 },
  etapa: { flexDirection: "row", gap: 14 },
  riel: { alignItems: "center", width: 20 },
  punto: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  puntoHecho: { backgroundColor: colors.navy },
  puntoActual: {
    backgroundColor: colors.gold,
    borderWidth: 4,
    borderColor: "rgba(232,184,0,0.25)",
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  puntoRojo: { backgroundColor: colors.error, borderColor: "rgba(196,41,31,0.2)" },
  puntoVacio: { borderWidth: 2, borderColor: "#D8D1C1" },
  linea: { width: 2, height: 22, backgroundColor: colors.track },
  lineaHecha: { backgroundColor: colors.navy },
  etapaTexto: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 1,
  },
  etapaTitulo: { fontFamily: fonts.label, fontSize: 14, color: colors.text },
  etapaActual: { fontFamily: fonts.heavy },
  etapaHora: { fontFamily: fonts.body, fontSize: 14, color: colors.text3, fontVariant: ["tabular-nums"] },

  motivo: {
    backgroundColor: colors.errorBg,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  motivoTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },

  datos: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 4 },
  filaComision: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  separador: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  datoEtiqueta: { fontFamily: fonts.body, fontSize: 13, color: colors.text3 },
  comision: { fontFamily: fonts.display, fontSize: 18, color: colors.text, fontVariant: ["tabular-nums"] },
  nota: { paddingVertical: 12, gap: 4 },
  notaTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },

  comprobante: { borderRadius: 24, padding: 10, gap: 10 },
  comprobanteCabeza: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  comprobanteTitulo: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },
  comprobanteAyuda: { fontFamily: fonts.body, fontSize: 12, color: colors.text3 },
  vista: {
    height: 300,
    borderRadius: 16,
    backgroundColor: colors.ground,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  vistaImagen: { width: "100%", height: "100%" },
  ampliar: {
    position: "absolute",
    right: 10,
    bottom: 10,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15,27,51,0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ampliarTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.white },
});
