import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../src/lib/supabase";
import COLORS from "../../src/theme/colors";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import { Ionicons } from "@expo/vector-icons";
import { confirmar, mensajeError } from "../../src/lib/ui";
import { useAviso } from "../../src/components/Avisos";
import { pedirPermiso } from "../../src/lib/permisos";
import { prepararImagen } from "../../src/lib/imagen";
import { useAlturaTeclado } from "../../src/lib/teclado";
import { subirImagen, borrarImagenes, urlsFirmadas, extraerPath } from "../../src/lib/storage";
import { validarUltimos4, validarCuenta } from "../../src/lib/validaciones";
import { EsqueletoLista } from "../../src/components/Cargando";

const BUCKET_TARJETAS = "tarjetas-fotos";

const BANCOS_TARJETA = [
  "BCP",
  "BBVA",
  "Interbank",
  "Scotiabank",
  "BanBif",
  "CMR",
  "Otros",
];
const BANCOS_CUENTA = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

const BANCO_COLORS = {
  BCP: { bg: "#FFF3E0", border: "#E67E00", text: "#BF5F00" },
  BBVA: { bg: "#E3E8F4", border: "#004481", text: "#003366" },
  Interbank: { bg: "#E3F2E8", border: "#00855A", text: "#006344" },
  Scotiabank: { bg: "#FCE4E4", border: "#CC0000", text: "#990000" },
  BanBif: { bg: "#E0F0FA", border: "#0077C0", text: "#005A94" },
  CMR: { bg: "#E0F5ED", border: "#00897B", text: "#00695C" },
  Otros: { bg: "#ECEFF1", border: "#607D8B", text: "#455A64" },
};

function getBancoColor(banco) {
  return BANCO_COLORS[banco] || BANCO_COLORS.Otros;
}

const OPCIONES_FOTO = {
  mediaTypes: ["images"],
  quality: 1,
  allowsEditing: true,
  aspect: [4, 3],
  // El base64 lo entrega prepararImagen, ya achicada.
};

// Dos caras. El frente es obligatorio; el reverso solo si los datos
// a verificar no caben en una sola foto, que depende del banco.
const TARJETA_VACIA = {
  banco: "BCP",
  ultimos_4: "",
  frente: null,
  reverso: null,
};

const CARAS = [
  {
    clave: "frente",
    etiqueta: "Frente",
    pista: "Nombre y últimos 4 dígitos",
    obligatoria: true,
  },
  {
    clave: "reverso",
    etiqueta: "Reverso",
    pista: "Solo si los datos están detrás",
    obligatoria: false,
  },
];
const CUENTA_VACIA = { banco: "BCP", numero_cuenta: "", tipo: "ahorros" };

export default function TarjetasScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [userId, setUserId] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mostrarFormTarjeta, setMostrarFormTarjeta] = useState(false);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [nuevaTarjeta, setNuevaTarjeta] = useState(TARJETA_VACIA);
  const [nuevaCuenta, setNuevaCuenta] = useState(CUENTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [guiaVisible, setGuiaVisible] = useState(false);
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, []),
  );

  async function cargarDatos() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!perfilData) return;
      setPerfil(perfilData);

      const { data: tarjetasData, error: errorTarjetas } = await supabase
        .from("tarjetas")
        .select("*")
        .eq("cliente_id", perfilData.id)
        .eq("activa", true)
        .order("created_at", { ascending: false });
      if (errorTarjetas) {
        mostrar(mensajeError(errorTarjetas), "error");
        return;
      }

      // La lista no firma ninguna imagen: las fotos de una tarjeta son
      // documentos de verificación para el revisor, no algo que el
      // cliente necesite volver a mirar en su propia lista.
      setTarjetas(tarjetasData || []);

      const { data: cuentasData, error: errorCuentas } = await supabase
        .from("cuentas_bancarias")
        .select("*")
        .eq("cliente_id", perfilData.id)
        .eq("activa", true)
        .order("banco", { ascending: true });
      if (errorCuentas) {
        mostrar(mensajeError(errorCuentas), "error");
        return;
      }
      setCuentas(cuentasData || []);
    } finally {
      // Siempre se apagan los spinners, incluso al salir por un return
      // temprano. Antes el pull to refresh se quedaba girando.
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function elegirFoto(cara, desdeCamara) {
    if (!(await pedirPermiso(desdeCamara ? "camara" : "galeria"))) return;
    const r = desdeCamara
      ? await ImagePicker.launchCameraAsync(OPCIONES_FOTO)
      : await ImagePicker.launchImageLibraryAsync(OPCIONES_FOTO);
    if (r.canceled || !r.assets?.[0]) return;
    const lista = await prepararImagen(r.assets[0]);
    if (!lista.base64)
      return mostrar("No pudimos leer la imagen. Intentalo otra vez.", "error");
    setNuevaTarjeta((p) => ({ ...p, [cara]: lista }));
  }

  async function agregarTarjeta() {
    // El botón de enviar está deshabilitado hasta tener los 4 dígitos y
    // la foto, así que no hace falta avisar de lo que ya se ve.

    // Evita que el mismo plastico se registre dos veces.
    const repetida = tarjetas.find(
      (t) =>
        t.banco === nuevaTarjeta.banco &&
        t.ultimos_4 === nuevaTarjeta.ultimos_4 &&
        t.estado !== "rechazado",
    );
    if (repetida) {
      return mostrar(
        `Ya registraste una tarjeta ${nuevaTarjeta.banco} terminada en ${nuevaTarjeta.ultimos_4}`,
        "atencion",
      );
    }

    setGuardando(true);
    const subidos = [];
    try {
      const sello = Date.now();

      const pathFrente = `${userId}/${sello}-frente.jpg`;
      await subirImagen(BUCKET_TARJETAS, pathFrente, nuevaTarjeta.frente);
      subidos.push(pathFrente);

      let pathReverso = null;
      if (nuevaTarjeta.reverso) {
        pathReverso = `${userId}/${sello}-reverso.jpg`;
        await subirImagen(BUCKET_TARJETAS, pathReverso, nuevaTarjeta.reverso);
        subidos.push(pathReverso);
      }

      // Se guarda el path, no una URL firmada que caduca.
      const { error: insertError } = await supabase.from("tarjetas").insert({
        cliente_id: perfil.id,
        banco: nuevaTarjeta.banco,
        ultimos_4: nuevaTarjeta.ultimos_4,
        foto_tarjeta: pathFrente,
        foto_reverso: pathReverso,
        estado: "pendiente",
        activa: true,
      });
      if (insertError) throw insertError;

      setMostrarFormTarjeta(false);
      setNuevaTarjeta(TARJETA_VACIA);
      mostrar("Tarjeta enviada para verificación", "exito");
      await cargarDatos();
    } catch (err) {
      // Si algo falla, se limpian las dos: una tarjeta a medias no
      // sirve y dejaría archivos sueltos en el servidor.
      await borrarImagenes(BUCKET_TARJETAS, subidos);
      mostrar(mensajeError(err), "error");
    } finally {
      setGuardando(false);
    }
  }

  async function agregarCuenta() {
    const error = validarCuenta(
      nuevaCuenta.numero_cuenta,
      nuevaCuenta.tipo,
      nuevaCuenta.banco,
    );
    if (error) return mostrar(error, "atencion");

    const existente = cuentas.find(
      (c) => c.banco === nuevaCuenta.banco && c.tipo === nuevaCuenta.tipo,
    );
    if (existente) {
      const tipoLabel =
        nuevaCuenta.tipo === "interbancaria" ? "interbancaria" : "de ahorros";
      return mostrar(
        `Ya tienes una cuenta ${tipoLabel} en ${nuevaCuenta.banco}`,
        "atencion",
      );
    }
    const mismoNumero = cuentas.find(
      (c) => c.numero_cuenta === nuevaCuenta.numero_cuenta,
    );
    if (mismoNumero)
      return mostrar("Ese número de cuenta ya está registrado", "atencion");

    // Sin este estado un doble toque creaba la cuenta por duplicado.
    setGuardandoCuenta(true);
    try {
      const { error: insertError } = await supabase
        .from("cuentas_bancarias")
        .insert({
          cliente_id: perfil.id,
          banco: nuevaCuenta.banco,
          numero_cuenta: nuevaCuenta.numero_cuenta,
          tipo: nuevaCuenta.tipo,
          activa: true,
        });
      if (insertError) throw insertError;

      setMostrarFormCuenta(false);
      setNuevaCuenta(CUENTA_VACIA);
      await cargarDatos();
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      setGuardandoCuenta(false);
    }
  }

  /**
   * Baja logica. Usa confirmar() y no window.confirm, que no existe en
   * React Native y hacia que el boton no respondiera en el telefono.
   */
  async function desactivar(tabla, id, descripcion) {
    const ok = await confirmar(`Quieres eliminar ${descripcion}?`, "Eliminar");
    if (!ok) return;

    const { error } = await supabase
      .from(tabla)
      .update({ activa: false })
      .eq("id", id);
    if (error) return mostrar(mensajeError(error), "error");
    await cargarDatos();
  }

  const estadoTarjeta = {
    pendiente: {
      text: "En verificacion",
      color: COLORS.warning,
      bg: COLORS.warningLight,
    },
    aprobado: {
      text: "Verificada",
      color: COLORS.success,
      bg: COLORS.successLight,
    },
    rechazado: {
      text: "Rechazada",
      color: COLORS.error,
      bg: COLORS.errorLight,
    },
  };

  const cuentasAgrupadas = {};
  cuentas.forEach((c) => {
    if (!cuentasAgrupadas[c.banco]) cuentasAgrupadas[c.banco] = [];
    cuentasAgrupadas[c.banco].push(c);
  });

  if (loading)
    return (
      <View style={s.container}>
        <Header onMenuPress={() => setMenuVisible(true)} titulo="Tarjetas" />
        <View style={s.content}>
          <EsqueletoLista filas={3} alto={100} />
        </View>
      </View>
    );

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Tarjetas" />

      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingBottom: 40 + altoTeclado }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargarDatos();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ══ TARJETAS ══ */}
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Mis tarjetas</Text>
            <Text style={s.sectionSub}>Registra y verifica tus tarjetas</Text>
          </View>
          <TouchableOpacity
            style={s.addBtnContainer}
            onPress={() => setMostrarFormTarjeta(!mostrarFormTarjeta)}
          >
            <Text style={s.addBtnText}>
              {mostrarFormTarjeta ? "Cancelar" : "Agregar"}
            </Text>
          </TouchableOpacity>
        </View>

        {mostrarFormTarjeta && (
          <View style={s.formCard}>
            <Text style={s.formLabel}>Selecciona el banco</Text>
            <View style={s.bankRow}>
              {BANCOS_TARJETA.map((b) => {
                const bc = getBancoColor(b);
                const selected = nuevaTarjeta.banco === b;
                return (
                  <TouchableOpacity
                    key={b}
                    onPress={() => setNuevaTarjeta((p) => ({ ...p, banco: b }))}
                    style={[
                      s.bankChip,
                      { borderColor: selected ? bc.border : COLORS.border },
                      selected && { backgroundColor: bc.bg },
                    ]}
                  >
                    <View style={[s.bankDot, { backgroundColor: bc.border }]} />
                    <Text
                      style={[
                        s.bankChipText,
                        selected && { color: bc.text, fontWeight: "600" },
                      ]}
                    >
                      {b}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.labelFila}>
              <Text style={s.formLabel}>Últimos 4 dígitos</Text>
              <TouchableOpacity
                onPress={() => setGuiaVisible(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Cómo tomar la foto de la tarjeta"
              >
                <Ionicons
                  name="information-circle"
                  size={19}
                  color={COLORS.primaryLight}
                />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.input}
              placeholder="Ej: 5678"
              value={nuevaTarjeta.ultimos_4}
              onChangeText={(v) =>
                setNuevaTarjeta((p) => ({
                  ...p,
                  ultimos_4: v.replace(/\D/g, "").slice(0, 4),
                }))
              }
              keyboardType="numeric"
              maxLength={4}
              placeholderTextColor={COLORS.textLight}
            />

            <Text style={s.formLabel}>Fotos de la tarjeta</Text>
            <Text style={s.formHint}>
              Máximo 2 imágenes. Deben mostrar tu nombre y los últimos 4
              dígitos. Cubre el número completo por seguridad.
            </Text>

            {CARAS.map((cara) => {
              const foto = nuevaTarjeta[cara.clave];
              return (
                <View key={cara.clave} style={s.caraBloque}>
                  <View style={s.caraEncabezado}>
                    <Text style={s.caraTitulo}>
                      {cara.etiqueta}
                      {cara.obligatoria ? "" : " (opcional)"}
                    </Text>
                    {foto && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={COLORS.success}
                      />
                    )}
                  </View>
                  <Text style={s.caraPista}>{cara.pista}</Text>

                  {foto ? (
                    <View style={s.fotoPreview}>
                      <Image source={{ uri: foto.uri }} style={s.fotoImage} />
                      <View style={s.caraAcciones}>
                        <TouchableOpacity
                          onPress={() => elegirFoto(cara.clave, true)}
                          style={s.fotoChangeBtn}
                          disabled={guardando}
                        >
                          <Text style={s.fotoChangeText}>Cambiar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            setNuevaTarjeta((p) => ({
                              ...p,
                              [cara.clave]: null,
                            }))
                          }
                          style={s.fotoChangeBtn}
                          disabled={guardando}
                        >
                          <Text style={s.fotoQuitarText}>Quitar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={s.fotoBtns}>
                      <TouchableOpacity
                        style={s.fotoBtn}
                        onPress={() => elegirFoto(cara.clave, true)}
                        disabled={guardando}
                      >
                        <Ionicons
                          name="camera-outline"
                          size={22}
                          color={COLORS.primary}
                        />
                        <Text style={s.fotoBtnText}>Cámara</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.fotoBtn}
                        onPress={() => elegirFoto(cara.clave, false)}
                        disabled={guardando}
                      >
                        <Ionicons
                          name="images-outline"
                          size={22}
                          color={COLORS.primary}
                        />
                        <Text style={s.fotoBtnText}>Galería</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={[
                s.btnPrimary,
                (guardando ||
                  nuevaTarjeta.ultimos_4.length !== 4 ||
                  !nuevaTarjeta.frente) &&
                  s.btnDisabled,
              ]}
              onPress={agregarTarjeta}
              disabled={
                guardando ||
                nuevaTarjeta.ultimos_4.length !== 4 ||
                !nuevaTarjeta.frente
              }
            >
              <Text style={s.btnPrimaryText}>
                {guardando ? "Enviando..." : "Enviar para verificacion"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {tarjetas.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Sin tarjetas registradas</Text>
            <Text style={s.emptyText}>
              Agrega tu primera tarjeta para comenzar a operar
            </Text>
          </View>
        ) : (
          tarjetas.map((t) => {
            const est = estadoTarjeta[t.estado] || estadoTarjeta.pendiente;
            const bc = getBancoColor(t.banco);
            return (
              <View
                key={t.id}
                style={[s.tarjetaCard, { borderLeftColor: bc.border }]}
              >
                <View style={s.tarjetaRow}>
                  <View style={{ flex: 1 }}>
                    <View style={s.tarjetaTopRow}>
                      <View style={[s.bancoTag, { backgroundColor: bc.bg }]}>
                        <View
                          style={[
                            s.bankDotSmall,
                            { backgroundColor: bc.border },
                          ]}
                        />
                        <Text style={[s.bancoTagText, { color: bc.text }]}>
                          {t.banco}
                        </Text>
                      </View>
                      <View
                        style={[s.estadoBadge, { backgroundColor: est.bg }]}
                      >
                        <Text style={[s.estadoBadgeText, { color: est.color }]}>
                          {est.text}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.tarjetaNumero}>
                      {"•••• •••• •••• "}
                      {t.ultimos_4}
                    </Text>
                    {t.estado === "rechazado" && t.motivo_rechazo ? (
                      <View style={s.rechazoBox}>
                        <Text style={s.rechazoText}>{t.motivo_rechazo}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      desactivar(
                        "tarjetas",
                        t.id,
                        `la tarjeta ${t.banco} terminada en ${t.ultimos_4}`,
                      )
                    }
                    style={s.deleteTouch}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={COLORS.textLight}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ══ CUENTAS ══ */}
        <View style={[s.sectionHeader, { marginTop: 36 }]}>
          <View>
            <Text style={s.sectionTitle}>Mis cuentas bancarias</Text>
            <Text style={s.sectionSub}>
              Una cuenta de ahorros y una CCI por banco
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtnContainer}
            onPress={() => setMostrarFormCuenta(!mostrarFormCuenta)}
          >
            <Text style={s.addBtnText}>
              {mostrarFormCuenta ? "Cancelar" : "Agregar"}
            </Text>
          </TouchableOpacity>
        </View>

        {mostrarFormCuenta && (
          <View style={s.formCard}>
            <Text style={s.formLabel}>Banco</Text>
            <View style={s.bankRow}>
              {BANCOS_CUENTA.map((b) => {
                const bc = getBancoColor(b);
                const selected = nuevaCuenta.banco === b;
                return (
                  <TouchableOpacity
                    key={b}
                    onPress={() => setNuevaCuenta((p) => ({ ...p, banco: b }))}
                    style={[
                      s.bankChip,
                      { borderColor: selected ? bc.border : COLORS.border },
                      selected && { backgroundColor: bc.bg },
                    ]}
                  >
                    <View style={[s.bankDot, { backgroundColor: bc.border }]} />
                    <Text
                      style={[
                        s.bankChipText,
                        selected && { color: bc.text, fontWeight: "600" },
                      ]}
                    >
                      {b}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.formLabel}>Tipo de cuenta</Text>
            <View style={s.tipoRow}>
              {[
                { key: "ahorros", label: "Cuenta de ahorros" },
                { key: "interbancaria", label: "CCI (Interbancaria)" },
              ].map((t) => {
                const isSelected = nuevaCuenta.tipo === t.key;
                const yaExiste = cuentas.find(
                  (c) => c.banco === nuevaCuenta.banco && c.tipo === t.key,
                );
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() =>
                      !yaExiste &&
                      setNuevaCuenta((p) => ({ ...p, tipo: t.key }))
                    }
                    style={[
                      s.tipoBtn,
                      isSelected && s.tipoBtnActive,
                      yaExiste && s.tipoBtnDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        s.tipoBtnText,
                        isSelected && s.tipoBtnTextActive,
                        yaExiste && { color: COLORS.textLight },
                      ]}
                    >
                      {t.label}
                    </Text>
                    {yaExiste ? (
                      <Text style={s.tipoRegistrado}>Ya registrada</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.formLabel}>Numero de cuenta</Text>
            <TextInput
              style={s.input}
              placeholder={
                nuevaCuenta.tipo === "interbancaria"
                  ? "20 digitos. Ej: 00219100234567890123"
                  : "Ej: 19123456789012"
              }
              value={nuevaCuenta.numero_cuenta}
              onChangeText={(v) =>
                setNuevaCuenta((p) => ({
                  ...p,
                  numero_cuenta: v.replace(/\D/g, "").slice(0, 20),
                }))
              }
              keyboardType="numeric"
              maxLength={20}
              placeholderTextColor={COLORS.textLight}
            />
            <Text style={s.formHint}>
              {nuevaCuenta.tipo === "interbancaria"
                ? `${nuevaCuenta.numero_cuenta.length} de 20 digitos`
                : "Copialo tal cual aparece en tu app del banco"}
            </Text>

            <TouchableOpacity
              style={[
                s.btnPrimary,
                (guardandoCuenta || !nuevaCuenta.numero_cuenta) &&
                  s.btnDisabled,
              ]}
              onPress={agregarCuenta}
              disabled={guardandoCuenta || !nuevaCuenta.numero_cuenta}
            >
              <Text style={s.btnPrimaryText}>
                {guardandoCuenta ? "Guardando..." : "Guardar cuenta"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {Object.keys(cuentasAgrupadas).length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Sin cuentas registradas</Text>
            <Text style={s.emptyText}>
              Agrega tu cuenta bancaria para recibir depositos
            </Text>
          </View>
        ) : (
          Object.keys(cuentasAgrupadas)
            .sort()
            .map((banco) => {
              const bc = getBancoColor(banco);
              const items = cuentasAgrupadas[banco];
              return (
                <View
                  key={banco}
                  style={[s.bancoGroup, { borderLeftColor: bc.border }]}
                >
                  <View
                    style={[s.bancoGroupHeader, { backgroundColor: bc.bg }]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={[s.bankDotSmall, { backgroundColor: bc.border }]}
                      />
                      <Text style={[s.bancoGroupTitle, { color: bc.text }]}>
                        {banco}
                      </Text>
                    </View>
                  </View>
                  {items.map((c) => (
                    <View key={c.id} style={s.cuentaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cuentaTipo}>
                          {c.tipo === "interbancaria"
                            ? "CCI (Interbancaria)"
                            : "Cuenta de ahorros"}
                        </Text>
                        <Text style={s.cuentaNumero}>{c.numero_cuenta}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          desactivar(
                            "cuentas_bancarias",
                            c.id,
                            `la cuenta ${banco} ${c.numero_cuenta}`,
                          )
                        }
                        style={s.deleteTouch}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={COLORS.textLight}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })
        )}
      </ScrollView>
      <Modal
        visible={guiaVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGuiaVisible(false)}
      >
        <Pressable style={s.guiaFondo} onPress={() => setGuiaVisible(false)}>
          {/* El Pressable de dentro para el toque: si no, tocar la
              tarjeta cerraria el modal como si fuera el fondo. */}
          <Pressable style={s.guiaCaja} onPress={() => {}}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.guiaScroll}
            >
              <View style={s.guiaEncabezado}>
                <Text style={s.guiaTitulo}>Cómo tomar la foto</Text>
                <TouchableOpacity
                  onPress={() => setGuiaVisible(false)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={22} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>

              <Image
                source={require("../../assets/tc-guia.jpg")}
                style={s.guiaImagen}
                resizeMode="cover"
              />

              <Text style={s.guiaIntro}>
                Solo necesitamos dos datos para confirmar que la tarjeta es
                tuya:
              </Text>

              <View style={s.guiaPunto}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={COLORS.success}
                />
                <Text style={s.guiaPuntoText}>
                  <Text style={s.guiaFuerte}>Tu nombre</Text> tal como aparece
                  impreso en la tarjeta.
                </Text>
              </View>
              <View style={s.guiaPunto}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={COLORS.success}
                />
                <Text style={s.guiaPuntoText}>
                  <Text style={s.guiaFuerte}>Los últimos 4 dígitos</Text> del
                  número, como en el ejemplo.
                </Text>
              </View>

              <View style={s.guiaSeparador} />

              <Text style={s.guiaIntro}>
                Lo demás puedes taparlo con el dedo o con un papel antes de
                tomar la foto:
              </Text>

              <View style={s.guiaPunto}>
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={s.guiaPuntoText}>
                  Los primeros 12 dígitos del número.
                </Text>
              </View>
              <View style={s.guiaPunto}>
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={s.guiaPuntoText}>
                  La fecha de vencimiento y el código de 3 dígitos del reverso.
                </Text>
              </View>

              <View style={s.guiaNota}>
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color={COLORS.primaryLight}
                />
                <Text style={s.guiaNotaText}>
                  Esos tres datos juntos son los que permiten hacer un cargo a
                  tu tarjeta. Por eso no te los pedimos ni los guardamos: con el
                  nombre y los últimos 4 dígitos nos basta para verificarla.
                </Text>
              </View>

              <TouchableOpacity
                style={s.guiaBtn}
                onPress={() => setGuiaVisible(false)}
              >
                <Text style={s.guiaBtnText}>Entendido</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <MenuLateral
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        perfil={perfil}
      />
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centrado: { justifyContent: "center", alignItems: "center" },
  caraBloque: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  caraEncabezado: { flexDirection: "row", alignItems: "center", gap: 7 },
  caraTitulo: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  caraPista: { fontSize: 12, color: COLORS.textLight, marginTop: 2, marginBottom: 10 },
  caraAcciones: { flexDirection: "row", gap: 18 },
  fotoQuitarText: { fontSize: 14, color: COLORS.error, fontWeight: "500" },
  content: { padding: 20, paddingBottom: 40 },
  loadingText: {
    textAlign: "center",
    marginTop: 40,
    color: COLORS.textLight,
    fontSize: 15,
  },
  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: COLORS.text },
  sectionSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  addBtnContainer: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  // Form
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 12,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 2,
  },
  formHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: -6,
    lineHeight: 18,
  },
  labelFila: { flexDirection: "row", alignItems: "center", gap: 6 },

  // Guia de como fotografiar la tarjeta
  guiaFondo: {
    flex: 1,
    backgroundColor: "rgba(15,27,51,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  guiaCaja: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    maxHeight: "86%",
    overflow: "hidden",
  },
  guiaScroll: { padding: 18, gap: 10 },
  guiaEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  guiaTitulo: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  guiaImagen: {
    width: "100%",
    height: 150,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    marginTop: 2,
  },
  guiaIntro: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  guiaPunto: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  guiaPuntoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  guiaFuerte: { fontWeight: "700" },
  guiaSeparador: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 6,
  },
  guiaNota: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  guiaNotaText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  guiaBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  guiaBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
  },
  // Bank chips
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bankChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  bankDot: { width: 10, height: 10, borderRadius: 5 },
  bankDotSmall: { width: 8, height: 8, borderRadius: 4 },
  bankChipText: { fontSize: 13, color: COLORS.textSecondary },
  // Tipo cuenta
  tipoRow: { gap: 8 },
  tipoBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: COLORS.white,
  },
  tipoBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "0D",
  },
  tipoBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.borderLight,
  },
  tipoBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "500" },
  tipoBtnTextActive: { color: COLORS.primary, fontWeight: "600" },
  tipoRegistrado: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  // Buttons
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { backgroundColor: COLORS.textLight },
  btnPrimaryText: { color: COLORS.white, fontSize: 15, fontWeight: "600" },
  // Tarjeta card
  tarjetaCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 4,
  },
  tarjetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tarjetaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  bancoTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bancoTagText: { fontSize: 13, fontWeight: "600" },
  tarjetaNumero: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  estadoBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  estadoBadgeText: { fontSize: 11, fontWeight: "600" },
  rechazoBox: {
    backgroundColor: COLORS.errorLight,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  rechazoText: { fontSize: 12, color: COLORS.error },
  // Delete
  deleteTouch: { padding: 6 },
  deleteIcon: { fontSize: 16, color: COLORS.textLight },
  // Cuentas agrupadas
  bancoGroup: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
    borderLeftWidth: 4,
  },
  bancoGroupHeader: { paddingHorizontal: 16, paddingVertical: 12 },
  bancoGroupTitle: { fontSize: 15, fontWeight: "700" },
  cuentaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  cuentaTipo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "500",
    marginBottom: 3,
  },
  cuentaNumero: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  // Empty
  emptyBox: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: COLORS.textSecondary },
  emptyText: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  // Fotos
  fotoBtns: { flexDirection: "row", gap: 10 },
  fotoBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
  },
  fotoBtnIcon: { fontSize: 28, marginBottom: 6 },
  fotoBtnText: { fontSize: 13, color: COLORS.text, fontWeight: "500" },
  fotoPreview: { alignItems: "center", gap: 10 },
  fotoImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  fotoChangeBtn: { paddingVertical: 6 },
  fotoChangeText: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
});
