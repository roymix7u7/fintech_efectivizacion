import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { pedirPermiso } from "../src/lib/permisos";
import { prepararImagen } from "../src/lib/imagen";
import { esFalloDeRed } from "../src/lib/conexion";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { Esqueleto } from "../src/components/Cargando";
import { useAlturaTeclado } from "../src/lib/teclado";
import { alertasUrgentes, marcarVistas } from "../src/lib/alertas";

const BUCKET = "comprobantes";
const MAX_NOTA = 300;

/** Opciones del selector. base64 es obligatorio para que la subida no llegue vacia. */
const OPCIONES_FOTO = {
  mediaTypes: ["images"],
  quality: 1,
  allowsEditing: true,
  // El base64 lo entrega prepararImagen, ya achicada.
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

export default function NuevaSolicitudScreen() {
  const [perfil, setPerfil] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // Alertas urgentes que hay que mostrar antes de enviar. null: sin modal.
  const [urgentes, setUrgentes] = useState(null);
  // Candado contra el doble toque. El estado de React tarda un render en
  // deshabilitar el boton, y en ese intervalo un segundo toque lanzaba
  // otra verificacion y otro envio.
  const enCurso = useRef(false);
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, []),
  );

  async function cargarDatos() {
    setCargando(true);
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
      setTarjetas(tarjetasData || []);

      // Si la tarjeta elegida ya no esta disponible, se limpia.
      setTarjetaSeleccionada((actual) =>
        actual && (tarjetasData || []).some((t) => t.id === actual.id)
          ? actual
          : null,
      );
    } finally {
      setCargando(false);
    }
  }

  async function tomarFoto() {
    if (!(await pedirPermiso("camara"))) return;
    const r = await ImagePicker.launchCameraAsync(OPCIONES_FOTO);
    if (!r.canceled && r.assets?.[0]) guardarComprobante(r.assets[0]);
  }

  async function seleccionarDeGaleria() {
    if (!(await pedirPermiso("galeria"))) return;
    const r = await ImagePicker.launchImageLibraryAsync(OPCIONES_FOTO);
    if (!r.canceled && r.assets?.[0]) guardarComprobante(r.assets[0]);
  }

  async function guardarComprobante(asset) {
    const lista = await prepararImagen(asset);
    if (!lista.base64)
      return mostrar("No pudimos leer la imagen. Intentalo otra vez.", "error");
    setComprobante(lista);
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
    // Sin comprobaciones de tarjeta ni comprobante: el botón de enviar
    // está deshabilitado hasta tener ambos, así que avisarlo aquí sería
    // repetir lo que la pantalla ya muestra.
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

  if (cargando) {
    return (
      <View style={s.container}>
        <View style={s.content}>
          <Esqueleto alto={18} ancho="70%" />
          <Esqueleto alto={13} ancho="50%" estilo={{ marginTop: 10 }} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            <Esqueleto alto={86} ancho={140} radio={14} />
            <Esqueleto alto={86} ancho={140} radio={14} />
          </View>
          <Esqueleto alto={18} ancho="60%" estilo={{ marginTop: 28 }} />
          <Esqueleto alto={200} radio={14} estilo={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  const listo = Boolean(tarjetaSeleccionada && comprobante);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingBottom: 60 + altoTeclado }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* Paso 1: Seleccionar tarjeta */}
      <Text style={s.stepTitle}>
        1. Con que tarjeta realizaste la operacion?
      </Text>
      <Text style={s.stepSub}>
        Solo puedes enviar comprobantes de tus tarjetas verificadas
      </Text>

      {tarjetas.length === 0 ? (
        <TouchableOpacity
          style={s.warningBox}
          onPress={() => router.dismissTo("/(tabs)/tarjetas")}
        >
          <Text style={s.warningText}>
            No tienes tarjetas verificadas. Toca aqui para registrar una.
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={s.tarjetasGrid}>
          {tarjetas.map((t) => {
            const activa = tarjetaSeleccionada?.id === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[s.tarjetaCard, activa && s.tarjetaCardActive]}
                onPress={() => setTarjetaSeleccionada(activa ? null : t)}
              >
                <Text
                  style={[s.tarjetaBanco, activa && s.tarjetaTextActive]}
                >
                  {t.banco}
                </Text>
                <Text
                  style={[s.tarjetaNumero, activa && s.tarjetaTextActive]}
                >
                  {"•••• "}
                  {t.ultimos_4}
                </Text>
                {activa && <Text style={s.tarjetaCheck}>{"✓"}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Paso 2: Comprobante */}
      <Text style={s.stepTitle}>2. Adjunta el comprobante</Text>
      <Text style={s.stepSub}>
        Foto clara del voucher o captura de la transferencia
      </Text>

      {comprobante ? (
        <View style={s.comprobantePreview}>
          <Image source={{ uri: comprobante.uri }} style={s.comprobanteImage} />
          <TouchableOpacity
            onPress={() => setComprobante(null)}
            disabled={enviando}
          >
            <Text style={s.cambiarFoto}>Cambiar comprobante</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.fotoBtns}>
          <TouchableOpacity
            style={s.fotoBtn}
            onPress={tomarFoto}
            disabled={enviando}
          >
            <Text style={s.fotoBtnIcon}>{"📷"}</Text>
            <Text style={s.fotoBtnText}>Tomar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.fotoBtn}
            onPress={seleccionarDeGaleria}
            disabled={enviando}
          >
            <Text style={s.fotoBtnIcon}>{"🖼"}</Text>
            <Text style={s.fotoBtnText}>Galeria</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Paso 3: Nota opcional */}
      <Text style={s.stepTitle}>3. Nota adicional (opcional)</Text>
      <TextInput
        style={s.textArea}
        placeholder="Algun detalle sobre la operacion..."
        value={nota}
        onChangeText={(v) => setNota(v.slice(0, MAX_NOTA))}
        multiline
        maxLength={MAX_NOTA}
        placeholderTextColor={COLORS.textLight}
      />
      <Text style={s.contador}>
        {nota.length} / {MAX_NOTA}
      </Text>

      {/* Resumen */}
      {listo && (
        <View style={s.resumen}>
          <Text style={s.resumenTitle}>Resumen de solicitud</Text>
          <View style={s.resumenRow}>
            <Text style={s.resumenLabel}>Tarjeta</Text>
            <Text style={s.resumenValue}>
              {tarjetaSeleccionada.banco}
              {" •••• "}
              {tarjetaSeleccionada.ultimos_4}
            </Text>
          </View>
          <View style={s.resumenRow}>
            <Text style={s.resumenLabel}>Comprobante</Text>
            <Text style={[s.resumenValue, { color: COLORS.success }]}>
              Adjunto
            </Text>
          </View>
          {nota.trim() ? (
            <View style={s.resumenRow}>
              <Text style={s.resumenLabel}>Nota</Text>
              <Text style={s.resumenValue} numberOfLines={1}>
                {nota.trim()}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Enviar */}
      <TouchableOpacity
        style={[
          s.btnEnviar,
          (!listo || enviando || verificando) && s.btnDisabled,
        ]}
        onPress={alPresionarEnviar}
        disabled={enviando || verificando || !listo}
      >
        {(enviando || verificando) && (
          <ActivityIndicator size="small" color={COLORS.white} />
        )}
        <Text style={s.btnEnviarText}>
          {verificando
            ? "Verificando..."
            : enviando
              ? "Enviando..."
              : "Enviar solicitud"}
        </Text>
      </TouchableOpacity>

      {/* Alerta urgente antes de enviar */}
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
            <Text style={s.modalTexto}>
              Léelo antes de enviar tu solicitud.
            </Text>

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
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centrado: { justifyContent: "center", alignItems: "center" },
  contador: { fontSize: 12, color: COLORS.textLight, textAlign: "right", marginTop: 6 },
  content: { padding: 20, paddingBottom: 60 },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 4,
  },
  stepSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 },
  warningBox: {
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  warningText: { fontSize: 14, color: "#F57F17" },
  tarjetasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tarjetaCard: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    minWidth: 140,
    backgroundColor: COLORS.white,
  },
  tarjetaCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  tarjetaBanco: { fontSize: 16, fontWeight: "600", color: COLORS.text },
  tarjetaNumero: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  tarjetaTextActive: { color: COLORS.white },
  tarjetaCheck: {
    position: "absolute",
    top: 8,
    right: 10,
    fontSize: 16,
    color: COLORS.secondary,
  },
  comprobantePreview: { alignItems: "center", gap: 10 },
  comprobanteImage: {
    width: "100%",
    height: 250,
    borderRadius: 14,
    backgroundColor: COLORS.inputBg,
  },
  cambiarFoto: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
  fotoBtns: { flexDirection: "row", gap: 12 },
  fotoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  fotoBtnIcon: { fontSize: 32, marginBottom: 8 },
  fotoBtnText: { fontSize: 14, color: COLORS.text, fontWeight: "500" },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    backgroundColor: COLORS.white,
    color: COLORS.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  resumen: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resumenTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
  },
  resumenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  resumenLabel: { fontSize: 14, color: COLORS.textSecondary },
  resumenValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: "60%",
    textAlign: "right",
  },
  btnEnviar: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
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
  btnDisabled: { backgroundColor: COLORS.textLight },
  btnEnviarText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
