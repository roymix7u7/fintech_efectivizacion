import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import COLORS from "../src/theme/colors";
import { ProveedorAvisos } from "../src/components/Avisos";

/**
 * Cabecera y transiciones comunes a todas las pantallas.
 *
 * El deslizamiento lateral no es decoración: al entrar, la pantalla
 * nueva empuja a la anterior, y al volver hace el camino inverso. Eso
 * le dice al usuario dónde está parado dentro de la app sin necesidad
 * de leer nada.
 */
export default function RootLayout() {
  return (
    <ProveedorAvisos>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.white },
          headerTitleStyle: {
            fontWeight: "600",
            fontSize: 17,
            letterSpacing: -0.2,
            color: COLORS.text,
          },
          headerTintColor: COLORS.primary,
          headerShadowVisible: false,
          headerBackTitle: "Atrás",
          animation: "slide_from_right",
          animationDuration: 260,
          // El gesto de arrastrar desde el borde para volver es lo que
          // la gente espera en iOS y ya no sorprende en Android.
          gestureEnabled: true,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false, animation: "fade" }}
        />
        {/* Estas dos dibujan su propia cabecera de marca, con logo y
            fondo azul. Sin esto salían dos cabeceras apiladas: la
            nativa arriba y la de la pantalla debajo. */}
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="registro" options={{ headerShown: false }} />
        <Stack.Screen
          name="recuperar"
          options={{ title: "Recuperar contraseña" }}
        />
        <Stack.Screen
          name="en-revision"
          options={{ headerShown: false, animation: "fade" }}
        />
        {/* Las pestañas entran con fundido: son el destino, no un paso
            más dentro de una secuencia. */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false, animation: "fade" }}
        />
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
    </ProveedorAvisos>
  );
}
