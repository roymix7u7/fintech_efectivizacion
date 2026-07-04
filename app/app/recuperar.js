import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function RecuperarScreen() {
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const router = useRouter();

  function alerta(msg) {
    if (typeof window !== "undefined") window.alert(msg);
  }

  async function enviarCodigo() {
    if (!email) return alerta("Ingresa tu correo electrónico.");
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setLoading(false);
      return alerta("Error: " + error.message);
    }

    setLoading(false);
    setPaso(2);
    alerta("Se envió un código de recuperación a tu correo.");
  }

  async function reenviarCodigo() {
    setReenviando(true);
    await supabase.auth.resetPasswordForEmail(email);
    setReenviando(false);
    alerta("Código reenviado. El código anterior ya no es válido.");
  }

  async function verificarYCambiar() {
    if (!codigo) return alerta("Ingresa el código.");
    if (!nuevaPassword || nuevaPassword.length < 6)
      return alerta("La contraseña debe tener al menos 6 caracteres.");
    if (nuevaPassword !== confirmarPassword)
      return alerta("Las contraseñas no coinciden.");

    setLoading(true);

    // Verificar el OTP
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: codigo,
      type: "recovery",
    });

    if (otpError) {
      setLoading(false);
      return alerta("Código inválido o expirado. Solicita uno nuevo.");
    }

    // Cambiar contraseña
    const { error: updateError } = await supabase.auth.updateUser({
      password: nuevaPassword,
    });

    if (updateError) {
      setLoading(false);
      return alerta("Error al cambiar contraseña: " + updateError.message);
    }

    await supabase.auth.signOut();
    setLoading(false);
    alerta("Contraseña cambiada. Inicia sesión con tu nueva contraseña.");
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      {paso === 1 && (
        <>
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>
            Ingresa tu correo y te enviaremos un código de recuperación
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.btn}
              onPress={enviarCodigo}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Enviando..." : "Enviar código"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.back()} style={styles.link}>
            <Text style={styles.linkText}>← Volver al login</Text>
          </TouchableOpacity>
        </>
      )}

      {paso === 2 && (
        <>
          <Text style={styles.title}>Verificar código</Text>
          <Text style={styles.subtitle}>
            Ingresa el código enviado a {email}
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.inputCode}
              placeholder="000000"
              value={codigo}
              onChangeText={(v) => setCodigo(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="numeric"
              maxLength={6}
              textAlign="center"
            />

            <TextInput
              style={styles.input}
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              value={nuevaPassword}
              onChangeText={setNuevaPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.input}
              placeholder="Confirmar nueva contraseña"
              value={confirmarPassword}
              onChangeText={setConfirmarPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.btn}
              onPress={verificarYCambiar}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Cambiando..." : "Cambiar contraseña"}
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
          </View>

          <TouchableOpacity onPress={() => setPaso(1)} style={styles.link}>
            <Text style={styles.linkText}>← Cambiar correo</Text>
          </TouchableOpacity>
        </>
      )}
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
  inputCode: {
    borderWidth: 2,
    borderColor: "#111",
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
  },
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
  reenviar: { alignItems: "center", paddingVertical: 8 },
  reenviarText: { color: "#3B82F6", fontSize: 14 },
});
