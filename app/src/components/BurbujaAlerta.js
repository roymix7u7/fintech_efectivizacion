import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alertLevel, fonts } from "../theme/tokens";
import { CURVA, useReducirMovimiento } from "../lib/movimiento";
import { Toque } from "./ui/Toque";
import { supabase } from "../lib/supabase";
import { invalidar } from "../lib/cache";
import {
  listarAlertas,
  marcarVistas,
  gravedadDe,
  nombreCanal,
} from "../lib/alertas";

/**
 * Burbuja flotante con la alerta que el cliente todavia no abrio.
 *
 * Tres reglas, y cada una responde a una forma de fallar:
 *
 *   · Aparece una sola vez por arranque. Repetirla cada vez que se
 *     cambia de pestana la convertiria en algo que se cierra por
 *     reflejo sin leer.
 *
 *   · Cerrarla con la X marca la alerta como vista. Que se vaya sola
 *     por tiempo no: si desaparecio mientras el telefono estaba en el
 *     bolsillo, el mensaje no llego, y el punto de "nueva" tiene que
 *     seguir ahi manana.
 *
 *   · Una alerta urgente no se va sola. Espera a que alguien la toque.
 *
 * Y escucha a la base en vivo: si el aviso sale mientras el cliente
 * esta a mitad de una solicitud, la burbuja aparece en ese momento. Si
 * hubiera que esperar a que cierre y vuelva a abrir el app, se enteraria
 * justo despues de mandarla, que es cuando el aviso ya no sirve.
 *
 * Vive en el layout de las pestanas, asi que se ve sobre cualquiera.
 */
const ESPERA_MS = 7000;

/** Gravedad de la alerta -> bloque sólido del diseño (tokens.alertLevel). */
const NIVEL = {
  critico: alertLevel.urgente,
  advertencia: alertLevel.importante,
  info: alertLevel.aviso,
};

export default function BurbujaAlerta() {
  const [alerta, setAlerta] = useState(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducir = useReducirMovimiento();

  const desliz = useRef(new Animated.Value(0)).current;
  // Ids ya mostrados en este arranque. Sin esto, volver del segundo
  // plano relanzaria la misma burbuja una y otra vez.
  const mostradas = useRef(new Set());
  const temporizador = useRef(null);

  const esconder = useCallback(() => {
    clearTimeout(temporizador.current);
    Animated.timing(desliz, {
      toValue: 0,
      duration: reducir ? 0 : 180,
      easing: CURVA,
      useNativeDriver: true,
    }).start(() => setAlerta(null));
  }, [desliz, reducir]);

  const buscar = useCallback(async () => {
    const { alertas } = await listarAlertas();
    const pendiente = alertas.find(
      (a) => !a.vista && !mostradas.current.has(a.id),
    );
    if (!pendiente) return;

    mostradas.current.add(pendiente.id);
    setAlerta(pendiente);

    Animated.timing(desliz, {
      toValue: 1,
      duration: reducir ? 0 : 350,
      easing: CURVA,
      useNativeDriver: true,
    }).start();

    if (!gravedadDe(pendiente.tipo).permanece) {
      temporizador.current = setTimeout(esconder, ESPERA_MS);
    }
  }, [desliz, esconder, reducir]);

  useEffect(() => {
    buscar();

    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") buscar();
    });

    // El aviso del servidor solo dice "algo cambio": la alerta se
    // vuelve a pedir por la via normal. Asi la vigencia y los permisos
    // los sigue decidiendo la base, y una alerta programada para
    // manana no se cuela por venir dentro del mensaje.
    const canal = supabase
      .channel(nombreCanal("alertas-en-vivo"))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alertas_sistema",
          filter: "categoria=eq.alerta",
        },
        () => {
          buscar();
          // Inicio y Noticias muestran la alerta desde su copia guardada.
          invalidar("noticias");
        },
      )
      .subscribe();

    return () => {
      clearTimeout(temporizador.current);
      sub.remove();
      supabase.removeChannel(canal);
    };
  }, [buscar]);

  if (!alerta) return null;

  const g = gravedadDe(alerta.tipo);
  const n = NIVEL[alerta.tipo] || NIVEL.info;

  function cerrar() {
    marcarVistas([alerta.id]);
    esconder();
  }

  function abrir() {
    esconder();
    router.push("/(tabs)/noticias?seccion=alertas");
  }

  // Alerta = bloque de color sólido con ícono y etiqueta. Nunca se
  // confunde con una noticia, que siempre es tarjeta blanca.
  return (
    <Animated.View
      style={[
        s.contenedor,
        {
          top: insets.top + 70,
          opacity: desliz,
          transform: [
            {
              translateY: desliz.interpolate({
                inputRange: [0, 1],
                outputRange: [reducir ? 0 : -70, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Toque
        onPress={abrir}
        escala={0.98}
        accessibilityRole="alert"
        accessibilityLabel={`${g.etiqueta}: ${alerta.titulo}. ${alerta.mensaje || ""}`}
        accessibilityHint="Abre el detalle en Alertas"
        style={[s.burbuja, { backgroundColor: n.bg }]}
      >
        <Ionicons name={n.icon} size={22} color={n.fg} style={{ marginTop: 2 }} />

        <View style={s.texto}>
          <Text style={[s.etiqueta, { color: n.fg }]}>{n.label}</Text>
          <Text style={[s.titulo, { color: n.fg }]} numberOfLines={1}>
            {alerta.titulo}
          </Text>
          {alerta.mensaje ? (
            <Text style={[s.mensaje, { color: n.fg }]} numberOfLines={2}>
              {alerta.mensaje}
            </Text>
          ) : null}
          <Text style={[s.pista, { color: n.fg }]}>Toca para ver el detalle</Text>
        </View>

        <Toque onPress={cerrar} accessibilityLabel="Marcar como vista" style={s.cerrar}>
          <Ionicons name="close" size={20} color={n.fg} />
        </Toque>
      </Toque>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  contenedor: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 90,
  },
  burbuja: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 22,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 4,
    shadowColor: "#0F1B33",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  texto: { flex: 1, gap: 2 },
  etiqueta: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1.4 },
  titulo: { fontFamily: fonts.strong, fontSize: 15, lineHeight: 20 },
  mensaje: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, opacity: 0.92 },
  pista: { fontFamily: fonts.strong, fontSize: 12, marginTop: 4, opacity: 0.85 },
  cerrar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginTop: -8 },
});
