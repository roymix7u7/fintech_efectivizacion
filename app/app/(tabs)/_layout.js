import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600", fontSize: 17 },
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#eee" },
        tabBarActiveTintColor: "#1B2A4A",
        tabBarInactiveTintColor: "#999",
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: "Inicio",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          title: "Solicitudes",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="tarjetas"
        options={{
          title: "Tarjetas",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>💳</Text>,
        }}
      />
      <Tabs.Screen
        name="noticias"
        options={{
          title: "Noticias",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📢</Text>,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Mi cuenta",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
