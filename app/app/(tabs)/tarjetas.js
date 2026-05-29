import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { supabase } from "../../src/lib/supabase";

const BANCOS = ["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"];

export default function TarjetasScreen() {
  const [perfil, setPerfil] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarFormTarjeta, setMostrarFormTarjeta] = useState(false);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [nuevaTarjeta, setNuevaTarjeta] = useState({
    banco: "BCP",
    ultimos_4: "",
  });
  const [nuevaCuenta, setNuevaCuenta] = useState({
    banco: "BCP",
    numero_cuenta: "",
    tipo: "ahorros",
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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
    setTarjetas(tarjetasData || []);

    const { data: cuentasData } = await supabase
      .from("cuentas_bancarias")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true)
      .order("created_at", { ascending: false });
    setCuentas(cuentasData || []);
    setLoading(false);
  }

  async function agregarTarjeta() {
    if (nuevaTarjeta.ultimos_4.length !== 4)
      return Alert.alert("Error", "Ingresa exactamente 4 dígitos.");
    const { error } = await supabase.from("tarjetas").insert({
      cliente_id: perfil.id,
      banco: nuevaTarjeta.banco,
      ultimos_4: nuevaTarjeta.ultimos_4,
    });
    if (error) return Alert.alert("Error", error.message);
    setMostrarFormTarjeta(false);
    setNuevaTarjeta({ banco: "BCP", ultimos_4: "" });
    cargarDatos();
  }

  async function agregarCuenta() {
    if (!nuevaCuenta.numero_cuenta)
      return Alert.alert("Error", "Ingresa el número de cuenta.");
    const { error } = await supabase.from("cuentas_bancarias").insert({
      cliente_id: perfil.id,
      banco: nuevaCuenta.banco,
      numero_cuenta: nuevaCuenta.numero_cuenta,
      tipo: nuevaCuenta.tipo,
    });
    if (error) return Alert.alert("Error", error.message);
    setMostrarFormCuenta(false);
    setNuevaCuenta({ banco: "BCP", numero_cuenta: "", tipo: "ahorros" });
    cargarDatos();
  }

  async function desactivar(tabla, id) {
    Alert.alert("Confirmar", "¿Desactivar este registro?", [
      { text: "Cancelar" },
      {
        text: "Sí",
        onPress: async () => {
          await supabase.from(tabla).update({ activa: false }).eq("id", id);
          cargarDatos();
        },
      },
    ]);
  }

  if (loading)
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Cargando...</Text>
      </View>
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* TARJETAS */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Mis tarjetas</Text>
        <TouchableOpacity
          onPress={() => setMostrarFormTarjeta(!mostrarFormTarjeta)}
        >
          <Text style={styles.addBtn}>
            {mostrarFormTarjeta ? "Cancelar" : "+ Agregar"}
          </Text>
        </TouchableOpacity>
      </View>

      {mostrarFormTarjeta && (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Banco</Text>
          <View style={styles.bankRow}>
            {BANCOS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setNuevaTarjeta({ ...nuevaTarjeta, banco: b })}
                style={[
                  styles.bankChip,
                  nuevaTarjeta.banco === b && styles.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.bankChipText,
                    nuevaTarjeta.banco === b && styles.bankChipTextActive,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.formLabel}>Últimos 4 dígitos</Text>
          <TextInput
            style={styles.input}
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
          />
          <TouchableOpacity style={styles.btnSave} onPress={agregarTarjeta}>
            <Text style={styles.btnSaveText}>Guardar tarjeta</Text>
          </TouchableOpacity>
        </View>
      )}

      {tarjetas.length === 0 ? (
        <Text style={styles.empty}>No tienes tarjetas registradas.</Text>
      ) : (
        tarjetas.map((t) => (
          <View key={t.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardBanco}>{t.banco}</Text>
                <Text style={styles.cardNumero}>
                  •••• •••• •••• {t.ultimos_4}
                </Text>
              </View>
              <TouchableOpacity onPress={() => desactivar("tarjetas", t.id)}>
                <Text style={styles.deleteBtn}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* CUENTAS */}
      <View style={[styles.sectionHeader, { marginTop: 32 }]}>
        <Text style={styles.sectionTitle}>Mis cuentas</Text>
        <TouchableOpacity
          onPress={() => setMostrarFormCuenta(!mostrarFormCuenta)}
        >
          <Text style={styles.addBtn}>
            {mostrarFormCuenta ? "Cancelar" : "+ Agregar"}
          </Text>
        </TouchableOpacity>
      </View>

      {mostrarFormCuenta && (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Banco</Text>
          <View style={styles.bankRow}>
            {BANCOS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setNuevaCuenta({ ...nuevaCuenta, banco: b })}
                style={[
                  styles.bankChip,
                  nuevaCuenta.banco === b && styles.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.bankChipText,
                    nuevaCuenta.banco === b && styles.bankChipTextActive,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.formLabel}>Número de cuenta</Text>
          <TextInput
            style={styles.input}
            placeholder="Número completo"
            value={nuevaCuenta.numero_cuenta}
            onChangeText={(v) =>
              setNuevaCuenta({ ...nuevaCuenta, numero_cuenta: v })
            }
            keyboardType="numeric"
          />
          <View style={styles.bankRow}>
            {["ahorros", "corriente"].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setNuevaCuenta({ ...nuevaCuenta, tipo: t })}
                style={[
                  styles.bankChip,
                  nuevaCuenta.tipo === t && styles.bankChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.bankChipText,
                    nuevaCuenta.tipo === t && styles.bankChipTextActive,
                  ]}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.btnSave} onPress={agregarCuenta}>
            <Text style={styles.btnSaveText}>Guardar cuenta</Text>
          </TouchableOpacity>
        </View>
      )}

      {cuentas.length === 0 ? (
        <Text style={styles.empty}>No tienes cuentas registradas.</Text>
      ) : (
        cuentas.map((c) => (
          <View key={c.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardBanco}>{c.banco}</Text>
                <Text style={styles.cardNumero}>Cuenta {c.tipo}</Text>
              </View>
              <TouchableOpacity
                onPress={() => desactivar("cuentas_bancarias", c.id)}
              >
                <Text style={styles.deleteBtn}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  addBtn: { fontSize: 14, color: "#3B82F6", fontWeight: "600" },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#eee",
    gap: 10,
  },
  formLabel: { fontSize: 13, fontWeight: "600", color: "#666" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bankChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  bankChipActive: { backgroundColor: "#111", borderColor: "#111" },
  bankChipText: { fontSize: 13, color: "#666" },
  bankChipTextActive: { color: "#fff" },
  btnSave: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnSaveText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBanco: { fontSize: 16, fontWeight: "600", color: "#111" },
  cardNumero: { fontSize: 14, color: "#999", marginTop: 2 },
  deleteBtn: { fontSize: 13, color: "#EF4444" },
  empty: { fontSize: 14, color: "#999", textAlign: "center", marginTop: 20 },
});
