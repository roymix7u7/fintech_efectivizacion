import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import PERU_DATA from "../src/data/peru";
import COLORS from "../src/theme/colors";
import { alerta, mensajeError } from "../src/lib/ui";
import { useAlturaTeclado } from "../src/lib/teclado";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import SubidaDocumentos, {
  DOCUMENTOS,
  documentosCompletos,
} from "../src/components/SubidaDocumentos";
import {
  validarEmail,
  validarDni,
  validarTelefono,
  validarNombre,
  validarPassword,
  reglasPassword,
  primerError,
} from "../src/lib/validaciones";
import { hayConexion } from "../src/lib/conexion";

const BUCKET_KYC = "kyc-documentos";

/**
 * IMPORTANTE: InputField y Selector viven fuera del componente de
 * pantalla a proposito. Si se declaran dentro, React los trata como un
 * tipo de componente distinto en cada render, desmonta el TextInput con
 * cada tecla y el teclado se cierra letra por letra.
 */
function InputField({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboard,
  maxLength,
  secure,
  showToggle,
  toggleShow,
  isShown,
  autoCapitalize,
  onLayout,
  onFocus,
  returnKeyType,
  onSubmitEditing,
}) {
  return (
    <View style={s.inputContainer} onLayout={onLayout}>
      <Ionicons
        name={icon}
        size={20}
        color={COLORS.textLight}
        style={s.inputIcon}
      />
      <TextInput
        style={s.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        returnKeyType={returnKeyType || "next"}
        onSubmitEditing={onSubmitEditing}
        keyboardType={keyboard || "default"}
        maxLength={maxLength}
        secureTextEntry={Boolean(secure) && !isShown}
        autoCorrect={false}
        autoCapitalize={
          autoCapitalize || (keyboard === "email-address" ? "none" : "sentences")
        }
        placeholderTextColor={COLORS.textLight}
      />
      {showToggle && (
        <TouchableOpacity onPress={toggleShow} style={s.eyeBtn}>
          <Ionicons
            name={isShown ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={COLORS.textLight}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Selector({
  label,
  icon,
  valor,
  opciones,
  abierto,
  onToggle,
  onSelect,
}) {
  return (
    <View>
      <TouchableOpacity style={s.selectorBtn} onPress={onToggle}>
        <Ionicons
          name={icon}
          size={20}
          color={COLORS.textLight}
          style={{ width: 28 }}
        />
        <Text style={valor ? s.selectorValue : s.selectorPlaceholder}>
          {valor || `Selecciona ${label.toLowerCase()}`}
        </Text>
        <Ionicons
          name={abierto ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.textLight}
        />
      </TouchableOpacity>
      {abierto && (
        <ScrollView style={s.selectorList} nestedScrollEnabled>
          {opciones.map((op) => (
            <TouchableOpacity
              key={op}
              style={s.selectorItem}
              onPress={() => onSelect(op)}
            >
              <Text
                style={[
                  s.selectorItemText,
                  valor === op && s.selectorItemActive,
                ]}
              >
                {op}
              </Text>
              {valor === op && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const FORM_VACIO = {
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
};

export default function RegistroScreen() {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(FORM_VACIO);
  const [codigoOtp, setCodigoOtp] = useState("");
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const router = useRouter();

  /**
   * Desplazamiento al campo enfocado.
   *
   * El teclado tapa la mitad inferior de la pantalla, asi que al tocar
   * un campo de abajo el usuario escribe a ciegas y tiene que cerrar el
   * teclado para comprobar lo que puso.
   *
   * Se guarda la posicion de cada campo cuando se dibuja, y al
   * enfocarlo se lleva cerca del borde superior. Asi queda siempre a la
   * vista, sin importar cuanto ocupe el teclado en ese telefono.
   */
  // Espacio en blanco al final igual al alto del teclado. Sin el, la
  // pantalla solo se desplaza hasta donde termina el contenido, y el
  // ultimo campo queda atrapado debajo del teclado.
  const altoTeclado = useAlturaTeclado();

  const scrollRef = useRef(null);
  const posiciones = useRef({});
  const inicioForm = useRef(0);

  function recordarPos(campo) {
    return (e) => {
      posiciones.current[campo] = e.nativeEvent.layout.y;
    };
  }

  function alEnfocar(campo) {
    return () => {
      const y = posiciones.current[campo];
      if (y == null || !scrollRef.current) return;
      // La espera deja que el teclado termine de subir; sin ella el
      // desplazamiento se calcula contra una pantalla que aun cambia.
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, inicioForm.current + y - 16),
          animated: true,
        });
      }, 140);
    };
  }

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleBack() {
    // Desde el paso 2 en adelante la cuenta de Auth ya existe, asi que
    // retroceder al formulario solo produciria un correo duplicado.
    if (paso === 3) return;
    if (paso === 2) {
      alerta(
        "Ya creamos tu cuenta con ese correo. Termina de verificarla para continuar.",
      );
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/login");
  }

  const departamentos = Object.keys(PERU_DATA).sort();
  const provincias = form.departamento
    ? Object.keys(PERU_DATA[form.departamento] || {}).sort()
    : [];
  const distritos =
    form.departamento && form.provincia
      ? [...(PERU_DATA[form.departamento]?.[form.provincia] || [])].sort()
      : [];

  const passChecks = reglasPassword(form.password, form.confirmarPassword);

  function validarPaso1() {
    return primerError(
      validarNombre(form.nombres, "nombres"),
      validarNombre(form.apellidos, "apellidos"),
      validarDni(form.dni),
      validarTelefono(form.telefono),
      !form.departamento ? "Selecciona tu departamento." : null,
      !form.provincia ? "Selecciona tu provincia." : null,
      !form.distrito ? "Selecciona tu distrito." : null,
      !form.direccion.trim() ? "Ingresa tu direccion." : null,
      validarEmail(form.email),
      validarPassword(form.password, form.confirmarPassword),
    );
  }

  async function enviarCodigoVerificacion() {
    const error = validarPaso1();
    if (error) return alerta(error);

    setLoading(true);
    try {
      if (!(await hayConexion())) {
        return alerta(
          "No hay conexion con el servidor. Revisa tu internet e intentalo de nuevo.",
        );
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (authError) {
        if (/already registered|already exists/i.test(authError.message)) {
          alerta(
            "Ese correo ya tiene una cuenta. Inicia sesion o recupera tu contrasena.",
          );
        } else {
          alerta(mensajeError(authError));
        }
        return;
      }

      // Supabase devuelve un usuario sin identidades cuando el correo ya
      // existe y esta confirmado. No es un registro nuevo.
      if (data.user && data.user.identities?.length === 0) {
        alerta(
          "Ese correo ya tiene una cuenta. Inicia sesion o recupera tu contrasena.",
        );
        return;
      }

      setPaso(2);
      alerta("Enviamos un codigo de 6 digitos a " + form.email.trim());
    } catch (err) {
      alerta(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Verifica el codigo y crea de inmediato la fila en users.
   * Se hace aqui y no al final para que nadie quede con una cuenta de
   * Auth sin fila en users: eso dejaba al usuario sin poder entrar ni
   * volver a registrarse con el mismo correo.
   */
  async function verificarCodigo() {
    if (codigoOtp.length !== 6) return alerta("Ingresa el codigo de 6 digitos.");

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: form.email.trim().toLowerCase(),
        token: codigoOtp,
        type: "signup",
      });
      if (error) return alerta("El codigo es incorrecto o ya expiro.");

      const uid = data.user?.id;
      if (!uid)
        return alerta("No pudimos confirmar tu cuenta. Intenta de nuevo.");

      const { data: existente } = await supabase
        .from("users")
        .select("id")
        .eq("id", uid)
        .maybeSingle();

      if (!existente) {
        const { error: userError } = await supabase.from("users").insert({
          id: uid,
          email: form.email.trim().toLowerCase(),
          rol: "cliente",
          estado: "pendiente",
        });
        if (userError) return alerta(mensajeError(userError));
      }

      setPaso(3);
    } catch (err) {
      alerta(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function reenviarCodigo() {
    setReenviando(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: form.email.trim().toLowerCase(),
    });
    setReenviando(false);
    if (error) return alerta(mensajeError(error));
    alerta("Te enviamos un codigo nuevo. El anterior ya no sirve.");
  }

  /**
   * Sube los documentos y crea el perfil.
   * Si una foto falla se aborta todo y se limpia lo ya subido. Antes el
   * error solo se escribia en consola y la cuenta se creaba sin
   * documentos, dejando al gestor sin nada que revisar.
   */
  async function finalizarRegistro() {
    if (!documentosCompletos(fotos))
      return alerta("Sube las 3 fotos requeridas.");

    setLoading(true);
    const subidos = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alerta("Tu sesion expiro. Vuelve a iniciar sesion para continuar.");
        router.replace("/login");
        return;
      }

      const paths = {};
      for (const doc of DOCUMENTOS) {
        const path = `${user.id}/${doc.key}.jpg`;
        await subirImagen(BUCKET_KYC, path, fotos[doc.key]);
        subidos.push(path);
        paths[doc.key] = path;
      }

      const direccion = [
        form.direccion.trim(),
        form.distrito,
        form.provincia,
        form.departamento,
      ]
        .filter(Boolean)
        .join(", ");

      // Se guarda el PATH del objeto, no una URL firmada: las firmadas
      // caducan y dejan el documento inaccesible con el tiempo.
      const perfil = {
        user_id: user.id,
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        dni: form.dni,
        telefono: "+51" + form.telefono,
        direccion,
        codigo_promo: form.codigo_promo.trim() || null,
        foto_dni_frontal: paths.dni_frontal,
        foto_dni_posterior: paths.dni_posterior,
        foto_selfie: paths.selfie,
      };

      const { data: perfilExistente } = await supabase
        .from("perfiles_cliente")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error: perfilError } = perfilExistente
        ? await supabase
            .from("perfiles_cliente")
            .update(perfil)
            .eq("user_id", user.id)
        : await supabase.from("perfiles_cliente").insert(perfil);

      if (perfilError) throw perfilError;

      await supabase.auth.signOut();
      alerta(
        "Cuenta creada. Revisaremos tus documentos y te avisaremos cuando este lista.",
      );
      router.replace("/login");
    } catch (err) {
      await borrarImagenes(BUCKET_KYC, subidos);
      alerta(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }

  const pasoTitulos = {
    1: { titulo: "Crear cuenta", sub: "Completa tus datos personales" },
    2: { titulo: "Verificar correo", sub: "Confirma tu direccion de email" },
    3: { titulo: "Documentos", sub: "Verifica tu identidad con fotos" },
  };
  const pasoIconos = ["person-outline", "mail-outline", "camera-outline"];

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={s.backBtn}
          disabled={paso === 3}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={paso === 3 ? "transparent" : COLORS.white}
          />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Image
            source={require("../assets/LOGOATK.png")}
            style={s.headerLogo}
            resizeMode="contain"
          />
          <Text style={s.headerBrand}>ALTOQUE PERU</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      {/* Stepper */}
      <View style={s.stepperContainer}>
        <View style={s.stepper}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={s.stepRow}>
              <View
                style={[
                  s.stepCircle,
                  paso >= n && s.stepCircleActive,
                  paso === n && s.stepCircleCurrent,
                ]}
              >
                {paso > n ? (
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                ) : (
                  <Ionicons
                    name={pasoIconos[n - 1]}
                    size={16}
                    color={paso >= n ? COLORS.white : COLORS.textLight}
                  />
                )}
              </View>
              {n < 3 && (
                <View style={[s.stepLine, paso > n && s.stepLineActive]} />
              )}
            </View>
          ))}
        </View>
        <Text style={s.stepLabel}>{pasoTitulos[paso].sub}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scrollView}
        contentContainerStyle={[s.content, { paddingBottom: 40 + altoTeclado }]}
        keyboardShouldPersistTaps="handled"
        // Arrastrar la lista cierra el teclado: es el gesto natural
        // para volver a ver el formulario completo.
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── PASO 1: Datos personales ── */}
        {paso === 1 && (
          <View
            style={s.form}
            onLayout={(e) => {
              inicioForm.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={s.sectionLabel}>Informacion personal</Text>
            <InputField
              icon="person-outline"
              placeholder="Nombres *"
              value={form.nombres}
              onChangeText={(v) => updateForm("nombres", v)}
              autoCapitalize="words"
              onLayout={recordarPos("nombres")}
              onFocus={alEnfocar("nombres")}
            />
            <InputField
              icon="person-outline"
              placeholder="Apellidos *"
              value={form.apellidos}
              onChangeText={(v) => updateForm("apellidos", v)}
              autoCapitalize="words"
              onLayout={recordarPos("apellidos")}
              onFocus={alEnfocar("apellidos")}
            />
            <InputField
              icon="id-card-outline"
              placeholder="DNI * (8 digitos)"
              value={form.dni}
              onChangeText={(v) =>
                updateForm("dni", v.replace(/\D/g, "").slice(0, 8))
              }
              keyboard="numeric"
              maxLength={8}
              onLayout={recordarPos("dni")}
              onFocus={alEnfocar("dni")}
            />

            <View style={s.phoneRow} onLayout={recordarPos("telefono")}>
              <View style={s.phonePrefix}>
                <Text style={s.phonePrefixFlag}>PE</Text>
                <Text style={s.phonePrefixText}>+51</Text>
              </View>
              <View style={[s.inputContainer, { flex: 1 }]}>
                <TextInput
                  style={s.input}
                  placeholder="987 654 321"
                  onFocus={alEnfocar("telefono")}
                  value={form.telefono}
                  onChangeText={(v) =>
                    updateForm("telefono", v.replace(/\D/g, "").slice(0, 9))
                  }
                  keyboardType="phone-pad"
                  maxLength={9}
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
            </View>

            <Text style={s.sectionLabel}>Ubicacion</Text>
            <Selector
              label="Departamento"
              icon="navigate-outline"
              valor={form.departamento}
              opciones={departamentos}
              abierto={abierto === "departamento"}
              onToggle={() =>
                setAbierto(abierto === "departamento" ? null : "departamento")
              }
              onSelect={(v) => {
                setForm((p) => ({
                  ...p,
                  departamento: v,
                  provincia: "",
                  distrito: "",
                }));
                setAbierto(null);
              }}
            />
            {form.departamento ? (
              <Selector
                label="Provincia"
                icon="map-outline"
                valor={form.provincia}
                opciones={provincias}
                abierto={abierto === "provincia"}
                onToggle={() =>
                  setAbierto(abierto === "provincia" ? null : "provincia")
                }
                onSelect={(v) => {
                  setForm((p) => ({ ...p, provincia: v, distrito: "" }));
                  setAbierto(null);
                }}
              />
            ) : null}
            {form.provincia ? (
              <Selector
                label="Distrito"
                icon="location-outline"
                valor={form.distrito}
                opciones={distritos}
                abierto={abierto === "distrito"}
                onToggle={() =>
                  setAbierto(abierto === "distrito" ? null : "distrito")
                }
                onSelect={(v) => {
                  updateForm("distrito", v);
                  setAbierto(null);
                }}
              />
            ) : null}
            <InputField
              icon="home-outline"
              placeholder="Direccion * (calle, manzana, lote)"
              value={form.direccion}
              onChangeText={(v) => updateForm("direccion", v)}
              onLayout={recordarPos("direccion")}
              onFocus={alEnfocar("direccion")}
            />
            <InputField
              icon="pricetag-outline"
              placeholder="Codigo promocional (opcional)"
              value={form.codigo_promo}
              onChangeText={(v) => updateForm("codigo_promo", v)}
              autoCapitalize="characters"
              onLayout={recordarPos("promo")}
              onFocus={alEnfocar("promo")}
            />

            <Text style={s.sectionLabel}>Acceso a la cuenta</Text>
            <InputField
              icon="mail-outline"
              placeholder="Correo electronico *"
              value={form.email}
              onChangeText={(v) => updateForm("email", v)}
              keyboard="email-address"
              onLayout={recordarPos("email")}
              onFocus={alEnfocar("email")}
            />
            <InputField
              icon="lock-closed-outline"
              placeholder="Contrasena * (min. 8 caracteres)"
              value={form.password}
              onChangeText={(v) => updateForm("password", v)}
              secure
              showToggle
              toggleShow={() => setShowPassword(!showPassword)}
              isShown={showPassword}
              onLayout={recordarPos("password")}
              onFocus={alEnfocar("password")}
            />

            {form.password.length > 0 && (
              <View style={s.checkList}>
                {[
                  { ok: passChecks.length, label: "Minimo 8 caracteres" },
                  { ok: passChecks.upper, label: "Una mayuscula" },
                  { ok: passChecks.lower, label: "Una minuscula" },
                  { ok: passChecks.number, label: "Un numero" },
                  { ok: passChecks.special, label: "Un simbolo" },
                ].map((c) => (
                  <View key={c.label} style={s.checkRow}>
                    <Ionicons
                      name={c.ok ? "checkmark-circle" : "ellipse-outline"}
                      size={16}
                      color={c.ok ? COLORS.success : COLORS.textLight}
                    />
                    <Text style={[s.checkText, c.ok && s.checkTextOk]}>
                      {c.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <InputField
              icon="lock-closed-outline"
              placeholder="Confirmar contrasena *"
              value={form.confirmarPassword}
              onChangeText={(v) => updateForm("confirmarPassword", v)}
              secure
              showToggle
              toggleShow={() => setShowConfirm(!showConfirm)}
              isShown={showConfirm}
              onLayout={recordarPos("confirmar")}
              onFocus={alEnfocar("confirmar")}
              returnKeyType="done"
              onSubmitEditing={enviarCodigoVerificacion}
            />

            {form.confirmarPassword.length > 0 && (
              <View style={s.matchRow}>
                <Ionicons
                  name={passChecks.match ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={passChecks.match ? COLORS.success : COLORS.error}
                />
                <Text
                  style={{
                    fontSize: 13,
                    color: passChecks.match ? COLORS.success : COLORS.error,
                    marginLeft: 6,
                  }}
                >
                  {passChecks.match
                    ? "Las contrasenas coinciden"
                    : "Las contrasenas no coinciden"}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.btnPrimary, loading && s.btnDisabled]}
              onPress={enviarCodigoVerificacion}
              disabled={loading}
            >
              <Text style={s.btnPrimaryText}>
                {loading ? "Enviando codigo..." : "Continuar"}
              </Text>
              {!loading && (
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={COLORS.primaryDark}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/login")}
              style={s.linkRow}
            >
              <Text style={s.linkText}>Ya tienes cuenta?</Text>
              <Text style={s.linkBold}> Inicia sesion</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PASO 2: Verificar correo ── */}
        {paso === 2 && (
          <View style={s.form}>
            <View style={s.otpCard}>
              <View style={s.otpIconBg}>
                <Ionicons
                  name="mail-open-outline"
                  size={36}
                  color={COLORS.primary}
                />
              </View>
              <Text style={s.otpTitle}>Revisa tu correo</Text>
              <Text style={s.otpSub}>Enviamos un codigo de verificacion a</Text>
              <Text style={s.otpEmail}>{form.email.trim()}</Text>
            </View>

            <View style={s.otpInputRow}>
              <TextInput
                style={s.otpInput}
                placeholder="000000"
                value={codigoOtp}
                onChangeText={(v) =>
                  setCodigoOtp(v.replace(/\D/g, "").slice(0, 6))
                }
                keyboardType="numeric"
                maxLength={6}
                textAlign="center"
                placeholderTextColor={COLORS.textLight}
              />
            </View>

            <TouchableOpacity
              style={[
                s.btnPrimary,
                (loading || codigoOtp.length !== 6) && s.btnDisabled,
              ]}
              onPress={verificarCodigo}
              disabled={loading || codigoOtp.length !== 6}
            >
              <Text style={s.btnPrimaryText}>
                {loading ? "Verificando..." : "Verificar codigo"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={reenviarCodigo}
              disabled={reenviando}
              style={s.resendBtn}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={COLORS.primary}
              />
              <Text style={s.resendText}>
                {reenviando ? "Reenviando..." : "Reenviar codigo"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PASO 3: Documentos ── */}
        {paso === 3 && (
          <View style={s.form}>
            <SubidaDocumentos
              fotos={fotos}
              onChange={setFotos}
              deshabilitado={loading}
            />

            <TouchableOpacity
              style={[
                s.btnPrimary,
                (loading || !documentosCompletos(fotos)) && s.btnDisabled,
              ]}
              onPress={finalizarRegistro}
              disabled={loading || !documentosCompletos(fotos)}
            >
              <Text style={s.btnPrimaryText}>
                {loading ? "Subiendo documentos..." : "Crear mi cuenta"}
              </Text>
              {!loading && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={COLORS.primaryDark}
                />
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  // Header
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: { padding: 6 },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLogo: { width: 28, height: 28 },
  headerBrand: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },
  // Stepper
  stepperContainer: {
    backgroundColor: COLORS.primary,
    paddingBottom: 24,
    alignItems: "center",
  },
  stepper: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: { backgroundColor: COLORS.secondary },
  stepCircleCurrent: { borderWidth: 2, borderColor: COLORS.white },
  stepLine: {
    width: 50,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 4,
  },
  stepLineActive: { backgroundColor: COLORS.secondary },
  stepLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  // Content
  scrollView: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.background,
    marginTop: -12,
  },
  content: { padding: 22, paddingTop: 28, paddingBottom: 40 },
  form: { gap: 14 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: -4,
  },
  // Input
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  inputIcon: { paddingLeft: 14 },
  input: { flex: 1, padding: 14, fontSize: 15, color: COLORS.text },
  eyeBtn: { paddingRight: 14 },
  // Phone
  phoneRow: { flexDirection: "row", gap: 8 },
  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
  },
  phonePrefixFlag: { fontSize: 18 },
  phonePrefixText: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  // Selectors
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: COLORS.white,
  },
  selectorValue: { flex: 1, fontSize: 15, color: COLORS.text },
  selectorPlaceholder: { flex: 1, fontSize: 15, color: COLORS.textLight },
  selectorList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    marginTop: 4,
  },
  selectorItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  selectorItemText: { fontSize: 15, color: COLORS.text },
  selectorItemActive: { color: COLORS.primary, fontWeight: "600" },
  // Password checks
  checkList: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { fontSize: 13, color: COLORS.textLight },
  checkTextOk: { color: COLORS.success },
  matchRow: { flexDirection: "row", alignItems: "center", paddingLeft: 4 },
  // Buttons
  btnPrimary: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: "700",
  },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  linkText: { fontSize: 14, color: COLORS.textSecondary },
  linkBold: { fontSize: 14, color: COLORS.primary, fontWeight: "600" },
  // OTP
  otpCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  otpIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.secondaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  otpTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
  },
  otpSub: { fontSize: 14, color: COLORS.textSecondary },
  otpEmail: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    marginTop: 4,
  },
  otpInputRow: { alignItems: "center" },
  otpInput: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 14,
    padding: 18,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 12,
    backgroundColor: COLORS.white,
    color: COLORS.text,
    width: "100%",
    textAlign: "center",
  },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  resendText: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
  // Documents
  docInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.successLight,
    borderRadius: 12,
    padding: 14,
  },
  docInfoText: { fontSize: 13, color: COLORS.success, flex: 1, lineHeight: 19 },
  docCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  docLabel: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  docDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 1 },
  docPreview: { alignItems: "center", gap: 10 },
  docImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  docChangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  docChangeText: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
  docBtns: { flexDirection: "row", gap: 10 },
  docBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.inputBg,
  },
  docBtnText: { fontSize: 13, color: COLORS.text, fontWeight: "500" },
});
