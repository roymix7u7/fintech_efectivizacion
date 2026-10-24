import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import COLORS from "../src/theme/colors";
import { fonts } from "../src/theme/tokens";
import { useFuentes } from "../src/theme/fuentes";
import { DURACION, useReducirMovimiento, duracion } from "../src/lib/movimiento";
import { ProveedorAvisos } from "../src/components/Avisos";
import VigilanteSesion from "../src/components/VigilanteSesion";
import { FranjaSistema } from "../src/components/ui/FranjaSistema";

// El splash se queda puesto hasta que las fuentes esten cargadas. Sin
// esto la app arranca con la tipografia del sistema y el texto salta de
// golpe a Sora y Manrope cuando terminan de llegar.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Cabecera y transiciones comunes a todas las pantallas.
 *
 * El deslizamiento lateral no es decoración: al entrar, la pantalla
 * nueva empuja a la anterior, y al volver hace el camino inverso. Eso
 * le dice al usuario dónde está parado dentro de la app sin necesidad
 * de leer nada.
 */
export default function RootLayout() {
  const { listas } = useFuentes();
  const reducir = useReducirMovimiento();

  useEffect(() => {
    if (listas) SplashScreen.hideAsync().catch(() => {});
  }, [listas]);

  // Nada se dibuja todavia: el splash sigue tapando la pantalla, asi
  // que devolver null aqui no deja ningun hueco en blanco.
  if (!listas) return null;

  return (
    <ProveedorAvisos>
      <StatusBar style="dark" />
      <VigilanteSesion />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.white },
          headerTitleStyle: {
            // La familia trae el peso: con fontWeight encima, Android
            // sintetiza una negrita falsa sobre una fuente ya gruesa.
            fontFamily: fonts.display,
            fontSize: 17,
            letterSpacing: -0.2,
            color: COLORS.text,
          },
          headerTintColor: COLORS.primary,
          headerShadowVisible: false,
          headerBackTitle: "Atrás",
          animation: reducir ? "none" : "slide_from_right",
          animationDuration: duracion(DURACION.screen, reducir),
          // El gesto de arrastrar desde el borde para volver es lo que
          // la gente espera en iOS y ya no sorprende en Android.
          gestureEnabled: true,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "fade",
            animationDuration: duracion(DURACION.fade, reducir),
          }}
        />
        {/* Estas dos dibujan su propia cabecera de marca, con logo y
            fondo azul. Sin esto salían dos cabeceras apiladas: la
            nativa arriba y la de la pantalla debajo. */}
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="registro" options={{ headerShown: false }} />
        <Stack.Screen
          name="recuperar"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="en-revision"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "fade",
            animationDuration: duracion(DURACION.fade, reducir),
          }}
        />
        {/* Las pestañas entran con fundido: son el destino, no un paso
            más dentro de una secuencia. */}
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "fade",
            animationDuration: duracion(DURACION.fade, reducir),
          }}
        />
        <Stack.Screen name="empresa" options={{ headerShown: false }} />
        <Stack.Screen name="legal/[tipo]" options={{ headerShown: false }} />
        <Stack.Screen name="mis-datos" options={{ headerShown: false }} />
        <Stack.Screen name="reclamaciones" options={{ headerShown: false }} />
        <Stack.Screen
          name="guia/[banco]"
          options={{ headerShown: false }}
        />
        {/* Dibuja su propia cabecera azul, de flujo: sin esto salian la
            nativa blanca y la de la pantalla, una encima de otra.

            Sube desde abajo en vez de entrar por el lado: no es un paso
            dentro de la navegación, es una tarea que se abre encima de
            lo que estabas viendo y que terminas o cancelas. */}
        <Stack.Screen
          name="nueva-solicitud"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "slide_from_bottom",
            animationDuration: duracion(DURACION.modalUp, reducir),
          }}
        />
        <Stack.Screen name="notificaciones" options={{ headerShown: false }} />
        {/* Registrar tarjeta y agregar o editar cuenta: tareas que se
            abren encima de la lista y se terminan o cancelan, así que
            suben desde abajo como Nueva solicitud. */}
        <Stack.Screen
          name="tarjeta-nueva"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "slide_from_bottom",
            animationDuration: duracion(DURACION.modalUp, reducir),
          }}
        />
        <Stack.Screen
          name="cuenta-nueva"
          options={{
            headerShown: false,
            animation: reducir ? "none" : "slide_from_bottom",
            animationDuration: duracion(DURACION.modalUp, reducir),
          }}
        />
      </Stack>
      {/* Encima de las pantallas y debajo de los avisos. */}
      <FranjaSistema />
    </ProveedorAvisos>
  );
}
