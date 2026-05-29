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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="nueva-operacion"
          options={{ title: "Nueva operación" }}
        />
      </Stack>
    </>
  );
}
