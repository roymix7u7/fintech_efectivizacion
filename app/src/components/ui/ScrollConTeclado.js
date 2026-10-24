// ScrollView que no deja que el teclado tape lo que se escribe.
//
// Con Expo 57 Android dibuja la app de borde a borde, y en ese modo la
// ventana ya no se achica cuando sale el teclado (el "resize" de
// app.json deja de tener efecto): el teclado se pone encima. Por eso la
// nota del comprobante, el número de cuenta o la contraseña quedaban
// tapados.
//
// Este ScrollView:
//   1. mide cuánto tapa el teclado de verdad (en iOS la pantalla sí se
//      achica con KeyboardAvoidingView, y entonces no tapa nada),
//   2. deja ese espacio libre al final, para poder llegar al último
//      campo,
//   3. mientras el teclado está abierto, mantiene el campo enfocado
//      encima del teclado: al enfocarlo, al pasar al siguiente y cuando
//      una nota de varias líneas crece.
// Funciona con cualquier TextInput de adentro, sin conectarlos uno a uno.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet, TextInput } from "react-native";

// Espacio entre el campo y el borde del teclado.
const MARGEN = 24;
const REVISAR_MS = 300;

/** Borde superior del teclado, en coordenadas de pantalla. */
function bordeTeclado(e) {
  const c = e?.endCoordinates || {};
  return c.screenY || Dimensions.get("screen").height - (c.height || 0);
}

export const ScrollConTeclado = forwardRef(function ScrollConTeclado(
  { contentContainerStyle, onScroll, children, ...props },
  ref,
) {
  const sv = useRef(null);
  const y = useRef(0);
  const borde = useRef(null);
  const [tapa, setTapa] = useState(0);

  useImperativeHandle(ref, () => sv.current, []);

  useEffect(() => {
    let intervalo = null;
    let espera = null;

    // Cuánto del ScrollView queda debajo del teclado.
    const medirTapa = () => {
      const nativo = sv.current?.getNativeScrollRef?.() || sv.current;
      nativo?.measureInWindow?.((_x, arriba, _w, alto) => {
        if (borde.current == null) return;
        setTapa(Math.max(0, Math.round(arriba + alto - borde.current)));
      });
    };

    // Si el campo enfocado quedó debajo del teclado, sube lo justo.
    const asegurar = () => {
      const campo = TextInput.State?.currentlyFocusedInput?.();
      if (!campo || borde.current == null) return;
      campo.measureInWindow?.((_x, arriba, _w, alto) => {
        const limite = borde.current - MARGEN;
        const abajo = arriba + alto;
        if (abajo > limite + 1) {
          sv.current?.scrollTo({ y: y.current + (abajo - limite), animated: true });
        }
      });
    };

    const abre = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      borde.current = bordeTeclado(e);
      clearTimeout(espera);
      // En iOS se espera a que KeyboardAvoidingView termine de achicar.
      espera = setTimeout(
        () => {
          medirTapa();
          setTimeout(asegurar, 60);
        },
        Platform.OS === "ios" ? 300 : 40,
      );
      clearInterval(intervalo);
      intervalo = setInterval(asegurar, REVISAR_MS);
    });
    const cierra = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      borde.current = null;
      clearTimeout(espera);
      clearInterval(intervalo);
      setTapa(0);
    });

    return () => {
      abre.remove();
      cierra.remove();
      clearTimeout(espera);
      clearInterval(intervalo);
    };
  }, []);

  const base = StyleSheet.flatten(contentContainerStyle) || {};

  return (
    <ScrollView
      ref={sv}
      keyboardShouldPersistTaps="handled"
      {...props}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
      onScroll={(e) => {
        y.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      contentContainerStyle={[base, { paddingBottom: (base.paddingBottom || 0) + tapa }]}
    >
      {children}
    </ScrollView>
  );
});

export default ScrollConTeclado;
