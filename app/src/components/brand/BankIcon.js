// Ícono de CUENTA bancaria: edificio con columnas, relleno.
//
// Regla del diseño: tarjeta = rectángulo oscuro con chip; cuenta = este
// edificio en el color del banco. Nunca se usa otra metáfora para una
// cuenta, ni un Ionicon, porque es justo la distinción que el cliente
// tiene que leer de un vistazo antes de enviar su operación.
import Svg, { Path, Rect } from "react-native-svg";

export function BankIcon({ size = 24, color = "#1B2A4A" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2.2 2.4 7.3v2.2h19.2V7.3z" />
      <Rect x={4.4} y={10.6} width={2.6} height={7} rx={0.6} />
      <Rect x={10.7} y={10.6} width={2.6} height={7} rx={0.6} />
      <Rect x={17} y={10.6} width={2.6} height={7} rx={0.6} />
      <Rect x={2.4} y={18.6} width={19.2} height={2.8} rx={0.7} />
    </Svg>
  );
}

export default BankIcon;
