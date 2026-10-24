// "¿Por qué te pedimos la foto?" — la explicación detrás del botón de
// información en Agregar tarjeta.
//
// Pedir la foto de una tarjeta genera desconfianza, con razón. Aquí se
// explica para qué sirve y cómo se cuida, y solo se promete lo que el
// sistema hace de verdad:
//   - el archivo va a un bucket privado (tarjetas-fotos, no público),
//   - solo lo leen el propio cliente y el equipo (políticas de storage),
//   - el panel lo abre con un enlace firmado que caduca,
//   - nunca se pide número completo, código de seguridad ni claves.
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/tokens";
import { Hoja } from "./ui/Hoja";
import { Boton } from "./ui/Boton";

const PARA_QUE = [
  {
    icono: "person-circle-outline",
    titulo: "Confirmar que la tarjeta es tuya",
    texto: "Comparamos el nombre impreso con el de tu documento. Solo operamos con tarjetas a tu nombre.",
  },
  {
    icono: "shield-checkmark-outline",
    titulo: "Proteger tu cuenta del fraude",
    texto: "Así nadie puede registrar una tarjeta ajena con tus datos, ni usar la tuya en otra cuenta.",
  },
  {
    icono: "wallet-outline",
    titulo: "Que el dinero llegue solo a ti",
    texto: "Depositamos únicamente en tu cuenta. Verificar la tarjeta es lo que lo garantiza.",
  },
];

const CUIDADO = [
  { icono: "lock-closed-outline", texto: "Se guarda en un archivo privado y cifrado. No es pública ni aparece en ningún buscador." },
  { icono: "eye-outline", texto: "Solo la ve la persona de nuestro equipo que verifica tu tarjeta, con un enlace que caduca." },
  { icono: "cut-outline", texto: "Basta con tu nombre y los últimos 4 dígitos: tapa los demás números." },
];

function Fila({ icono, titulo, texto, tono = "navy" }) {
  const fondo = tono === "oro" ? colors.goldCream : colors.infoBg;
  const color = tono === "oro" ? colors.goldText : colors.navy;
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: titulo ? "flex-start" : "center" }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: fondo,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icono} size={19} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {titulo ? <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>{titulo}</Text> : null}
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 }}>{texto}</Text>
      </View>
    </View>
  );
}

const Seccion = ({ children }) => (
  <Text
    style={{
      fontFamily: fonts.heavy,
      fontSize: 12,
      letterSpacing: 1.2,
      color: colors.text3,
      textTransform: "uppercase",
    }}
  >
    {children}
  </Text>
);

export function PorQueFoto({ visible, onCerrar }) {
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo="¿Por qué te pedimos la foto?" altoMax={0.88}>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text, paddingHorizontal: 4 }}>
          Tu seguridad es lo primero. Una persona de nuestro equipo revisa cada tarjeta antes de que puedas operar con
          ella, y la foto es lo que le permite hacerlo.
        </Text>

        <View style={{ gap: 14 }}>
          <Seccion>Para qué la usamos</Seccion>
          {PARA_QUE.map((f) => (
            <Fila key={f.titulo} {...f} />
          ))}
        </View>

        <View style={{ gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.ground }}>
          <Seccion>Cómo la cuidamos</Seccion>
          {CUIDADO.map((f) => (
            <Fila key={f.texto} {...f} tono="oro" />
          ))}
        </View>

        {/* Lo que nunca se pide: es lo que protege contra quien se haga
            pasar por la empresa. */}
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            padding: 14,
            borderRadius: 18,
            backgroundColor: colors.errorBg,
            alignItems: "flex-start",
          }}
        >
          <Ionicons name="hand-left-outline" size={20} color={colors.errorText} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text }}>
            <Text style={{ fontFamily: fonts.heavy }}>Nunca te pediremos </Text>
            el número completo de tu tarjeta, el código de seguridad (CVV), tu clave ni tu PIN. Si envías el reverso,
            tapa el código. Si alguien te los pide en nombre de AlToque, no los compartas.
          </Text>
        </View>

        <Boton titulo="Entendido" onPress={onCerrar} style={{ height: 54 }} />
      </ScrollView>
    </Hoja>
  );
}

export default PorQueFoto;
