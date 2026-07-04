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
    telefono: "",
    dni: "",
    direccion: "",
    codigo_promo: "",
  });
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function updateForm(key, value) {
    setForm({ ...form, [key]: value });
  }

  async function seleccionarFoto(tipo) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      const msg = "Se necesita permiso para usar la cámara.";
      if (typeof window !== "undefined") window.alert(msg);
      return;
    }

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

    if (status !== "granted") {
      const msg = "Se necesita permiso para acceder a la galería.";
      if (typeof window !== "undefined") window.alert(msg);
      return;
    }

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
      .upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) throw error;

    const { data } = await supabase.storage
      .from("kyc-documentos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return data.signedUrl;
  }

  function validarPaso1() {
    if (
      !form.nombres ||
      !form.apellidos ||
      !form.dni ||
      !form.telefono ||
      !form.email ||
      !form.password
    ) {
      const msg = "Completa todos los campos obligatorios.";
      if (typeof window !== "undefined") window.alert(msg);
      return false;
    }
    if (form.dni.length !== 8) {
      const msg = "El DNI debe tener 8 dígitos.";
      if (typeof window !== "undefined") window.alert(msg);
      return false;
    }
    if (form.password.length < 6) {
      const msg = "La contraseña debe tener al menos 6 caracteres.";
      if (typeof window !== "undefined") window.alert(msg);
      return false;
    }
    return true;
  }

  function validarPaso2() {
    if (!fotos.dni_frontal || !fotos.dni_posterior || !fotos.selfie) {
      const msg =
        "Debes subir las 3 fotos: DNI frontal, DNI posterior y selfie.";
      if (typeof window !== "undefined") window.alert(msg);
      return false;
    }
    return true;
  }

  async function handleRegistro() {
    if (!validarPaso2()) return;
    setLoading(true);

    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) throw new Error(authError.message);
      const userId = authData.user?.id;
      if (!userId) throw new Error("No se pudo crear la cuenta.");

      // 2. Crear registro en tabla users
      const { error: userError } = await supabase.from("users").insert({
        id: userId,
        email: form.email,
        rol: "cliente",
        estado: "pendiente",
      });
      if (userError)
        throw new Error("Error creando usuario: " + userError.message);

      // 3. Subir fotos a Supabase Storage
      let urlDniFrontal = null;
      let urlDniPosterior = null;
      let urlSelfie = null;

      try {
        urlDniFrontal = await subirFoto(
          fotos.dni_frontal.uri,
          `${userId}/dni_frontal.jpg`,
        );
        urlDniPosterior = await subirFoto(
          fotos.dni_posterior.uri,
          `${userId}/dni_posterior.jpg`,
        );
        urlSelfie = await subirFoto(fotos.selfie.uri, `${userId}/selfie.jpg`);
      } catch (uploadError) {
        console.log("Error subiendo fotos:", uploadError.message);
        // Continuamos aunque falle la subida — el perfil se crea igual
      }

      // 4. Crear perfil del cliente
      const { error: perfilError } = await supabase
        .from("perfiles_cliente")
        .insert({
          user_id: userId,
          nombres: form.nombres,
          apellidos: form.apellidos,
          dni: form.dni,
          telefono: form.telefono,
          direccion: form.direccion,
          codigo_promo: form.codigo_promo || null,
          foto_dni_frontal: urlDniFrontal,
          foto_dni_posterior: urlDniPosterior,
          foto_selfie: urlSelfie,
        });
      if (perfilError)
        throw new Error("Error creando perfil: " + perfilError.message);

      setLoading(false);
      const msg =
        "Cuenta creada. Tu cuenta está en revisión. Te notificaremos cuando sea aprobada.";
      if (typeof window !== "undefined") {
        window.alert(msg);
      }
      router.replace("/login");
    } catch (err) {
      setLoading(false);
      const msg = "Error: " + err.message;
      if (typeof window !== "undefined") {
        window.alert(msg);
      }
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Indicador de pasos */}
      <View style={styles.pasoIndicador}>
        <View style={[styles.pasoDot, paso >= 1 && styles.pasoDotActive]} />
        <View style={styles.pasoLinea} />
        <View style={[styles.pasoDot, paso >= 2 && styles.pasoDotActive]} />
      </View>
      <Text style={styles.pasoLabel}>
        {paso === 1
          ? "Paso 1 de 2 — Datos personales"
          : "Paso 2 de 2 — Documentos de identidad"}
      </Text>

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
            placeholder="Contraseña * (mín. 6 caracteres)"
            value={form.password}
            onChangeText={(v) => updateForm("password", v)}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              if (validarPaso1()) setPaso(2);
            }}
          >
            <Text style={styles.btnText}>Siguiente →</Text>
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

      {paso === 2 && (
        <View style={styles.form}>
          <Text style={styles.title}>Documentos</Text>
          <Text style={styles.subtitle}>
            Sube tus fotos de DNI y una selfie
          </Text>

          {/* DNI Frontal */}
          <Text style={styles.fotoLabel}>📄 DNI Frontal *</Text>
          {fotos.dni_frontal ? (
            <View style={styles.fotoPreview}>
              <Image
                source={{ uri: fotos.dni_frontal.uri }}
                style={styles.fotoImage}
              />
              <TouchableOpacity
                onPress={() => setFotos({ ...fotos, dni_frontal: null })}
              >
                <Text style={styles.fotoRemove}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fotoBtns}>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarFoto("dni_frontal")}
              >
                <Text style={styles.fotoBtnText}>📷 Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarDeGaleria("dni_frontal")}
              >
                <Text style={styles.fotoBtnText}>🖼️ Galería</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* DNI Posterior */}
          <Text style={styles.fotoLabel}>📄 DNI Posterior *</Text>
          {fotos.dni_posterior ? (
            <View style={styles.fotoPreview}>
              <Image
                source={{ uri: fotos.dni_posterior.uri }}
                style={styles.fotoImage}
              />
              <TouchableOpacity
                onPress={() => setFotos({ ...fotos, dni_posterior: null })}
              >
                <Text style={styles.fotoRemove}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fotoBtns}>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarFoto("dni_posterior")}
              >
                <Text style={styles.fotoBtnText}>📷 Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarDeGaleria("dni_posterior")}
              >
                <Text style={styles.fotoBtnText}>🖼️ Galería</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Selfie */}
          <Text style={styles.fotoLabel}>🤳 Selfie sosteniendo el DNI *</Text>
          {fotos.selfie ? (
            <View style={styles.fotoPreview}>
              <Image
                source={{ uri: fotos.selfie.uri }}
                style={styles.fotoImage}
              />
              <TouchableOpacity
                onPress={() => setFotos({ ...fotos, selfie: null })}
              >
                <Text style={styles.fotoRemove}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fotoBtns}>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarFoto("selfie")}
              >
                <Text style={styles.fotoBtnText}>📷 Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fotoBtn}
                onPress={() => seleccionarDeGaleria("selfie")}
              >
                <Text style={styles.fotoBtnText}>🖼️ Galería</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.botonesNav}>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => setPaso(1)}
            >
              <Text style={styles.btnSecondaryText}>← Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnFlex,
                (!fotos.dni_frontal || !fotos.dni_posterior || !fotos.selfie) &&
                  styles.btnDisabled,
              ]}
              onPress={handleRegistro}
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
    width: 40,
    height: 2,
    backgroundColor: "#ddd",
    marginHorizontal: 8,
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
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  btnSecondaryText: { color: "#666", fontSize: 16, fontWeight: "600" },
  botonesNav: { flexDirection: "row", gap: 12, marginTop: 8 },
  link: { marginTop: 24, alignItems: "center" },
  linkText: { color: "#666", fontSize: 14 },
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
});
