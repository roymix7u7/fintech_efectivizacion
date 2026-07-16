import { useState } from "react";
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
import PERU_DATA from "../src/data/peru";
import COLORS from "../src/theme/colors";

export default function RegistroScreen() {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    password: "",
    confirmarPassword: "",
    telefono: "",
    dni: "",
    direccion: "",
    codigo_promo: "",
    departamento: "",
    provincia: "",
    distrito: "",
  });
  const [codigoOtp, setCodigoOtp] = useState("");
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [userId, setUserId] = useState(null);
  const [showDepartamento, setShowDepartamento] = useState(false);
  const [showProvincia, setShowProvincia] = useState(false);
  const [showDistrito, setShowDistrito] = useState(false);
  const router = useRouter();

  function updateForm(key, value) {
    setForm({ ...form, [key]: value });
  }
  function alerta(msg) {
    if (typeof window !== "undefined") window.alert(msg);
  }

  const departamentos = Object.keys(PERU_DATA).sort();
  const provincias = form.departamento
    ? Object.keys(PERU_DATA[form.departamento]).sort()
    : [];
  const distritos =
    form.departamento && form.provincia
      ? (PERU_DATA[form.departamento][form.provincia] || []).sort()
      : [];

  // ── Validaciones de contraseña ──
  const passChecks = {
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    number: /[0-9]/.test(form.password),
    special: /\W/.test(form.password),
    match:
      form.password === form.confirmarPassword &&
      form.confirmarPassword.length > 0,
  };

  async function enviarCodigoVerificacion() {
    if (
      !form.nombres ||
      !form.apellidos ||
      !form.dni ||
      !form.telefono ||
      !form.email ||
      !form.password ||
      !form.confirmarPassword
    ) {
      alerta("Completa todos los campos obligatorios.");
      return;
    }
    if (form.dni.length !== 8) {
      alerta("El DNI debe tener 8 dígitos.");
      return;
    }
    if (!passChecks.length) {
      alerta("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!passChecks.upper) {
      alerta("La contraseña debe tener al menos una mayúscula.");
      return;
    }
    if (!passChecks.lower) {
      alerta("La contraseña debe tener al menos una minúscula.");
      return;
    }
    if (!passChecks.number) {
      alerta("La contraseña debe tener al menos un número.");
      return;
    }
    if (!passChecks.special) {
      alerta("La contraseña debe tener al menos un carácter especial.");
      return;
    }
    if (!passChecks.match) {
      alerta("Las contraseñas no coinciden.");
      return;
    }
    if (!form.departamento || !form.provincia || !form.distrito) {
      alerta("Selecciona tu ubicación completa.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });
      if (authError) {
        setLoading(false);
        alerta("Error: " + authError.message);
        return;
      }
      setUserId(authData.user?.id);
      setLoading(false);
      setPaso(2);
      alerta("Se envió un código de verificación a " + form.email);
    } catch (err) {
      setLoading(false);
      alerta("Error: " + err.message);
    }
  }

  async function verificarCodigo() {
    if (codigoOtp.length !== 6) {
      alerta("Ingresa el código de 6 dígitos.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: form.email,
      token: codigoOtp,
      type: "signup",
    });
    if (error) {
      setLoading(false);
      alerta("Código inválido o expirado.");
      return;
    }
    setLoading(false);
    setPaso(3);
  }

  async function reenviarCodigo() {
    setReenviando(true);
    await supabase.auth.resend({ type: "signup", email: form.email });
    setReenviando(false);
    alerta("Nuevo código enviado. El anterior ya no es válido.");
  }

  async function seleccionarFoto(tipo) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      alerta("Se necesita permiso para la cámara.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: tipo === "selfie" ? [1, 1] : [4, 3],
    });
    if (!result.canceled && result.assets[0])
      setFotos({ ...fotos, [tipo]: result.assets[0] });
  }

  async function seleccionarDeGaleria(tipo) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alerta("Se necesita permiso para la galería.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: tipo === "selfie" ? [1, 1] : [4, 3],
    });
    if (!result.canceled && result.assets[0])
      setFotos({ ...fotos, [tipo]: result.assets[0] });
  }

  async function subirFoto(uri, path) {
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from("kyc-documentos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const { data } = await supabase.storage
      .from("kyc-documentos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return data.signedUrl;
  }

  async function finalizarRegistro() {
    if (!fotos.dni_frontal || !fotos.dni_posterior || !fotos.selfie) {
      alerta("Sube las 3 fotos requeridas.");
      return;
    }
    setLoading(true);
    try {
      const uid = userId;
      const { error: userError } = await supabase
        .from("users")
        .insert({
          id: uid,
          email: form.email,
          rol: "cliente",
          estado: "pendiente",
        });
      if (userError) throw new Error(userError.message);

      let urlFrontal = null,
        urlPosterior = null,
        urlSelfie = null;
      try {
        urlFrontal = await subirFoto(
          fotos.dni_frontal.uri,
          `${uid}/dni_frontal.jpg`,
        );
        urlPosterior = await subirFoto(
          fotos.dni_posterior.uri,
          `${uid}/dni_posterior.jpg`,
        );
        urlSelfie = await subirFoto(fotos.selfie.uri, `${uid}/selfie.jpg`);
      } catch (e) {
        console.log("Error subiendo fotos:", e.message);
      }

      const direccionCompleta = `${form.direccion}, ${form.distrito}, ${form.provincia}, ${form.departamento}`;

      const { error: perfilError } = await supabase
        .from("perfiles_cliente")
        .insert({
          user_id: uid,
          nombres: form.nombres,
          apellidos: form.apellidos,
          dni: form.dni,
          telefono: "+51" + form.telefono,
          direccion: direccionCompleta,
          codigo_promo: form.codigo_promo || null,
          foto_dni_frontal: urlFrontal,
          foto_dni_posterior: urlPosterior,
          foto_selfie: urlSelfie,
        });
      if (perfilError) throw new Error(perfilError.message);

      setLoading(false);
      alerta("¡Cuenta creada! Tu cuenta está en revisión.");
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      setLoading(false);
      alerta("Error: " + err.message);
    }
  }

  function renderSelector(label, valor, opciones, show, setShow, onSelect) {
    return (
      <View>
        <Text style={s.selectorLabel}>{label}</Text>
        <TouchableOpacity style={s.selector} onPress={() => setShow(!show)}>
          <Text style={valor ? s.selectorText : s.selectorPlaceholder}>
            {valor || `Selecciona ${label.toLowerCase()}`}
          </Text>
          <Text style={s.selectorArrow}>{show ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {show && (
          <ScrollView style={s.selectorList} nestedScrollEnabled>
            {opciones.map((op) => (
              <TouchableOpacity
                key={op}
                style={s.selectorItem}
                onPress={() => {
                  onSelect(op);
                  setShow(false);
                }}
              >
                <Text
                  style={[
                    s.selectorItemText,
                    valor === op && s.selectorItemActive,
                  ]}
                >
                  {op}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Indicador de pasos */}
      <View style={s.pasoIndicador}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={[s.pasoDot, paso >= n && s.pasoDotActive]}>
              <Text style={[s.pasoDotText, paso >= n && s.pasoDotTextActive]}>
                {n}
              </Text>
            </View>
            {n < 3 && (
              <View style={[s.pasoLinea, paso > n && s.pasoLineaActive]} />
            )}
          </View>
        ))}
      </View>
      <Text style={s.pasoLabel}>
        {paso === 1
          ? "Datos personales"
          : paso === 2
            ? "Verificar correo"
            : "Documentos de identidad"}
      </Text>

      {/* ── PASO 1 ── */}
      {paso === 1 && (
        <View style={s.form}>
          <TextInput
            style={s.input}
            placeholder="Nombres *"
            value={form.nombres}
            onChangeText={(v) => updateForm("nombres", v)}
            placeholderTextColor={COLORS.textLight}
          />
          <TextInput
            style={s.input}
            placeholder="Apellidos *"
            value={form.apellidos}
            onChangeText={(v) => updateForm("apellidos", v)}
            placeholderTextColor={COLORS.textLight}
          />
          <TextInput
            style={s.input}
            placeholder="DNI * (8 dígitos)"
            value={form.dni}
            onChangeText={(v) =>
              updateForm("dni", v.replace(/\D/g, "").slice(0, 8))
            }
            keyboardType="numeric"
            maxLength={8}
            placeholderTextColor={COLORS.textLight}
          />

          <Text style={s.selectorLabel}>Teléfono *</Text>
          <View style={s.phoneRow}>
            <View style={s.phonePrefix}>
              <Text style={s.phonePrefixText}>🇵🇪 +51</Text>
            </View>
            <TextInput
              style={s.phoneInput}
              placeholder="987654321"
              value={form.telefono}
              onChangeText={(v) =>
                updateForm("telefono", v.replace(/\D/g, "").slice(0, 9))
              }
              keyboardType="phone-pad"
              maxLength={9}
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {renderSelector(
            "Departamento",
            form.departamento,
            departamentos,
            showDepartamento,
            setShowDepartamento,
            (v) => {
              setForm({
                ...form,
                departamento: v,
                provincia: "",
                distrito: "",
              });
            },
          )}
          {form.departamento &&
            renderSelector(
              "Provincia",
              form.provincia,
              provincias,
              showProvincia,
              setShowProvincia,
              (v) => {
                setForm({ ...form, provincia: v, distrito: "" });
              },
            )}
          {form.provincia &&
            renderSelector(
              "Distrito",
              form.distrito,
              distritos,
              showDistrito,
              setShowDistrito,
              (v) => {
                updateForm("distrito", v);
              },
            )}

          <TextInput
            style={s.input}
            placeholder="Dirección (calle, manzana, lote)"
            value={form.direccion}
            onChangeText={(v) => updateForm("direccion", v)}
            placeholderTextColor={COLORS.textLight}
          />
          <TextInput
            style={s.input}
            placeholder="Código promocional (opcional)"
            value={form.codigo_promo}
            onChangeText={(v) => updateForm("codigo_promo", v)}
            placeholderTextColor={COLORS.textLight}
          />

          <View style={s.divider} />

          <TextInput
            style={s.input}
            placeholder="Correo electrónico *"
            value={form.email}
            onChangeText={(v) => updateForm("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={COLORS.textLight}
          />
          <TextInput
            style={s.input}
            placeholder="Contraseña * (mín. 8 caracteres)"
            value={form.password}
            onChangeText={(v) => updateForm("password", v)}
            secureTextEntry
            placeholderTextColor={COLORS.textLight}
          />

          {form.password.length > 0 && (
            <View style={s.validaciones}>
              <Text style={passChecks.length ? s.valOk : s.valFail}>
                {passChecks.length ? "✅" : "❌"} Mínimo 8 caracteres
              </Text>
              <Text style={passChecks.upper ? s.valOk : s.valFail}>
                {passChecks.upper ? "✅" : "❌"} Una letra mayúscula
              </Text>
              <Text style={passChecks.lower ? s.valOk : s.valFail}>
                {passChecks.lower ? "✅" : "❌"} Una letra minúscula
              </Text>
              <Text style={passChecks.number ? s.valOk : s.valFail}>
                {passChecks.number ? "✅" : "❌"} Un número
              </Text>
              <Text style={passChecks.special ? s.valOk : s.valFail}>
                {passChecks.special ? "✅" : "❌"} Un carácter especial
              </Text>
            </View>
          )}

          <TextInput
            style={s.input}
            placeholder="Confirmar contraseña *"
            value={form.confirmarPassword}
            onChangeText={(v) => updateForm("confirmarPassword", v)}
            secureTextEntry
            placeholderTextColor={COLORS.textLight}
          />
          {form.confirmarPassword.length > 0 && (
            <Text style={passChecks.match ? s.valOk : s.valFail}>
              {passChecks.match
                ? "✅ Contraseñas coinciden"
                : "❌ No coinciden"}
            </Text>
          )}

          <TouchableOpacity
            style={s.btn}
            onPress={enviarCodigoVerificacion}
            disabled={loading}
          >
            <Text style={s.btnText}>
              {loading ? "Enviando código..." : "Siguiente →"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={s.link}
          >
            <Text style={s.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PASO 2 ── */}
      {paso === 2 && (
        <View style={s.form}>
          <View style={s.otpCard}>
            <Text style={s.otpIcon}>📧</Text>
            <Text style={s.otpTitle}>Revisa tu correo</Text>
            <Text style={s.otpSubtitle}>
              Enviamos un código de verificación a
            </Text>
            <Text style={s.otpEmail}>{form.email}</Text>
          </View>

          <TextInput
            style={s.inputCode}
            placeholder="000000"
            value={codigoOtp}
            onChangeText={(v) => setCodigoOtp(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="numeric"
            maxLength={6}
            textAlign="center"
            placeholderTextColor={COLORS.textLight}
          />

          <TouchableOpacity
            style={[s.btn, codigoOtp.length !== 6 && s.btnDisabled]}
            onPress={verificarCodigo}
            disabled={loading || codigoOtp.length !== 6}
          >
            <Text style={s.btnText}>
              {loading ? "Verificando..." : "Verificar código"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={reenviarCodigo}
            disabled={reenviando}
            style={s.reenviar}
          >
            <Text style={s.reenviarText}>
              {reenviando
                ? "Reenviando..."
                : "¿No recibiste el código? Reenviar"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setPaso(1)} style={s.link}>
            <Text style={s.linkText}>← Cambiar datos</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PASO 3 ── */}
      {paso === 3 && (
        <View style={s.form}>
          <Text style={s.fotoInstruccion}>
            Sube fotos claras y legibles de tu documento de identidad
          </Text>

          {["dni_frontal", "dni_posterior", "selfie"].map((tipo) => {
            const labels = {
              dni_frontal: "📄 DNI Frontal *",
              dni_posterior: "📄 DNI Posterior *",
              selfie: "🤳 Selfie con DNI *",
            };
            return (
              <View key={tipo}>
                <Text style={s.fotoLabel}>{labels[tipo]}</Text>
                {fotos[tipo] ? (
                  <View style={s.fotoPreview}>
                    <Image
                      source={{ uri: fotos[tipo].uri }}
                      style={s.fotoImage}
                    />
                    <TouchableOpacity
                      onPress={() => setFotos({ ...fotos, [tipo]: null })}
                    >
                      <Text style={s.fotoRemove}>Cambiar foto</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.fotoBtns}>
                    <TouchableOpacity
                      style={s.fotoBtn}
                      onPress={() => seleccionarFoto(tipo)}
                    >
                      <Text style={s.fotoBtnText}>📷 Cámara</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.fotoBtn}
                      onPress={() => seleccionarDeGaleria(tipo)}
                    >
                      <Text style={s.fotoBtnText}>🖼️ Galería</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[
              s.btn,
              (!fotos.dni_frontal || !fotos.dni_posterior || !fotos.selfie) &&
                s.btnDisabled,
            ]}
            onPress={finalizarRegistro}
            disabled={
              loading ||
              !fotos.dni_frontal ||
              !fotos.dni_posterior ||
              !fotos.selfie
            }
          >
            <Text style={s.btnText}>
              {loading ? "Creando cuenta..." : "Crear mi cuenta"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, paddingBottom: 60 },
  pasoIndicador: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  pasoDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  pasoDotActive: { backgroundColor: COLORS.primary },
  pasoDotText: { fontSize: 14, fontWeight: "600", color: COLORS.textLight },
  pasoDotTextActive: { color: COLORS.white },
  pasoLinea: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 6,
  },
  pasoLineaActive: { backgroundColor: COLORS.primary },
  pasoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  form: { gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: COLORS.white,
    color: COLORS.text,
  },
  inputCode: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
    backgroundColor: COLORS.white,
    color: COLORS.text,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { backgroundColor: COLORS.textLight },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  link: { marginTop: 20, alignItems: "center" },
  linkText: { color: COLORS.textSecondary, fontSize: 14 },
  reenviar: { alignItems: "center", paddingVertical: 8 },
  reenviarText: { color: COLORS.secondary, fontSize: 14, fontWeight: "500" },
  validaciones: { gap: 4, paddingLeft: 4 },
  valOk: { fontSize: 13, color: COLORS.success },
  valFail: { fontSize: 13, color: COLORS.error },
  // Phone
  phoneRow: { flexDirection: "row", gap: 8 },
  phonePrefix: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: COLORS.white,
    justifyContent: "center",
  },
  phonePrefixText: { fontSize: 16, color: COLORS.text, fontWeight: "500" },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: COLORS.white,
    color: COLORS.text,
  },
  // Selectors
  selectorLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  selector: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorText: { fontSize: 16, color: COLORS.text },
  selectorPlaceholder: { fontSize: 16, color: COLORS.textLight },
  selectorArrow: { fontSize: 12, color: COLORS.textLight },
  selectorList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    marginTop: 4,
  },
  selectorItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectorItemText: { fontSize: 15, color: COLORS.text },
  selectorItemActive: { color: COLORS.primary, fontWeight: "600" },
  // OTP
  otpCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  otpIcon: { fontSize: 48, marginBottom: 12 },
  otpTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  otpSubtitle: { fontSize: 14, color: COLORS.textSecondary },
  otpEmail: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginTop: 4,
  },
  // Fotos
  fotoInstruccion: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  fotoLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 8,
  },
  fotoBtns: { flexDirection: "row", gap: 10 },
  fotoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  fotoBtnText: { fontSize: 14, color: COLORS.text },
  fotoPreview: { alignItems: "center", gap: 8 },
  fotoImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  fotoRemove: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
});
