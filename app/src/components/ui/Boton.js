// Botones del diseño (design/DESIGN.md §5).
//
//   principal — marino con texto blanco: la acción normal de la pantalla.
//   dinero    — dorado con texto azul noche. SOLO para lo que mueve
//               dinero: "Nueva solicitud", "Enviar solicitud", "Enviar
//               comprobante". Si todo es dorado, el dorado deja de
//               decir "aquí está tu plata".
//   contorno  — borde marino 1.5, para la alternativa.
//   peligro   — contorno rojo, para salir o cerrar sesión.
//
// Deshabilitado no es un botón gris mudo: lleva escrito el motivo
// ("Adjunta el comprobante para enviar"), porque un botón que no
// responde sin decir por qué es el error más común de formulario.
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, hit, radius } from "../../theme/tokens";
import { Toque } from "./Toque";

const VARIANTES = {
  principal: { bg: colors.navy, fg: colors.white, borde: null },
  dinero: { bg: colors.gold, fg: colors.night, borde: null },
  contorno: { bg: "transparent", fg: colors.navy, borde: colors.navy },
  peligro: { bg: colors.surface, fg: colors.errorText, borde: "#E3B8B3" },
  claro: { bg: colors.white, fg: colors.night, borde: null },
  // Se ve deshabilitado pero responde: al tocarlo la pantalla marca en
  // rojo lo que falta (el "nudge" del prototipo).
  apagado: { bg: colors.muted, fg: colors.disabledText, borde: null },
};

export function Boton({
  titulo,
  onPress,
  variante = "principal",
  icono,
  iconoIzq,
  deshabilitado,
  motivo,
  cargando,
  grande,
  apagado,
  style,
  accessibilityLabel,
}) {
  const v = VARIANTES[apagado ? "apagado" : variante] || VARIANTES.principal;
  const alto = grande ? hit.buttonLg : hit.button;

  if (deshabilitado) {
    return (
      <View
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={motivo || titulo}
        style={[
          {
            height: alto,
            borderRadius: radius.lg + 2,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: motivo ? fonts.strong : fonts.heavy,
            fontSize: motivo ? 13 : 16,
            color: colors.text3,
          }}
        >
          {motivo || titulo}
        </Text>
      </View>
    );
  }

  return (
    <Toque
      onPress={onPress}
      disabled={cargando}
      accessibilityLabel={accessibilityLabel || titulo}
      style={[
        {
          height: alto,
          borderRadius: radius.lg + 2,
          backgroundColor: v.bg,
          borderWidth: v.borde ? 1.5 : 0,
          borderColor: v.borde || "transparent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 16,
        },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {iconoIzq ? <Ionicons name={iconoIzq} size={18} color={v.fg} /> : null}
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.heavy,
              fontSize: grande ? 17 : 16,
              color: v.fg,
            }}
          >
            {titulo}
          </Text>
          {icono ? <Ionicons name={icono} size={18} color={v.fg} /> : null}
        </>
      )}
    </Toque>
  );
}

export default Boton;
