import { useState } from "react";
import { View, Text, StyleSheet, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/tokens";
import { useAviso } from "./Avisos";
import { Toque } from "./ui/Toque";
import { HojaFoto, capturarFoto } from "./ui/HojaFoto";

// La selfie va solo con la cámara: es la prueba de que la persona está
// ahí con su documento. Una foto de galería podría ser de cualquiera.
// El documento sí puede venir de la galería (muchos ya lo tienen
// fotografiado).
export const DOCUMENTOS = [
  { key: "dni_frontal", lado: "frente", aspecto: [4, 3] },
  { key: "dni_posterior", lado: "reverso", aspecto: [4, 3] },
  { key: "selfie", lado: "selfie", aspecto: [1, 1], soloCamara: true },
];

/** "DNI" o "Carnet", según el documento con que se registró. */
export const nombreCorto = (tipoDocumento) => (tipoDocumento === "ce" ? "Carnet" : "DNI");

function etiquetaDe(doc, tipoDocumento) {
  const corto = nombreCorto(tipoDocumento);
  if (doc.lado === "selfie") return `Selfie con tu ${corto}`;
  return `${corto} · ${doc.lado}`;
}

/** true solo si estan las tres fotos. */
export function documentosCompletos(fotos) {
  return DOCUMENTOS.every((d) => Boolean(fotos?.[d.key]));
}

/** Cuántas fotos faltan, para el botón "Faltan N fotos". */
export function fotosFaltantes(fotos) {
  return DOCUMENTOS.filter((d) => !fotos?.[d.key]).length;
}

/** Silueta de cada foto: DNI de frente, código de barras, persona con DNI. */
function Silueta({ lado, apagada }) {
  const fondo = apagada ? "#C9D2E6" : colors.navyLight;
  if (lado === "reverso") {
    return (
      <View style={[s.silueta, { backgroundColor: fondo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }]}>
        {[2, 4, 2, 5, 2, 3, 2].map((w, i) => (
          <View key={i} style={{ width: w, height: 22, backgroundColor: "rgba(255,255,255,0.6)" }} />
        ))}
      </View>
    );
  }
  if (lado === "selfie") {
    return (
      <View style={[s.silueta, { backgroundColor: fondo, overflow: "hidden" }]}>
        <View style={{ position: "absolute", left: 12, top: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.55)" }} />
        <View style={{ position: "absolute", left: 6, top: 27, width: 28, height: 22, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: "rgba(255,255,255,0.4)" }} />
        <View style={{ position: "absolute", left: 38, top: 14, width: 20, height: 14, borderRadius: 3, backgroundColor: colors.gold, transform: [{ rotate: "-8deg" }] }} />
      </View>
    );
  }
  return (
    <View style={[s.silueta, { backgroundColor: fondo }]}>
      <View style={{ position: "absolute", left: 7, top: 8, width: 16, height: 22, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" }} />
      <View style={{ position: "absolute", left: 29, top: 12, width: 28, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.5)" }} />
      <View style={{ position: "absolute", left: 29, top: 21, width: 20, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" }} />
    </View>
  );
}

/**
 * Las tres fotos de identidad.
 *
 *   variante "lista"  — filas dentro de una tarjeta de cristal, con el
 *                       contador "n de 3" y su barra (registro).
 *   variante "filas"  — cada foto es una fila suelta; las que faltan
 *                       van con borde punteado (volver a subir tras
 *                       una observación).
 *
 * El documento se toma con la cámara o se trae de la galería; la
 * selfie abre directo la cámara frontal. Con la foto puesta, la
 * miniatura reemplaza a la silueta para que la persona vea qué envía.
 */
export default function SubidaDocumentos({ fotos, onChange, deshabilitado, tipoDocumento = "dni", variante = "lista" }) {
  const { mostrar } = useAviso();
  const [eligiendo, setEligiendo] = useState(null);
  const [preparando, setPreparando] = useState(null);

  function abrir(doc) {
    if (doc.soloCamara) return tomarSelfie(doc);
    setEligiendo(doc);
  }

  async function tomarSelfie(doc) {
    const lista = await capturarFoto({
      desdeCamara: true,
      aspecto: doc.aspecto,
      frontal: true,
      onPreparando: (v) => setPreparando(v ? doc.key : null),
    });
    if (lista === false) return mostrar("No pudimos leer la imagen. Inténtalo otra vez.", "error");
    if (lista) onChange({ ...fotos, [doc.key]: lista });
  }

  const hechas = DOCUMENTOS.length - fotosFaltantes(fotos);

  const filas = DOCUMENTOS.map((doc, i) => {
    const foto = fotos?.[doc.key];
    const etiqueta = etiquetaDe(doc, tipoDocumento);
    const marco = preparando === doc.key ? (
      <View style={[s.silueta, s.preparando]}>
        <ActivityIndicator color={colors.navy} />
      </View>
    ) : foto ? (
      <Image source={{ uri: foto.uri }} style={s.silueta} resizeMode="cover" accessibilityIgnoresInvertColors />
    ) : (
      <Silueta lado={doc.lado} apagada={variante === "filas"} />
    );

    if (variante === "filas") {
      return (
        <Toque
          key={doc.key}
          onPress={() => abrir(doc)}
          disabled={deshabilitado}
          accessibilityLabel={foto ? `${etiqueta}, lista. Cambiar` : `Subir ${etiqueta}`}
          style={[s.filaSuelta, foto ? s.filaLista : s.filaFalta]}
        >
          {marco}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.etiqueta}>{etiqueta}</Text>
            {foto ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="checkmark" size={13} color={colors.successText} />
                <Text style={s.lista}>Lista</Text>
              </View>
            ) : (
              <Text style={s.pista}>{doc.soloCamara ? "Solo con la cámara" : "Cámara o galería"}</Text>
            )}
          </View>
          {foto ? (
            <Text style={s.cambiar}>Cambiar</Text>
          ) : (
            <View style={s.camara}>
              <Ionicons name={doc.soloCamara ? "camera-reverse-outline" : "camera-outline"} size={18} color={colors.white} />
            </View>
          )}
        </Toque>
      );
    }

    return (
      <View key={doc.key} style={[s.fila, i > 0 && s.separador]}>
        {marco}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.etiqueta}>{etiqueta}</Text>
          <Text style={s.pista}>
            {foto ? "Toca para cambiarla" : doc.soloCamara ? "Solo con la cámara" : "Cámara o galería"}
          </Text>
        </View>
        <Toque
          onPress={() => abrir(doc)}
          disabled={deshabilitado || preparando === doc.key}
          accessibilityLabel={foto ? `Cambiar foto: ${etiqueta}` : `Subir foto: ${etiqueta}`}
          style={foto ? s.listo : s.camara}
        >
          <Ionicons
            name={foto ? "checkmark" : doc.soloCamara ? "camera-reverse-outline" : "camera-outline"}
            size={18}
            color={colors.white}
          />
        </Toque>
      </View>
    );
  });

  return (
    <>
      {variante === "lista" ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.titulo}>3 fotos</Text>
            <Text style={[s.contador, hechas === 3 && { color: colors.successText }]}>{hechas} de 3</Text>
          </View>
          <View style={s.riel}>
            <View style={[s.avance, { width: `${Math.round((hechas / 3) * 100)}%` }]} />
          </View>
          <View>{filas}</View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>{filas}</View>
      )}

      <HojaFoto
        visible={Boolean(eligiendo)}
        titulo={eligiendo ? etiquetaDe(eligiendo, tipoDocumento) : ""}
        ayuda="Que se lean todos los datos: sin reflejos ni dedos encima."
        aspecto={eligiendo?.aspecto}
        onCerrar={() => setEligiendo(null)}
        onPreparando={(v) => setPreparando(v ? eligiendo?.key : null)}
        onFoto={(f) => eligiendo && onChange({ ...fotos, [eligiendo.key]: f })}
      />
    </>
  );
}

const s = StyleSheet.create({
  titulo: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  contador: { fontFamily: fonts.heavy, fontSize: 12, color: colors.text3 },
  riel: { height: 5, borderRadius: 3, backgroundColor: "rgba(15,27,51,0.08)", overflow: "hidden" },
  avance: { height: 5, borderRadius: 3, backgroundColor: colors.success },
  fila: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  separador: { borderTopWidth: 1, borderTopColor: "rgba(15,27,51,0.08)" },
  silueta: { width: 66, height: 44, borderRadius: 8 },
  etiqueta: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },
  camara: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  listo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  filaSuelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  filaLista: { borderWidth: 1, borderColor: colors.line },
  filaFalta: { borderWidth: 1.5, borderColor: colors.dashed, borderStyle: "dashed" },
  lista: { fontFamily: fonts.strong, fontSize: 12, color: colors.successText },
  cambiar: { fontFamily: fonts.strong, fontSize: 12, color: colors.text3 },
  pista: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  preparando: { backgroundColor: colors.ground, alignItems: "center", justifyContent: "center" },
});
