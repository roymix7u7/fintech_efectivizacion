// "Importante antes de registrarla": píldora crema que despliega un
// globo con las reglas. Las reglas no se esconden en un texto largo:
// cada una es una fila con su ícono (sí / no / candado / asesor).
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../theme/tokens";
import { CURVA, useReducirMovimiento } from "../../lib/movimiento";
import { Toque } from "./Toque";
import { BankIcon } from "../brand/BankIcon";

const TONOS = {
  si: { bg: colors.successBg, fg: colors.success, icono: "checkmark" },
  no: { bg: colors.errorBg, fg: colors.error, icono: "ban-outline" },
  candado: { bg: colors.goldCream, fg: colors.goldText, icono: "lock-closed-outline" },
  info: { bg: colors.infoBg, fg: colors.navyLight, icono: "chatbubble-ellipses-outline" },
  banco: { bg: colors.infoBg, fg: colors.navyLight, icono: "business-outline" },
  editar: { bg: colors.goldCream, fg: colors.goldText, icono: "create-outline" },
};

export function Consejo({ titulo, reglas }) {
  const [abierto, setAbierto] = useState(false);
  const reducir = useReducirMovimiento();
  const pop = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(pop, { toValue: abierto ? 1 : 0, duration: reducir ? 0 : 360, easing: CURVA, useNativeDriver: true }),
      Animated.timing(giro, { toValue: abierto ? 1 : 0, duration: reducir ? 0 : 300, useNativeDriver: true }),
    ]).start();
  }, [abierto]);

  return (
    <View style={{ alignItems: "center", zIndex: 6 }}>
      <Toque
        onPress={() => setAbierto((v) => !v)}
        accessibilityLabel={titulo}
        accessibilityState={{ expanded: abierto }}
        style={{
          height: 44,
          paddingLeft: 10,
          paddingRight: 14,
          borderRadius: 999,
          backgroundColor: colors.goldCream,
          borderWidth: 1,
          borderColor: "#F3DE92",
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          shadowColor: colors.night,
          shadowOpacity: 0.1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        }}
      >
        <Ionicons name="information-circle-outline" size={19} color={colors.goldCreamText} />
        <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.goldCreamText }}>{titulo}</Text>
        <Animated.View
          style={{ transform: [{ rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}
        >
          <Ionicons name="chevron-down" size={16} color={colors.goldCreamText} />
        </Animated.View>
      </Toque>

      {abierto ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={{
            alignSelf: "stretch",
            marginTop: 12,
            backgroundColor: colors.surface,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 8,
            shadowColor: colors.night,
            shadowOpacity: 0.24,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 20 },
            elevation: 12,
            opacity: pop,
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.92, 1.02, 1] }) },
            ],
          }}
        >
          {/* Piquito del globo, apuntando a la píldora */}
          <View
            style={{
              position: "absolute",
              top: -7,
              alignSelf: "center",
              width: 14,
              height: 14,
              backgroundColor: colors.surface,
              borderRadius: 3,
              transform: [{ rotate: "45deg" }],
            }}
          />
          {reglas.map((r, i) => {
            const t = TONOS[r.tono] || TONOS.info;
            return (
              <View
                key={r.texto}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.lineSoft,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    backgroundColor: t.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {r.tono === "banco" ? (
                    <BankIcon size={17} color={t.fg} />
                  ) : (
                    <Ionicons name={t.icono} size={17} color={t.fg} />
                  )}
                </View>
                <Text style={{ flex: 1, fontFamily: fonts.strong, fontSize: 15, lineHeight: 20, color: colors.text }}>
                  {r.texto}
                </Text>
              </View>
            );
          })}
          <Toque
            onPress={() => setAbierto(false)}
            accessibilityLabel="Entendido"
            style={{
              height: 44,
              marginTop: 4,
              borderRadius: 12,
              backgroundColor: colors.ground,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.text }}>Entendido</Text>
          </Toque>
        </Animated.View>
      ) : null}
    </View>
  );
}

export default Consejo;
