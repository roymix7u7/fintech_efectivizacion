// Isotipo ATK vectorizado (A dorada, T y K blancas). Úsalo solo sobre
// azul noche.
//
// Es vectorial y no el PNG de assets porque escala sin bordes borrosos
// y permite teñir las letras. El PNG sigue sirviendo para el icono de
// la app y el splash, que los pide el sistema como imagen.
import Svg, { Polygon } from "react-native-svg";

export function Logo({ width = 56, letterColor = "#FFFFFF", accent = "#E8B800" }) {
  const height = Math.round((width * 290) / 672);
  return (
    <Svg
      width={width}
      height={height}
      viewBox="218 14 672 290"
      accessibilityLabel="ATK"
      accessibilityRole="image"
    >
      <Polygon fill={accent} points="225,296 357,22 490,296 431,296 357,138 284,296" />
      <Polygon fill={letterColor} points="450,22 645,22 645,80 577,80 577,296 512,296 512,80 450,80" />
      <Polygon
        fill={letterColor}
        points="672,22 732,22 732,160 806,22 876,22 789,158 882,296 812,296 755,205 732,232 732,296 672,296"
      />
    </Svg>
  );
}

export default Logo;
