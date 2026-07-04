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
  const router = useRouter();

  function updateForm(key, value) {
    setForm({ ...form, [key]: value });
  }

  function alerta(msg) {
    if (typeof window !== "undefined") window.alert(msg);
  }

  // ── PASO 1: Validar datos y crear usuario ──────────────────

  async function enviarCodigoVerificacion() {
    console.log("Ejecutando enviarCodigoVerificacion");
    console.log("Form:", form);

    setLoading(true);
    console.log("Llamando signUp...");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      console.log("SignUp completado:", { authData, authError });

      if (authError) {
        setLoading(false);
        console.log("Error en signUp:", authError.message);
        return alerta("Error: " + authError.message);
      }

      setUserId(authData.user?.id);
      console.log("userId:", authData.user?.id);
      setLoading(false);
      setPaso(2);
      alerta("Se envió un código de verificación a " + form.email);
    } catch (err) {
      console.log("Excepción en signUp:", err);
      setLoading(false);
      alerta("Error inesperado: " + err.message);
    }
    if (
      !form.nombres ||
      !form.apellidos ||
      !form.dni ||
      !form.telefono ||
      !form.email ||
      !form.password
    ) {
      return alerta("Completa todos los campos obligatorios.");
    }
    if (form.dni.length !== 8) return alerta("El DNI debe tener 8 dígitos.");
    if (form.password.length < 8)
      return alerta("La contraseña debe tener al menos 8 caracteres.");
    if (!/[A-Z]/.test(form.password))
      return alerta("La contraseña debe tener al menos una letra mayúscula.");
    if (!/[a-z]/.test(form.password))
      return alerta("La contraseña debe tener al menos una letra minúscula.");
    if (!/[0-9]/.test(form.password))
      return alerta("La contraseña debe tener al menos un número.");
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password))
      return alerta(
        "La contraseña debe tener al menos un carácter especial (!@#$%...).",
      );
    if (form.password !== form.confirmarPassword)
      return alerta("Las contraseñas no coinciden.");
  }

  // ── PASO 2: Verificar código OTP ───────────────────────────
  async function verificarCodigo() {
    if (codigoOtp.length !== 6)
      return alerta("Ingresa el código de 6 dígitos.");
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: form.email,
      token: codigoOtp,
      type: "signup",
    });

    if (error) {
      setLoading(false);
      return alerta("Código inválido o expirado. Solicita uno nuevo.");
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

  // ── PASO 3: Fotos y finalizar registro ─────────────────────
  async function seleccionarFoto(tipo) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted")
      return alerta("Se necesita permiso para usar la cámara.");

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: tipo === "selfie" ? [1, 1] : [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      setFotos({ ...fotos, [tipo]: result.assets[0] });
    }
  }

  async function seleccionarDeGaleria(tipo) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted")
      return alerta("Se necesita permiso para acceder a la galería.");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: tipo === "selfie" ? [1, 1] : [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      setFotos({ ...fotos, [tipo]: result.assets[0] });
    }
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
      return alerta("Sube las 3 fotos requeridas.");
    }
    setLoading(true);

    try {
      const uid = userId;

      // Crear en tabla users
      const { error: userError } = await supabase.from("users").insert({
        id: uid,
        email: form.email,
        rol: "cliente",
        estado: "pendiente",
      });
      if (userError) throw new Error(userError.message);

      // Subir fotos
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

      // Crear perfil
      const { error: perfilError } = await supabase
        .from("perfiles_cliente")
        .insert({
          user_id: uid,
          nombres: form.nombres,
          apellidos: form.apellidos,
          dni: form.dni,
          telefono: form.telefono,
          direccion: form.direccion,
          codigo_promo: form.codigo_promo || null,
          foto_dni_frontal: urlFrontal,
          foto_dni_posterior: urlPosterior,
          foto_selfie: urlSelfie,
        });
      if (perfilError) throw new Error(perfilError.message);

      setLoading(false);
      alerta(
        "¡Cuenta creada! Tu cuenta está en revisión. Te notificaremos cuando sea aprobada.",
      );
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      setLoading(false);
      alerta("Error: " + err.message);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Indicador de pasos */}
      <View style={styles.pasoIndicador}>
        <View style={[styles.pasoDot, paso >= 1 && styles.pasoDotActive]} />
        <View style={styles.pasoLinea} />
        <View style={[styles.pasoDot, paso >= 2 && styles.pasoDotActive]} />
        <View style={styles.pasoLinea} />
        <View style={[styles.pasoDot, paso >= 3 && styles.pasoDotActive]} />
      </View>
      <Text style={styles.pasoLabel}>
        {paso === 1
          ? "Paso 1 de 3 — Datos personales"
          : paso === 2
            ? "Paso 2 de 3 — Verificar correo"
            : "Paso 3 de 3 — Documentos de identidad"}
      </Text>

      {/* ── PASO 1: Datos personales ── */}
      {paso === 1 && (
        <View style={styles.form}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>
            Completa tus datos para registrarte
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Nombres *"
            value={form.nombres}
            onChangeText={(v) => updateForm("nombres", v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Apellidos *"
            value={form.apellidos}
            onChangeText={(v) => updateForm("apellidos", v)}
          />
          <TextInput
            style={styles.input}
            placeholder="DNI * (8 dígitos)"
            value={form.dni}
            onChangeText={(v) =>
              updateForm("dni", v.replace(/\D/g, "").slice(0, 8))
            }
            keyboardType="numeric"
            maxLength={8}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono * (ej: +51987654321)"
            value={form.telefono}
            onChangeText={(v) => updateForm("telefono", v)}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección"
            value={form.direccion}
            onChangeText={(v) => updateForm("direccion", v)}
          />
          <TextInput
            style={styles.input}
            placeholder="Código promocional (opcional)"
            value={form.codigo_promo}
            onChangeText={(v) => updateForm("codigo_promo", v)}
          />
          <View style={styles.divider} />

          <TextInput
            style={styles.input}
            placeholder="Correo electrónico *"
            value={form.email}
            onChangeText={(v) => updateForm("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña * (mín. 8 caracteres)"
            value={form.password}
            onChangeText={(v) => updateForm("password", v)}
            secureTextEntry
          />

          {form.password.length > 0 && (
            <View style={styles.validaciones}>
              <Text
                style={
                  form.password.length >= 8 ? styles.valOk : styles.valFail
                }
              >
                {form.password.length >= 8 ? "✅" : "❌"} Mínimo 8 caracteres
              </Text>
              <Text
                style={
                  /[A-Z]/.test(form.password) ? styles.valOk : styles.valFail
                }
              >
                {/[A-Z]/.test(form.password) ? "✅" : "❌"} Una letra mayúscula
              </Text>
              <Text
                style={
                  /[a-z]/.test(form.password) ? styles.valOk : styles.valFail
                }
              >
                {/[a-z]/.test(form.password) ? "✅" : "❌"} Una letra minúscula
              </Text>
              <Text
                style={
                  /[0-9]/.test(form.password) ? styles.valOk : styles.valFail
                }
              >
                {/[0-9]/.test(form.password) ? "✅" : "❌"} Un número
              </Text>
              <Text
                style={
                  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password)
                    ? styles.valOk
                    : styles.valFail
                }
              >
                {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password)
                  ? "✅"
                  : "❌"}{" "}
                Un carácter especial
              </Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Confirmar contraseña *"
            value={form.confirmarPassword}
            onChangeText={(v) => updateForm("confirmarPassword", v)}
            secureTextEntry
          />

          {form.confirmarPassword.length > 0 && (
            <Text
              style={
                form.password === form.confirmarPassword
                  ? styles.valOk
                  : styles.valFail
              }
            >
              {form.password === form.confirmarPassword
                ? "✅ Las contraseñas coinciden"
                : "❌ Las contraseñas no coinciden"}
            </Text>
          )}

          <TouchableOpacity
            style={styles.btn}
            onPress={enviarCodigoVerificacion}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading ? "Enviando código..." : "Siguiente →"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={styles.link}
          >
            <Text style={styles.linkText}>
              ¿Ya tienes cuenta? Inicia sesión
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PASO 2: Verificar correo ── */}
      {paso === 2 && (
        <View style={styles.form}>
          <Text style={styles.title}>Verificar correo</Text>
          <Text style={styles.subtitle}>
            Ingresa el código de 6 dígitos enviado a {form.email}
          </Text>

          <TextInput
            style={styles.inputCode}
            placeholder="000000"
            value={codigoOtp}
            onChangeText={(v) => setCodigoOtp(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="numeric"
            maxLength={6}
            textAlign="center"
          />

          <TouchableOpacity
            style={styles.btn}
            onPress={verificarCodigo}
            disabled={loading || codigoOtp.length !== 6}
          >
            <Text style={styles.btnText}>
              {loading ? "Verificando..." : "Verificar código"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={reenviarCodigo}
            disabled={reenviando}
            style={styles.reenviar}
          >
            <Text style={styles.reenviarText}>
              {reenviando
                ? "Reenviando..."
                : "¿No recibiste el código? Reenviar"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setPaso(1)} style={styles.link}>
            <Text style={styles.linkText}>← Cambiar datos</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PASO 3: Fotos de identidad ── */}
      {paso === 3 && (
        <View style={styles.form}>
          <Text style={styles.title}>Documentos</Text>
          <Text style={styles.subtitle}>
            Sube tus fotos de DNI y una selfie
          </Text>

          {["dni_frontal", "dni_posterior", "selfie"].map((tipo) => {
            const labels = {
              dni_frontal: "📄 DNI Frontal *",
              dni_posterior: "📄 DNI Posterior *",
              selfie: "🤳 Selfie sosteniendo el DNI *",
            };
            return (
              <View key={tipo}>
                <Text style={styles.fotoLabel}>{labels[tipo]}</Text>
                {fotos[tipo] ? (
                  <View style={styles.fotoPreview}>
                    <Image
                      source={{ uri: fotos[tipo].uri }}
                      style={styles.fotoImage}
                    />
                    <TouchableOpacity
                      onPress={() => setFotos({ ...fotos, [tipo]: null })}
                    >
                      <Text style={styles.fotoRemove}>Cambiar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.fotoBtns}>
                    <TouchableOpacity
                      style={styles.fotoBtn}
                      onPress={() => seleccionarFoto(tipo)}
                    >
                      <Text style={styles.fotoBtnText}>📷 Cámara</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.fotoBtn}
                      onPress={() => seleccionarDeGaleria(tipo)}
                    >
                      <Text style={styles.fotoBtnText}>🖼️ Galería</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.botonesNav}>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnFlex,
                (!fotos.dni_frontal || !fotos.dni_posterior || !fotos.selfie) &&
                  styles.btnDisabled,
              ]}
              onPress={finalizarRegistro}
              disabled={
                loading ||
                !fotos.dni_frontal ||
                !fotos.dni_posterior ||
                !fotos.selfie
              }
            >
              <Text style={styles.btnText}>
                {loading ? "Creando cuenta..." : "Registrarme"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 32, paddingBottom: 60 },
  pasoIndicador: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pasoDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#ddd" },
  pasoDotActive: { backgroundColor: "#111" },
  pasoLinea: {
    width: 30,
    height: 2,
    backgroundColor: "#ddd",
    marginHorizontal: 6,
  },
  pasoLabel: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 16, color: "#666", marginTop: 4, marginBottom: 24 },
  form: { gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  inputCode: {
    borderWidth: 2,
    borderColor: "#111",
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
  },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 8 },
  btn: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnFlex: { flex: 1 },
  btnDisabled: { backgroundColor: "#ccc" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { marginTop: 24, alignItems: "center" },
  linkText: { color: "#666", fontSize: 14 },
  reenviar: { alignItems: "center", paddingVertical: 8 },
  reenviarText: { color: "#3B82F6", fontSize: 14 },
  fotoLabel: { fontSize: 15, fontWeight: "600", color: "#111", marginTop: 8 },
  fotoBtns: { flexDirection: "row", gap: 10 },
  fotoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  fotoBtnText: { fontSize: 14, color: "#333" },
  fotoPreview: { alignItems: "center", gap: 8 },
  fotoImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  fotoRemove: { fontSize: 14, color: "#3B82F6", fontWeight: "500" },
  botonesNav: { flexDirection: "row", gap: 12, marginTop: 8 },
  validaciones: { gap: 4, paddingLeft: 4 },
  valOk: { fontSize: 13, color: "#10B981" },
  valFail: { fontSize: 13, color: "#EF4444" },
});
