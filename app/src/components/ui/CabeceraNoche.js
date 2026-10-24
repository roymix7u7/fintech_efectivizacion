// Cabecera azul noche con luces, esquinas inferiores redondeadas.
//
// Es la superficie de marca: solo va en Inicio, Bienvenida, Mi cuenta,
// Sobre la empresa, Guía y Cuenta en revisión. En el resto de pantallas
// el fondo es porcelana, para que la cabecera azul siga significando
// "aquí está tu cuenta" y no se vuelva papel tapiz.
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/tokens";
import { AmbientGlow, heroLights } from "./AmbientGlow";

export function CabeceraNoche({
  children,
  luces = heroLights,
  radio = 36,
  style,
  sinSafeArea,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          backgroundColor: colors.night,
          borderBottomLeftRadius: radio,
          borderBottomRightRadius: radio,
          overflow: "hidden",
          paddingTop: (sinSafeArea ? 0 : insets.top) + 18,
        },
        style,
      ]}
    >
      <AmbientGlow lights={luces} />
      {children}
    </View>
  );
}

export default CabeceraNoche;
