// Texto de un documento legal: títulos (## ), viñetas (- ) y párrafos.
//
// El panel publica el texto plano con esas dos marcas; aquí se dibuja
// con la tipografía de la app, sin depender de una librería de
// Markdown para algo tan simple.
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/tokens";
import { fechaLegal } from "../lib/legal";

function bloques(contenido) {
  const lineas = String(contenido || "").replace(/\r\n/g, "\n").split("\n");
  const salida = [];
  let parrafo = [];
  const cerrar = () => {
    if (parrafo.length) salida.push({ tipo: "p", texto: parrafo.join(" ") });
    parrafo = [];
  };
  for (const cruda of lineas) {
    const l = cruda.trim();
    if (!l) cerrar();
    else if (l.startsWith("## ")) {
      cerrar();
      salida.push({ tipo: "h", texto: l.slice(3) });
    } else if (l.startsWith("- ")) {
      cerrar();
      salida.push({ tipo: "li", texto: l.slice(2) });
    } else parrafo.push(l);
  }
  cerrar();
  return salida;
}

/** Aviso de versión preliminar, mientras el abogado no la apruebe. */
export function AvisoBorrador() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: colors.goldCream,
      }}
    >
      <Ionicons name="construct-outline" size={15} color={colors.goldText} />
      <Text style={{ flex: 1, fontFamily: fonts.label, fontSize: 12, color: colors.goldText }}>
        Versión preliminar, en revisión legal.
      </Text>
    </View>
  );
}

export function TextoLegal({ documento }) {
  if (!documento) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: fonts.label, fontSize: 12, color: colors.text3 }}>
        Versión {documento.version} · {fechaLegal(documento.publicado_en)}
      </Text>
      {documento.borrador ? <AvisoBorrador /> : null}
      {bloques(documento.contenido).map((b, i) =>
        b.tipo === "h" ? (
          <Text
            key={i}
            accessibilityRole="header"
            style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text, paddingTop: 6 }}
          >
            {b.texto}
          </Text>
        ) : b.tipo === "li" ? (
          <View key={i} style={{ flexDirection: "row", gap: 10, paddingLeft: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 8 }} />
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text2 }}>
              {b.texto}
            </Text>
          </View>
        ) : (
          <Text key={i} style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text2 }}>
            {b.texto}
          </Text>
        ),
      )}
    </View>
  );
}

export default TextoLegal;
