import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { colors, fonts } from "../src/theme/tokens";
import { Aparece } from "../src/components/Cargando";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { CabeceraPasos } from "../src/components/ui/CabeceraPasos";
import { Campo, CodigoSeisCajas, ReglasClave } from "../src/components/ui/Campos";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { useAlturaTeclado } from "../src/lib/teclado";
import { validarEmail, validarPassword, reglasPassword } from "../src/lib/validaciones";
import { ScrollConTeclado } from "../src/components/ui/ScrollConTeclado";

/**
 * Recuperar acceso en tres pasos, como en el prototipo:
 *
 *   1. Correo → se pide el código (resetPasswordForEmail).
 *   2. Código de 6 dígitos → se verifica solo al completarlo
 *      (verifyOtp tipo "recovery"). Si es correcto, Supabase abre una
 *      sesión de recuperación.
 *   3. Nueva contraseña → updateUser con esa sesión, se cierra y se
 *      vuelve al ingreso para entrar con la clave nueva.
 *
 * Verificar el código antes de pedir la contraseña evita que alguien
 * escriba una clave larga para enterarse después de que el código ya
 * había vencido.
 */
export default function RecuperarScreen() {
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoOk, setCodigoOk] = useState(false);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const verificando = useRef(false);
  // Si se verifica el código y la persona se va sin guardar, la sesión
  // de recuperación no puede quedar abierta: con ella el app la dejaría
  // entrar sin contraseña la próxima vez.
  const sesionAbierta = useRef(false);

  useEffect(
    () => () => {
      if (sesionAbierta.current) supabase.auth.signOut().catch(() => {});
    },
    [],
  );

  const correo = email.trim().toLowerCase();
  const errorEmail = validarEmail(email);
  const passChecks = reglasPassword(nuevaPassword, confirmarPassword);
  const errorPass = validarPassword(nuevaPassword, confirmarPassword);

  async function volver() {
    if (paso === 1) {
      if (router.canGoBack()) router.back();
      else router.replace("/login");
      return;
    }
    if (paso === 3 && sesionAbierta.current) {
      // El código ya se gastó: volver a él no sirve, se empieza de nuevo.
      await supabase.auth.signOut().catch(() => {});
      sesionAbierta.current = false;
      setCodigo("");
      setCodigoOk(false);
      setPaso(1);
      return;
    }
    setPaso(paso - 1);
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (paso === 1) return false;
      volver();
      return true;
    });
    return () => sub.remove();
  }, [paso]);

  async function enviarCodigo() {
    if (errorEmail) {
      setIntentos((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(correo);
      if (error) return mostrar(mensajeError(error), "error");
      setCodigo("");
      setCodigoOk(false);
      setIntentos(0);
      setPaso(2);
      mostrar("Código enviado a tu correo", "exito");
    } finally {
      setLoading(false);
    }
  }

  async function reenviarCodigo() {
    setReenviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(correo);
      if (error) return mostrar(mensajeError(error), "error");
      mostrar("Código reenviado", "exito");
    } finally {
      setReenviando(false);
    }
  }

  function cambiarCodigo(v) {
    setCodigo(v);
    if (v.length === 6) verificarCodigo(v);
  }

  async function verificarCodigo(token) {
    if (verificando.current) return;
    verificando.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: correo, token, type: "recovery" });
      if (error) {
        setCodigo("");
        return mostrar("El código es incorrecto o ya expiró", "error");
      }
      sesionAbierta.current = true;
      setCodigoOk(true);
      // Se deja ver el "Código verificado" un momento antes de avanzar.
      setTimeout(() => setPaso(3), 900);
    } finally {
      verificando.current = false;
      setLoading(false);
    }
  }

  async function guardar() {
    if (errorPass) {
      setIntentos((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: nuevaPassword });
      if (updateError) return mostrar(mensajeError(updateError), "error");

      await supabase.auth.signOut();
      sesionAbierta.current = false;
      mostrar("Contraseña actualizada. Ingresa con la nueva", "exito", 4500);
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  const titulos = {
    1: ["Recupera tu acceso", "Te enviaremos un código a tu correo."],
    2: ["Revisa tu correo", "Te enviamos un código de 6 dígitos."],
    3: ["Nueva contraseña", "Crea una que no hayas usado antes."],
  };

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollConTeclado
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <CabeceraPasos paso={paso} titulo={titulos[paso][0]} subtitulo={titulos[paso][1]} onVolver={volver} />

        <View style={s.cuerpo}>
          {paso === 1 && (
            <Aparece key="paso1">
              <GlassPanel variant="light" radius={26} style={s.tarjeta}>
                <Campo
                  etiqueta="Correo"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  returnKeyType="send"
                  onSubmitEditing={enviarCodigo}
                  ok={!errorEmail}
                  error={intentos > 0 && errorEmail ? "Escribe un correo válido" : null}
                  senal={intentos}
                />
                {/* Se ve apagado hasta que el correo es válido, pero sigue
                    respondiendo: al tocarlo marca qué falta. */}
                <Boton
                  titulo={loading ? "Enviando..." : "Enviar código"}
                  icono={errorEmail ? undefined : "arrow-forward"}
                  onPress={enviarCodigo}
                  cargando={loading}
                  apagado={Boolean(errorEmail)}
                  style={{ height: 56 }}
                />
              </GlassPanel>
            </Aparece>
          )}

          {paso === 2 && (
            <Aparece key="paso2">
              <GlassPanel variant="light" radius={26} style={s.tarjeta}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={s.sobre}>
                    <Ionicons name="mail-outline" size={22} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.enviadoA}>Enviado a</Text>
                    <Text style={s.correo} numberOfLines={1}>
                      {correo}
                    </Text>
                  </View>
                  <Toque onPress={() => setPaso(1)} accessibilityLabel="Cambiar correo" style={s.cambiar}>
                    <Text style={s.cambiarTexto}>Cambiar</Text>
                  </Toque>
                </View>
                <CodigoSeisCajas
                  valor={codigo}
                  onCambio={cambiarCodigo}
                  autoFocus
                  ok={codigoOk}
                  deshabilitado={loading || codigoOk}
                />
                {codigoOk ? (
                  <View style={s.verificado}>
                    <Ionicons name="checkmark" size={14} color={colors.successText} />
                    <Text style={s.verificadoTexto}>Código verificado</Text>
                  </View>
                ) : (
                  <Text style={s.ayuda}>
                    {loading ? "Verificando..." : "Toca los recuadros para escribir. ¿No llegó? Revisa spam."}
                  </Text>
                )}
              </GlassPanel>
              {!codigoOk ? (
                <Toque
                  onPress={reenviarCodigo}
                  disabled={reenviando}
                  hitSlop={8}
                  accessibilityLabel="Reenviar código"
                  style={s.reenviar}
                >
                  <Text style={s.reenviarTexto}>{reenviando ? "Reenviando..." : "Reenviar código"}</Text>
                </Toque>
              ) : null}
            </Aparece>
          )}

          {paso === 3 && (
            <Aparece key="paso3">
              <GlassPanel variant="light" radius={26} style={s.tarjeta}>
                <Campo
                  etiqueta="Nueva contraseña"
                  value={nuevaPassword}
                  onChangeText={setNuevaPassword}
                  secreto
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  ok={!validarPassword(nuevaPassword, nuevaPassword)}
                  error={intentos > 0 && validarPassword(nuevaPassword, nuevaPassword) ? "Revisa los requisitos de abajo" : null}
                  senal={intentos}
                />
                <Campo
                  etiqueta="Confirmar contraseña"
                  value={confirmarPassword}
                  onChangeText={setConfirmarPassword}
                  secreto
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  returnKeyType="done"
                  onSubmitEditing={guardar}
                  ok={!errorPass}
                  error={
                    confirmarPassword.length > 0 && !passChecks.match
                      ? "Las contraseñas no coinciden"
                      : null
                  }
                  senal={intentos}
                />
                <ReglasClave reglas={passChecks} mostrarCoincide />
                <Boton
                  titulo={loading ? "Guardando..." : "Guardar contraseña"}
                  icono={errorPass ? undefined : "arrow-forward"}
                  onPress={guardar}
                  cargando={loading}
                  apagado={Boolean(errorPass)}
                  style={{ height: 56 }}
                />
              </GlassPanel>
            </Aparece>
          )}
        </View>
      </ScrollConTeclado>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cuerpo: { marginTop: -64, paddingHorizontal: 16, gap: 12 },
  tarjeta: { padding: 18, paddingHorizontal: 16, gap: 14 },
  sobre: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
  enviadoA: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2 },
  correo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  cambiar: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.ground,
    justifyContent: "center",
  },
  cambiarTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.text },
  ayuda: { fontFamily: fonts.body, fontSize: 13, color: colors.text3, textAlign: "center" },
  verificado: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.successBg,
  },
  verificadoTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.successText },
  reenviar: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: 6 },
  reenviarTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.goldText },
});
