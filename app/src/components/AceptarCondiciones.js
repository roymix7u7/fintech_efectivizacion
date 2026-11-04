// Pide aceptar los documentos legales que el cliente todavía no aceptó:
// una versión nueva publicada desde el panel, o lo del registro si no
// llegó a guardarse. Sin aceptarlos no se sigue usando la app; la otra
// salida es cerrar sesión.
//
// Cada documento lleva su propia casilla (la autorización de fotos va
// aparte de los términos) y se puede leer aquí mismo, sin salir.
import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme/tokens";
import { aceptar, leerDocumento, pendientes, TIPOS_LEGALES } from "../lib/legal";
import { cerrarSesion } from "../lib/sesion";
import { mensajeError } from "../lib/ui";
import { useAviso } from "./Avisos";
import { TextoLegal } from "./TextoLegal";
import { Casilla, Enlace } from "./ui/Casilla";
import { Boton } from "./ui/Boton";
import { Toque } from "./ui/Toque";

export default function AceptarCondiciones() {
  const [lista, setLista] = useState([]);
  const [marcados, setMarcados] = useState({});
  const [leyendo, setLeyendo] = useState(null); // documento completo
  const [cargandoDoc, setCargandoDoc] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mostrar } = useAviso();

  const revisar = useCallback(async () => {
    try {
      setLista(await pendientes());
    } catch {
      // Sin conexión no se bloquea: se vuelve a mirar al volver al frente.
    }
  }, []);

  useEffect(() => {
    revisar();
    const sub = AppState.addEventListener("change", (e) => e === "active" && revisar());
    return () => sub.remove();
  }, [revisar]);

  async function leer(doc) {
    setCargandoDoc(true);
    try {
      setLeyendo(await leerDocumento({ id: doc.id }));
    } catch (e) {
      mostrar(mensajeError(e), "error");
    } finally {
      setCargandoDoc(false);
    }
  }

  async function confirmar() {
    setGuardando(true);
    try {
      await aceptar(lista.map((d) => d.id));
      setLista([]);
      setMarcados({});
      mostrar("Gracias. Ya puedes seguir.", "exito");
    } catch (e) {
      mostrar(mensajeError(e), "error");
    } finally {
      setGuardando(false);
    }
  }

  async function salir() {
    await cerrarSesion();
    router.replace("/?quedarse=1");
  }

  if (!lista.length) return null;

  const actualizacion = lista.some((d) => d.actualizacion);
  const todos = lista.every((d) => marcados[d.id]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLeyendo(null)}>
      <View style={s.velo}>
        <View style={[s.hoja, { paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal>
          {leyendo ? (
            <>
              <View style={s.lectorCabeza}>
                <Toque onPress={() => setLeyendo(null)} accessibilityLabel="Volver" hitSlop={8} style={s.volver}>
                  <Ionicons name="chevron-back" size={18} color={colors.text} />
                  <Text style={s.volverTexto}>Volver</Text>
                </Toque>
              </View>
              <Text style={s.titulo} accessibilityRole="header">
                {leyendo.titulo}
              </Text>
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                <TextoLegal documento={leyendo} />
              </ScrollView>
            </>
          ) : (
            <>
              <View style={s.icono}>
                <Ionicons name="shield-checkmark-outline" size={26} color={colors.goldText} />
              </View>
              <Text style={s.titulo} accessibilityRole="header">
                {actualizacion ? "Actualizamos nuestras condiciones" : "Antes de continuar"}
              </Text>
              <Text style={s.texto}>
                {actualizacion
                  ? "Para seguir usando AlToque, revisa y acepta los cambios."
                  : "Para usar AlToque necesitamos que revises y aceptes:"}
              </Text>

              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
                {lista.map((d) => (
                  <Casilla
                    key={d.id}
                    marcada={Boolean(marcados[d.id])}
                    onCambio={(v) => setMarcados((m) => ({ ...m, [d.id]: v }))}
                    accessibilityLabel={`Acepto: ${d.titulo}`}
                  >
                    {d.tipo === "biometria" ? "Autorizo: " : "Acepto: "}
                    <Text style={{ fontFamily: fonts.heavy }}>{d.titulo || TIPOS_LEGALES[d.tipo]?.corto}</Text>
                    {` (versión ${d.version}). `}
                    <Enlace onPress={() => leer(d)}>{cargandoDoc ? "Abriendo..." : "Leer"}</Enlace>
                  </Casilla>
                ))}
              </ScrollView>

              <Boton
                titulo={guardando ? "Guardando..." : "Aceptar y continuar"}
                onPress={confirmar}
                cargando={guardando}
                deshabilitado={!todos}
                motivo={!todos ? "Marca cada casilla para continuar" : undefined}
                style={{ height: 54 }}
              />
              <Toque onPress={salir} accessibilityLabel="Cerrar sesión" style={s.salir}>
                <Text style={s.salirTexto}>Ahora no, cerrar sesión</Text>
              </Toque>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  velo: { flex: 1, backgroundColor: "rgba(15,27,51,0.6)", justifyContent: "flex-end" },
  hoja: {
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 22,
    gap: 14,
  },
  icono: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontFamily: fonts.display, fontSize: 23, lineHeight: 27, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text2 },
  lectorCabeza: { flexDirection: "row" },
  volver: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  volverTexto: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  salir: { alignSelf: "center", minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  salirTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.text3 },
});
