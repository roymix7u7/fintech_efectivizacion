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
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function NuevaOperacionScreen() {
  const [perfil, setPerfil] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [monto, setMonto] = useState("");
  const [numeroVoucher, setNumeroVoucher] = useState("");
  const [fechaVoucher, setFechaVoucher] = useState("");
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState(1);
  const router = useRouter();

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
      .select("id, tasa_comision")
      .eq("user_id", user.id)
      .single();

    if (!perfilData) return;
    setPerfil(perfilData);

    const { data: tarjetasData } = await supabase
      .from("tarjetas")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true);
    setTarjetas(tarjetasData || []);

    const { data: cuentasData } = await supabase
      .from("cuentas_bancarias")
      .select("*")
      .eq("cliente_id", perfilData.id)
      .eq("activa", true);
    setCuentas(cuentasData || []);
  }

  function calcularComision() {
    const montoNum = parseFloat(monto) || 0;
    const tasa = parseFloat(perfil?.tasa_comision) || 1;
    const comision = (montoNum * tasa) / 100;
    const neto = montoNum - comision;
    return { comision: comision.toFixed(2), neto: neto.toFixed(2), tasa };
  }

  async function generarCodigo() {
    const anio = new Date().getFullYear();
    const prefijo = `OP-${anio}-`;
    const { data } = await supabase
      .from("operaciones")
      .select("codigo")
      .like("codigo", `${prefijo}%`)
      .order("codigo", { ascending: false })
      .limit(1);

    let siguiente = 1;
    if (data && data.length > 0) {
      const ultimo = parseInt(data[0].codigo.split("-")[2]) || 0;
      siguiente = ultimo + 1;
    }
    return `${prefijo}${String(siguiente).padStart(6, "0")}`;
  }

  async function crearOperacion() {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0)
      return Alert.alert("Error", "Ingresa un monto válido.");
    if (!fechaVoucher)
      return Alert.alert("Error", "Ingresa la fecha del voucher.");
    if (!tarjetaSeleccionada || !cuentaSeleccionada)
      return Alert.alert("Error", "Selecciona tarjeta y cuenta.");

    setLoading(true);

    const { comision, neto, tasa } = calcularComision();
    const codigo = await generarCodigo();

    // Formatear fecha: de DD/MM/YYYY a YYYY-MM-DD
    let fechaFormateada = fechaVoucher;
    if (fechaVoucher.includes("/")) {
      const partes = fechaVoucher.split("/");
      if (partes.length === 3) {
        let anio = partes[2];
        if (anio.length === 2) anio = "20" + anio;
        fechaFormateada = `${anio}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
      }
    }

    //Ver los logs para entender por qué no se crean las operaciones
    console.log("Intentando crear operación:", {
      codigo,
      monto: montoNum,
      tasa,
      comision,
      neto,
      fechaFormateada,
      tarjeta: tarjetaSeleccionada.id,
      cuenta: cuentaSeleccionada.id,
      perfil: perfil.id,
    });

    const { data, error } = await supabase
      .from("operaciones")
      .insert({
        codigo,
        cliente_id: perfil.id,
        tarjeta_id: tarjetaSeleccionada.id,
        cuenta_destino_id: cuentaSeleccionada.id,
        monto_bruto: montoNum,
        tasa_comision: tasa,
        monto_comision: parseFloat(comision),
        monto_neto: parseFloat(neto),
        numero_op_voucher: numeroVoucher || null,
        fecha_voucher: fechaFormateada,
        ocr_confirmado_por_cliente: true,
        estado: "pendiente_verificacion",
      })
      .select()
      .single();

    if (error) {
      setLoading(false);
      return Alert.alert(
        "Error",
        "No se pudo crear la operación: " + error.message,
      );
    }

    setLoading(false);

    const mensaje = `Tu operación ${codigo} fue creada.\n\nMonto: S/ ${montoNum.toFixed(2)}\nComisión: S/ ${comision}\nRecibirás: S/ ${neto}\n\nEstá siendo revisada por nuestro equipo.`;

    if (typeof window !== "undefined") {
      window.alert(mensaje);
    } else {
      Alert.alert("Operación creada", mensaje);
    }

    router.replace("/(tabs)/operaciones");
  }

  if (!perfil)
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Cargando...</Text>
      </View>
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* PASO 1: Seleccionar tarjeta */}
      <Text style={styles.stepTitle}>1. Selecciona tu tarjeta</Text>
      {tarjetas.length === 0 ? (
        <Text style={styles.empty}>
          No tienes tarjetas. Agrégala en la pestaña Tarjetas.
        </Text>
      ) : (
        <View style={styles.optionsRow}>
          {tarjetas.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.optionCard,
                tarjetaSeleccionada?.id === t.id && styles.optionCardActive,
              ]}
              onPress={() => setTarjetaSeleccionada(t)}
            >
              <Text
                style={[
                  styles.optionBanco,
                  tarjetaSeleccionada?.id === t.id && styles.optionTextActive,
                ]}
              >
                {t.banco}
              </Text>
              <Text
                style={[
                  styles.optionNumero,
                  tarjetaSeleccionada?.id === t.id && styles.optionTextActive,
                ]}
              >
                •••• {t.ultimos_4}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* PASO 2: Seleccionar cuenta destino */}
      <Text style={styles.stepTitle}>2. Cuenta destino</Text>
      {cuentas.length === 0 ? (
        <Text style={styles.empty}>
          No tienes cuentas. Agrégala en la pestaña Tarjetas.
        </Text>
      ) : (
        <View style={styles.optionsRow}>
          {cuentas.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.optionCard,
                cuentaSeleccionada?.id === c.id && styles.optionCardActive,
              ]}
              onPress={() => setCuentaSeleccionada(c)}
            >
              <Text
                style={[
                  styles.optionBanco,
                  cuentaSeleccionada?.id === c.id && styles.optionTextActive,
                ]}
              >
                {c.banco}
              </Text>
              <Text
                style={[
                  styles.optionNumero,
                  cuentaSeleccionada?.id === c.id && styles.optionTextActive,
                ]}
              >
                {c.tipo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* PASO 3: Datos del voucher */}
      <Text style={styles.stepTitle}>3. Datos del voucher</Text>
      <View style={styles.formSection}>
        <Text style={styles.formLabel}>Monto del voucher (S/)</Text>
        <TextInput
          style={styles.input}
          placeholder="1500.00"
          value={monto}
          onChangeText={setMonto}
          keyboardType="decimal-pad"
        />

        <Text style={styles.formLabel}>N° de operación del voucher</Text>
        <TextInput
          style={styles.input}
          placeholder="12345678"
          value={numeroVoucher}
          onChangeText={setNumeroVoucher}
          keyboardType="numeric"
        />

        <Text style={styles.formLabel}>Fecha del voucher (DD/MM/YYYY)</Text>
        <TextInput
          style={styles.input}
          placeholder="28/05/2026"
          value={fechaVoucher}
          onChangeText={setFechaVoucher}
          keyboardType="default"
          maxLength={10}
        />
      </View>

      {/* Resumen */}
      {monto && parseFloat(monto) > 0 && (
        <View style={styles.resumen}>
          <Text style={styles.resumenTitle}>Resumen</Text>
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>Monto bruto</Text>
            <Text style={styles.resumenValue}>
              S/ {parseFloat(monto).toFixed(2)}
            </Text>
          </View>
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>
              Comisión ({calcularComision().tasa}%)
            </Text>
            <Text style={[styles.resumenValue, { color: "#EF4444" }]}>
              - S/ {calcularComision().comision}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.resumenRow}>
            <Text style={[styles.resumenLabel, { fontWeight: "700" }]}>
              Recibirás
            </Text>
            <Text
              style={[
                styles.resumenValue,
                { fontWeight: "700", color: "#10B981", fontSize: 20 },
              ]}
            >
              S/ {calcularComision().neto}
            </Text>
          </View>
        </View>
      )}

      {/* Botón crear */}
      <TouchableOpacity
        style={[
          styles.btnCrear,
          (!tarjetaSeleccionada || !cuentaSeleccionada || !monto) &&
            styles.btnDisabled,
        ]}
        onPress={crearOperacion}
        disabled={
          loading || !tarjetaSeleccionada || !cuentaSeleccionada || !monto
        }
      >
        <Text style={styles.btnCrearText}>
          {loading ? "Creando..." : "Crear operación"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 60 },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginTop: 20,
    marginBottom: 12,
  },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    minWidth: 120,
    backgroundColor: "#fff",
  },
  optionCardActive: { borderColor: "#111", backgroundColor: "#111" },
  optionBanco: { fontSize: 15, fontWeight: "600", color: "#111" },
  optionNumero: { fontSize: 13, color: "#999", marginTop: 2 },
  optionTextActive: { color: "#fff" },
  formSection: { gap: 10 },
  formLabel: { fontSize: 13, fontWeight: "600", color: "#666", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  resumen: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#eee",
  },
  resumenTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
  },
  resumenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  resumenLabel: { fontSize: 14, color: "#666" },
  resumenValue: { fontSize: 14, fontWeight: "600", color: "#111" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 8 },
  btnCrear: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  btnDisabled: { backgroundColor: "#ccc" },
  btnCrearText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  empty: { fontSize: 14, color: "#999", marginBottom: 12 },
});
