import { Platform } from "react-native";
import COLORS from "./colors";

/**
 * Escala tipografica nombrada por funcion, no por tamano.
 *
 * Antes cada pantalla elegia su propio tamano y peso, asi que el mismo
 * tipo de dato se veia distinto segun donde apareciera. Esto da un
 * unico vocabulario: si es un titulo de pantalla, es TIPO.titulo.
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
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: COLORS.text,
  },
  /** Titulo de una seccion dentro de la pantalla. */
  seccion: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: COLORS.text,
  },
  /** Titulo de una tarjeta o fila. */
  tarjeta: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: COLORS.text,
  },
  /** Texto corriente. */
  cuerpo: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
  },
  /** Texto secundario: descripciones, ayudas. */
  apoyo: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  /** Etiqueta en mayusculas sobre un dato. */
  etiqueta: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.textLight,
  },
  /** Fecha, contador, nota al pie. */
  micro: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  /** Numero destacado. */
  cifra: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: COLORS.text,
    ...CIFRAS,
  },
};

export default TIPO;
