// Cabecera de los flujos por pasos (registro, recuperar acceso).
//
// Azul noche con luces, el logo al centro, "n de 3" a la derecha y la
// barra de segmentos: el segmento en curso se llena de izquierda a
// derecha al entrar, los anteriores ya están llenos. Debajo, el título.
// Deja 92 px abajo para que la tarjeta de cristal del formulario se
// monte sobre el borde (marginTop -64 en el cuerpo).
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { colors, fonts } from "../../theme/tokens";
import { CURVA, useReducirMovimiento } from "../../lib/movimiento";
import { Logo } from "../brand/Logo";
import { CabeceraNoche } from "./CabeceraNoche";
import { BotonIcono } from "./Piezas";
import { Aparece } from "../Cargando";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 280, top: 60, right: -120 },
  { color: colors.glowBlue, opacity: 0.75, size: 320, bottom: -170, left: -120 },
];

function Segmento({ estado }) {
  const reducir = useReducirMovimiento();
  const lleno = useRef(new Animated.Value(estado === "actual" && !reducir ? 0 : 1)).current;

  useEffect(() => {
    if (estado !== "actual" || reducir) return;
    lleno.setValue(0);
    Animated.timing(lleno, { toValue: 1, duration: 700, delay: 150, easing: CURVA, useNativeDriver: false }).start();
  }, [estado]);

  return (
    <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
      {estado !== "pendiente" ? (
        <Animated.View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.gold,
            width: lleno.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          }}
        />
      ) : null}
    </View>
  );
}

export function CabeceraPasos({ paso, total = 3, titulo, subtitulo, onVolver }) {
  return (
    <CabeceraNoche luces={LUCES} style={{ paddingHorizontal: 20, paddingBottom: 92, gap: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {onVolver ? (
          <BotonIcono variante="noche" icono="chevron-back" onPress={onVolver} accessibilityLabel="Volver" />
        ) : (
          <View style={{ width: 44, height: 44 }} />
        )}
        <Logo width={56} />
        <View
          style={{
            height: 32,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.10)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.2)",
            justifyContent: "center",
          }}
          accessibilityLabel={`Paso ${paso} de ${total}`}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 12, color: colors.white }}>
            {paso} de {total}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <Segmento key={i} estado={i + 1 < paso ? "hecho" : i + 1 === paso ? "actual" : "pendiente"} />
        ))}
      </View>

      <Aparece key={titulo}>
        <View style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
          <Text
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.6, color: colors.white, textAlign: "center" }}
          >
            {titulo}
          </Text>
          {subtitulo ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: "rgba(255,255,255,0.72)", textAlign: "center" }}>
              {subtitulo}
            </Text>
          ) : null}
        </View>
      </Aparece>
    </CabeceraNoche>
  );
}

export default CabeceraPasos;
