// Campos de formulario del prototipo final.
//
// Alto 52, radio 14, fondo blanco, borde #DCE3EE. Con foco: borde
// marino de 2 y halo dorado. Válido: borde verde y un check a la
// derecha. Con error: borde rojo, el mensaje con ícono debajo y una
// sacudida corta, pegado al campo que lo causó y no en un aviso que se va.
import { forwardRef, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../theme/tokens";
import { useReducirMovimiento } from "../../lib/movimiento";
import { Toque } from "./Toque";

const CAJA = {
  height: 52,
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: colors.fieldBorder,
  backgroundColor: colors.field,
  flexDirection: "row",
  alignItems: "center",
};

const FOCO = {
  borderWidth: 2,
  borderColor: colors.navy,
  // En Android la sombra no tiñe: ahí el foco lo marca el borde marino.
  shadowColor: colors.gold,
  shadowOpacity: 0.35,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 0 },
};

const VALIDO = { borderColor: colors.success };
const ERROR = { borderWidth: 2, borderColor: colors.error };

const ENTRADA = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  paddingHorizontal: 14,
  fontFamily: fonts.label,
  fontSize: 16,
  color: colors.text,
};

/**
 * Sacude la vista cada vez que `senal` cambia y `activo` es verdadero.
 * La señal es un contador: cada intento fallido de continuar lo sube.
 */
export function useSacudida(senal, activo) {
  const x = useRef(new Animated.Value(0)).current;
  const reducir = useReducirMovimiento();

  useEffect(() => {
    if (!senal || !activo || reducir) return;
    Animated.sequence(
      [-6, 6, -4, 4, 0].map((v) => Animated.timing(x, { toValue: v, duration: 80, useNativeDriver: true })),
    ).start();
  }, [senal]);

  return { transform: [{ translateX: x }] };
}

/** Etiqueta de campo: 14, marino, con una pista opcional a la derecha. */
export function EtiquetaCampo({ texto, pista, pistaOk }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
      <Text style={{ fontFamily: fonts.strong, fontSize: 14, color: colors.text }}>{texto}</Text>
      {pista ? (
        <Text style={{ fontFamily: fonts.heavy, fontSize: 12, color: pistaOk ? colors.successText : colors.text3 }}>
          {pista}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Campo con su etiqueta. `prefijo` dibuja un trozo fijo a la izquierda
 * (+51 en el teléfono); `secreto` agrega el botón de mostrar; `ok`
 * pinta el check verde; `error` el mensaje rojo; `senal` es el contador
 * de intentos que dispara la sacudida. `style` va al texto que se
 * escribe (por ejemplo, el espaciado del DNI).
 *
 * El borde y el foco viven en la caja de afuera, nunca en el TextInput:
 * en Android, cambiarle el estilo al campo que está perdiendo el foco
 * hacía que lo recuperara, y al tocar la contraseña el cursor volvía
 * al correo. Toda la caja es tocable, así que tocar el borde o el
 * relleno también enfoca el campo.
 */
export const Campo = forwardRef(function Campo(
  { etiqueta, pista, error, ok, senal, prefijo, secreto, style, onFocus, onBlur, ...props },
  ref,
) {
  const [foco, setFoco] = useState(false);
  const [visible, setVisible] = useState(false);
  const interno = useRef(null);
  const sacudida = useSacudida(senal, Boolean(error));

  function unirRef(nodo) {
    interno.current = nodo;
    if (typeof ref === "function") ref(nodo);
    else if (ref) ref.current = nodo;
  }

  return (
    <View style={{ gap: 6 }}>
      {etiqueta ? <EtiquetaCampo texto={etiqueta} pista={pista} pistaOk={ok} /> : null}
      <Animated.View style={sacudida}>
        <Pressable
          onPress={() => interno.current?.focus()}
          accessible={false}
          style={[CAJA, ok && VALIDO, foco && FOCO, error && ERROR, secreto && { paddingRight: 4 }]}
        >
          {prefijo ? (
            <Text
              style={{
                paddingLeft: 14,
                paddingRight: 12,
                fontFamily: fonts.strong,
                fontSize: 15,
                color: colors.text2,
                borderRightWidth: 1,
                borderRightColor: colors.fieldBorder,
              }}
            >
              {prefijo}
            </Text>
          ) : null}
          <TextInput
            ref={unirRef}
            {...props}
            secureTextEntry={secreto ? !visible : props.secureTextEntry}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={props.accessibilityLabel || etiqueta}
            onFocus={(e) => {
              setFoco(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFoco(false);
              onBlur?.(e);
            }}
            style={[ENTRADA, prefijo && { paddingHorizontal: 12 }, secreto && { paddingRight: 0 }, style]}
          />
          {secreto ? (
            <Toque
              onPress={() => setVisible((v) => !v)}
              accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.text2} />
            </Toque>
          ) : null}
          {ok ? (
            <View style={{ paddingRight: secreto ? 8 : 14 }} accessibilityLabel="Correcto">
              <Ionicons name="checkmark" size={18} color={colors.success} />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
      {error ? <MensajeError texto={error} /> : null}
    </View>
  );
});

/** Línea roja con ícono, debajo del campo que falló. */
export function MensajeError({ texto }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
      <Text style={{ flex: 1, fontFamily: fonts.strong, fontSize: 12, color: colors.error }}>{texto}</Text>
    </View>
  );
}

/**
 * Código de verificación en seis recuadros. Por debajo es un solo
 * TextInput invisible: así funcionan el pegado y el autocompletado del
 * correo, que con seis campos separados se rompen. `ok` pinta los seis
 * en verde cuando el código ya se verificó.
 */
export function CodigoSeisCajas({ valor, onCambio, autoFocus, ok, deshabilitado }) {
  const ref = useRef(null);
  const [foco, setFoco] = useState(false);
  const digitos = (valor || "").split("");

  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Código de verificación">
      <View style={{ flexDirection: "row", gap: 7 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const actual = !ok && foco && i === Math.min(digitos.length, 5);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 60,
                borderRadius: 16,
                backgroundColor: ok ? colors.successBg : colors.surface,
                borderWidth: ok || actual ? 2 : 1.5,
                borderColor: ok
                  ? colors.success
                  : actual
                    ? colors.navy
                    : digitos[i]
                      ? colors.fieldFilled
                      : colors.fieldBorder,
                alignItems: "center",
                justifyContent: "center",
                ...(actual ? { shadowColor: colors.gold, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null),
              }}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text, fontVariant: ["tabular-nums"] }}>
                {digitos[i] || ""}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={valor}
        onChangeText={(v) => onCambio(v.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        editable={!deshabilitado}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus={autoFocus}
        caretHidden
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, opacity: 0.01 }}
      />
    </Pressable>
  );
}

/**
 * Reglas de la contraseña en lista: círculo vacío que se vuelve check
 * verde al cumplirse. Son las reglas reales que exige la app (las del
 * prototipo eran tres; aquí van las cinco que valida el registro).
 */
export function ReglasClave({ reglas, mostrarCoincide }) {
  const items = [
    { ok: reglas.length, texto: "Mínimo 8 caracteres" },
    { ok: reglas.upper, texto: "Una letra mayúscula" },
    { ok: reglas.lower, texto: "Una letra minúscula" },
    { ok: reglas.number, texto: "Un número" },
    { ok: reglas.special, texto: "Un símbolo (como ! o #)" },
    ...(mostrarCoincide ? [{ ok: reglas.match && reglas.length, texto: "Las contraseñas coinciden" }] : []),
  ];
  return (
    <View style={{ gap: 10, paddingHorizontal: 2, paddingTop: 4 }}>
      {items.map((r) => (
        <View key={r.texto} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {r.ok ? (
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.success,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={12} color={colors.white} />
            </View>
          ) : (
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#C5CFDE" }} />
          )}
          <Text style={{ fontFamily: fonts.strong, fontSize: 13, color: r.ok ? colors.successText : colors.text3 }}>
            {r.texto}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Fuerza de la contraseña en tres segmentos: débil (rojo), aceptable
 * (dorado), fuerte (verde). Es orientativa: lo que decide si se puede
 * continuar son las reglas de arriba.
 */
export function FuerzaClave({ clave }) {
  const p = clave || "";
  const variedad = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  const nivel = !p ? 0 : p.length < 8 ? 1 : variedad >= 3 && p.length >= 10 ? 3 : 2;
  const color = [colors.track, colors.error, colors.gold, colors.success][nivel];
  const texto = ["Escribe una contraseña", "Débil", "Aceptable", "Fuerte"][nivel];

  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Fuerza de la contraseña: ${texto}`}>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: nivel >= n ? color : colors.track }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 12, color: nivel ? (nivel === 2 ? colors.goldText : color) : colors.textFaint }}>
        {texto}
      </Text>
    </View>
  );
}
