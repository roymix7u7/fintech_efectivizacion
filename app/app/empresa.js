import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Linking, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Aparece } from "../src/components/Cargando";
import { Logo } from "../src/components/brand/Logo";
import { BankIcon } from "../src/components/brand/BankIcon";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { BankBadge } from "../src/components/ui/BankBadge";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { AvisoMarcas } from "../src/components/AvisoMarcas";
import { BotonIcono, MiniTarjeta, Tarjeta } from "../src/components/ui/Piezas";
import { CURVA, useReducirMovimiento } from "../src/lib/movimiento";
import { colors, fonts } from "../src/theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WHATSAPP = "51995766986";
const CORREO = "contacto@altoqueperu.com";

const LUCES = [
  { color: colors.glowGold, opacity: 0.4, size: 300, top: 20, left: 20 },
  { color: colors.glowBlue, opacity: 0.75, size: 320, bottom: -170, right: -110 },
];

/**
 * El camino del dinero, contado desde lo que vive el cliente: de su
 * línea de crédito a su cuenta de ahorros. Lenguaje neutro y exacto
 * (docs/guia-lenguaje.md): se dice qué pasa, sin palabras de más.
 */
const ETAPAS = [
  { clave: "linea", titulo: "Tu línea de crédito", texto: "El saldo disponible de tu tarjeta de crédito." },
  { clave: "banco", titulo: "Operas desde la app de tu banco", texto: "Sigues nuestra guía paso a paso. El monto se carga a tu tarjeta." },
  { clave: "revision", titulo: "Revisamos tu operación", texto: "Una persona confirma tu comprobante y que la tarjeta es tuya." },
  { clave: "comision", titulo: "Descontamos la comisión", texto: "Un porcentaje que depende del banco de tu tarjeta." },
  { clave: "deposito", titulo: "Te depositamos en tu cuenta", texto: "En tu cuenta de ahorros, a tu nombre." },
];

// Locales y horario: los mismos de los términos (versión 1.0).
const LOCALES = [
  { distrito: "Lince", direccion: "Jr. Manuel Candamo 278, 2.° piso, Lince, Lima", referencia: "A media cuadra del Edificio El Almirante" },
  { distrito: "San Juan de Miraflores", direccion: "Calle Algarrobos 103, San Juan de Miraflores, Lima", referencia: "Frente a la Estación Atocongo" },
  { distrito: "Los Olivos", direccion: "Santa Cruz de Pachacútec 214, Los Olivos, Lima", referencia: "Frente a Mega Plaza" },
];

const PLAZOS = [
  "Normalmente te depositamos en 1 hora.",
  "En días de alta demanda, de 2 a 3 horas.",
  "Si fallan los sistemas bancarios, hasta el siguiente día hábil.",
  "Fuera de horario, en el transcurso de la mañana del siguiente día de atención.",
];

const GARANTIAS = [
  { clave: "cifrado", texto: "Documentos\ncifrados" },
  { clave: "nombre", texto: "Depósito\na tu nombre" },
  { clave: "clara", texto: "Comisión\nclara" },
];

function IconoEtapa({ clave }) {
  if (clave === "linea") return <MiniTarjeta ancho={26} alto={18} />;
  if (clave === "banco") return <Ionicons name="phone-portrait-outline" size={22} color={colors.navy} />;
  if (clave === "revision") return <Logo width={30} letterColor={colors.night} />;
  if (clave === "comision") return <Ionicons name="pricetag-outline" size={21} color={colors.goldText} />;
  return <BankIcon size={22} color={colors.success} />;
}

function IconoGarantia({ clave }) {
  if (clave === "nombre") return <BankIcon size={20} color={colors.goldText} />;
  return <Ionicons name={clave === "cifrado" ? "lock-closed-outline" : "eye-outline"} size={20} color={colors.goldText} />;
}

/** La moneda "S/" que baja por la línea punteada, una y otra vez. */
function Moneda({ recorrido }) {
  const reducir = useReducirMovimiento();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducir || !recorrido) return;
    const ciclo = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 5000, easing: Easing.bezier(0.45, 0, 0.55, 1), useNativeDriver: true }),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [reducir, recorrido]);

  if (reducir || !recorrido) return null;

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.moneda,
        {
          opacity: t.interpolate({ inputRange: [0, 0.08, 0.88, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, recorrido] }) }],
        },
      ]}
    >
      <Text style={s.monedaTexto}>S/</Text>
    </Animated.View>
  );
}

/** Barra de referencia: el monto entero, y cómo se reparte. */
function Reparto() {
  const reducir = useReducirMovimiento();
  const ancho = useRef(new Animated.Value(reducir ? 1 : 0)).current;

  useEffect(() => {
    if (reducir) return;
    Animated.timing(ancho, { toValue: 1, duration: 700, delay: 150, easing: CURVA, useNativeDriver: false }).start();
  }, [reducir]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={s.repartoEtiqueta}>Monto de tu operación</Text>
        <View style={[s.barra, { backgroundColor: colors.navy }]} />
      </View>
      <View style={{ gap: 6 }}>
        <View style={[s.barra, { flexDirection: "row", overflow: "hidden" }]}>
          <View style={{ width: "86%" }}>
            <Animated.View
              style={{
                height: 18,
                backgroundColor: colors.success,
                width: ancho.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              }}
            />
          </View>
          <View style={{ width: "14%", backgroundColor: colors.gold }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[s.repartoParte, { color: colors.successText }]}>Tu depósito</Text>
          <Text style={[s.repartoParte, { color: colors.goldText }]}>Comisión</Text>
        </View>
      </View>
    </View>
  );
}

export default function EmpresaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [alto, setAlto] = useState(0);
  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inicio"));

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <Aparece>
            <View style={s.marca}>
              <Logo width={170} />
              <Text style={s.lema} accessibilityRole="header">
                Tu aliado <Text style={{ color: "#F4DC8A" }}>financiero.</Text>
              </Text>
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <Aparece retraso={100}>
            <GlassPanel variant="light" radius={24} style={s.garantias}>
              {GARANTIAS.map((g) => (
                <View key={g.clave} style={s.garantia} accessible accessibilityLabel={g.texto.replace("\n", " ")}>
                  <View style={s.garantiaIcono}>
                    <IconoGarantia clave={g.clave} />
                  </View>
                  <Text style={s.garantiaTexto}>{g.texto}</Text>
                </View>
              ))}
            </GlassPanel>
          </Aparece>

          <Aparece retraso={160}>
            <Text style={s.seccion}>Cómo funciona</Text>
            <Tarjeta style={s.etapas}>
              <View
                style={s.etapasLista}
                onLayout={(e) => setAlto(e.nativeEvent.layout.height)}
              >
                {/* Línea punteada dorada que une las etapas */}
                <View style={[s.riel, { height: Math.max(0, alto - 70) }]} />
                <Moneda recorrido={Math.max(0, alto - 76)} />
                {ETAPAS.map((e, i) => (
                  <View key={e.clave} style={[s.etapa, i === ETAPAS.length - 1 && { paddingBottom: 4 }]}>
                    <View style={s.etapaIcono}>
                      <IconoEtapa clave={e.clave} />
                    </View>
                    <View style={{ flex: 1, gap: 3, paddingTop: 2 }}>
                      <Text style={s.etapaTitulo}>{e.titulo}</Text>
                      <Text style={s.etapaTexto}>{e.texto}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Tarjeta>
            <View style={s.unaVez}>
              <Ionicons name="person-outline" size={18} color={colors.navyLight} />
              <Text style={s.unaVezTexto}>
                Antes de tu primera operación verificamos tu identidad y tu tarjeta. Se hace una sola vez.
              </Text>
            </View>
          </Aparece>

          <Aparece retraso={220}>
            <Text style={s.seccion}>Cuánto cuesta</Text>
            <Tarjeta style={s.costo}>
              <Reparto />
              <Text style={s.costoNota}>Gráfico de referencia: la comisión real depende del banco de tu tarjeta.</Text>
              <Toque
                onPress={() => router.push("/(tabs)/perfil")}
                accessibilityLabel="Ver mi comisión"
                hitSlop={8}
                style={s.verComision}
              >
                <Text style={s.verComisionTexto}>Ver mi comisión</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.goldText} />
              </Toque>
            </Tarjeta>
          </Aparece>

          <Aparece retraso={260}>
            <Text style={s.seccion}>Dónde te depositamos</Text>
            <Tarjeta style={s.destinos}>
              <View style={[s.destino, s.destinoSeparado]}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {["BCP", "BBVA", "Interbank", "Scotiabank", "BanBif"].map((b) => (
                    <BankBadge key={b} bank={b} size={26} />
                  ))}
                </View>
                <View style={s.destinoFila}>
                  <Ionicons name="arrow-forward" size={16} color={colors.gold} />
                  <BankIcon size={18} color={colors.navy} />
                  <Text style={s.destinoTexto}>Cuenta de ahorros del mismo banco</Text>
                </View>
              </View>
              <View style={s.destino}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <BankBadge bank="CMR" size={26} />
                  <BankBadge bank="iO" size={26} />
                  <View style={s.otras}>
                    <Text style={s.otrasTexto}>Otras</Text>
                  </View>
                </View>
                <View style={s.destinoFila}>
                  <Ionicons name="arrow-forward" size={16} color={colors.gold} />
                  <BankIcon size={18} color={colors.navy} />
                  <Text style={s.destinoTexto}>Cuenta de ahorros de cualquier banco</Text>
                </View>
              </View>
            </Tarjeta>
            <Text style={s.nota}>Siempre a una cuenta a tu nombre.</Text>
          </Aparece>

          <Aparece retraso={300}>
            <Text style={s.seccion}>¿Tienes dudas?</Text>
            <View style={s.contacto}>
              <Boton
                titulo="WhatsApp"
                iconoIzq="logo-whatsapp"
                onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)}
                style={s.contactoBoton}
              />
              <Boton
                variante="contorno"
                titulo="Correo"
                iconoIzq="mail-outline"
                onPress={() => Linking.openURL(`mailto:${CORREO}`)}
                style={s.contactoBoton}
              />
            </View>
          </Aparece>
          <Aparece retraso={200}>
            <Text style={s.seccion}>Horario y locales</Text>
            <Tarjeta style={s.horario}>
              <View style={s.horarioFila}>
                <View style={s.horarioIcono}>
                  <Ionicons name="time-outline" size={19} color={colors.navy} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.horarioTitulo}>Lunes a sábado, de 9:00 a. m. a 6:00 p. m.</Text>
                  <Text style={s.horarioTexto}>Refrigerio de 1:00 p. m. a 2:00 p. m. En la app y en los locales.</Text>
                </View>
              </View>
              <View style={s.plazos}>
                {PLAZOS.map((t) => (
                  <View key={t} style={s.plazo}>
                    <View style={s.plazoPunto} />
                    <Text style={s.horarioTexto}>{t}</Text>
                  </View>
                ))}
                <Text style={s.horarioNota}>Cualquier demora te la avisamos en Alertas.</Text>
              </View>
              {LOCALES.map((l) => (
                <Toque
                  key={l.distrito}
                  onPress={() =>
                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.direccion)}`)
                  }
                  accessibilityLabel={`Local ${l.distrito}: ${l.direccion}. Abrir en el mapa`}
                  escala={0.99}
                  style={s.local}
                >
                  <Ionicons name="location-outline" size={19} color={colors.goldText} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.horarioTitulo}>{l.distrito}</Text>
                    <Text style={s.horarioTexto}>{l.direccion}</Text>
                    <Text style={s.horarioNota}>{l.referencia}</Text>
                  </View>
                  <Ionicons name="navigate-outline" size={16} color={colors.textFaint} />
                </Toque>
              ))}
            </Tarjeta>
          </Aparece>

          {/* Indecopi: el Libro de Reclamaciones tiene que estar a la vista. */}
          <Toque
            onPress={() => router.push("/reclamaciones")}
            accessibilityLabel="Libro de Reclamaciones"
            style={s.libro}
          >
            <Ionicons name="book-outline" size={20} color={colors.navy} />
            <Text style={s.libroTexto}>Libro de Reclamaciones</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Toque>
          <AvisoMarcas conEmpresa />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  horario: { borderRadius: 22, padding: 16, gap: 14 },
  horarioFila: { flexDirection: "row", gap: 12, alignItems: "center" },
  horarioIcono: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.infoBg, alignItems: "center", justifyContent: "center" },
  horarioTitulo: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  horarioTexto: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text2 },
  horarioNota: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  plazos: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.ground },
  plazo: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  plazoPunto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 7 },
  local: { flexDirection: "row", gap: 12, alignItems: "center", paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  libro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 6,
  },
  libroTexto: { flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 84, gap: 12 },
  marca: { alignItems: "center", gap: 16, paddingTop: 10 },
  lema: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.white },

  cuerpo: { marginTop: -54, paddingHorizontal: 16, gap: 10 },
  garantias: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 8, gap: 4 },
  garantia: { flex: 1, alignItems: "center", gap: 8 },
  garantiaIcono: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  garantiaTexto: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 15, color: colors.text, textAlign: "center" },

  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 10 },
  etapas: { borderRadius: 22, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 8 },
  etapasLista: { position: "relative" },
  riel: {
    position: "absolute",
    left: 20,
    top: 22,
    width: 0,
    borderLeftWidth: 3,
    borderStyle: "dashed",
    borderColor: colors.gold,
  },
  moneda: {
    position: "absolute",
    left: 8,
    top: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  monedaTexto: { fontFamily: fonts.heavy, fontSize: 8, color: colors.night },
  etapa: { flexDirection: "row", gap: 14, paddingBottom: 18 },
  etapaIcono: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  etapaTitulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  etapaTexto: { fontFamily: fonts.label, fontSize: 13, lineHeight: 18, color: colors.text2 },
  unaVez: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.infoBg,
  },
  unaVezTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 13, lineHeight: 18, color: colors.text },

  costo: { borderRadius: 22, padding: 18, paddingHorizontal: 16, gap: 12 },
  barra: { height: 18, borderRadius: 6 },
  repartoEtiqueta: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2 },
  repartoParte: { fontFamily: fonts.heavy, fontSize: 13 },
  costoNota: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  verComision: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", minHeight: 32 },
  verComisionTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.goldText },

  destinos: { borderRadius: 22, paddingVertical: 6, paddingHorizontal: 16 },
  destino: { gap: 8, paddingVertical: 12 },
  destinoSeparado: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  destinoFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  destinoTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 14, color: colors.text },
  otras: { height: 26, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.muted, justifyContent: "center" },
  otrasTexto: { fontFamily: fonts.heavy, fontSize: 11, color: colors.text2 },
  nota: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 8 },

  contacto: { flexDirection: "row", gap: 8 },
  contactoBoton: { flex: 1, height: 56 },
});
