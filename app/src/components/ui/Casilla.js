// Casilla para aceptar algo (términos, autorización de fotos).
//
// Toda la fila se puede tocar, no solo el cuadrito. El texto acepta
// enlaces (un <Text onPress> adentro) que abren el documento sin marcar
// la casilla.
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../theme/tokens";
import { useSacudida } from "./Campos";
import { Toque } from "./Toque";

export function Casilla({ marcada, onCambio, children, error, senal, accessibilityLabel }) {
  const sacudida = useSacudida(senal, error);
  return (
    <Animated.View style={sacudida}>
      <Toque
        onPress={() => onCambio(!marcada)}
        escala={0.99}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcada }}
        accessibilityLabel={accessibilityLabel}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          padding: 12,
          borderRadius: 16,
          // Grosor fijo: marcar solo cambia el color.
          borderWidth: 1.5,
          borderColor: error ? colors.error : marcada ? colors.success : colors.line,
          backgroundColor: marcada ? colors.successBg : colors.surface,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: marcada ? colors.success : error ? colors.error : colors.fieldBorder,
            backgroundColor: marcada ? colors.success : colors.surface,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {marcada ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text }}>
          {children}
        </Text>
      </Toque>
    </Animated.View>
  );
}

/** Enlace dentro del texto de una casilla. */
export function Enlace({ children, onPress }) {
  return (
    <Text
      onPress={onPress}
      suppressHighlighting
      style={{ fontFamily: fonts.heavy, color: colors.navy, textDecorationLine: "underline" }}
    >
      {children}
    </Text>
  );
}

export default Casilla;
