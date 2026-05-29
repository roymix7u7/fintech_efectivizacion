import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function RegistroScreen() {
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
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function updateForm(key, value) {
    setForm({ ...form, [key]: value });
  }

  async function handleRegistro() {
    if (
      !form.nombres ||
      !form.apellidos ||
      !form.email ||
      !form.password ||
      !form.dni ||
      !form.telefono
    ) {
      return Alert.alert("Error", "Completa todos los campos obligatorios.");
    }
    if (form.password.length < 6) {
      return Alert.alert(
        "Error",
        "La contraseña debe tener al menos 6 caracteres.",
      );
    }

    setLoading(true);

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      setLoading(false);
      return Alert.alert("Error", authError.message);
    }

    const userId = authData.user?.id;
    if (!userId) {
      setLoading(false);
      return Alert.alert("Error", "No se pudo crear la cuenta.");
    }

    // 2. Crear registro en tabla users
    const { error: userError } = await supabase.from("users").insert({
      id: userId,
      email: form.email,
      rol: "cliente",
      estado: "pendiente",
    });

    if (userError) {
      setLoading(false);
      return Alert.alert(
        "Error",
        "Error creando el usuario: " + userError.message,
      );
    }

    // 3. Crear perfil del cliente
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
      });

    if (perfilError) {
      setLoading(false);
      return Alert.alert(
        "Error",
        "Error creando el perfil: " + perfilError.message,
      );
    }

    setLoading(false);
    Alert.alert(
      "Cuenta creada",
      "Tu cuenta está en revisión. Te notificaremos cuando sea aprobada.",
      [{ text: "OK", onPress: () => router.replace("/login") }],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Crear cuenta</Text>
      <Text style={styles.subtitle}>Completa tus datos para registrarte</Text>

      <View style={styles.form}>
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
          placeholder="DNI *"
          value={form.dni}
          onChangeText={(v) => updateForm("dni", v)}
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
          onPress={handleRegistro}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Creando cuenta..." : "Registrarme"}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/login")}
        style={styles.link}
      >
        <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 32, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 16, color: "#666", marginTop: 4, marginBottom: 32 },
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
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { marginTop: 24, alignItems: "center" },
  linkText: { color: "#666", fontSize: 14 },
});
