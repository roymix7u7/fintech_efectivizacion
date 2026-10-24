// Grilla de bancos para elegir en los formularios de tarjeta y cuenta.
//
// El elegido se pinta con el color de su banco: borde, fondo teñido y
// un check en la esquina. Uno "lleno" (ya tiene todo lo que ese banco
// admite) se ve gris y con borde punteado: sigue respondiendo para
// explicar por qué no se puede.
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { bancoDe, colors, fonts } from "../../theme/tokens";
import { BankBadge, matiz } from "./BankBadge";
import { Toque } from "./Toque";

export function GrillaBancos({ bancos, valor, onElegir, columnas = 4, conNombre = true, lleno = () => false }) {
  const ancho = `${100 / columnas}%`;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
      {bancos.map((banco) => {
        const sel = valor === banco;
        const completo = lleno(banco);
        const b = bancoDe(banco);
        return (
          <View key={banco} style={{ width: ancho, padding: 4 }}>
            <Toque
              onPress={() => onElegir(banco)}
              accessibilityLabel={completo ? `${b.name}, ya registrada` : b.name}
              accessibilityState={{ selected: sel }}
              style={{
                height: conNombre ? 82 : 64,
                borderRadius: 18,
                backgroundColor: sel ? matiz(b.color, 0.9) : colors.surface,
                // Grosor fijo: elegir solo cambia el color, nada se corre.
                borderWidth: 2,
                borderStyle: completo ? "dashed" : "solid",
                borderColor: sel ? b.color : completo ? "#C5CFDE" : colors.line,
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              <View style={{ opacity: completo ? 0.35 : 1 }}>
                <BankBadge bank={banco} size={conNombre ? 36 : 34} sombra={!completo} />
              </View>
              {conNombre ? (
                <Text
                  style={{
                    fontFamily: sel ? fonts.heavy : fonts.strong,
                    fontSize: 11,
                    color: completo ? colors.textFaint : colors.text,
                  }}
                  numberOfLines={1}
                >
                  {b.name}
                </Text>
              ) : null}
              {sel ? (
                <View
                  style={{
                    position: "absolute",
                    top: 5,
                    right: 5,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: b.color,
                    borderWidth: 1.5,
                    borderColor: colors.white,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="checkmark" size={11} color={b.onColor} />
                </View>
              ) : completo ? (
                <View style={{ position: "absolute", top: 6, right: 6 }}>
                  <Ionicons name="checkmark-done" size={13} color={colors.textFaint} />
                </View>
              ) : null}
            </Toque>
          </View>
        );
      })}
    </View>
  );
}

export default GrillaBancos;
