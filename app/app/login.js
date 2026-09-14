import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import TIPO from "../src/theme/tipografia";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { validarEmail } from "../src/lib/validaciones";
import { hayConexion } from "../src/lib/conexion";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { mostrar } = useAviso();

  async function handleLogin() {
    const errorEmail = validarEmail(email);
    if (errorEmail) return mostrar(errorEmail, "atencion");
    if (!password) return mostrar("Ingresa tu contraseña", "atencion");

    setLoading(true);
    try {
      // Sin esto, un telefono sin internet recibe "correo o contrasena
      // incorrectos", que manda a la persona a dudar de sus datos.
      if (!(await hayConexion())) {
        return mostrar(
          "Sin conexión con el servidor. Revisa tu internet.",
          "error",
        );
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return mostrar(mensajeError(error), "error");

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("rol, estado")
        .eq("id", data.user.id)
        .maybeSingle();

      if (userError) {
        await supabase.auth.signOut();
        return mostrar(mensajeError(userError), "error");
      }

      // Cuentas viejas que quedaron sin fila en users porque el registro
      // se interrumpio. Se repara aqui en vez de dejar al usuario fuera.
      if (!userData) {
        const { error: repararError } = await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          rol: "cliente",
          estado: "pendiente",
        });
        if (repararError) {
          await supabase.auth.signOut();
          return mostrar(
            "Tu registro quedó incompleto. Escríbenos para activarlo.",
            "error",
          );
        }
        return router.replace("/en-revision");
      }

      if (userData.rol !== "cliente") {
        await supabase.auth.signOut();
        return mostrar("Esta app es solo para clientes", "atencion");
      }

      if (userData.estado === "bloqueado") {
        await supabase.auth.signOut();
        return mostrar("Tu cuenta está bloqueada. Contacta a soporte.", "error");
      }

      // pendiente y observado comparten pantalla: en-revision muestra el
      // motivo y deja volver a subir los documentos.
      if (userData.estado === "activo") router.replace("/(tabs)/inicio");
      else router.replace("/en-revision");
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header azul */}
      <View style={s.header}>
        {/* Al ocultar la cabecera nativa, el botón de volver tiene que
            vivir aquí: sin él no habría forma de regresar al inicio. */}
        <TouchableOpacity
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={s.volver}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>

        <Image
          source={require("../assets/LOGOATK.png")}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.brand}>ALTOQUE PERÚ WK</Text>
        <Text style={s.headerSub}>Tu aliado financiero</Text>
      </View>

      {/* Formulario */}
      <View style={s.formContainer}>
        <Text style={s.title}>Iniciar sesión</Text>
        <Text style={s.subtitle}>Ingresa con tu cuenta para continuar</Text>

        <View style={s.form}>
          <View style={s.inputContainer}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={COLORS.textLight}
              style={s.inputIcon}
            />
            <TextInput
              style={s.input}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          <View style={s.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={COLORS.textLight}
              style={s.inputIcon}
            />
            <TextInput
              style={s.input}
              placeholder="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              placeholderTextColor={COLORS.textLight}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={s.eyeBtn}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/recuperar")}
            style={s.forgotLink}
          >
            <Text style={s.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <Text style={s.btnText}>Ingresando...</Text>
            ) : (
              <View style={s.btnInner}>
                <Text style={s.btnText}>Ingresar</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={COLORS.primaryDark}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>o</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity
          style={s.registerBtn}
          onPress={() => router.push("/registro")}
        >
          <Text style={s.registerText}>Crear cuenta nueva</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  // Header
  header: {
    backgroundColor: COLORS.primary,
    alignItems: "center",
    paddingTop: 64,
    paddingBottom: 30,
  },
  volver: {
    position: "absolute",
    top: 54,
    left: 18,
    padding: 6,
  },
  logo: { width: 64, height: 64, marginBottom: 12 },
  brand: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 1,
  },
  headerSub: { fontSize: 14, color: COLORS.white, opacity: 0.7, marginTop: 4 },
  // Form
  formContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  title: { ...TIPO.titulo },
  subtitle: { ...TIPO.apoyo, marginTop: 4, marginBottom: 28 },
  form: { gap: 16 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  inputIcon: { paddingLeft: 14 },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeBtn: { paddingRight: 14 },
  forgotLink: { alignItems: "flex-end" },
  forgotText: { color: COLORS.primary, fontSize: 14, fontWeight: "500" },
  btn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { color: COLORS.primaryDark, fontSize: 16, fontWeight: "700" },
  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.borderLight },
  dividerText: { paddingHorizontal: 14, fontSize: 13, color: COLORS.textLight },
  // Register
  registerBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
  },
  registerText: { color: COLORS.primary, fontSize: 15, fontWeight: "600" },
});
