// Barra de pestañas flotante de cristal (design/DESIGN.md §4.3).
//
// Tres destinos: Inicio, Solicitudes y Tarjetas. Flota sobre el
// contenido en vez de ocupar una franja propia, así que cada pantalla
// con pestañas deja ESPACIO_PESTANAS libre al final.
//
// En Noticias y Mi cuenta no se dibuja: esas se abren desde el menú y
// no son destinos de la barra; mostrarla ahí marcaría como activa una
// pestaña que no es la pantalla en la que estás.
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../../theme/tokens";
import { GlassPanel } from "./GlassPanel";
import { Toque } from "./Toque";

const DESTINOS = {
  inicio: { titulo: "Inicio", icono: "home-outline", activo: "home" },
  solicitudes: { titulo: "Solicitudes", icono: "receipt-outline", activo: "receipt" },
  tarjetas: { titulo: "Tarjetas", icono: "card-outline", activo: "card" },
};

/**
 * Lo que tapa la barra, para el padding inferior de cada pestaña.
 * Suma la barra del sistema: con los tres botones de Android mide unos
 * 48 dp y con gestos unos 16; un número fijo dejaba el final del
 * contenido debajo de la barra en los teléfonos con botones.
 */
export function useEspacioPestanas() {
  const insets = useSafeAreaInsets();
  return insets.bottom + 14 + 66 + 30;
}

export function BarraPestanas({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const actual = state.routes[state.index]?.name;

  if (!DESTINOS[actual]) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: insets.bottom + 14,
      }}
    >
      <GlassPanel
        variant="light"
        radius={24}
        style={{
          height: 66,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          paddingHorizontal: 8,
        }}
      >
        {state.routes
          .filter((r) => DESTINOS[r.name])
          .map((ruta) => {
            const d = DESTINOS[ruta.name];
            const enfocada = ruta.name === actual;

            const ir = () => {
              const evento = navigation.emit({
                type: "tabPress",
                target: ruta.key,
                canPreventDefault: true,
              });
              if (!enfocada && !evento.defaultPrevented) {
                navigation.navigate(ruta.name);
              }
            };

            return (
              <Toque
                key={ruta.key}
                onPress={ir}
                accessibilityRole="tab"
                accessibilityLabel={d.titulo}
                accessibilityState={{ selected: enfocada }}
                style={{
                  width: 96,
                  paddingVertical: 7,
                  borderRadius: 16,
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: enfocada ? colors.navy : "transparent",
                }}
              >
                <Ionicons
                  name={enfocada ? d.activo : d.icono}
                  size={22}
                  color={enfocada ? colors.gold : colors.text2}
                />
                <Text
                  style={{
                    fontFamily: enfocada ? fonts.heavy : fonts.strong,
                    fontSize: 11,
                    color: enfocada ? colors.gold : colors.text2,
                  }}
                >
                  {d.titulo}
                </Text>
              </Toque>
            );
          })}
      </GlassPanel>
    </View>
  );
}

export default BarraPestanas;
