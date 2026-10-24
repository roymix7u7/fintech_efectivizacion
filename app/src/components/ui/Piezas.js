// Piezas pequeñas que se repiten en todas las pantallas del rediseño.
// Juntas en un archivo porque cada una son pocas líneas y siempre se
// importan de a varias.
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radius, type } from "../../theme/tokens";
import { GlassPanel } from "./GlassPanel";
import { Toque } from "./Toque";

/** Etiqueta de bloque: 11 px, mayúsculas, espaciada. Una por bloque. */
export function Etiqueta({ children, style, color }) {
  return (
    <Text
      style={[
        { ...type.section, color: color || colors.text3, textTransform: "uppercase" },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Título grande de pantalla, en Sora. */
export function TituloPantalla({ children, style, tamano = 33 }) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.display,
          fontSize: tamano,
          lineHeight: tamano + 2,
          letterSpacing: -0.6,
          color: colors.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Tarjeta blanca con el borde cálido del diseño. */
export function Tarjeta({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.xxl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Botón cuadrado de 44×44 para menú, volver o campana.
 *
 *   claro   — blanco con borde, sobre el fondo porcelana.
 *   noche   — cristal, dentro de una cabecera azul noche.
 */
export function BotonIcono({ icono, onPress, variante = "claro", accessibilityLabel, punto, tamano = 20 }) {
  const contenido = (
    <>
      <Ionicons
        name={icono}
        size={tamano}
        color={variante === "noche" ? colors.white : colors.text}
      />
      {punto ? (
        <View
          style={{
            position: "absolute",
            top: 9,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.gold,
          }}
        />
      ) : null}
    </>
  );

  return (
    <Toque onPress={onPress} accessibilityLabel={accessibilityLabel} hitSlop={4}>
      {variante === "noche" ? (
        <GlassPanel
          variant="onNight"
          radius={14}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          {contenido}
        </GlassPanel>
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {contenido}
        </View>
      )}
    </Toque>
  );
}

/**
 * Mini tarjeta de crédito (30×20) para contadores y leyendas.
 * color: el del banco, para las filas de "Mis bancos"; sin él, noche.
 */
export function MiniTarjeta({ ancho = 30, alto = 20, claro, color }) {
  return (
    <View
      style={{
        width: ancho,
        height: alto,
        borderRadius: 5,
        overflow: "hidden",
        backgroundColor: claro ? "rgba(255,255,255,0.14)" : color || colors.night,
        borderWidth: claro ? 1 : 0,
        borderColor: "rgba(255,255,255,0.35)",
      }}
    >
      {color ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: alto * 0.2,
            height: alto * 0.14,
            backgroundColor: "rgba(255,255,255,0.22)",
          }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          top: alto * 0.22,
          left: ancho * 0.14,
          width: ancho * 0.27,
          height: alto * 0.32,
          borderRadius: 2,
          backgroundColor: colors.gold,
        }}
      />
    </View>
  );
}

/** Indicador de pasos en segmentos (registro, nueva solicitud). */
export function Segmentos({ total, actual, completos }) {
  return (
    <View style={{ flexDirection: "row", gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => {
        const hecho = completos != null ? i < completos : i < actual - 1;
        const enCurso = completos == null && i === actual - 1;
        return (
          <View
            key={i}
            style={{
              flex: completos != null ? undefined : 1,
              width: completos != null ? 28 : undefined,
              height: completos != null ? 6 : 5,
              borderRadius: 3,
              backgroundColor: enCurso || (completos != null && hecho)
                ? colors.gold
                : hecho
                  ? colors.navy
                  : colors.track,
            }}
          />
        );
      })}
    </View>
  );
}

/** Fila de dato: etiqueta a la izquierda, valor a la derecha. */
export function FilaDato({ etiqueta, valor, ultima }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 13,
        gap: 12,
        borderBottomWidth: ultima ? 0 : 1,
        borderBottomColor: colors.lineSoft,
      }}
    >
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.text3 }}>
        {etiqueta}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.strong, fontSize: 14, color: colors.text, flexShrink: 1, textAlign: "right" }}
      >
        {valor}
      </Text>
    </View>
  );
}
