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
import COLORS from "../src/theme/colors";

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

  const passChecks = {
    length: nuevaPassword.length >= 8,
    upper: /[A-Z]/.test(nuevaPassword),
    lower: /[a-z]/.test(nuevaPassword),
    number: /[0-9]/.test(nuevaPassword),
    special: /\W/.test(nuevaPassword),
    match: nuevaPassword === confirmarPassword && confirmarPassword.length > 0,
  };

  async function enviarCodigo() {
    if (!email) {
      alerta("Ingresa tu correo electrónico.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setLoading(false);
      alerta("Error: " + error.message);
      return;
    }
    setLoading(false);
    setPaso(2);
    alerta("Se envió un código de recuperación a tu correo.");
  }

  async function reenviarCodigo() {
    setReenviando(true);
    await supabase.auth.resetPasswordForEmail(email);
    setReenviando(false);
    alerta("Código reenviado. El anterior ya no es válido.");
  }

  async function verificarYCambiar() {
    if (!codigo) {
      alerta("Ingresa el código.");
      return;
    }
    if (!passChecks.length) {
      alerta("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!passChecks.upper) {
      alerta("Debe tener al menos una mayúscula.");
      return;
    }
    if (!passChecks.lower) {
      alerta("Debe tener al menos una minúscula.");
      return;
    }
    if (!passChecks.number) {
      alerta("Debe tener al menos un número.");
      return;
    }
    if (!passChecks.special) {
      alerta("Debe tener al menos un carácter especial.");
      return;
    }
    if (!passChecks.match) {
      alerta("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: codigo,
      type: "recovery",
    });
    if (otpError) {
      setLoading(false);
      alerta("Código inválido o expirado.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: nuevaPassword,
    });
    if (updateError) {
      setLoading(false);
      alerta("Error: " + updateError.message);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    alerta("Contraseña cambiada. Inicia sesión con tu nueva contraseña.");
    router.replace("/login");
  }

  return (
    <View style={s.container}>
      {paso === 1 && (
        <>
          <View style={s.iconCard}>
            <Text style={s.icon}>🔐</Text>
            <Text style={s.title}>Recuperar contraseña</Text>
            <Text style={s.subtitle}>
              Ingresa tu correo y te enviaremos un código
            </Text>
          </View>

          <View style={s.form}>
            <TextInput
              style={s.input}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={COLORS.textLight}
            />
            <TouchableOpacity
              style={s.btn}
              onPress={enviarCodigo}
              disabled={loading}
            >
              <Text style={s.btnText}>
                {loading ? "Enviando..." : "Enviar código"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.back()} style={s.link}>
            <Text style={s.linkText}>← Volver al login</Text>
          </TouchableOpacity>
        </>
      )}

      {paso === 2 && (
        <>
          <View style={s.iconCard}>
            <Text style={s.icon}>📧</Text>
            <Text style={s.title}>Verificar código</Text>
            <Text style={s.subtitle}>Ingresa el código enviado a</Text>
            <Text style={s.emailHighlight}>{email}</Text>
          </View>

          <View style={s.form}>
            <TextInput
              style={s.inputCode}
              placeholder="000000"
              value={codigo}
              onChangeText={(v) => setCodigo(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="numeric"
              maxLength={6}
              textAlign="center"
              placeholderTextColor={COLORS.textLight}
            />

            <TextInput
              style={s.input}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              value={nuevaPassword}
              onChangeText={setNuevaPassword}
              secureTextEntry
              placeholderTextColor={COLORS.textLight}
            />

            {nuevaPassword.length > 0 && (
              <View style={s.validaciones}>
                <Text style={passChecks.length ? s.valOk : s.valFail}>
                  {passChecks.length ? "✅" : "❌"} Mínimo 8 caracteres
                </Text>
                <Text style={passChecks.upper ? s.valOk : s.valFail}>
                  {passChecks.upper ? "✅" : "❌"} Una mayúscula
                </Text>
                <Text style={passChecks.lower ? s.valOk : s.valFail}>
                  {passChecks.lower ? "✅" : "❌"} Una minúscula
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
              placeholder="Confirmar nueva contraseña"
              value={confirmarPassword}
              onChangeText={setConfirmarPassword}
              secureTextEntry
              placeholderTextColor={COLORS.textLight}
            />

            {confirmarPassword.length > 0 && (
              <Text style={passChecks.match ? s.valOk : s.valFail}>
                {passChecks.match
                  ? "✅ Contraseñas coinciden"
                  : "❌ No coinciden"}
              </Text>
            )}

            <TouchableOpacity
              style={s.btn}
              onPress={verificarYCambiar}
              disabled={loading}
            >
              <Text style={s.btnText}>
                {loading ? "Cambiando..." : "Cambiar contraseña"}
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
          </View>

          <TouchableOpacity onPress={() => setPaso(1)} style={s.link}>
            <Text style={s.linkText}>← Cambiar correo</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 32,
    justifyContent: "center",
  },
  iconCard: { alignItems: "center", marginBottom: 28 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: 4 },
  emailHighlight: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginTop: 4,
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
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  link: { marginTop: 24, alignItems: "center" },
  linkText: { color: COLORS.textSecondary, fontSize: 14 },
  reenviar: { alignItems: "center", paddingVertical: 8 },
  reenviarText: { color: COLORS.secondary, fontSize: 14, fontWeight: "500" },
  validaciones: { gap: 4, paddingLeft: 4 },
  valOk: { fontSize: 13, color: COLORS.success },
  valFail: { fontSize: 13, color: COLORS.error },
});
