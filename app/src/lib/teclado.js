import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Alto que ocupa el teclado, o cero si esta cerrado.
 *
 * Sirve para dejar espacio en blanco al final de un formulario. Sin
 * ese espacio, una pantalla solo puede desplazarse hasta donde termina
 * su contenido, asi que el ultimo campo se queda debajo del teclado y
 * no hay forma de subirlo.
 *
 * Se nota cuando un campo tiene algo debajo y otro no: en el registro,
 * la contrasena muestra la lista de requisitos y eso da margen para
 * desplazarse, mientras que el correo no tiene nada despues y queda
 * atrapado.
 */
export function useAlturaTeclado() {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    // En iOS conviene "willShow": empieza a la vez que la animacion, y
    // el desplazamiento acompana al teclado en lugar de ir detras.
    const eventoAbre =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const eventoCierra =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const abre = Keyboard.addListener(eventoAbre, (e) =>
      setAlto(e.endCoordinates?.height ?? 0),
    );
    const cierra = Keyboard.addListener(eventoCierra, () => setAlto(0));

    return () => {
      abre.remove();
      cierra.remove();
    };
  }, []);

  return alto;
}
