import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Pide permiso de camara o galeria.
 *
 * Lo importante esta en el caso denegado. Android e iOS solo muestran
 * el dialogo del sistema una vez: si el usuario dice que no, las
 * siguientes veces la respuesta llega negada sin preguntarle nada. Con
 * un simple aviso de "necesitamos permiso", la persona queda atrapada
 * sin entender por que el boton no hace nada.
 *
 * Por eso, cuando ya no se puede volver a preguntar, se le ofrece
 * abrir los ajustes del telefono directamente.
 *
 * Devuelve true solo si se puede continuar.
 */
export async function pedirPermiso(tipo) {
  const esCamara = tipo === "camara";

  const actual = esCamara
    ? await ImagePicker.getCameraPermissionsAsync()
    : await ImagePicker.getMediaLibraryPermissionsAsync();

  if (actual.granted) return true;

  // canAskAgain en false significa que el sistema ya no mostrara el
  // dialogo: la unica salida son los ajustes.
  if (actual.canAskAgain) {
    const pedido = esCamara
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (pedido.granted) return true;
    if (pedido.canAskAgain) {
      Alert.alert(
        esCamara ? "Permiso de cámara" : "Permiso de fotos",
        esCamara
          ? "Necesitamos la cámara para que puedas fotografiar tus documentos y comprobantes."
          : "Necesitamos acceso a tus fotos para que puedas adjuntar un comprobante que ya tengas guardado.",
      );
      return false;
    }
  }

  ofrecerAjustes(esCamara);
  return false;
}

function ofrecerAjustes(esCamara) {
  const donde =
    Platform.OS === "ios"
      ? "Ajustes, AlToque Perú"
      : "Ajustes, Aplicaciones, AlToque Perú, Permisos";

  Alert.alert(
    esCamara ? "La cámara está bloqueada" : "Tus fotos están bloqueadas",
    `Rechazaste el permiso antes, y el teléfono ya no vuelve a preguntar. ` +
      `Puedes activarlo en ${donde}.`,
    [
      { text: "Ahora no", style: "cancel" },
      {
        text: "Abrir ajustes",
        onPress: () => Linking.openSettings(),
      },
    ],
  );
}

/** Opciones comunes del selector. base64 es obligatorio para la subida. */
export function opcionesFoto(aspecto) {
  return {
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: true,
    aspect: aspecto,
    base64: true,
  };
}
