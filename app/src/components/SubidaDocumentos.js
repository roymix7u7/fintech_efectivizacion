import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import COLORS from "../theme/colors";
import { alerta } from "../lib/ui";
import { pedirPermiso } from "../lib/permisos";

export const DOCUMENTOS = [
  {
    key: "dni_frontal",
    label: "DNI - Cara frontal",
    icon: "id-card-outline",
    desc: "Lado con tu foto y datos",
    aspecto: [4, 3],
  },
  {
    key: "dni_posterior",
    label: "DNI - Cara posterior",
    icon: "id-card-outline",
    desc: "Lado con el codigo de barras",
    aspecto: [4, 3],
  },
  {
    key: "selfie",
    label: "Selfie con DNI",
    icon: "person-circle-outline",
    desc: "Sosteniendo tu DNI junto a tu rostro",
    aspecto: [1, 1],
  },
];

/** true solo si estan las tres fotos. */
export function documentosCompletos(fotos) {
  return DOCUMENTOS.every((d) => Boolean(fotos?.[d.key]));
}

/**
 * Opciones comunes del selector de imagenes.
 * base64 es obligatorio: sin el, la subida a Supabase Storage crea
 * archivos de 0 bytes en React Native.
 */
function opciones(aspecto) {
  return {
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: true,
    aspect: aspecto,
    base64: true,
  };
}

export default function SubidaDocumentos({ fotos, onChange, deshabilitado }) {
  async function usarCamara(doc) {
    // pedirPermiso se encarga del caso dificil: cuando el sistema ya no
    // vuelve a preguntar, ofrece abrir los ajustes del telefono.
    if (!(await pedirPermiso("camara"))) return;
    const r = await ImagePicker.launchCameraAsync(opciones(doc.aspecto));
    if (!r.canceled && r.assets?.[0]) guardar(doc.key, r.assets[0]);
  }

  async function usarGaleria(doc) {
    if (!(await pedirPermiso("galeria"))) return;
    const r = await ImagePicker.launchImageLibraryAsync(opciones(doc.aspecto));
    if (!r.canceled && r.assets?.[0]) guardar(doc.key, r.assets[0]);
  }

  function guardar(key, asset) {
    if (!asset.base64) {
      alerta("No pudimos leer la imagen. Intentalo otra vez.");
      return;
    }
    onChange({ ...fotos, [key]: asset });
  }

  return (
    <>
      <View style={s.infoCard}>
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color={COLORS.primary}
        />
        <Text style={s.infoText}>
          Tus documentos son privados y se usan solo para verificar tu identidad
        </Text>
      </View>

      {DOCUMENTOS.map((doc) => (
        <View key={doc.key} style={s.card}>
          <View style={s.header}>
            <Ionicons name={doc.icon} size={20} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{doc.label}</Text>
              <Text style={s.desc}>{doc.desc}</Text>
            </View>
            {fotos[doc.key] && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={COLORS.success}
              />
            )}
          </View>

          {fotos[doc.key] ? (
            <View style={s.preview}>
              <Image source={{ uri: fotos[doc.key].uri }} style={s.imagen} />
              <TouchableOpacity
                onPress={() => onChange({ ...fotos, [doc.key]: null })}
                style={s.cambiarBtn}
                disabled={deshabilitado}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={s.cambiarText}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.botones}>
              <TouchableOpacity
                style={s.boton}
                onPress={() => usarCamara(doc)}
                disabled={deshabilitado}
              >
                <Ionicons
                  name="camera-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={s.botonText}>Camara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.boton}
                onPress={() => usarGaleria(doc)}
                disabled={deshabilitado}
              >
                <Ionicons
                  name="images-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={s.botonText}>Galeria</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  desc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  preview: { gap: 10 },
  imagen: {
    width: "100%",
    height: 170,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
  },
  cambiarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cambiarText: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
  botones: { flexDirection: "row", gap: 12 },
  boton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.inputBg,
  },
  botonText: { fontSize: 13, color: COLORS.text, fontWeight: "500" },
});
