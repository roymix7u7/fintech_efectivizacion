import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function GuiaBancoScreen() {
  const { banco } = useLocalSearchParams();
  const [guia, setGuia] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarGuia();
  }, [banco]);

  async function cargarGuia() {
    try {
      // El filtro por activa evita que una guia dada de baja siga
      // visible con un enlace directo. maybeSingle no revienta si hay
      // mas de una fila del mismo banco.
      const { data } = await supabase
        .from("guias_banco")
        .select("*")
        .eq("banco", banco)
        .eq("activa", true)
        .limit(1)
        .maybeSingle();
      setGuia(data);
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Cargando guía...</Text>
      </View>
    );
  if (!guia)
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Guía no disponible.</Text>
      </View>
    );

  const pasos = guia.pasos || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.bancoIcon}>🏦</Text>
      <Text style={styles.titulo}>Guía de {banco}</Text>
      <Text style={styles.subtitulo}>
        Sigue estos pasos para operar desde tu app bancaria
      </Text>

      {guia.imagen_portada && (
        <Image
          source={{ uri: guia.imagen_portada }}
          style={styles.portada}
          resizeMode="contain"
        />
      )}

      {pasos.length === 0 ? (
        <Text style={styles.empty}>
          Esta guía aún no tiene pasos configurados.
        </Text>
      ) : (
        pasos
          .sort((a, b) => a.orden - b.orden)
          .map((paso) => (
            <View key={paso.orden} style={styles.pasoCard}>
              <View style={styles.pasoHeader}>
                <View style={styles.pasoNumero}>
                  <Text style={styles.pasoNumeroText}>{paso.orden}</Text>
                </View>
                <Text style={styles.pasoTitulo}>{paso.titulo}</Text>
              </View>
              <Text style={styles.pasoDescripcion}>{paso.descripcion}</Text>
              {paso.imagen_url && (
                <Image
                  source={{ uri: paso.imagen_url }}
                  style={styles.pasoImagen}
                  resizeMode="contain"
                />
              )}
            </View>
          ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  content: { padding: 20, paddingBottom: 40, alignItems: "center" },
  loading: { fontSize: 14, color: "#999", textAlign: "center", marginTop: 40 },
  bancoIcon: { fontSize: 48, marginTop: 10, marginBottom: 12 },
  titulo: { fontSize: 22, fontWeight: "700", color: "#111", marginBottom: 4 },
  subtitulo: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  portada: { width: "100%", height: 180, borderRadius: 12, marginBottom: 20 },
  pasoCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
  },
  pasoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  pasoNumero: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  pasoNumeroText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pasoTitulo: { fontSize: 15, fontWeight: "600", color: "#111", flex: 1 },
  pasoDescripcion: { fontSize: 14, color: "#555", lineHeight: 22 },
  pasoImagen: { width: "100%", height: 200, borderRadius: 10, marginTop: 12 },
  empty: { fontSize: 14, color: "#999", textAlign: "center", marginTop: 20 },
});
