// Carga de las dos familias del diseño: Sora para títulos y cifras,
// Manrope para el resto.
//
// Se llama en app/_layout.js y la navegación no se dibuja hasta que
// `listas` sea true: si se dibuja antes, el texto aparece con la fuente
// del sistema y salta de golpe al cargar la real.
import { useFonts } from "expo-font";
import { Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

export function useFuentes() {
  const [cargadas, error] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // Si la carga falla se sigue adelante con la fuente del sistema: es
  // mejor una app con otra tipografía que una pantalla en blanco.
  return { listas: cargadas || Boolean(error), error };
}
