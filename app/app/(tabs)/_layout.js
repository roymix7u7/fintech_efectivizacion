import { View } from "react-native";
import { Tabs } from "expo-router";
import BurbujaAlerta from "../../src/components/BurbujaAlerta";
import RegistroPush from "../../src/components/RegistroPush";
import AvisosEnVivo from "../../src/components/AvisosEnVivo";
import AceptarCondiciones from "../../src/components/AceptarCondiciones";
import { BarraPestanas } from "../../src/components/ui/BarraPestanas";
import { colors } from "../../src/theme/tokens";
import { useReducirMovimiento } from "../../src/lib/movimiento";

/**
 * Barra de pestañas.
 *
 * La animación va aquí y no en el layout de arriba: moverse entre
 * pestañas usa este navegador, no el de pila, así que la transición
 * del stack nunca se aplicaba y los cambios de pestaña salían secos.
 *
 * Entre pestañas va un fundido y no un desplazamiento: las tres son
 * destinos al mismo nivel, no pasos de una secuencia, así que moverse
 * de una a otra no debería sentirse como avanzar ni como volver.
 *
 * La barra es propia (BarraPestanas): flota en cristal sobre el
 * contenido, como pide el diseño, en vez de la franja blanca nativa.
 */
export default function TabsLayout() {
  const reducir = useReducirMovimiento();

  return (
    // La burbuja de alertas vive fuera del navegador para que se vea
    // sobre cualquier pestana y no se desmonte al cambiar de una a otra.
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <Tabs
        tabBar={(props) => <BarraPestanas {...props} />}
        screenOptions={{
          headerShown: false,
          animation: reducir ? "none" : "fade",
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: colors.ground },
        }}
      >
        <Tabs.Screen name="inicio" options={{ title: "Inicio" }} />
        <Tabs.Screen name="solicitudes" options={{ title: "Solicitudes" }} />
        <Tabs.Screen name="tarjetas" options={{ title: "Tarjetas" }} />
        <Tabs.Screen name="noticias" options={{ href: null }} />
        <Tabs.Screen name="perfil" options={{ href: null }} />
      </Tabs>
      <RegistroPush />
      <AvisosEnVivo />
      <BurbujaAlerta />
      {/* Versiones nuevas de términos o privacidad: se aceptan antes de seguir. */}
      <AceptarCondiciones />
    </View>
  );
}
