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
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../src/lib/supabase";
import COLORS from "../../src/theme/colors";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import { Ionicons } from "@expo/vector-icons";
import { alerta, confirmar, mensajeError } from "../../src/lib/ui";
import { subirImagen, borrarImagenes, urlsFirmadas, extraerPath } from "../../src/lib/storage";
import { validarUltimos4, validarCuenta } from "../../src/lib/validaciones";

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
  quality: 0.6,
  allowsEditing: true,
  aspect: [4, 3],
  base64: true,
};

const TARJETA_VACIA = { banco: "BCP", ultimos_4: "", foto: null };
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
        alerta(mensajeError(errorTarjetas));
        return;
      }

      // Se firman todas las fotos de una sola llamada. Antes se hacia una
      // peticion por tarjeta dentro de un bucle.
      const lista = tarjetasData || [];
      const firmadas = await urlsFirmadas(
        BUCKET_TARJETAS,
        lista.map((t) => t.foto_tarjeta),
      );
      setTarjetas(
        lista.map((t) => ({
          ...t,
          foto_vista: firmadas[extraerPath(BUCKET_TARJETAS, t.foto_tarjeta)] || null,
        })),
      );

      const { data: cuentasData, error: errorCuentas } = await supabase
        .from("cuentas_bancarias")
        .select("*")
        .eq("cliente_id", perfilData.id)
        .eq("activa", true)
        .order("banco", { ascending: true });
      if (errorCuentas) {
        alerta(mensajeError(errorCuentas));
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

  async function elegirFoto(desdeCamara) {
    const permiso = desdeCamara
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== "granted") {
      alerta(
        desdeCamara
          ? "Necesitamos permiso para usar la camara."
          : "Necesitamos permiso para acceder a tus fotos.",
      );
      return;
    }
    const r = desdeCamara
      ? await ImagePicker.launchCameraAsync(OPCIONES_FOTO)
      : await ImagePicker.launchImageLibraryAsync(OPCIONES_FOTO);
    if (r.canceled || !r.assets?.[0]) return;
    if (!r.assets[0].base64)
      return alerta("No pudimos leer la imagen. Intentalo otra vez.");
    setNuevaTarjeta((p) => ({ ...p, foto: r.assets[0] }));
  }

  async function agregarTarjeta() {
    const error = validarUltimos4(nuevaTarjeta.ultimos_4);
    if (error) return alerta(error);
    if (!nuevaTarjeta.foto) return alerta("Adjunta una foto de tu tarjeta.");

    // Evita que el mismo plastico se registre dos veces.
    const repetida = tarjetas.find(
      (t) =>
        t.banco === nuevaTarjeta.banco &&
        t.ultimos_4 === nuevaTarjeta.ultimos_4 &&
        t.estado !== "rechazado",
    );
    if (repetida) {
      return alerta(
        `Ya registraste una tarjeta ${nuevaTarjeta.banco} terminada en ${nuevaTarjeta.ultimos_4}.`,
      );
    }

    setGuardando(true);
    let pathSubido = null;
    try {
      const path = `${userId}/${Date.now()}.jpg`;
      await subirImagen(BUCKET_TARJETAS, path, nuevaTarjeta.foto);
      pathSubido = path;

      // Se guarda el path, no una URL firmada que caduca.
      const { error: insertError } = await supabase.from("tarjetas").insert({
        cliente_id: perfil.id,
        banco: nuevaTarjeta.banco,
        ultimos_4: nuevaTarjeta.ultimos_4,
        foto_tarjeta: path,
        estado: "pendiente",
        activa: true,
      });
      if (insertError) throw insertError;

      setMostrarFormTarjeta(false);
      setNuevaTarjeta(TARJETA_VACIA);
      alerta("Tarjeta enviada para verificacion.");
      await cargarDatos();
    } catch (err) {
      await borrarImagenes(BUCKET_TARJETAS, [pathSubido]);
      alerta(mensajeError(err));
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
    if (error) return alerta(error);

    const existente = cuentas.find(
      (c) => c.banco === nuevaCuenta.banco && c.tipo === nuevaCuenta.tipo,
    );
    if (existente) {
      const tipoLabel =
        nuevaCuenta.tipo === "interbancaria" ? "interbancaria" : "de ahorros";
      return alerta(
        `Ya tienes una cuenta ${tipoLabel} registrada en ${nuevaCuenta.banco}.`,
      );
    }
    const mismoNumero = cuentas.find(
      (c) => c.numero_cuenta === nuevaCuenta.numero_cuenta,
    );
    if (mismoNumero)
      return alerta("Ese numero de cuenta ya esta registrado.");

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
      alerta(mensajeError(err));
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
    if (error) return alerta(mensajeError(error));
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
      <View style={[s.container, s.centrado]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );

  return (
    <View style={s.container}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Tarjetas" />

      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
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

            <Text style={s.formLabel}>Ultimos 4 digitos</Text>
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

            <Text style={s.formLabel}>Foto de la tarjeta</Text>
            <Text style={s.formHint}>
              Debe mostrar tu nombre y los ultimos 4 digitos. Cubre el numero
              completo por seguridad.
            </Text>

            {nuevaTarjeta.foto ? (
              <View style={s.fotoPreview}>
                <Image
                  source={{ uri: nuevaTarjeta.foto.uri }}
                  style={s.fotoImage}
                />
                <TouchableOpacity
                  onPress={() => setNuevaTarjeta((p) => ({ ...p, foto: null }))}
                  style={s.fotoChangeBtn}
                  disabled={guardando}
                >
                  <Text style={s.fotoChangeText}>Cambiar foto</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.fotoBtns}>
                <TouchableOpacity
                  style={s.fotoBtn}
                  onPress={() => elegirFoto(true)}
                  disabled={guardando}
                >
                  <Ionicons
                    name="camera-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                  <Text style={s.fotoBtnText}>Camara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.fotoBtn}
                  onPress={() => elegirFoto(false)}
                  disabled={guardando}
                >
                  <Ionicons
                    name="images-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                  <Text style={s.fotoBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[
                s.btnPrimary,
                (guardando ||
                  nuevaTarjeta.ultimos_4.length !== 4 ||
                  !nuevaTarjeta.foto) &&
                  s.btnDisabled,
              ]}
              onPress={agregarTarjeta}
              disabled={
                guardando ||
                nuevaTarjeta.ultimos_4.length !== 4 ||
                !nuevaTarjeta.foto
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
                    {t.foto_vista ? (
                      <Image
                        source={{ uri: t.foto_vista }}
                        style={s.tarjetaMiniatura}
                        resizeMode="cover"
                      />
                    ) : null}
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
  tarjetaMiniatura: {
    width: 96,
    height: 62,
    borderRadius: 8,
    marginTop: 10,
    backgroundColor: COLORS.inputBg,
  },
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
