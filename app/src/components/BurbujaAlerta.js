import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import COLORS from "../theme/colors";
import { supabase } from "../lib/supabase";
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

export default function BurbujaAlerta() {
  const [alerta, setAlerta] = useState(null);
  const router = useRouter();

  const desliz = useRef(new Animated.Value(0)).current;
  // Ids ya mostrados en este arranque. Sin esto, volver del segundo
  // plano relanzaria la misma burbuja una y otra vez.
  const mostradas = useRef(new Set());
  const temporizador = useRef(null);

  const esconder = useCallback(() => {
    clearTimeout(temporizador.current);
    Animated.timing(desliz, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setAlerta(null));
  }, [desliz]);

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
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (!gravedadDe(pendiente.tipo).permanece) {
      temporizador.current = setTimeout(esconder, ESPERA_MS);
    }
  }, [desliz, esconder]);

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
        () => buscar(),
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

  function cerrar() {
    marcarVistas([alerta.id]);
    esconder();
  }

  function abrir() {
    esconder();
    router.push("/(tabs)/noticias?seccion=alertas");
  }

  return (
    <Animated.View
      style={[
        s.contenedor,
        {
          opacity: desliz,
          transform: [
            {
              translateY: desliz.interpolate({
                inputRange: [0, 1],
                outputRange: [-70, 0],
              }),
            },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={abrir}
        style={[s.burbuja, { borderLeftColor: g.color }]}
      >
        <View style={[s.icono, { backgroundColor: g.fondo }]}>
          <Ionicons name={g.icono} size={19} color={g.color} />
        </View>

        <View style={s.texto}>
          <Text style={[s.etiqueta, { color: g.color }]}>{g.etiqueta}</Text>
          <Text style={s.titulo} numberOfLines={1}>
            {alerta.titulo}
          </Text>
          <Text style={s.mensaje} numberOfLines={2}>
            {alerta.mensaje}
          </Text>
          <Text style={s.pista}>Toca para ver el detalle</Text>
        </View>

        <TouchableOpacity
          onPress={cerrar}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Marcar como vista"
          style={s.cerrar}
        >
          <Ionicons name="close" size={18} color={COLORS.textLight} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  contenedor: {
    position: "absolute",
    top: 96,
    left: 14,
    right: 14,
    zIndex: 90,
  },
  burbuja: {
    flexDirection: "row",
    gap: 11,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 13,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  texto: { flex: 1, gap: 1 },
  etiqueta: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  titulo: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  mensaje: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  pista: { fontSize: 11, color: COLORS.textLight, marginTop: 3 },
  cerrar: { alignSelf: "flex-start", padding: 2 },
});
