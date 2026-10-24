import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Share, Linking, TextInput } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { textoMisDatos, miPedido, pedirEliminacion, cancelarEliminacion } from "../src/lib/misdatos";
import { invalidar } from "../src/lib/cache";
import { fechaLegal } from "../src/lib/legal";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { Aparece, Esqueleto } from "../src/components/Cargando";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { BotonIcono, Tarjeta } from "../src/components/ui/Piezas";
import { Boton } from "../src/components/ui/Boton";
import { Hoja } from "../src/components/ui/Hoja";
import { Casilla } from "../src/components/ui/Casilla";
import { colors, fonts } from "../src/theme/tokens";

const CORREO = "contacto@altoqueperu.com";

const LUCES = [
  { color: colors.glowGold, opacity: 0.32, size: 240, top: -60, right: -100 },
  { color: colors.glowBlue, opacity: 0.7, size: 280, bottom: -160, left: -110 },
];

const SE_BORRA = [
  "Las fotos de tu documento, tu selfie y tus tarjetas",
  "Tus datos personales: nombre, documento, celular y dirección",
  "Tu acceso: ya no podrás entrar con tu correo",
];
const SE_CONSERVA = [
  "El registro de tus operaciones y sus comprobantes, por el tiempo que exige la ley",
  "La constancia de los documentos que aceptaste",
];

/** Fila de lista con ícono. */
function Item({ icono, color, texto }) {
  return (
    <View style={s.item}>
      <Ionicons name={icono} size={17} color={color} style={{ marginTop: 1 }} />
      <Text style={s.itemTexto}>{texto}</Text>
    </View>
  );
}

/**
 * Mis datos: lo que la ley y las tiendas exigen que el cliente pueda
 * hacer con su información sin depender de nadie.
 */
export default function MisDatosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();
  const [pedido, setPedido] = useState(undefined); // undefined: cargando
  const [descargando, setDescargando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPedido(await miPedido());
    } catch (e) {
      setPedido(null);
      mostrar(mensajeError(e), "error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/perfil"));

  async function descargar() {
    setDescargando(true);
    try {
      const texto = await textoMisDatos();
      // La hoja del sistema: guardarlo, enviárselo por correo o WhatsApp.
      await Share.share({ title: "Mis datos · AlToque", message: texto });
    } catch (e) {
      mostrar(mensajeError(e), "error");
    } finally {
      setDescargando(false);
    }
  }

  function escribir(asunto) {
    Linking.openURL(`mailto:${CORREO}?subject=${encodeURIComponent(asunto)}`).catch(() =>
      mostrar(`Escríbenos a ${CORREO}`, "info"),
    );
  }

  async function pedir() {
    setEnviando(true);
    try {
      const r = await pedirEliminacion(motivo.trim());
      setConfirmar(false);
      setMotivo("");
      setEntiendo(false);
      invalidar("avisos");
      mostrar(
        r?.ok === false ? "Ya tenías un pedido abierto." : "Recibimos tu pedido. Te responderemos dentro del plazo.",
        "exito",
      );
      cargar();
    } catch (e) {
      mostrar(mensajeError(e), "error");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    try {
      const r = await cancelarEliminacion();
      mostrar(
        r?.ok ? "Cancelaste el pedido. Tu cuenta sigue activa." : "Ya lo estamos procesando: escríbenos para detenerlo.",
        r?.ok ? "exito" : "atencion",
      );
      cargar();
    } catch (e) {
      mostrar(mensajeError(e), "error");
    }
  }

  const abierto = pedido && ["pendiente", "en_proceso"].includes(pedido.estado);

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <View style={{ gap: 6 }}>
            <Text style={s.titulo} accessibilityRole="header">
              Mis datos
            </Text>
            <Text style={s.subtitulo}>Tu información es tuya: llévatela o pide que la borremos.</Text>
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {/* ── Descargar ── */}
          <Aparece>
            <Tarjeta style={s.bloque}>
              <View style={s.bloqueCabeza}>
                <View style={[s.icono, { backgroundColor: colors.infoBg }]}>
                  <Ionicons name="download-outline" size={20} color={colors.navy} />
                </View>
                <Text style={s.bloqueTitulo}>Descargar mis datos</Text>
              </View>
              <Text style={s.texto}>
                Una copia de todo lo que tenemos de ti: perfil, tarjetas, cuentas, solicitudes, comisiones, documentos
                que aceptaste y avisos. Puedes guardarla o enviártela por correo.
              </Text>
              <Boton
                titulo={descargando ? "Preparando..." : "Descargar"}
                iconoIzq="download-outline"
                onPress={descargar}
                cargando={descargando}
                style={{ height: 52 }}
              />
            </Tarjeta>
          </Aparece>

          {/* ── Otros derechos ── */}
          <Aparece retraso={60}>
            <Tarjeta style={s.bloque}>
              <View style={s.bloqueCabeza}>
                <View style={[s.icono, { backgroundColor: colors.goldCream }]}>
                  <Ionicons name="create-outline" size={20} color={colors.goldText} />
                </View>
                <Text style={s.bloqueTitulo}>Corregir o limitar tus datos</Text>
              </View>
              <Text style={s.texto}>
                Si algún dato está mal o no quieres que lo usemos para algo, escríbenos desde tu correo registrado.
              </Text>
              <Boton
                variante="contorno"
                titulo="Escribir a AlToque"
                iconoIzq="mail-outline"
                onPress={() => escribir("Mis datos personales")}
                style={{ height: 50 }}
              />
            </Tarjeta>
          </Aparece>

          {/* ── Eliminar ── */}
          <Aparece retraso={120}>
            <Tarjeta style={s.bloque}>
              <View style={s.bloqueCabeza}>
                <View style={[s.icono, { backgroundColor: colors.errorBg }]}>
                  <Ionicons name="trash-outline" size={20} color={colors.errorText} />
                </View>
                <Text style={s.bloqueTitulo}>Eliminar mi cuenta</Text>
              </View>

              {pedido === undefined ? (
                <Esqueleto alto={60} />
              ) : abierto ? (
                <View style={{ gap: 12 }}>
                  <View style={s.estado}>
                    <Ionicons name="time-outline" size={18} color={colors.navyLight} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.estadoTitulo}>
                        {pedido.estado === "en_proceso" ? "Estamos eliminando tu cuenta" : "Pedido recibido"}
                      </Text>
                      <Text style={s.estadoTexto}>
                        Lo pediste el {fechaLegal(pedido.creada_en)}. Te responderemos a más tardar el{" "}
                        {fechaLegal(pedido.vence_en)}.
                      </Text>
                    </View>
                  </View>
                  {pedido.estado === "pendiente" ? (
                    <Boton variante="contorno" titulo="Cancelar el pedido" onPress={cancelar} style={{ height: 50 }} />
                  ) : (
                    <Text style={s.nota}>Si cambiaste de idea, escríbenos a {CORREO} cuanto antes.</Text>
                  )}
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {pedido?.estado === "rechazada" && pedido.respuesta ? (
                    <View style={[s.estado, { backgroundColor: colors.errorBg }]}>
                      <Ionicons name="information-circle-outline" size={18} color={colors.errorText} />
                      <Text style={[s.estadoTexto, { flex: 1, color: colors.text }]}>
                        Tu último pedido no se pudo completar: {pedido.respuesta}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={s.subtituloBloque}>Qué se borra</Text>
                  {SE_BORRA.map((t) => (
                    <Item key={t} icono="close-circle-outline" color={colors.errorText} texto={t} />
                  ))}
                  <Text style={s.subtituloBloque}>Qué se conserva</Text>
                  {SE_CONSERVA.map((t) => (
                    <Item key={t} icono="lock-closed-outline" color={colors.goldText} texto={t} />
                  ))}
                  <Text style={s.nota}>
                    Si tienes una solicitud en curso, primero la terminamos (y te pagamos), y luego eliminamos tu
                    cuenta.
                  </Text>
                  <Boton
                    variante="peligro"
                    titulo="Pedir eliminar mi cuenta"
                    iconoIzq="trash-outline"
                    onPress={() => setConfirmar(true)}
                    style={{ height: 52 }}
                  />
                </View>
              )}
            </Tarjeta>
          </Aparece>
        </View>
      </ScrollView>

      <Hoja visible={confirmar} onCerrar={() => setConfirmar(false)} titulo="¿Eliminar tu cuenta?" altoMax={0.85}>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={s.texto}>
            Revisaremos tu pedido y te responderemos en un plazo de 10 días hábiles. Una vez eliminada, no se puede
            recuperar.
          </Text>
          <View style={{ gap: 6 }}>
            <Text style={s.etiqueta}>¿Nos cuentas por qué? (opcional)</Text>
            {/* El borde va en la caja: cambiar el estilo del propio
                TextInput le quita el foco en Android. */}
            <View style={s.motivoCaja}>
              <TextInput
                value={motivo}
                onChangeText={(v) => setMotivo(v.slice(0, 500))}
                placeholder="Nos ayuda a mejorar"
                placeholderTextColor={colors.textFaint}
                multiline
                style={s.motivo}
                accessibilityLabel="Motivo, opcional"
              />
            </View>
          </View>
          <Casilla marcada={entiendo} onCambio={setEntiendo} accessibilityLabel="Entiendo que no se puede deshacer">
            Entiendo que mi cuenta y mis fotos se borrarán y que no se puede deshacer.
          </Casilla>
          <Boton
            variante="peligro"
            titulo={enviando ? "Enviando..." : "Pedir eliminación"}
            onPress={pedir}
            cargando={enviando}
            deshabilitado={!entiendo}
            motivo={!entiendo ? "Marca la casilla para continuar" : undefined}
            style={{ height: 54 }}
          />
        </ScrollView>
      </Hoja>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 28, gap: 18 },
  titulo: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.white },
  subtitulo: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.75)" },
  cuerpo: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  bloque: { borderRadius: 24, padding: 18, gap: 12 },
  bloqueCabeza: { flexDirection: "row", alignItems: "center", gap: 12 },
  icono: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bloqueTitulo: { flex: 1, fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text2 },
  subtituloBloque: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.1, color: colors.text3, textTransform: "uppercase" },
  item: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemTexto: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  nota: { fontFamily: fonts.label, fontSize: 12, lineHeight: 18, color: colors.text3 },
  estado: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.infoBg, alignItems: "flex-start" },
  estadoTitulo: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  estadoTexto: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text2 },
  etiqueta: { fontFamily: fonts.strong, fontSize: 13, color: colors.text },
  motivoCaja: { borderRadius: 14, borderWidth: 1.5, borderColor: colors.fieldBorder, backgroundColor: colors.ground },
  motivo: { minHeight: 80, maxHeight: 140, padding: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text, textAlignVertical: "top" },
});
