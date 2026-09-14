import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import TIPO from "../src/theme/tipografia";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { useAlturaTeclado } from "../src/lib/teclado";
import {
  validarEmail,
  validarPassword,
  reglasPassword,
} from "../src/lib/validaciones";

export default function RecuperarScreen() {
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const router = useRouter();

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/login");
    }
  }

  const passChecks = reglasPassword(nuevaPassword, confirmarPassword);

  async function enviarCodigo() {
    const errorEmail = validarEmail(email);
    if (errorEmail) return mostrar(errorEmail, "atencion");

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
      );
      if (error) return mostrar(mensajeError(error), "error");
      setPaso(2);
      mostrar("Te enviamos un código a tu correo", "exito");
    } finally {
      setLoading(false);
    }
  }

  async function reenviarCodigo() {
    setReenviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
      );
      if (error) return mostrar(mensajeError(error), "error");
      mostrar("Código reenviado", "exito");
    } finally {
      setReenviando(false);
    }
  }

  async function verificarYCambiar() {
    if (!codigo) {
      mostrar("Ingresa el código", "atencion");
      return;
    }
    const errorPass = validarPassword(nuevaPassword, confirmarPassword);
    if (errorPass) return mostrar(errorPass, "atencion");

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: codigo,
        type: "recovery",
      });
      if (otpError) return mostrar("El código es incorrecto o ya expiró", "error");

      const { error: updateError } = await supabase.auth.updateUser({
        password: nuevaPassword,
      });
      if (updateError) return mostrar(mensajeError(updateError), "error");

      await supabase.auth.signOut();
      mostrar("Contraseña cambiada. Inicia sesión.", "exito", 4500);
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={s.pantalla}
      contentContainerStyle={[s.container, { paddingBottom: 32 + altoTeclado }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
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

          <TouchableOpacity onPress={handleBack} style={s.link}>
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flexGrow: 1,
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
