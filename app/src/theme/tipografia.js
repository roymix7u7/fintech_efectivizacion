import { Platform } from "react-native";
import COLORS from "./colors";
import { fonts } from "./tokens";

/**
 * Escala tipografica nombrada por funcion, no por tamano.
 *
 * Antes cada pantalla elegia su propio tamano y peso, asi que el mismo
 * tipo de dato se veia distinto segun donde apareciera. Esto da un
 * unico vocabulario: si es un titulo de pantalla, es TIPO.titulo.
 *
 * Con el rediseño pasa a las dos familias de la marca: Sora para
 * titulos y cifras, Manrope para el resto. Los tamaños se mantienen a
 * proposito: cambiar familia no mueve ninguna pantalla, mientras que
 * cambiar tamaños si, y eso va pantalla por pantalla contra
 * design/DESIGN.md.
 *
 * Ojo: en React Native el peso se elige con la familia, no con
 * fontWeight. Poner los dos deja que el sistema sintetice una negrita
 * falsa sobre una fuente que ya es negrita, y el texto sale sucio. Por
 * eso aqui no hay fontWeight; si una pantalla lo trae suelto, ese
 * texto sigue con la fuente del sistema hasta que se rehaga.
 */

/** Cifras de ancho fijo, para montos, DNI y numeros de cuenta. */
export const CIFRAS = Platform.select({
  ios: { fontVariant: ["tabular-nums"] },
  android: { fontVariant: ["tabular-nums"] },
  default: { fontVariant: ["tabular-nums"] },
});

const TIPO = {
  /** Titulo grande de pantalla. */
  titulo: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.4,
    color: COLORS.text,
  },
  /** Titulo de una seccion dentro de la pantalla. */
  seccion: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: -0.2,
    color: COLORS.text,
  },
  /** Titulo de una tarjeta o fila. */
  tarjeta: {
    fontFamily: fonts.strong,
    fontSize: 15,
    letterSpacing: -0.1,
    color: COLORS.text,
  },
  /** Texto corriente. */
  cuerpo: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
  },
  /** Texto secundario: descripciones, ayudas. */
  apoyo: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  /** Etiqueta en mayusculas sobre un dato. */
  etiqueta: {
    fontFamily: fonts.heavy,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.textLight,
  },
  /** Fecha, contador, nota al pie. */
  micro: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: COLORS.textLight,
  },
  /** Numero destacado. */
  cifra: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.5,
    color: COLORS.text,
    ...CIFRAS,
  },
};

export default TIPO;
