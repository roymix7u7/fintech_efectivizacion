import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import COLORS from "../../src/theme/colors";

const BANCOS = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

export default function TarjetasScreen() {
  const [perfil, setPerfil] = useState(null);
  const [userId, setUserId] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Forms
  const [mostrarFormTarjeta, setMostrarFormTarjeta] = useState(false);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [nuevaTarjeta, setNuevaTarjeta] = useState({
    banco: "BCP",
    ultimos_4: "",
    foto: null,
  });
  const [nuevaCuenta, setNuevaCuenta] = useState({
    banco: "BCP",
    numero_cuenta: "",
    tipo: "ahorros",
  });
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, []),
  );

  async function cargarDatos() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: perfilData } = await supabase
      .from("perfiles_cliente")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!perfilData) {
      setLoading(false);
      return;
    }
    setPerfil(perfilData);

    const { data: tarjetasData } = await supabase
      .from("tarjetas")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true)
      .order("created_at", { ascending: false });

    // Firmar URLs de fotos
    if (tarjetasData) {
      for (const t of tarjetasData) {
        if (t.foto_tarjeta && t.foto_tarjeta.includes("tarjetas-fotos")) {
          try {
            const pathParts = t.foto_tarjeta.split("tarjetas-fotos/");
            if (pathParts[1]) {
              const path = decodeURIComponent(pathParts[1].split("?")[0]);
              const { data: sd } = await supabase.storage
                .from("tarjetas-fotos")
                .createSignedUrl(path, 3600);
              if (sd?.signedUrl) t.foto_tarjeta = sd.signedUrl;
            }
          } catch (e) {}
        }
      }
    }

    setTarjetas(tarjetasData || []);

    const { data: cuentasData } = await supabase
      .from("cuentas_bancarias")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setCuentas(cuentasData || []);
    setLoading(false);
    setRefreshing(false);
  }

  async function tomarFotoTarjeta() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      alerta("Se necesita permiso para la cámara.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0])
      setNuevaTarjeta({ ...nuevaTarjeta, foto: result.assets[0] });
  }

  async function seleccionarFotoTarjeta() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alerta("Se necesita permiso para la galería.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0])
      setNuevaTarjeta({ ...nuevaTarjeta, foto: result.assets[0] });
  }

  function alerta(msg) {
    if (typeof window !== "undefined") window.alert(msg);
  }

  async function agregarTarjeta() {
    if (nuevaTarjeta.ultimos_4.length !== 4) {
      alerta("Ingresa exactamente 4 dígitos.");
      return;
    }
    if (!nuevaTarjeta.foto) {
      alerta(
        "Adjunta una foto de tu tarjeta mostrando tu nombre y los últimos 4 dígitos.",
      );
      return;
    }

    setGuardando(true);
    try {
      // Subir foto
      const timestamp = Date.now();
      const path = `${userId}/${timestamp}.jpg`;
      const response = await fetch(nuevaTarjeta.foto.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("tarjetas-fotos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = await supabase.storage
        .from("tarjetas-fotos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      // Crear tarjeta con estado pendiente
      const { error } = await supabase.from("tarjetas").insert({
        cliente_id: perfil.id,
        banco: nuevaTarjeta.banco,
        ultimos_4: nuevaTarjeta.ultimos_4,
        foto_tarjeta: urlData?.signedUrl || path,
        estado: "pendiente",
        activa: true,
      });
      if (error) throw new Error(error.message);

      setGuardando(false);
      setMostrarFormTarjeta(false);
      setNuevaTarjeta({ banco: "BCP", ultimos_4: "", foto: null });
      alerta(
        "Tarjeta enviada para verificación. Te notificaremos cuando sea aprobada.",
      );
      cargarDatos();
    } catch (err) {
      setGuardando(false);
      alerta("Error: " + err.message);
    }
  }

  async function agregarCuenta() {
    if (!nuevaCuenta.numero_cuenta) {
      alerta("Ingresa el número de cuenta.");
      return;
    }
    const { error } = await supabase.from("cuentas_bancarias").insert({
      cliente_id: perfil.id,
      banco: nuevaCuenta.banco,
      numero_cuenta: nuevaCuenta.numero_cuenta,
      tipo: nuevaCuenta.tipo,
    });
    if (error) {
      alerta("Error: " + error.message);
      return;
    }
    setMostrarFormCuenta(false);
    setNuevaCuenta({ banco: "BCP", numero_cuenta: "", tipo: "ahorros" });
    cargarDatos();
  }

  async function desactivar(tabla, id) {
    if (typeof window !== "undefined") {
      if (window.confirm("¿Desactivar este registro?")) {
        await supabase.from(tabla).update({ activa: false }).eq("id", id);
        cargarDatos();
      }
    }
  }

  const estadoTarjeta = {
    pendiente: {
      text: "En verificación",
      color: COLORS.warning,
      bg: "#FFF8E1",
    },
    aprobado: { text: "Aprobada", color: COLORS.success, bg: "#E8F5E9" },
    rechazado: { text: "Rechazada", color: COLORS.error, bg: "#FFEBEE" },
  };

  if (loading)
    return (
      <View style={s.container}>
        <Text style={s.empty}>Cargando...</Text>
      </View>
    );

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            cargarDatos();
          }}
        />
      }
    >
      {/* ── TARJETAS ── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Mis tarjetas</Text>
        <TouchableOpacity
          onPress={() => setMostrarFormTarjeta(!mostrarFormTarjeta)}
        >
          <Text style={s.addBtn}>
            {mostrarFormTarjeta ? "Cancelar" : "+ Agregar"}
          </Text>
        </TouchableOpacity>
      </View>

      {mostrarFormTarjeta && (
        <View style={s.formCard}>
          <Text style={s.formLabel}>Banco</Text>
          <View style={s.bankRow}>
            {BANCOS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setNuevaTarjeta({ ...nuevaTarjeta, banco: b })}
                style={[
                  s.bankChip,
                  nuevaTarjeta.banco === b && s.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    s.bankChipText,
                    nuevaTarjeta.banco === b && s.bankChipTextActive,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.formLabel}>Últimos 4 dígitos</Text>
          <TextInput
            style={s.input}
            placeholder="1234"
            value={nuevaTarjeta.ultimos_4}
            onChangeText={(v) =>
              setNuevaTarjeta({
                ...nuevaTarjeta,
                ultimos_4: v.replace(/\D/g, "").slice(0, 4),
              })
            }
            keyboardType="numeric"
            maxLength={4}
            placeholderTextColor={COLORS.textLight}
          />

          <Text style={s.formLabel}>Foto de la tarjeta *</Text>
          <Text style={s.formHint}>
            Debe mostrar tu nombre y los últimos 4 dígitos. Cubre el resto por
            seguridad.
          </Text>

          {nuevaTarjeta.foto ? (
            <View style={s.fotoPreview}>
              <Image
                source={{ uri: nuevaTarjeta.foto.uri }}
                style={s.fotoImage}
              />
              <TouchableOpacity
                onPress={() => setNuevaTarjeta({ ...nuevaTarjeta, foto: null })}
              >
                <Text style={s.fotoRemove}>Cambiar foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.fotoBtns}>
              <TouchableOpacity style={s.fotoBtn} onPress={tomarFotoTarjeta}>
                <Text style={s.fotoBtnText}>📷 Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.fotoBtn}
                onPress={seleccionarFotoTarjeta}
              >
                <Text style={s.fotoBtnText}>🖼️ Galería</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[
              s.btnSave,
              (!nuevaTarjeta.ultimos_4 || !nuevaTarjeta.foto) && s.btnDisabled,
            ]}
            onPress={agregarTarjeta}
            disabled={
              guardando || !nuevaTarjeta.ultimos_4 || !nuevaTarjeta.foto
            }
          >
            <Text style={s.btnSaveText}>
              {guardando ? "Enviando..." : "Enviar para verificación"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {tarjetas.length === 0 ? (
        <Text style={s.empty}>No tienes tarjetas registradas.</Text>
      ) : (
        tarjetas.map((t) => {
          const est = estadoTarjeta[t.estado] || estadoTarjeta.pendiente;
          return (
            <View key={t.id} style={s.card}>
              <View style={s.cardRow}>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={s.cardBanco}>{t.banco}</Text>
                    <View style={[s.estadoBadge, { backgroundColor: est.bg }]}>
                      <Text style={[s.estadoBadgeText, { color: est.color }]}>
                        {est.text}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.cardNumero}>•••• •••• •••• {t.ultimos_4}</Text>
                  {t.estado === "rechazado" && t.motivo_rechazo && (
                    <View style={s.rechazoBox}>
                      <Text style={s.rechazoText}>
                        Motivo: {t.motivo_rechazo}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => desactivar("tarjetas", t.id)}>
                  <Text style={s.deleteBtn}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* ── CUENTAS ── */}
      <View style={[s.sectionHeader, { marginTop: 32 }]}>
        <Text style={s.sectionTitle}>Mis cuentas</Text>
        <TouchableOpacity
          onPress={() => setMostrarFormCuenta(!mostrarFormCuenta)}
        >
          <Text style={s.addBtn}>
            {mostrarFormCuenta ? "Cancelar" : "+ Agregar"}
          </Text>
        </TouchableOpacity>
      </View>

      {mostrarFormCuenta && (
        <View style={s.formCard}>
          <Text style={s.formLabel}>Banco</Text>
          <View style={s.bankRow}>
            {BANCOS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setNuevaCuenta({ ...nuevaCuenta, banco: b })}
                style={[
                  s.bankChip,
                  nuevaCuenta.banco === b && s.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    s.bankChipText,
                    nuevaCuenta.banco === b && s.bankChipTextActive,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.formLabel}>Tipo de cuenta</Text>
          <View style={s.bankRow}>
            {[
              { key: "ahorros", label: "Cuenta de ahorros" },
              { key: "interbancaria", label: "Cuenta interbancaria" },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setNuevaCuenta({ ...nuevaCuenta, tipo: t.key })}
                style={[
                  s.bankChip,
                  nuevaCuenta.tipo === t.key && s.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    s.bankChipText,
                    nuevaCuenta.tipo === t.key && s.bankChipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.formLabel}>Número de cuenta</Text>
          <TextInput
            style={s.input}
            placeholder="Número completo"
            value={nuevaCuenta.numero_cuenta}
            onChangeText={(v) =>
              setNuevaCuenta({ ...nuevaCuenta, numero_cuenta: v })
            }
            keyboardType="numeric"
            placeholderTextColor={COLORS.textLight}
          />

          <TouchableOpacity style={s.btnSave} onPress={agregarCuenta}>
            <Text style={s.btnSaveText}>Guardar cuenta</Text>
          </TouchableOpacity>
        </View>
      )}

      {cuentas.length === 0 ? (
        <Text style={s.empty}>No tienes cuentas registradas.</Text>
      ) : (
        cuentas.map((c) => (
          <View key={c.id} style={s.card}>
            <View style={s.cardRow}>
              <View>
                <Text style={s.cardBanco}>{c.banco}</Text>
                <Text style={s.cardNumero}>
                  {c.tipo === "interbancaria"
                    ? "Cuenta interbancaria"
                    : "Cuenta de ahorros"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => desactivar("cuentas_bancarias", c.id)}
              >
                <Text style={s.deleteBtn}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  addBtn: { fontSize: 14, color: COLORS.primary, fontWeight: "600" },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  formLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  formHint: { fontSize: 12, color: COLORS.textLight, marginTop: -4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.white,
    color: COLORS.text,
  },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bankChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  bankChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  bankChipText: { fontSize: 13, color: COLORS.textSecondary },
  bankChipTextActive: { color: COLORS.white },
  btnSave: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { backgroundColor: COLORS.textLight },
  btnSaveText: { color: COLORS.white, fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBanco: { fontSize: 16, fontWeight: "600", color: COLORS.text },
  cardNumero: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  deleteBtn: { fontSize: 13, color: COLORS.error },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  estadoBadgeText: { fontSize: 11, fontWeight: "600" },
  rechazoBox: {
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  rechazoText: { fontSize: 12, color: COLORS.error },
  empty: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: "center",
    marginTop: 20,
  },
  fotoBtns: { flexDirection: "row", gap: 10 },
  fotoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  fotoBtnText: { fontSize: 14, color: COLORS.text },
  fotoPreview: { alignItems: "center", gap: 8 },
  fotoImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
  fotoRemove: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
});
