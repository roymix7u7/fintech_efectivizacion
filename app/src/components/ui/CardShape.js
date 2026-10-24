// Forma de TARJETA de crédito (132×84).
//
// Estados:
//   verified — azul noche + chip dorado + luz del color del banco
//   pending  — contorno punteado azul claro + reloj en la esquina
//   rejected — gris + ✕ roja (va en "Otros estados", en versión mini)
//
// stackCount > 1 dibuja un mazo con contador ×N, para varias tarjetas
// del mismo banco.
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { bancoDe, colors, fonts, radius, shadow } from "../../theme/tokens";
import { AmbientGlow } from "./AmbientGlow";

const W = 132;
const H = 84;

function Chip({ muted }) {
  return (
    <View
      style={{
        width: 24,
        height: 18,
        borderRadius: 5,
        backgroundColor: muted ? "#C9D2E6" : colors.gold,
      }}
    />
  );
}

function Face({ bank, last4, state = "verified" }) {
  const b = bancoDe(bank);

  if (state === "pending" || state === "rejected") {
    const pending = state === "pending";
    return (
      <View
        style={{
          width: W,
          height: H,
          borderRadius: radius.md,
          padding: 12,
          justifyContent: "space-between",
          backgroundColor: pending ? "#EEF1F7" : "#D5D9E1",
          borderWidth: pending ? 1.5 : 0,
          borderStyle: "dashed",
          borderColor: "#9AA8C6",
        }}
      >
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Chip muted />
          <Text
            style={{
              fontFamily: fonts.heavy,
              fontSize: 10,
              color: pending ? colors.navyLight : colors.text2,
            }}
          >
            {b.code}
          </Text>
        </View>

        <Text
          style={{
            fontFamily: fonts.strong,
            fontSize: 13,
            letterSpacing: 1.8,
            color: pending ? colors.navyLight : colors.text2,
          }}
        >
          ···· {last4}
        </Text>

        {/* El distintivo sale de la esquina: así se ve aunque la
            tarjeta esté en un mazo y tapada por la de encima. */}
        <View
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: pending ? colors.navyLight : colors.error,
            borderWidth: 2.5,
            borderColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={pending ? "time-outline" : "close"} size={14} color="#FFFFFF" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: W,
          height: H,
          borderRadius: radius.md,
          backgroundColor: colors.night,
          padding: 12,
          justifyContent: "space-between",
          overflow: "hidden",
        },
        shadow.creditCard,
      ]}
    >
      {/* La luz del color del banco es lo que distingue una tarjeta de
          otra sin escribir el nombre entero. */}
      <AmbientGlow lights={[{ color: b.color, opacity: 0.9, size: 150, top: -75, right: -55 }]} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Chip />
        <Text style={{ fontFamily: fonts.heavy, fontSize: 10, color: "#FFFFFF" }}>{b.code}</Text>
      </View>

      <Text
        style={{
          fontFamily: fonts.strong,
          fontSize: 13,
          letterSpacing: 1.8,
          color: "#FFFFFF",
        }}
      >
        ···· {last4}
      </Text>
    </View>
  );
}

export function CardShape(props) {
  const n = props.stackCount ?? 1;
  const b = bancoDe(props.bank);
  const label = `Tarjeta ${b.name} terminada en ${props.last4}`;

  if (n <= 1) {
    return (
      <View accessibilityLabel={label}>
        <Face {...props} />
      </View>
    );
  }

  return (
    <View accessibilityLabel={`${n} tarjetas ${b.name}`} style={{ width: W, height: H, marginTop: 10 }}>
      <View
        style={{
          position: "absolute",
          top: -10,
          left: 12,
          right: 12,
          height: H,
          borderRadius: radius.md,
          backgroundColor: "#3F4D70",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -5,
          left: 6,
          right: 6,
          height: H,
          borderRadius: radius.md,
          backgroundColor: "#273556",
        }}
      />
      <Face {...props} />

      <View
        style={{
          position: "absolute",
          bottom: -8,
          right: -8,
          minWidth: 24,
          height: 24,
          paddingHorizontal: 7,
          borderRadius: 12,
          backgroundColor: colors.gold,
          borderWidth: 2,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 11, color: colors.night }}>×{n}</Text>
      </View>
    </View>
  );
}

export default CardShape;
