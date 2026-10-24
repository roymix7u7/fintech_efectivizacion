// Paleta de la app, derivada de los tokens del diseño.
//
// Los nombres de aquí son los que ya usan las ~700 referencias de las
// pantallas (COLORS.primary, COLORS.textLight...). En vez de tocarlas
// una por una, este archivo las traduce a tokens.js, que es la fuente
// de verdad. Así el rediseño entra por la base y las pantallas que
// todavía no se han rehecho ya respiran la paleta nueva.
//
// Para código nuevo, importa tokens.js directamente: tiene el
// vocabulario completo (cristal, sombras, movimiento, bancos) y los
// nombres que usa design/DESIGN.md.
import { colors as t } from "./tokens";

const COLORS = {
  // Marca
  primary: t.navy,
  primaryLight: t.navyLight,
  primaryDark: t.night,
  secondary: t.gold,
  secondaryLight: t.goldCream,
  // Más oscuro que el dorado anterior: sobre fondo claro el #C49B00
  // no llegaba al contraste mínimo para texto.
  secondaryDark: t.goldText,

  // Superficies. El fondo pasa de gris azulado a porcelana cálida, que
  // es lo que diferencia la base del rediseño.
  white: t.white,
  background: t.ground,
  card: t.surface,
  inputBg: t.field,

  // Texto. textLight era #94A3BB y no pasaba AA en tamaños chicos;
  // ahora es el mínimo que el diseño permite para texto útil.
  text: t.text,
  textSecondary: t.text2,
  textLight: t.text3,

  // Bordes, ahora cálidos para que no corten el fondo porcelana.
  border: t.line,
  borderLight: t.lineSoft,

  // Estados
  success: t.success,
  successLight: t.successBg,
  error: t.error,
  errorLight: t.errorBg,
  // El diseño no tiene un "warning" propio: lo importante se dice en
  // dorado (ver alertLevel.importante en tokens.js).
  warning: t.gold,
  warningLight: t.goldCream,
};

export default COLORS;
