import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  BackHandler,
  Animated,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import PERU_DATA from "../src/data/peru";
import { colors, fonts } from "../src/theme/tokens";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { useAlturaTeclado } from "../src/lib/teclado";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { marcarInicioSesion, entrarA } from "../src/lib/sesion";
import SubidaDocumentos, {
  DOCUMENTOS,
  documentosCompletos,
  fotosFaltantes,
} from "../src/components/SubidaDocumentos";
import {
  validarEmail,
  validarDocumento,
  largoDocumento,
  validarTelefono,
  validarNombre,
  validarPassword,
  reglasPassword,
} from "../src/lib/validaciones";
import { hayConexion } from "../src/lib/conexion";
import { Aparece } from "../src/components/Cargando";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { BarraFija, ALTO_BARRA_FIJA } from "../src/components/ui/BarraFija";
import { CabeceraPasos } from "../src/components/ui/CabeceraPasos";
import { Hoja } from "../src/components/ui/Hoja";
import { Segmentado } from "../src/components/ui/Segmentado";
import { Casilla, Enlace } from "../src/components/ui/Casilla";
import { documentosVigentes, aceptar } from "../src/lib/legal";
import { ScrollConTeclado } from "../src/components/ui/ScrollConTeclado";
import {
  Campo,
  CodigoSeisCajas,
  EtiquetaCampo,
  FuerzaClave,
  MensajeError,
  ReglasClave,
  useSacudida,
} from "../src/components/ui/Campos";

const BUCKET_KYC = "kyc-documentos";

const FORM_VACIO = {
  tipo_documento: "dni",
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

/**
 * "Áncash" → "ancash": para buscar sin depender de las tildes. Con
 * reemplazos directos y no normalize(), que no todos los Android traen.
 */
const sinTildes = (t) =>
  t
    .toLowerCase()
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u");

/**
 * Mensaje para un número que se escribe dígito a dígito: mientras falta
 * largo dice cuántos faltan, que es lo que la persona necesita saber;
 * con el largo completo, el motivo real (empieza en 9, no todos iguales).
 */
function errorDeDigitos(valor, largo, validar) {
  if (valor.length > 0 && valor.length < largo) {
    const faltan = largo - valor.length;
    return `Faltan ${faltan} dígito${faltan === 1 ? "" : "s"}`;
  }
  return validar(valor);
}

/**
 * Botón de ubigeo. Vive fuera de la pantalla a propósito: si se declara
 * dentro, React lo trata como un componente nuevo en cada render.
 */
function Ubigeo({ etiqueta, valor, vacio, habilitado, error, senal, onAbrir }) {
  const sacudida = useSacudida(senal, error);
  return (
    <Animated.View style={[{ flex: 1, minWidth: 0 }, sacudida]}>
      <Toque
        onPress={onAbrir}
        disabled={!habilitado}
        escala={0.99}
        accessibilityLabel={`${etiqueta}: ${valor || "sin elegir"}`}
        style={[
          s.ubigeo,
          !habilitado && { opacity: 0.5 },
          valor
            ? { borderColor: colors.success }
            : error
              ? { borderWidth: 2, borderColor: colors.error }
              : null,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={s.ubigeoEtiqueta}>{etiqueta}</Text>
          <Text
            numberOfLines={1}
            style={[s.ubigeoValor, !valor && { color: colors.textFaint }]}
          >
            {valor || vacio}
          </Text>
        </View>
        <Ionicons
          name={valor ? "checkmark" : "chevron-down"}
          size={valor ? 16 : 18}
          color={valor ? colors.success : colors.text3}
        />
      </Toque>
    </Animated.View>
  );
}

const TIPOS_DOC = [
  { clave: "dni", titulo: "DNI", detalle: "Peruano", accesible: "DNI" },
  {
    clave: "ce",
    titulo: "Carnet",
    detalle: "de extranjería",
    accesible: "Carnet de extranjería",
  },
];

export default function RegistroScreen() {
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(FORM_VACIO);
  const [codigoOtp, setCodigoOtp] = useState("");
  const [codigoOk, setCodigoOk] = useState(false);
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [elegir, setElegir] = useState(null); // "departamento" | "provincia" | "distrito"
  const [busqueda, setBusqueda] = useState("");
  const [promoAbierto, setPromoAbierto] = useState(false);
  // Cada intento de continuar con datos incompletos sube este contador:
  // enciende los errores y sacude los campos que fallan.
  const [intentos, setIntentos] = useState(0);
  const [faltanVisible, setFaltanVisible] = useState(false);
  // Consentimiento: dos casillas separadas, porque las fotos del
  // documento y la selfie pueden ser datos sensibles y la ley pide una
  // autorización aparte de los términos.
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaFotos, setAceptaFotos] = useState(false);
  // Opcional y desmarcada: las promociones necesitan su propio permiso.
  const [aceptaPromos, setAceptaPromos] = useState(false);
  // Versiones vigentes al momento de aceptar: son las que se registran.
  const [vigentes, setVigentes] = useState(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Espacio en blanco al final igual al alto del teclado. Sin él, la
  // pantalla solo se desplaza hasta donde termina el contenido, y el
  // último campo queda atrapado debajo del teclado.
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();

  const scrollRef = useRef(null);
  const posiciones = useRef({});
  const grupos = useRef({});
  const inicioForm = useRef(0);
  const verificando = useRef(false);

  // Desde el paso 2 la cuenta de Auth ya existe: el botón atrás del
  // teléfono no puede devolver al formulario, solo produciría un correo
  // duplicado.
  useEffect(() => {
    if (paso === 1) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      mostrar(
        paso === 2
          ? "Ya creamos tu cuenta con ese correo. Termina de verificarla."
          : "Sube tus fotos para terminar. Tu cuenta ya está creada.",
        "info",
      );
      return true;
    });
    return () => sub.remove();
  }, [paso]);

  /**
   * Desplazamiento al campo enfocado. Cada campo vive dentro de una
   * tarjeta: su "y" es relativa a ella, así que se guarda también dónde
   * empieza cada tarjeta y al enfocar se suman las dos.
   */
  function recordarGrupo(grupo) {
    return (e) => {
      grupos.current[grupo] = e.nativeEvent.layout.y;
    };
  }

  function recordarPos(campo, grupo) {
    return (e) => {
      posiciones.current[campo] = { grupo, y: e.nativeEvent.layout.y };
    };
  }

  function alEnfocar(campo) {
    return () => {
      const pos = posiciones.current[campo];
      if (!pos || !scrollRef.current) return;
      const y = (grupos.current[pos.grupo] || 0) + pos.y;
      // La espera deja que el teclado termine de subir; sin ella el
      // desplazamiento se calcula contra una pantalla que aún cambia.
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, inicioForm.current + y - 24),
          animated: true,
        });
      }, 140);
    };
  }

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  // ── Ubigeo ──
  // El listado ya viene ordenado sin tildes (Áncash junto a Amazonas):
  // el .sort() de JavaScript lo mandaba al final.
  const departamentos = Object.keys(PERU_DATA);
  const provincias = form.departamento
    ? Object.keys(PERU_DATA[form.departamento] || {})
    : [];
  const distritos =
    form.departamento && form.provincia
      ? PERU_DATA[form.departamento]?.[form.provincia] || []
      : [];
  const todasUbigeo =
    { departamento: departamentos, provincia: provincias, distrito: distritos }[
      elegir
    ] || [];
  const conBuscador = todasUbigeo.length > 10;
  const filtro = sinTildes(busqueda.trim());
  const opcionesUbigeo = filtro
    ? todasUbigeo.filter((op) => sinTildes(op).includes(filtro))
    : todasUbigeo;
  // Que la combinación exista de verdad en el listado del INEI.
  const ubigeoValido = Boolean(
    form.departamento &&
    form.provincia &&
    PERU_DATA[form.departamento]?.[form.provincia]?.includes(form.distrito),
  );

  function abrirUbigeo(nivel) {
    setBusqueda("");
    setElegir(nivel);
  }

  function elegirUbigeo(valor) {
    if (elegir === "departamento")
      setForm((p) => ({
        ...p,
        departamento: valor,
        provincia: "",
        distrito: "",
      }));
    else if (elegir === "provincia")
      setForm((p) => ({ ...p, provincia: valor, distrito: "" }));
    else updateForm("distrito", valor);
    setElegir(null);
  }

  // ── Validación en vivo ──
  const largo = largoDocumento(form.tipo_documento);
  const esCe = form.tipo_documento === "ce";
  const passChecks = reglasPassword(form.password, form.confirmarPassword);
  const errores = {
    nombres: validarNombre(form.nombres, "nombres"),
    apellidos: validarNombre(form.apellidos, "apellidos"),
    dni: errorDeDigitos(form.dni, largo, (v) =>
      validarDocumento(form.tipo_documento, v),
    ),
    telefono: errorDeDigitos(form.telefono, 9, validarTelefono),
    ubicacion: !ubigeoValido
      ? "Elige departamento, provincia y distrito"
      : null,
    direccion: form.direccion.trim().length < 5 ? "Escribe tu dirección" : null,
    email: validarEmail(form.email),
    password: validarPassword(form.password, form.password),
    confirmar: !passChecks.match ? "Las contraseñas no coinciden" : null,
  };
  // Un error se muestra si la persona ya intentó continuar, o si está
  // escribiendo algo que ya se ve mal (el correo con más de 3 letras,
  // un documento o celular a medio escribir).
  const mostrarErr = (campo) => {
    if (!errores[campo]) return null;
    if (intentos > 0) return errores[campo];
    if (campo === "dni" || campo === "telefono")
      return form[campo].length > 0 ? errores[campo] : null;
    if (campo === "email") return form.email.length > 3 ? errores.email : null;
    if (campo === "confirmar")
      return form.confirmarPassword.length > 0 ? errores.confirmar : null;
    return null;
  };
  const okDe = (campo, valor) =>
    !errores[campo] && String(valor || "").length > 0;

  const faltantes = [
    errores.nombres && "Nombres",
    errores.apellidos && "Apellidos",
    errores.dni && (esCe ? "Número de carnet" : "Número de DNI"),
    errores.telefono && "Celular",
    errores.ubicacion && "Departamento, provincia y distrito",
    errores.direccion && "Dirección",
    errores.email && "Correo",
    errores.password && "Contraseña (revisa los requisitos)",
    !errores.password && errores.confirmar && "Confirmar contraseña",
    !aceptaTerminos && "Aceptar los términos y la política de privacidad",
    !aceptaFotos && "Autorizar el uso de tus fotos de identidad",
  ].filter(Boolean);

  // Las versiones vigentes se piden al entrar: lo que la persona lee
  // al tocar el enlace es lo que después queda registrado.
  useEffect(() => {
    documentosVigentes()
      .then(setVigentes)
      .catch(() => {});
  }, []);

  async function continuar() {
    if (faltantes.length) {
      setIntentos((n) => n + 1);
      setFaltanVisible(true);
      return;
    }
    // Sin las versiones no hay qué registrar: no se crea la cuenta.
    if (!vigentes?.length) {
      try {
        setVigentes(await documentosVigentes());
      } catch {
        return mostrar("No pudimos cargar los términos. Revisa tu conexión e inténtalo otra vez.", "error");
      }
    }
    enviarCodigoVerificacion();
  }

  async function enviarCodigoVerificacion() {
    setLoading(true);
    try {
      if (!(await hayConexion())) {
        return mostrar(
          "Sin conexión con el servidor. Revisa tu internet.",
          "error",
        );
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (authError) {
        if (/already registered|already exists/i.test(authError.message)) {
          mostrar(
            "Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
            "atencion",
          );
        } else {
          mostrar(mensajeError(authError), "error");
        }
        return;
      }

      // Supabase devuelve un usuario sin identidades cuando el correo ya
      // existe y esta confirmado. No es un registro nuevo.
      if (data.user && data.user.identities?.length === 0) {
        mostrar(
          "Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
          "atencion",
        );
        return;
      }

      setPaso(2);
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  // Con los seis dígitos se verifica solo, sin botón: es lo que la
  // persona espera después de pegar o escribir el código.
  function cambiarCodigo(v) {
    setCodigoOtp(v);
    if (v.length === 6) verificarCodigo(v);
  }

  /**
   * Verifica el codigo y crea de inmediato la fila en users.
   * Se hace aqui y no al final para que nadie quede con una cuenta de
   * Auth sin fila en users: eso dejaba al usuario sin poder entrar ni
   * volver a registrarse con el mismo correo.
   */
  async function verificarCodigo(token = codigoOtp) {
    if (verificando.current) return;
    verificando.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: form.email.trim().toLowerCase(),
        token,
        type: "signup",
      });
      if (error) {
        setCodigoOtp("");
        return mostrar("El código es incorrecto o ya expiró", "error");
      }

      const uid = data.user?.id;
      if (!uid)
        return mostrar(
          "No pudimos confirmar tu cuenta. Intenta de nuevo.",
          "error",
        );

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
        if (userError) return mostrar(mensajeError(userError), "error");
      }

      // Primer momento en que existe la cuenta: se registra lo que
      // aceptó en el paso 1, antes de que suba ninguna foto. Si falla,
      // la app se lo vuelve a pedir al entrar (AceptarCondiciones).
      try {
        const lista = vigentes?.length ? vigentes : await documentosVigentes();
        await aceptar(lista.map((d) => d.id));
      } catch {}

      // Desde aquí hay sesión: el app queda desbloqueada.
      await marcarInicioSesion();
      setCodigoOk(true);
      // Se deja ver el "Correo verificado" un momento antes de avanzar.
      setTimeout(() => setPaso(3), 900);
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      verificando.current = false;
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
    if (error) return mostrar(mensajeError(error), "error");
    mostrar("Te enviamos un código nuevo", "exito");
  }

  /**
   * Sube los documentos y crea el perfil.
   * Si una foto falla se aborta todo y se limpia lo ya subido: antes la
   * cuenta se creaba sin documentos y el gestor no tenía nada que revisar.
   */
  async function finalizarRegistro() {
    setLoading(true);
    const subidos = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        mostrar("Tu sesión expiró. Vuelve a iniciar sesión.", "atencion");
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
        tipo_documento: form.tipo_documento,
        dni: form.dni,
        telefono: "+51" + form.telefono,
        direccion,
        codigo_promo: form.codigo_promo.trim() || null,
        acepta_promociones: aceptaPromos,
        promociones_actualizado_en: new Date().toISOString(),
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

      // Igual que en el prototipo: no se le saca de la app, pasa a ver
      // en qué va su revisión. Esa pantalla escucha a la base y lo deja
      // entrar apenas el gestor lo aprueba.
      mostrar("Documentos enviados. Una persona los revisará.", "exito", 4000);
      entrarA(router, "/en-revision");
    } catch (err) {
      await borrarImagenes(BUCKET_KYC, subidos);
      mostrar(mensajeError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  const titulos = {
    1: { titulo: "Crea tu cuenta", sub: null },
    2: {
      titulo: "Revisa tu correo",
      sub: "Te enviamos un código de 6 dígitos.",
    },
    3: {
      titulo: "Tu identidad",
      sub: "La revisa una persona, no un algoritmo.",
    },
  };
  const conBarra = paso !== 2 && altoTeclado === 0;
  const faltanFotos = fotosFaltantes(fotos);

  return (
    <KeyboardAvoidingView
      style={s.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <ScrollConTeclado
        ref={scrollRef}
        contentContainerStyle={{
          paddingBottom:
            (conBarra ? ALTO_BARRA_FIJA : 0) + insets.bottom + 32,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <CabeceraPasos
          paso={paso}
          titulo={titulos[paso].titulo}
          subtitulo={titulos[paso].sub}
          onVolver={paso === 1 ? handleBack : null}
        />

        <View
          style={s.cuerpo}
          onLayout={(e) => {
            inicioForm.current = e.nativeEvent.layout.y;
          }}
        >
          {/* ── PASO 1: Datos ── */}
          {paso === 1 && (
            <>
              <View onLayout={recordarGrupo("identidad")}>
                <GlassPanel variant="light" radius={26} style={s.grupo}>
                  <View onLayout={recordarPos("nombres", "identidad")}>
                    <Campo
                      etiqueta="Nombres"
                      value={form.nombres}
                      onChangeText={(v) => updateForm("nombres", v)}
                      placeholder="Ingresa tus nombres"
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoComplete="given-name"
                      ok={okDe("nombres", form.nombres)}
                      error={mostrarErr("nombres")}
                      senal={intentos}
                      onFocus={alEnfocar("nombres")}
                    />
                  </View>
                  <View onLayout={recordarPos("apellidos", "identidad")}>
                    <Campo
                      etiqueta="Apellidos"
                      value={form.apellidos}
                      onChangeText={(v) => updateForm("apellidos", v)}
                      placeholder="Ingresa tus apellidos"
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoComplete="family-name"
                      ok={okDe("apellidos", form.apellidos)}
                      error={mostrarErr("apellidos")}
                      senal={intentos}
                      onFocus={alEnfocar("apellidos")}
                    />
                  </View>

                  {/* Documento: el selector va solo en su fila, a todo el
                      ancho. Al lado del número cada opción quedaba en
                      ~50 px y "Carnet de extranjería" no entraba.
                      Cambiar de tipo borra el número: el largo es otro. */}
                  <View style={s.documento}>
                    <EtiquetaCampo texto="Tipo de documento" />
                    <Segmentado
                      opciones={TIPOS_DOC}
                      valor={form.tipo_documento}
                      accessibilityLabel="Tipo de documento"
                      onCambio={(t) =>
                        t !== form.tipo_documento &&
                        setForm((p) => ({ ...p, tipo_documento: t, dni: "" }))
                      }
                    />
                  </View>

                  <View onLayout={recordarPos("dni", "identidad")}>
                    <Campo
                      etiqueta={esCe ? "Número de carnet" : "Número de DNI"}
                      value={form.dni}
                      onChangeText={(v) =>
                        updateForm("dni", v.replace(/\D/g, "").slice(0, largo))
                      }
                      keyboardType="number-pad"
                      maxLength={largo}
                      placeholder={`${largo} dígitos`}
                      style={{ letterSpacing: 1.5 }}
                      ok={okDe("dni", form.dni)}
                      error={mostrarErr("dni")}
                      senal={intentos}
                      onFocus={alEnfocar("dni")}
                    />
                  </View>
                </GlassPanel>
              </View>

              <View onLayout={recordarGrupo("contacto")}>
                <GlassPanel variant="light" radius={26} style={s.grupo}>
                  <View onLayout={recordarPos("telefono", "contacto")}>
                    <Campo
                      etiqueta="Celular"
                      prefijo="+51"
                      value={form.telefono}
                      onChangeText={(v) =>
                        updateForm("telefono", v.replace(/\D/g, "").slice(0, 9))
                      }
                      keyboardType="phone-pad"
                      maxLength={9}
                      placeholder="9 dígitos"
                      autoComplete="tel"
                      ok={okDe("telefono", form.telefono)}
                      error={mostrarErr("telefono")}
                      senal={intentos}
                      onFocus={alEnfocar("telefono")}
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <EtiquetaCampo texto="Ubicación" />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Ubigeo
                        etiqueta="Departamento"
                        valor={form.departamento}
                        vacio="Elige"
                        habilitado
                        error={intentos > 0 && !form.departamento}
                        senal={intentos}
                        onAbrir={() => abrirUbigeo("departamento")}
                      />
                      <Ubigeo
                        etiqueta="Provincia"
                        valor={form.provincia}
                        vacio="Elige"
                        habilitado={Boolean(form.departamento)}
                        error={
                          intentos > 0 &&
                          Boolean(form.departamento) &&
                          !form.provincia
                        }
                        senal={intentos}
                        onAbrir={() => abrirUbigeo("provincia")}
                      />
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <Ubigeo
                        etiqueta="Distrito"
                        valor={form.distrito}
                        vacio="Elige tu distrito"
                        habilitado={Boolean(form.provincia)}
                        error={
                          intentos > 0 &&
                          Boolean(form.provincia) &&
                          !form.distrito
                        }
                        senal={intentos}
                        onAbrir={() => abrirUbigeo("distrito")}
                      />
                    </View>
                    {intentos > 0 && errores.ubicacion ? (
                      <MensajeError texto={errores.ubicacion} />
                    ) : null}
                  </View>

                  <View onLayout={recordarPos("direccion", "contacto")}>
                    <Campo
                      etiqueta="Dirección"
                      value={form.direccion}
                      onChangeText={(v) => updateForm("direccion", v)}
                      placeholder="Av., calle, número"
                      autoComplete="street-address"
                      ok={okDe("direccion", form.direccion)}
                      error={mostrarErr("direccion")}
                      senal={intentos}
                      onFocus={alEnfocar("direccion")}
                    />
                  </View>
                  <View onLayout={recordarPos("email", "contacto")}>
                    <Campo
                      etiqueta="Correo"
                      value={form.email}
                      onChangeText={(v) => updateForm("email", v)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      placeholder="tucorreo@ejemplo.com"
                      ok={okDe("email", form.email)}
                      error={mostrarErr("email")}
                      senal={intentos}
                      onFocus={alEnfocar("email")}
                    />
                  </View>
                </GlassPanel>
              </View>

              <View onLayout={recordarGrupo("seguridad")}>
                <GlassPanel variant="light" radius={26} style={s.grupo}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={colors.goldText}
                    />
                    <Text style={s.grupoTitulo}>Tu contraseña</Text>
                  </View>
                  <View onLayout={recordarPos("password", "seguridad")}>
                    <Campo
                      etiqueta="Contraseña"
                      value={form.password}
                      onChangeText={(v) => updateForm("password", v)}
                      secreto
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      ok={!errores.password}
                      error={
                        intentos > 0 && errores.password
                          ? "Revisa los requisitos de abajo"
                          : null
                      }
                      senal={intentos}
                      onFocus={alEnfocar("password")}
                    />
                  </View>
                  <FuerzaClave clave={form.password} />
                  <View onLayout={recordarPos("confirmar", "seguridad")}>
                    <Campo
                      etiqueta="Confirmar contraseña"
                      value={form.confirmarPassword}
                      onChangeText={(v) => updateForm("confirmarPassword", v)}
                      secreto
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      returnKeyType="done"
                      onSubmitEditing={continuar}
                      ok={!errores.password && passChecks.match}
                      error={mostrarErr("confirmar")}
                      senal={intentos}
                      onFocus={alEnfocar("confirmar")}
                    />
                  </View>
                  <ReglasClave reglas={passChecks} mostrarCoincide />
                </GlassPanel>
              </View>

              {/* Consentimiento: va al final, cuando ya sabe qué datos nos da. */}
              <View onLayout={recordarGrupo("legal")}>
                <GlassPanel variant="light" radius={26} style={s.grupo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={colors.goldText} />
                    <Text style={s.grupoTitulo}>Tu privacidad</Text>
                  </View>
                  <Casilla
                    marcada={aceptaTerminos}
                    onCambio={setAceptaTerminos}
                    error={intentos > 0 && !aceptaTerminos}
                    senal={intentos}
                    accessibilityLabel="Acepto los Términos y condiciones y la Política de privacidad"
                  >
                    Acepto los <Enlace onPress={() => router.push("/legal/terminos")}>Términos y condiciones</Enlace> y la{" "}
                    <Enlace onPress={() => router.push("/legal/privacidad")}>Política de privacidad</Enlace>.
                  </Casilla>
                  <Casilla
                    marcada={aceptaFotos}
                    onCambio={setAceptaFotos}
                    error={intentos > 0 && !aceptaFotos}
                    senal={intentos}
                    accessibilityLabel="Autorizo el uso de las fotos de mi documento y mi selfie para verificar mi identidad"
                  >
                    Autorizo el uso de las fotos de mi documento y mi selfie solo para verificar mi identidad.{" "}
                    <Enlace onPress={() => router.push("/legal/biometria")}>Ver detalle</Enlace>
                  </Casilla>
                  <Casilla
                    marcada={aceptaPromos}
                    onCambio={setAceptaPromos}
                    accessibilityLabel="Quiero recibir promociones y novedades de AlToque, opcional"
                  >
                    Quiero recibir promociones y novedades de AlToque (opcional). Puedo dejar de recibirlas cuando
                    quiera desde Mi cuenta.
                  </Casilla>
                </GlassPanel>
              </View>

              {/* El código es opcional: plegado para que no parezca un
                  campo más que hay que llenar. */}
              <View onLayout={recordarGrupo("promo")}>
                {promoAbierto || form.codigo_promo ? (
                  <Aparece>
                    <GlassPanel variant="light" radius={26} style={s.grupo}>
                      <View onLayout={recordarPos("promo", "promo")}>
                        <Campo
                          etiqueta="Código promocional (opcional)"
                          value={form.codigo_promo}
                          onChangeText={(v) => updateForm("codigo_promo", v)}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          autoFocus={promoAbierto && !form.codigo_promo}
                          onFocus={alEnfocar("promo")}
                        />
                      </View>
                    </GlassPanel>
                  </Aparece>
                ) : (
                  <Toque
                    onPress={() => setPromoAbierto(true)}
                    accessibilityLabel="Agregar código promocional"
                    style={s.promo}
                  >
                    <View style={s.promoMas}>
                      <Text style={s.promoMasTexto}>+</Text>
                    </View>
                    <Text style={s.promoTexto}>
                      Código promocional{" "}
                      <Text
                        style={{ fontFamily: fonts.label, color: colors.text3 }}
                      >
                        (opcional)
                      </Text>
                    </Text>
                  </Toque>
                )}
              </View>

              <Toque
                onPress={() => router.replace("/login")}
                accessibilityLabel="Ya tengo cuenta. Iniciar sesión"
                style={s.enlace}
              >
                <Text style={s.enlaceTexto}>
                  ¿Ya tienes cuenta?{" "}
                  <Text style={s.enlaceFuerte}>Inicia sesión</Text>
                </Text>
              </Toque>
            </>
          )}

          {/* ── PASO 2: Verificar correo ── */}
          {paso === 2 && (
            <Aparece key="paso2">
              <GlassPanel variant="light" radius={26} style={s.grupo}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View style={s.sobre}>
                    <Ionicons
                      name="mail-outline"
                      size={22}
                      color={colors.gold}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.enviadoA}>Enviado a</Text>
                    <Text style={s.correo} numberOfLines={1}>
                      {form.email.trim().toLowerCase()}
                    </Text>
                  </View>
                </View>
                <CodigoSeisCajas
                  valor={codigoOtp}
                  onCambio={cambiarCodigo}
                  autoFocus
                  ok={codigoOk}
                  deshabilitado={loading || codigoOk}
                />
                {codigoOk ? (
                  <View style={s.verificado}>
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.successText}
                    />
                    <Text style={s.verificadoTexto}>Correo verificado</Text>
                  </View>
                ) : (
                  <Text style={s.ayuda}>
                    {loading
                      ? "Verificando..."
                      : "Toca los recuadros para escribir. ¿No llegó? Revisa spam."}
                  </Text>
                )}
              </GlassPanel>
              <View style={s.creada}>
                <View style={s.puntoVerde} />
                <Text style={s.creadaTexto}>Tu cuenta ya fue creada</Text>
              </View>
              {!codigoOk ? (
                <Toque
                  onPress={reenviarCodigo}
                  disabled={reenviando}
                  hitSlop={8}
                  accessibilityLabel="Reenviar código"
                  style={{
                    alignSelf: "center",
                    minHeight: 44,
                    justifyContent: "center",
                  }}
                >
                  <Text style={s.reenviar}>
                    {reenviando ? "Reenviando..." : "Reenviar código"}
                  </Text>
                </Toque>
              ) : null}
            </Aparece>
          )}

          {/* ── PASO 3: Documentos ── */}
          {paso === 3 && (
            <Aparece key="paso3">
              <GlassPanel variant="light" radius={26} style={s.grupo}>
                <SubidaDocumentos
                  fotos={fotos}
                  onChange={setFotos}
                  deshabilitado={loading}
                  tipoDocumento={form.tipo_documento}
                />
              </GlassPanel>
              <View style={s.creada}>
                <Ionicons
                  name="lock-closed-outline"
                  size={15}
                  color={colors.goldText}
                />
                <Text style={[s.creadaTexto, { color: colors.text2 }]}>
                  Tus fotos se guardan cifradas
                </Text>
              </View>
            </Aparece>
          )}
        </View>
      </ScrollConTeclado>

      {conBarra ? (
        <BarraFija>
          {paso === 1 ? (
            <Boton
              titulo={loading ? "Enviando código..." : "Continuar"}
              icono="arrow-forward"
              onPress={continuar}
              cargando={loading}
              style={{ height: 58 }}
            />
          ) : (
            <Boton
              titulo={
                loading
                  ? "Subiendo documentos..."
                  : faltanFotos
                    ? `Faltan ${faltanFotos} foto${faltanFotos === 1 ? "" : "s"}`
                    : "Enviar a revisión"
              }
              icono={faltanFotos ? undefined : "arrow-forward"}
              onPress={finalizarRegistro}
              cargando={loading}
              deshabilitado={!documentosCompletos(fotos)}
              style={{ height: 58 }}
            />
          )}
        </BarraFija>
      ) : null}

      {/* Elegir departamento, provincia o distrito */}
      <Hoja
        visible={Boolean(elegir)}
        onCerrar={() => setElegir(null)}
        titulo={
          {
            departamento: "Departamento",
            provincia: "Provincia",
            distrito: "Distrito",
          }[elegir] || ""
        }
        altoMax={0.8}
      >
        {elegir && elegir !== "departamento" ? (
          <Text style={s.ruta} numberOfLines={1}>
            {elegir === "provincia"
              ? form.departamento
              : `${form.provincia}, ${form.departamento}`}
          </Text>
        ) : null}
        {conBuscador ? (
          <View style={s.buscador}>
            <Ionicons name="search" size={18} color={colors.text3} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder={`Buscar ${elegir || ""}`}
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel={`Buscar ${elegir || ""}`}
              style={s.buscadorTexto}
            />
            {busqueda ? (
              <Toque
                onPress={() => setBusqueda("")}
                hitSlop={10}
                accessibilityLabel="Borrar búsqueda"
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textFaint}
                />
              </Toque>
            ) : null}
          </View>
        ) : null}
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: 4 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {opcionesUbigeo.length === 0 ? (
            <Text style={s.sinResultados}>
              No encontramos “{busqueda.trim()}”. Revisa cómo se escribe.
            </Text>
          ) : null}
          {opcionesUbigeo.map((op) => {
            const sel = form[elegir] === op;
            return (
              <Toque
                key={op}
                escala={0.99}
                onPress={() => elegirUbigeo(op)}
                accessibilityState={{ selected: sel }}
                style={[s.opcion, sel && s.opcionSel]}
              >
                <Text
                  style={[s.opcionTexto, sel && { fontFamily: fonts.heavy }]}
                >
                  {op}
                </Text>
                {sel ? (
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                ) : null}
              </Toque>
            );
          })}
        </ScrollView>
      </Hoja>

      {/* Lo que falta, en una lista: más claro que un aviso que se va. */}
      <Modal
        visible={faltanVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFaltanVisible(false)}
        statusBarTranslucent
      >
        <View style={s.velo}>
          <View style={s.dialogo} accessibilityViewIsModal>
            <View style={s.dialogoIcono}>
              <Ionicons
                name="alert-circle-outline"
                size={26}
                color={colors.error}
              />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.dialogoTitulo}>Faltan algunos datos</Text>
              <Text style={s.dialogoTexto}>
                Completa los campos marcados en rojo:
              </Text>
            </View>
            <View style={s.dialogoLista}>
              {faltantes.map((f) => (
                <View
                  key={f}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.error,
                    }}
                  />
                  <Text style={s.dialogoItem}>{f}</Text>
                </View>
              ))}
            </View>
            <Boton
              titulo="Revisar"
              onPress={() => {
                setFaltanVisible(false);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
              style={{ height: 54 }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cuerpo: { marginTop: -64, paddingHorizontal: 16, gap: 12 },
  grupo: { padding: 18, paddingHorizontal: 16, gap: 14 },
  documento: { gap: 6 },
  grupoTitulo: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },

  ubigeo: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.field,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ubigeoEtiqueta: {
    fontFamily: fonts.strong,
    fontSize: 12,
    color: colors.text2,
  },
  ubigeoValor: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },

  promo: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#BCC7D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  promoMas: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  promoMasTexto: {
    fontFamily: fonts.heavy,
    fontSize: 16,
    lineHeight: 18,
    color: colors.goldText,
  },
  promoTexto: { fontFamily: fonts.strong, fontSize: 14, color: colors.text2 },
  enlace: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  enlaceTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  enlaceFuerte: { fontFamily: fonts.strong, color: colors.navy },

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
  ayuda: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text3,
    textAlign: "center",
  },
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
  verificadoTexto: {
    fontFamily: fonts.heavy,
    fontSize: 13,
    color: colors.successText,
  },
  creada: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 14,
  },
  puntoVerde: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  creadaTexto: {
    fontFamily: fonts.strong,
    fontSize: 12,
    color: colors.successText,
  },
  reenviar: { fontFamily: fonts.strong, fontSize: 13, color: colors.goldText },

  ruta: {
    fontFamily: fonts.strong,
    fontSize: 13,
    color: colors.text2,
    paddingHorizontal: 4,
    marginTop: -6,
  },
  buscador: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.ground,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buscadorTexto: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.label,
    fontSize: 15,
    color: colors.text,
  },
  sinResultados: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text2,
    textAlign: "center",
    paddingVertical: 20,
  },
  opcion: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#F7F9FC",
  },
  opcionSel: { backgroundColor: colors.successBg },
  opcionTexto: { fontFamily: fonts.label, fontSize: 15, color: colors.text },

  velo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  dialogo: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 20,
    paddingTop: 24,
    gap: 16,
  },
  dialogoIcono: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.errorBg,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogoTitulo: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 27,
    color: colors.text,
  },
  dialogoTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
  dialogoLista: {
    gap: 8,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.ground,
  },
  dialogoItem: {
    flex: 1,
    fontFamily: fonts.strong,
    fontSize: 14,
    color: colors.text,
  },
});
