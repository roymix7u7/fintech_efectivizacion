import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import COLORS from "../../src/theme/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.borderLight,
          height: 58,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          title: "Solicitudes",
          tabBarIcon: ({ color }) => (
            <Ionicons name="document-text-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tarjetas"
        options={{
          title: "Tarjetas",
          tabBarIcon: ({ color }) => (
            <Ionicons name="card-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="noticias" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}
