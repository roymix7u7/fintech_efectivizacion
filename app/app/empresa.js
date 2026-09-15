import { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../src/theme/colors";
import TIPO from "../src/theme/tipografia";
import { Aparece } from "../src/components/Cargando";

const WHATSAPP = "51995766986";
const CORREO = "contacto@altoqueperu.com";

/**
 * Los cuatro pasos del circuito, explicados desde lo que hace el
 * cliente y no desde lo que hace el sistema.
 */
const PASOS = [
  {
    icono: "person-add-outline",
    titulo: "Crea tu cuenta",
    detalle:
      "Necesitamos tu DNI por ambas caras y una selfie sosteniéndolo. Es lo que exige la ley para operar con dinero, y lo revisa una persona.",
    espera: "Revisión en pocas horas",
  },
  {
    icono: "card-outline",
    titulo: "Registra tu tarjeta",
    detalle:
      "Sube una foto donde se vea tu nombre y los últimos 4 dígitos, con el número completo cubierto. Verificamos que la tarjeta sea tuya.",
    espera: "Verificación en pocas horas",
  },
  {
    icono: "swap-horizontal-outline",
    titulo: "Haz la operación en tu banco",
    detalle:
      "Desde la app de tu banco, siguiendo la guía que te mostramos para esa entidad. Cada banco tiene su camino y te lo indicamos paso a paso.",
    espera: "Lo haces tú, cuando quieras",
  },
  {
    icono: "cloud-upload-outline",
    titulo: "Envíanos el comprobante",
    detalle:
      "Una foto clara del voucher. Lo revisamos y depositamos en la cuenta bancaria que tengas registrada.",
    espera: "Te avisamos al resolverlo",
  },
];

const GARANTIAS = [
  {
    icono: "lock-closed-outline",
    titulo: "Tus documentos están cifrados",
    detalle: "Solo el personal autorizado puede verlos, y queda registro.",
  },
  {
    icono: "eye-outline",
    titulo: "Una persona revisa cada caso",
    detalle: "Nada se aprueba de forma automática.",
  },
  {
    icono: "receipt-outline",
    titulo: "Sabes siempre en qué va",
    detalle: "Cada solicitud muestra su estado, y el motivo si se rechaza.",
  },
];

export default function EmpresaScreen() {
  const linea = useRef(new Animated.Value(0)).current;

  // La línea que une los pasos se dibuja sola al entrar. Refuerza que
  // es una secuencia y no cuatro cosas sueltas.
  useEffect(() => {
    Animated.timing(linea, {
      toValue: 1,
      duration: 900,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [linea]);

  const router = useRouter();

  return (
    <ScrollView
      style={s.pantalla}
      contentContainerStyle={s.contenido}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Portada ── */}
      <Aparece>
        <View style={s.portada}>
          <View style={s.haloPortada} />
          <View style={s.logoPlaca}>
            <Image
              source={require("../assets/LOGOATK.png")}
              style={s.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={s.marca}>ALTOQUE PERÚ WK</Text>
          <Text style={s.lema}>
            Convertimos la línea de tu tarjeta de crédito en efectivo, en tu
            propia cuenta bancaria.
          </Text>
        </View>
      </Aparece>

      {/* ── Cómo funciona ── */}
      <Aparece retraso={120}>
        <Text style={s.tituloSeccion}>Cómo funciona</Text>
        <Text style={s.subSeccion}>
          Cuatro pasos. Los dos primeros se hacen una sola vez.
        </Text>
      </Aparece>

      <View style={s.pasos}>
        {/* Riel que conecta los pasos */}
        <View style={s.rielFondo} />
        <Animated.View
          style={[
            s.riel,
            {
              height: linea.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />

        {PASOS.map((p, i) => (
          <Aparece key={p.titulo} retraso={200 + i * 110}>
            <View style={s.paso}>
              <View style={s.pasoIzquierda}>
                <View style={s.pasoCirculo}>
                  <Text style={s.pasoNumero}>{i + 1}</Text>
                </View>
              </View>

              <View style={s.pasoCuerpo}>
                <View style={s.pasoEncabezado}>
                  <Ionicons name={p.icono} size={18} color={COLORS.primary} />
                  <Text style={s.pasoTitulo}>{p.titulo}</Text>
                </View>
                <Text style={s.pasoDetalle}>{p.detalle}</Text>
                <View style={s.pasoEspera}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={COLORS.secondaryDark}
                  />
                  <Text style={s.pasoEsperaTexto}>{p.espera}</Text>
                </View>
              </View>
            </View>
          </Aparece>
        ))}
      </View>

      {/* ── La comisión ── */}
      <Aparece retraso={660}>
        <View style={s.comision}>
          <View style={s.comisionEncabezado}>
            <Ionicons name="pricetag-outline" size={19} color={COLORS.secondary} />
            <Text style={s.comisionTitulo}>Sobre la comisión</Text>
          </View>

          <Text style={s.comisionTexto}>
            Cobramos un porcentaje sobre el monto de cada operación. Se descuenta
            del depósito, así que no tienes que pagar nada por adelantado ni por
            separado.
          </Text>

          <View style={s.formula}>
            <View style={s.formulaCaja}>
              <Text style={s.formulaEtiqueta}>Operación</Text>
              <Text style={s.formulaValor}>100%</Text>
            </View>
            <Ionicons name="remove-outline" size={18} color={COLORS.textLight} />
            <View style={s.formulaCaja}>
              <Text style={s.formulaEtiqueta}>Comisión</Text>
              <Text style={[s.formulaValor, { color: COLORS.secondaryDark }]}>
                tu %
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={COLORS.textLight} />
            <View style={[s.formulaCaja, s.formulaCajaFinal]}>
              <Text style={[s.formulaEtiqueta, { color: COLORS.white }]}>
                Recibes
              </Text>
              <Text style={[s.formulaValor, { color: COLORS.white }]}>
                el resto
              </Text>
            </View>
          </View>

          <Text style={s.comisionNota}>
            El porcentaje depende del banco de tu tarjeta, y puede tener
            condiciones especiales según tu caso. El tuyo está siempre a la
            vista en tu perfil, antes de que operes.
          </Text>

          <TouchableOpacity
            style={s.comisionBoton}
            onPress={() => router.dismissTo("/(tabs)/perfil")}
            activeOpacity={0.8}
          >
            <Text style={s.comisionBotonTexto}>Ver mi comisión</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primaryDark} />
          </TouchableOpacity>
        </View>
      </Aparece>

      {/* ── Garantías ── */}
      <Aparece retraso={760}>
        <Text style={s.tituloSeccion}>Cómo cuidamos tus datos</Text>
      </Aparece>

      {GARANTIAS.map((g, i) => (
        <Aparece key={g.titulo} retraso={820 + i * 90}>
          <View style={s.garantia}>
            <View style={s.garantiaIcono}>
              <Ionicons name={g.icono} size={19} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.garantiaTitulo}>{g.titulo}</Text>
              <Text style={s.garantiaDetalle}>{g.detalle}</Text>
            </View>
          </View>
        </Aparece>
      ))}

      {/* ── Contacto ── */}
      <Aparece retraso={1120}>
        <View style={s.contacto}>
          <Text style={s.contactoTitulo}>¿Tienes dudas?</Text>
          <Text style={s.contactoTexto}>
            Escríbenos y te respondemos en horario de oficina.
          </Text>

          <TouchableOpacity
            style={[s.contactoBoton, s.contactoWhatsapp]}
            onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={20} color={COLORS.white} />
            <Text style={s.contactoBotonTexto}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.contactoBoton}
            onPress={() => Linking.openURL(`mailto:${CORREO}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
            <Text style={[s.contactoBotonTexto, { color: COLORS.primary }]}>
              {CORREO}
            </Text>
          </TouchableOpacity>
        </View>
      </Aparece>

      <Text style={s.version}>AlToque Perú WK · Versión 1.0.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  contenido: { padding: 20, paddingBottom: 48 },

  // Portada
  portada: {
    backgroundColor: COLORS.primary,
    borderRadius: 22,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 30,
  },
  haloPortada: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -140,
    right: -110,
    backgroundColor: COLORS.secondary,
    opacity: 0.1,
  },
  logoPlaca: {
    width: 82,
    height: 82,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 52, height: 52 },
  marca: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.secondary,
    letterSpacing: 2.4,
    marginTop: 18,
  },
  lema: {
    ...TIPO.cuerpo,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 21,
  },

  tituloSeccion: { ...TIPO.seccion, marginBottom: 4 },
  subSeccion: { ...TIPO.apoyo, marginBottom: 18 },

  // Pasos
  pasos: { position: "relative", marginBottom: 30 },
  rielFondo: {
    position: "absolute",
    left: 17,
    top: 18,
    bottom: 30,
    width: 2,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
  },
  riel: {
    position: "absolute",
    left: 17,
    top: 18,
    width: 2,
    backgroundColor: COLORS.secondary,
    borderRadius: 2,
    opacity: 0.5,
  },
  paso: { flexDirection: "row", gap: 14, marginBottom: 18 },
  pasoIzquierda: { width: 36, alignItems: "center" },
  pasoCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pasoNumero: { color: COLORS.secondary, fontSize: 15, fontWeight: "800" },
  pasoCuerpo: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pasoEncabezado: { flexDirection: "row", alignItems: "center", gap: 8 },
  pasoTitulo: { ...TIPO.tarjeta, flex: 1 },
  pasoDetalle: { ...TIPO.apoyo, marginTop: 7 },
  pasoEspera: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pasoEsperaTexto: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondaryDark,
  },

  // Comisión
  comision: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 30,
  },
  comisionEncabezado: { flexDirection: "row", alignItems: "center", gap: 9 },
  comisionTitulo: { ...TIPO.seccion },
  comisionTexto: { ...TIPO.cuerpo, color: COLORS.textSecondary, marginTop: 10 },
  formula: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 18,
  },
  formulaCaja: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  formulaCajaFinal: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  formulaEtiqueta: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textLight,
  },
  formulaValor: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 4,
  },
  comisionNota: { ...TIPO.apoyo, marginTop: 16 },
  comisionBoton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  comisionBotonTexto: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "700",
  },

  // Garantías
  garantia: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  garantiaIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  garantiaTitulo: { ...TIPO.tarjeta, fontSize: 14 },
  garantiaDetalle: { ...TIPO.apoyo, marginTop: 3 },

  // Contacto
  contacto: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 20,
  },
  contactoTitulo: { ...TIPO.seccion },
  contactoTexto: { ...TIPO.apoyo, marginTop: 4, marginBottom: 16 },
  contactoBoton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  contactoWhatsapp: {
    backgroundColor: "#25D366",
    borderColor: "#25D366",
  },
  contactoBotonTexto: { fontSize: 15, fontWeight: "600", color: COLORS.white },

  version: {
    ...TIPO.micro,
    textAlign: "center",
    marginTop: 26,
  },
});
