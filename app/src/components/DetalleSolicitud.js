import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { urlFirmada } from "../lib/storage";
import { hora } from "../lib/fechas";
import COLORS from "../theme/colors";
import TIPO, { CIFRAS } from "../theme/tipografia";
import { estadoSolicitud } from "../theme/estados";

const BUCKET = "comprobantes";

// Una URL firmada dura una hora. Se reutiliza 50 minutos para que
// reabrir un detalle sea inmediato y no quede a punto de caducar.
const FIRMA_VALIDA_MS = 50 * 60 * 1000;

// Firmas compartidas por todas las pantallas: abrir la misma operacion
// desde el inicio y despues desde el historial no vuelve a firmar.
const firmas = new Map();

const CAMPOS =
  "id, codigo, banco, estado, nota_cliente, motivo_rechazo, comprobante_url, created_at, fecha_revision, pagado_en, tarjetas(banco, ultimos_4)";

const fechaLarga = (iso) =>
  new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }) +
  " · " +
  hora(iso);

function Paso({ icono, color, titulo, fecha, ultimo }) {
  return (
    <View style={s.paso}>
      <View style={s.pasoRiel}>
        <View style={[s.pasoPunto, { backgroundColor: color }]}>
          <Ionicons name={icono} size={12} color={COLORS.white} />
        </View>
        {!ultimo && <View style={s.pasoLinea} />}
      </View>
      <View style={s.pasoTexto}>
        <Text style={s.pasoTitulo}>{titulo}</Text>
        {fecha ? <Text style={s.pasoFecha}>{fechaLarga(fecha)}</Text> : null}
      </View>
    </View>
  );
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

  const id = solicitud?.id || null;

  useEffect(() => {
    abierta.current = id;
    setAmpliada(false);

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
  async function cargar(base) {
    const idActual = base.id;
    setImagen({ estado: "cargando", url: null });

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

  const est = estadoSolicitud(detalle?.estado);
  const tarjeta = detalle?.tarjetas || {
    banco: detalle?.banco,
    ultimos_4: detalle?.ultimos_4,
  };

  return (
    <Modal
      visible={Boolean(id)}
      transparent
      animationType="slide"
      onRequestClose={() => (ampliada ? setAmpliada(false) : onCerrar())}
    >
      <Pressable style={s.hojaFondo} onPress={onCerrar}>
        {/* Pressable interno: tocar la hoja no debe cerrarla. */}
        <Pressable style={s.hoja} onPress={() => {}}>
          {detalle && (
            <>
              <View style={s.hojaAsa} />

              <View style={s.hojaCabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={s.hojaEtiqueta}>Solicitud</Text>
                  <Text style={s.hojaCodigo}>{detalle.codigo}</Text>
                </View>
                <TouchableOpacity
                  onPress={onCerrar}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={24} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <View style={[s.hojaEstado, { backgroundColor: est.bg }]}>
                  <Ionicons name={est.icon} size={18} color={est.color} />
                  <Text style={[s.hojaEstadoTexto, { color: est.color }]}>
                    {est.text}
                  </Text>
                </View>

                <View style={s.datos}>
                  <View>
                    <Text style={s.datoEtiqueta}>Tarjeta</Text>
                    <Text style={s.datoValor}>
                      {tarjeta.banco}
                      {tarjeta.ultimos_4 ? ` •••• ${tarjeta.ultimos_4}` : ""}
                    </Text>
                  </View>
                  {detalle.nota_cliente ? (
                    <View>
                      <Text style={s.datoEtiqueta}>Tu nota</Text>
                      <Text style={s.datoValor}>{detalle.nota_cliente}</Text>
                    </View>
                  ) : null}
                </View>

                {detalle.estado === "rechazado" && detalle.motivo_rechazo ? (
                  <View style={s.rechazoBox}>
                    <Text style={s.rechazoLabel}>Motivo del rechazo</Text>
                    <Text style={s.rechazoTexto}>{detalle.motivo_rechazo}</Text>
                  </View>
                ) : null}

                <Text style={s.seccionTitulo}>Recorrido</Text>
                <View>
                  <Paso
                    icono="paper-plane"
                    color={COLORS.primaryLight}
                    titulo="Enviada"
                    fecha={detalle.created_at}
                    ultimo={detalle.estado === "pendiente"}
                  />
                  {detalle.estado === "pendiente" ? null : (
                    <Paso
                      icono={detalle.estado === "rechazado" ? "close" : "checkmark"}
                      color={
                        detalle.estado === "rechazado"
                          ? COLORS.error
                          : COLORS.success
                      }
                      titulo={
                        detalle.estado === "rechazado" ? "Rechazada" : "Aprobada"
                      }
                      fecha={detalle.fecha_revision}
                      ultimo={detalle.estado !== "pagado"}
                    />
                  )}
                  {detalle.estado === "pagado" && (
                    <Paso
                      icono="cash"
                      color={COLORS.primary}
                      titulo="Pago enviado"
                      fecha={detalle.pagado_en}
                      ultimo
                    />
                  )}
                  {detalle.estado === "pendiente" && (
                    <Text style={s.recorridoPista}>
                      Estamos revisando tu comprobante. Te avisaremos en la
                      campana cuando cambie.
                    </Text>
                  )}
                </View>

                <Text style={s.seccionTitulo}>Comprobante</Text>
                {imagen.estado === "cargando" || imagen.estado === "vacio" ? (
                  <View style={[s.comprobante, s.comprobanteCentro]}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={s.comprobanteAyuda}>Cargando comprobante…</Text>
                  </View>
                ) : imagen.estado === "listo" ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setAmpliada(true)}
                  >
                    <Image
                      source={{ uri: imagen.url }}
                      style={s.comprobante}
                      resizeMode="contain"
                    />
                    <Text style={s.comprobanteAmpliar}>
                      Toca para verlo en pantalla completa
                    </Text>
                  </TouchableOpacity>
                ) : imagen.estado === "sin" ? (
                  <View style={[s.comprobante, s.comprobanteCentro]}>
                    <Ionicons
                      name="image-outline"
                      size={28}
                      color={COLORS.textLight}
                    />
                    <Text style={s.comprobanteAyuda}>
                      Esta solicitud no tiene comprobante guardado.
                    </Text>
                  </View>
                ) : (
                  <View style={[s.comprobante, s.comprobanteCentro]}>
                    <Ionicons
                      name="cloud-offline-outline"
                      size={28}
                      color={COLORS.textLight}
                    />
                    <Text style={s.comprobanteAyuda}>
                      No pudimos cargar el comprobante.
                    </Text>
                    <TouchableOpacity
                      style={s.reintentar}
                      onPress={() => cargar(detalle)}
                    >
                      <Text style={s.reintentarTexto}>Reintentar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>

      {/* Pantalla completa dentro del mismo Modal: dos Modal abiertos a
          la vez se comportan distinto en Android e iOS. */}
      {ampliada && imagen.url ? (
        <Pressable style={s.ampliadaFondo} onPress={() => setAmpliada(false)}>
          <Image
            source={{ uri: imagen.url }}
            style={s.ampliadaImagen}
            resizeMode="contain"
          />
          <View style={s.ampliadaCerrar}>
            <Ionicons name="close" size={26} color={COLORS.white} />
          </View>
        </Pressable>
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  hojaFondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.55)",
    justifyContent: "flex-end",
  },
  hoja: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: "90%",
  },
  hojaAsa: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  hojaCabecera: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  hojaEtiqueta: { ...TIPO.micro, textTransform: "uppercase", letterSpacing: 0.6 },
  hojaCodigo: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 2,
    ...CIFRAS,
  },
  hojaEstado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hojaEstadoTexto: { fontSize: 14, fontWeight: "700" },

  datos: { marginTop: 14, gap: 10 },
  datoEtiqueta: { ...TIPO.micro, marginBottom: 2 },
  datoValor: { fontSize: 14, color: COLORS.text, lineHeight: 20 },

  rechazoBox: {
    backgroundColor: COLORS.errorLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  rechazoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.error,
    marginBottom: 3,
  },
  rechazoTexto: { fontSize: 13.5, color: COLORS.error, lineHeight: 19 },

  seccionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 10,
  },

  recorridoPista: { ...TIPO.apoyo, marginTop: 6 },
  paso: { flexDirection: "row", gap: 12 },
  pasoRiel: { alignItems: "center", width: 22 },
  pasoPunto: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  pasoLinea: { width: 2, flex: 1, minHeight: 16, backgroundColor: COLORS.border },
  pasoTexto: { flex: 1, paddingBottom: 14 },
  pasoTitulo: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  pasoFecha: { ...TIPO.micro, marginTop: 2 },

  comprobante: {
    width: "100%",
    height: 320,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  comprobanteCentro: { alignItems: "center", justifyContent: "center", gap: 8 },
  comprobanteAyuda: { ...TIPO.apoyo, textAlign: "center", paddingHorizontal: 20 },
  comprobanteAmpliar: { ...TIPO.micro, textAlign: "center", marginTop: 8 },
  reintentar: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reintentarTexto: { fontSize: 13, fontWeight: "600", color: COLORS.primary },

  ampliadaFondo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  ampliadaImagen: { width: "100%", height: "82%" },
  ampliadaCerrar: { position: "absolute", top: 50, right: 20 },
});
