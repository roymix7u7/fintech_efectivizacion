// Forma de CUENTA bancaria (100×84): bloque blanco con el edificio del
// banco.
//
//   ok      — edificio en el color del banco + últimos 4 + tipo
//   missing — hueco punteado dorado con el edificio tenue y un "+".
//             Es un botón: el hueco es la invitación a llenarlo.
//
// stackCount > 1 dibuja un mazo con contador ×N.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { bancoDe, colors, fonts } from "../../theme/tokens";
import { BankIcon } from "../brand/BankIcon";

const W = 100;
const H = 84;
const R = 22;

/** kind: "Ahorros" | "CCI" */
export function AccountShape({ bank, last4, kind, missing, onAdd, stackCount = 1 }) {
  const b = bancoDe(bank);

  if (missing) {
    return (
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`Agregar cuenta ${b.name}`}
        style={({ pressed }) => ({
          width: W,
          height: H,
          borderRadius: R,
          backgroundColor: "#FFF8E1",
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: "#D9B84A",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <View>
          <BankIcon size={28} color="#D9B84A" />
          <View
            style={{
              position: "absolute",
              right: -9,
              bottom: -5,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.gold,
              borderWidth: 2,
              borderColor: "#FFF8E1",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={11} color={colors.night} />
          </View>
        </View>

        <Text style={{ fontFamily: fonts.heavy, fontSize: 11, color: colors.goldCreamText }}>
          Cuenta {b.code}
        </Text>
      </Pressable>
    );
  }

  const face = (
    <View
      style={{
        width: W,
        height: H,
        borderRadius: R,
        backgroundColor: "#FFFFFF",
        borderWidth: 1.5,
        borderColor: colors.track,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}
    >
      <BankIcon size={28} color={b.color} />
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 12,
          letterSpacing: 0.7,
          color: colors.text,
        }}
      >
        ···· {last4}
      </Text>
      <Text style={{ fontFamily: fonts.strong, fontSize: 10, color: colors.text3 }}>{kind}</Text>
    </View>
  );

  if (stackCount <= 1) {
    return (
      <View accessibilityLabel={`Cuenta ${b.name} ${kind} terminada en ${last4}`}>{face}</View>
    );
  }

  return (
    <View
      accessibilityLabel={`${stackCount} cuentas ${b.name}`}
      style={{ width: W, height: H, marginTop: 10 }}
    >
      <View
        style={{
          position: "absolute",
          top: -10,
          left: 12,
          right: 12,
          height: H,
          borderRadius: R,
          backgroundColor: "#F1EEE7",
          borderWidth: 1.5,
          borderColor: colors.track,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -5,
          left: 6,
          right: 6,
          height: H,
          borderRadius: R,
          backgroundColor: "#FAF8F4",
          borderWidth: 1.5,
          borderColor: colors.track,
        }}
      />
      {face}

      <View
        style={{
          position: "absolute",
          bottom: -8,
          right: -8,
          minWidth: 24,
          height: 24,
          paddingHorizontal: 7,
          borderRadius: 12,
          backgroundColor: colors.navy,
          borderWidth: 2,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 11, color: "#FFFFFF" }}>
          ×{stackCount}
        </Text>
      </View>
    </View>
  );
}

export default AccountShape;
