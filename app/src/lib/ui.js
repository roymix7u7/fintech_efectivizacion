import { Alert, Platform } from "react-native";

/**
 * Aviso simple. En web usa window.alert; en nativo usa Alert.alert.
 * React Native define global.window, por eso no sirve preguntar por
 * "typeof window": hay que mirar Platform.OS.
 */
export function alerta(mensaje, titulo = "Aviso") {
  if (Platform.OS === "web") {
    window.alert(mensaje);
    return;
  }
  Alert.alert(titulo, String(mensaje));
}

/**
 * Confirmacion si/no. Devuelve una promesa con true o false.
 * window.confirm NO existe en React Native, por eso en nativo se
 * resuelve con los botones de Alert.alert.
 */
export function confirmar(mensaje, titulo = "Confirmar") {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(mensaje));
  }
  return new Promise((resolve) => {
    Alert.alert(titulo, String(mensaje), [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "Aceptar", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

/** Traduce los errores mas comunes de Supabase a algo legible. */
export function mensajeError(error) {
  if (!error) return "Ocurrio un error inesperado.";
  const msg = error.message || String(error);

  const traducciones = {
    "Invalid login credentials": "Correo o contrasena incorrectos.",
    "Email not confirmed": "Debes confirmar tu correo antes de ingresar.",
    "User already registered": "Ese correo ya esta registrado.",
    "Token has expired or is invalid": "El codigo expiro o no es valido.",
    "For security purposes, you can only request this after 60 seconds":
      "Espera un minuto antes de pedir otro codigo.",
  };
  for (const [clave, texto] of Object.entries(traducciones)) {
    if (msg.includes(clave)) return texto;
  }
  // Los indices unicos de la base aparecen aqui por su nombre, asi que
  // se traducen a algo que el usuario entienda.
  if (msg.includes("perfiles_cliente_dni_unico"))
    return "Ese DNI ya esta registrado en otra cuenta.";
  if (msg.includes("users_email_key"))
    return "Ese correo ya tiene una cuenta.";
  if (msg.includes("tarjetas_cliente_banco_ultimos4_unico"))
    return "Ya tienes registrada esa tarjeta.";
  if (msg.includes("cuentas_numero_unico"))
    return "Ese numero de cuenta ya esta registrado.";
  if (msg.includes("cuentas_cliente_banco_tipo_unico"))
    return "Ya tienes una cuenta de ese tipo en ese banco.";
  if (msg.includes("solicitudes_codigo_key"))
    return "Hubo un cruce al generar el codigo. Intentalo de nuevo.";
  if (msg.includes("duplicate key")) return "Ese registro ya existe.";
  if (msg.includes("row-level security") || msg.includes("violates"))
    return "No tienes permiso para realizar esta accion.";
  if (msg.includes("Network request failed"))
    return "Sin conexion. Revisa tu internet e intentalo de nuevo.";
  return msg;
}
