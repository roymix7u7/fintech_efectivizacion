// Selector de dos o más opciones con un indicador marino que se desliza
// (DNI | Carnet, Ahorros | CCI).
//
// Cada opción lleva un título corto y un detalle debajo: así el texto
// largo ("Carnet de extranjería") no parte la línea ni cambia el alto
// del control al elegir. El color del texto acompaña al indicador en
// lugar de saltar antes de que llegue.
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../theme/tokens";
import { CURVA, useReducirMovimiento } from "../../lib/movimiento";
import { Toque } from "./Toque";

const MARGEN = 4;

/**
 * opciones: [{ clave, titulo, detalle, apagado, accesible }]
 *   apagado  — se ve gris pero responde (para explicar por qué no).
 */
export function Segmentado({ opciones, valor, onCambio, accessibilityLabel }) {
  const reducir = useReducirMovimiento();
  const [ancho, setAncho] = useState(0);
  const indice = Math.max(0, opciones.findIndex((o) => o.clave === valor));
  const pos = useRef(new Animated.Value(indice)).current;

  useEffect(() => {
    Animated.timing(pos, {
      toValue: indice,
      duration: reducir ? 0 : 380,
      easing: CURVA,
      useNativeDriver: true,
    }).start();
  }, [indice]);

  const n = opciones.length;
  const brillo = (i) =>
    pos.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: "clamp" });

  const contenido = (o, activo) => (
    <>
      {/* En un teléfono angosto el texto se achica un poco antes que
          cortarse con "…". */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[s.titulo, activo ? { color: colors.white } : o.apagado ? { color: colors.textFaint } : null]}
      >
        {o.titulo}
      </Text>
      {o.detalle ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[s.detalle, activo ? { color: "rgba(255,255,255,0.78)" } : o.apagado ? { color: colors.textFaint } : null]}
        >
          {o.detalle}
        </Text>
      ) : null}
    </>
  );

  return (
    <View
      style={s.caja}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setAncho((e.nativeEvent.layout.width - MARGEN * 2) / n)}
    >
      {ancho ? (
        <Animated.View
          style={[
            s.indicador,
            {
              width: ancho,
              transform: [{ translateX: pos.interpolate({ inputRange: [0, Math.max(1, n - 1)], outputRange: [0, ancho * Math.max(1, n - 1)] }) }],
            },
          ]}
        />
      ) : null}
      {opciones.map((o, i) => (
        <Toque
          key={o.clave}
          onPress={() => onCambio(o.clave)}
          accessibilityRole="radio"
          accessibilityState={{ checked: o.clave === valor }}
          accessibilityLabel={o.accesible || o.titulo}
          escala={0.98}
          style={s.opcion}
        >
          {contenido(o, false)}
          {/* Capa blanca encima: se enciende a medida que llega el
              indicador, con el mismo movimiento. */}
          <Animated.View pointerEvents="none" style={[s.capa, { opacity: brillo(i) }]}>
            {contenido(o, true)}
          </Animated.View>
        </Toque>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  caja: { flexDirection: "row", padding: MARGEN, borderRadius: 18, backgroundColor: colors.muted },
  indicador: {
    position: "absolute",
    top: MARGEN,
    bottom: MARGEN,
    left: MARGEN,
    borderRadius: 14,
    backgroundColor: colors.navy,
    shadowColor: colors.night,
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
    // Sin elevation: en Android sube al indicador por encima de sus
    // hermanos y tapa el texto de las opciones.
  },
  opcion: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 1 },
  // Posición escrita a mano: RN 0.86 ya no trae StyleSheet.absoluteFillObject
  // y al expandirlo no llegaba nada (la capa se apilaba debajo del texto).
  capa: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 1 },
  titulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text2, textAlign: "center" },
  detalle: { fontFamily: fonts.label, fontSize: 11, color: colors.text3, textAlign: "center" },
});

export default Segmentado;
