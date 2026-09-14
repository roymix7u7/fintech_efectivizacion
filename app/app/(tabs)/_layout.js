import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../../src/theme/colors";
import BurbujaAlerta from "../../src/components/BurbujaAlerta";
import RegistroPush from "../../src/components/RegistroPush";

/**
 * Barra de pestañas.
 *
 * La animación va aquí y no en el layout de arriba: moverse entre
 * pestañas usa este navegador, no el de pila, así que la transición
 * del stack nunca se aplicaba y los cambios de pestaña salían secos.
 *
 * "shift" desplaza la pantalla saliente hacia el lado por el que se
 * fue, así que el movimiento coincide con el orden de la barra y se
 * entiende hacia dónde se avanzó.
 */
export default function TabsLayout() {
  return (
    // La burbuja de alertas vive fuera del navegador para que se vea
    // sobre cualquier pestana y no se desmonte al cambiar de una a otra.
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: "shift",
          tabBarStyle: {
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.borderLight,
            height: 58,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textLight,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="inicio"
          options={{
            title: "Inicio",
            // El icono relleno marca la pestaña activa mejor que el color
            // solo, sobre todo para quien distingue mal los tonos.
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="solicitudes"
          options={{
            title: "Solicitudes",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "document-text" : "document-text-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="tarjetas"
          options={{
            title: "Tarjetas",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "card" : "card-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen name="noticias" options={{ href: null }} />
        <Tabs.Screen name="perfil" options={{ href: null }} />
      </Tabs>
      <RegistroPush />
      <BurbujaAlerta />
    </View>
  );
}
