// Sello cuadrado del banco, para listas y selectores.
//
// Degradado en el color del banco, un brillo arriba y un aro tenue
// abajo: se lee como una pieza y no como un cuadrado plano con letras.
// No usa los logos reales (son marcas registradas): el color y la
// sigla bastan para reconocerlo.
//
// Va siempre acompañado del nombre o de los dígitos: el color del banco
// nunca identifica solo. Por eso el sello se oculta a los lectores de
// pantalla, que leen el texto de al lado.
import { useId } from "react";
import { Platform, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Rect, Stop } from "react-native-svg";
import { bancoDe, fonts } from "../../theme/tokens";

/** Mezcla un color hex con blanco (t > 0) o con negro (t < 0). */
export function matiz(hex, t) {
  const n = parseInt(hex.replace("#", ""), 16);
  const canal = (c) => Math.round(t > 0 ? c + (255 - c) * t : c * (1 + t));
  const r = canal((n >> 16) & 255);
  const g = canal((n >> 8) & 255);
  const b = canal(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** bank: clave del token o el nombre tal como viene de la base. */
export function BankBadge({ bank, size = 40, sombra = size >= 36 }) {
  const b = bancoDe(bank);
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radio = Math.round(size * 0.3);
  const largo = b.code.length;
  // Sigla de 4 letras (BBVA) un poco más chica para que no toque los bordes.
  const letra = Math.max(8, Math.round(size * (largo >= 4 ? 0.22 : 0.27)));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radio,
        ...(sombra && Platform.OS === "ios"
          ? { shadowColor: b.color, shadowOpacity: 0.32, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }
          : null),
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={matiz(b.color, 0.16)} />
            <Stop offset="1" stopColor={matiz(b.color, -0.2)} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} rx={radio} fill={`url(#${id})`} />
        {/* Aro tenue abajo a la derecha, como el canto de una moneda. */}
        <Circle
          cx={size * 0.95}
          cy={size * 1.02}
          r={size * 0.5}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.14}
          strokeWidth={Math.max(1, size * 0.06)}
        />
        {/* Brillo superior. */}
        <Ellipse cx={size * 0.32} cy={size * 0.02} rx={size * 0.62} ry={size * 0.34} fill="#FFFFFF" fillOpacity={0.13} />
        <Rect
          x={0.5}
          y={0.5}
          width={size - 1}
          height={size - 1}
          rx={radio - 0.5}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.22}
          strokeWidth={1}
        />
      </Svg>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {/* onColor y no blanco fijo: sobre el naranja del BCP el blanco
            no pasa contraste, así que ahí el texto va oscuro. */}
        <Text
          numberOfLines={1}
          style={{
            color: b.onColor,
            fontFamily: fonts.displayBold,
            fontSize: letra,
            letterSpacing: largo >= 4 ? -0.2 : 0.2,
          }}
        >
          {b.code}
        </Text>
      </View>
    </View>
  );
}

export default BankBadge;
