import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import COLORS from "../src/theme/colors";

export default function NuevaSolicitudScreen() {
  const [perfil, setPerfil] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!perfilData) return;
    setPerfil(perfilData);

    const { data: tarjetasData } = await supabase
      .from("tarjetas")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setTarjetas(tarjetasData || []);
  }

  async function tomarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      if (typeof window !== "undefined")
        window.alert("Se necesita permiso para la cámara.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) setComprobante(result.assets[0]);
  }

  async function seleccionarDeGaleria() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      if (typeof window !== "undefined")
        window.alert("Se necesita permiso para la galería.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) setComprobante(result.assets[0]);
  }

  async function generarCodigo() {
    const anio = new Date().getFullYear();
    const prefijo = `SOL-${anio}-`;
    const { data } = await supabase
      .from("solicitudes")
      .select("codigo")
      .like("codigo", `${prefijo}%`)
      .order("codigo", { ascending: false })
      .limit(1);
    let siguiente = 1;
    if (data && data.length > 0) {
      const ultimo = parseInt(data[0].codigo.split("-")[2]) || 0;
      siguiente = ultimo + 1;
    }
    return `${prefijo}${String(siguiente).padStart(6, "0")}`;
  }

  async function enviarSolicitud() {
    if (!tarjetaSeleccionada) {
      if (typeof window !== "undefined")
        window.alert(
          "Selecciona la tarjeta con la que realizaste la operación.",
        );
      return;
    }
    if (!comprobante) {
      if (typeof window !== "undefined")
        window.alert("Adjunta el comprobante de la operación.");
      return;
    }

    setLoading(true);

    try {
      const codigo = await generarCodigo();

      // Subir comprobante
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const timestamp = Date.now();
      const path = `${user.id}/${timestamp}.jpg`;

      const response = await fetch(comprobante.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("comprobantes")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadError)
        throw new Error("Error subiendo comprobante: " + uploadError.message);

      const { data: urlData } = await supabase.storage
        .from("comprobantes")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      // Crear solicitud
      const { error: solError } = await supabase.from("solicitudes").insert({
        codigo,
        cliente_id: perfil.id,
        tarjeta_id: tarjetaSeleccionada.id,
        banco: tarjetaSeleccionada.banco,
        comprobante_url: urlData?.signedUrl || path,
        nota_cliente: nota || null,
        estado: "pendiente",
      });

      if (solError)
        throw new Error("Error creando solicitud: " + solError.message);

      // Auditoría
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      await supabase.from("auditoria_logs").insert({
        usuario_id: currentUser.id,
        accion: "CREAR_SOLICITUD",
        entidad: "solicitudes",
        datos_despues: { codigo, banco: tarjetaSeleccionada.banco },
      });

      setLoading(false);
      if (typeof window !== "undefined") {
        window.alert(
          `Solicitud ${codigo} enviada. Revisaremos tu comprobante.`,
        );
      }
      router.replace("/(tabs)/solicitudes");
    } catch (err) {
      setLoading(false);
      if (typeof window !== "undefined") window.alert("Error: " + err.message);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Paso 1: Seleccionar tarjeta */}
      <Text style={s.stepTitle}>
        1. ¿Con qué tarjeta realizaste la operación?
      </Text>
      <Text style={s.stepSub}>
        Solo puedes enviar comprobantes de tus tarjetas registradas
      </Text>

      {tarjetas.length === 0 ? (
        <View style={s.warningBox}>
          <Text style={s.warningText}>
            No tienes tarjetas registradas. Agrégala en la pestaña Tarjetas.
          </Text>
        </View>
      ) : (
        <View style={s.tarjetasGrid}>
          {tarjetas.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                s.tarjetaCard,
                tarjetaSeleccionada?.id === t.id && s.tarjetaCardActive,
              ]}
              onPress={() => setTarjetaSeleccionada(t)}
            >
              <Text
                style={[
                  s.tarjetaBanco,
                  tarjetaSeleccionada?.id === t.id && s.tarjetaTextActive,
                ]}
              >
                {t.banco}
              </Text>
              <Text
                style={[
                  s.tarjetaNumero,
                  tarjetaSeleccionada?.id === t.id && s.tarjetaTextActive,
                ]}
              >
                •••• {t.ultimos_4}
              </Text>
              {tarjetaSeleccionada?.id === t.id && (
                <Text style={s.tarjetaCheck}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Paso 2: Comprobante */}
      <Text style={s.stepTitle}>2. Adjunta el comprobante</Text>
      <Text style={s.stepSub}>
        Foto clara del voucher o captura de pantalla de la transferencia
      </Text>

      {comprobante ? (
        <View style={s.comprobantePreview}>
          <Image source={{ uri: comprobante.uri }} style={s.comprobanteImage} />
          <TouchableOpacity onPress={() => setComprobante(null)}>
            <Text style={s.cambiarFoto}>Cambiar comprobante</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.fotoBtns}>
          <TouchableOpacity style={s.fotoBtn} onPress={tomarFoto}>
            <Text style={s.fotoBtnIcon}>📷</Text>
            <Text style={s.fotoBtnText}>Tomar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.fotoBtn} onPress={seleccionarDeGaleria}>
            <Text style={s.fotoBtnIcon}>🖼️</Text>
            <Text style={s.fotoBtnText}>Galería</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Paso 3: Nota opcional */}
      <Text style={s.stepTitle}>3. Nota adicional (opcional)</Text>
      <TextInput
        style={s.textArea}
        placeholder="Algún detalle sobre la operación..."
        value={nota}
        onChangeText={setNota}
        multiline
        numberOfLines={3}
        placeholderTextColor={COLORS.textLight}
      />

      {/* Resumen */}
      {tarjetaSeleccionada && comprobante && (
        <View style={s.resumen}>
          <Text style={s.resumenTitle}>Resumen de solicitud</Text>
          <View style={s.resumenRow}>
            <Text style={s.resumenLabel}>Tarjeta</Text>
            <Text style={s.resumenValue}>
              {tarjetaSeleccionada.banco} •••• {tarjetaSeleccionada.ultimos_4}
            </Text>
          </View>
          <View style={s.resumenRow}>
            <Text style={s.resumenLabel}>Comprobante</Text>
            <Text style={[s.resumenValue, { color: COLORS.success }]}>
              ✅ Adjunto
            </Text>
          </View>
          {nota ? (
            <View style={s.resumenRow}>
              <Text style={s.resumenLabel}>Nota</Text>
              <Text style={s.resumenValue} numberOfLines={1}>
                {nota}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Enviar */}
      <TouchableOpacity
        style={[
          s.btnEnviar,
          (!tarjetaSeleccionada || !comprobante) && s.btnDisabled,
        ]}
        onPress={enviarSolicitud}
        disabled={loading || !tarjetaSeleccionada || !comprobante}
      >
        <Text style={s.btnEnviarText}>
          {loading ? "Enviando..." : "Enviar solicitud"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
    marginTop: 24,
  },
  btnDisabled: { backgroundColor: COLORS.textLight },
  btnEnviarText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
});
