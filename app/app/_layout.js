import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#ffffff" },
          headerTitleStyle: { fontWeight: "600", fontSize: 17 },
          headerShadowVisible: false,
          headerBackTitle: "Atrás",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Iniciar sesión" }} />
        <Stack.Screen name="registro" options={{ title: "Crear cuenta" }} />
        <Stack.Screen
          name="recuperar"
          options={{ title: "Recuperar contraseña" }}
        />
        <Stack.Screen name="en-revision" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="empresa" options={{ title: "Sobre nosotros" }} />
        <Stack.Screen
          name="guia/[banco]"
          options={{ title: "Guía del banco" }}
        />
        <Stack.Screen
          name="nueva-solicitud"
          options={{ title: "Nueva solicitud" }}
        />
        <Stack.Screen name="notificaciones" options={{ title: "Avisos" }} />
      </Stack>
    </>
  );
}
