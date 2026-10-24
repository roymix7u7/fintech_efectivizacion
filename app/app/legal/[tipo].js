import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { leerDocumento, TIPOS_LEGALES } from "../../src/lib/legal";
import { mensajeError } from "../../src/lib/ui";
import { Esqueleto, Aparece } from "../../src/components/Cargando";
import { TextoLegal } from "../../src/components/TextoLegal";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { BotonIcono, Tarjeta } from "../../src/components/ui/Piezas";
import { Boton } from "../../src/components/ui/Boton";
import { colors, fonts } from "../../src/theme/tokens";

const LUCES = [
  { color: colors.glowGold, opacity: 0.32, size: 240, top: -60, right: -100 },
  { color: colors.glowBlue, opacity: 0.7, size: 280, bottom: -160, left: -110 },
];

/**
 * Un documento legal: Términos, Privacidad o la autorización para las
 * fotos de identidad. Se abre también sin sesión, desde el registro.
 *
 *   /legal/terminos              la versión vigente
 *   /legal/privacidad?id=<uuid>  una versión exacta (la que se aceptó)
 */
export default function LegalScreen() {
  const { tipo, id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [documento, setDocumento] = useState(null);
  const [error, setError] = useState(null);

  async function cargar() {
    setError(null);
    try {
      setDocumento(await leerDocumento({ tipo: String(tipo), id: id ? String(id) : null }));
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  useEffect(() => {
    cargar();
  }, [tipo, id]);

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const nombre = TIPOS_LEGALES[tipo]?.corto || "Documento";

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <View style={{ gap: 8 }}>
            <View style={s.icono}>
              <Ionicons name={TIPOS_LEGALES[tipo]?.icono || "document-text-outline"} size={22} color={colors.gold} />
            </View>
            <Text style={s.titulo} accessibilityRole="header">
              {documento?.titulo || nombre}
            </Text>
            {documento?.resumen ? <Text style={s.resumen}>{documento.resumen}</Text> : null}
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {error ? (
            <Tarjeta style={s.tarjeta}>
              <Text style={s.error}>{error}</Text>
              <Boton titulo="Reintentar" onPress={cargar} style={{ height: 50 }} />
            </Tarjeta>
          ) : !documento ? (
            <Tarjeta style={s.tarjeta}>
              <Esqueleto alto={14} ancho="40%" />
              <Esqueleto alto={18} ancho="70%" />
              <Esqueleto alto={80} />
              <Esqueleto alto={80} />
            </Tarjeta>
          ) : (
            <Aparece>
              <Tarjeta style={s.tarjeta}>
                <TextoLegal documento={documento} />
              </Tarjeta>
            </Aparece>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 28, gap: 18 },
  icono: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.white },
  resumen: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.75)" },
  cuerpo: { paddingHorizontal: 16, paddingTop: 14 },
  tarjeta: { borderRadius: 24, padding: 18, gap: 12 },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.text2, textAlign: "center" },
});
