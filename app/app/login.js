import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    if (!email || !password) {
      if (typeof window !== "undefined")
        return window.alert("Completa todos los campos.");
      return Alert.alert("Error", "Completa todos los campos.");
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      if (typeof window !== "undefined") return window.alert(error.message);
      return Alert.alert("Error", error.message);
    }

    const { data: userData } = await supabase
      .from("users")
      .select("rol, estado")
      .eq("id", data.user.id)
      .single();

    if (!userData || userData.rol !== "cliente") {
      await supabase.auth.signOut();
      setLoading(false);
      const msg = "Esta app es solo para clientes.";
      if (typeof window !== "undefined") return window.alert(msg);
      return Alert.alert("Error", msg);
    }

    if (userData.estado === "bloqueado") {
      await supabase.auth.signOut();
      setLoading(false);
      const msg = "Tu cuenta está bloqueada. Contacta soporte.";
      if (typeof window !== "undefined") return window.alert(msg);
      return Alert.alert("Error", msg);
    }

    setLoading(false);

    if (userData.estado === "activo") {
      router.replace("/(tabs)/inicio");
    } else {
      router.replace("/en-revision");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenido de vuelta</Text>
      <Text style={styles.subtitle}>Ingresa con tu cuenta</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          onPress={() => router.push("/recuperar")}
          style={styles.forgotLink}
        >
          <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/registro")}
        style={styles.link}
      >
        <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 32,
    justifyContent: "center",
  },
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
  forgotLink: { alignItems: "flex-end" },
  forgotText: { color: "#3B82F6", fontSize: 14 },
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
