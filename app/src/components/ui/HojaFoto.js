// Tomar una foto o traerla de la galería, en una hoja desde abajo.
//
// Devuelve la imagen ya achicada y con su base64 (prepararImagen): sin
// base64 la subida a Supabase Storage crea archivos de 0 bytes.
import { Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors, fonts } from "../../theme/tokens";
import { pedirPermiso } from "../../lib/permisos";
import { prepararImagen } from "../../lib/imagen";
import { useAviso } from "../Avisos";
import { Hoja } from "./Hoja";
import { Toque } from "./Toque";

// En iOS no se puede presentar la cámara mientras la hoja todavía baja.
export const esperarCierre = () => new Promise((r) => setTimeout(r, Platform.OS === "ios" ? 380 : 0));

/**
 * Abre la cámara o la galería y devuelve la imagen lista para subir.
 *
 *   null   — la persona canceló o no dio permiso.
 *   false  — eligió algo que no se pudo leer.
 *
 * Recorte: solo con la cámara y solo en Android, que respeta la
 * proporción pedida. iOS recorta siempre en cuadrado, y eso cortaba la
 * mitad de un DNI o de una tarjeta. Lo que viene de la galería (una
 * captura, un voucher) se sube entero.
 */
export async function capturarFoto({ desdeCamara, aspecto, frontal, onPreparando }) {
  if (!(await pedirPermiso(desdeCamara ? "camara" : "galeria"))) return null;
  const cuadrado = aspecto && aspecto[0] === aspecto[1];
  const recortar = Boolean(desdeCamara && aspecto && (Platform.OS === "android" || cuadrado));
  const opciones = {
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: recortar,
    ...(recortar ? { aspect: aspecto } : null),
    ...(frontal ? { cameraType: ImagePicker.CameraType.front } : null),
  };
  const r = desdeCamara
    ? await ImagePicker.launchCameraAsync(opciones)
    : await ImagePicker.launchImageLibraryAsync(opciones);
  if (r.canceled || !r.assets?.[0]) return null;
  onPreparando?.(true);
  try {
    const lista = await prepararImagen(r.assets[0]);
    return lista?.base64 ? lista : false;
  } finally {
    onPreparando?.(false);
  }
}

export function HojaFoto({ visible, titulo, ayuda, aspecto, onCerrar, onFoto, onPreparando }) {
  const { mostrar } = useAviso();

  async function elegir(desdeCamara) {
    onCerrar();
    await esperarCierre();
    const lista = await capturarFoto({ desdeCamara, aspecto, onPreparando });
    if (lista === false) return mostrar("No pudimos leer la imagen. Inténtalo otra vez.", "error");
    if (lista) onFoto(lista);
  }

  const opcion = (icono, texto, detalle, desdeCamara) => (
    <Toque
      onPress={() => elegir(desdeCamara)}
      accessibilityLabel={texto}
      style={{
        minHeight: 68,
        borderRadius: 18,
        backgroundColor: colors.ground,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: colors.night,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icono} size={21} color={colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>{texto}</Text>
        <Text style={{ fontFamily: fonts.label, fontSize: 12, color: colors.text2 }}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Toque>
  );

  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={titulo}>
      <View style={{ gap: 8 }}>
        {ayuda ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text2, paddingBottom: 4 }}>
            {ayuda}
          </Text>
        ) : null}
        {opcion("camera-outline", "Tomar foto", "Con buena luz y sin reflejos", true)}
        {opcion("images-outline", "Elegir de la galería", "Una foto o una captura que ya tengas", false)}
      </View>
    </Hoja>
  );
}

export default HojaFoto;
