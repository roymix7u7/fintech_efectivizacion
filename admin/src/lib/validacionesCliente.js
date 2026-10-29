/**
 * Validaciones del registro de clientes. Son las mismas reglas que la
 * app (app/src/lib/validaciones.js) y que exige la base: si cambia una,
 * hay que cambiarla en los dos lados. Cada función devuelve null si el
 * valor es válido, o el texto del problema.
 */

export function validarEmail(email) {
  const v = (email || "").trim();
  if (!v) return "Ingresa tu correo electrónico.";
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v))
    return "El correo no tiene un formato válido.";
  return null;
}

export function validarDni(dni) {
  const v = (dni || "").trim();
  if (!v) return "Ingresa tu DNI.";
  if (!/^\d{8}$/.test(v)) return "El DNI debe tener exactamente 8 dígitos.";
  if (/^(\d)\1{7}$/.test(v)) return "Ese DNI no es válido.";
  return null;
}

/** DNI de 8 dígitos o carnet de extranjería de 9. */
export function validarDocumento(tipo, numero) {
  if (tipo !== "ce") return validarDni(numero);
  const v = (numero || "").trim();
  if (!v) return "Ingresa tu número de carnet.";
  if (!/^\d{9}$/.test(v)) return "El carnet de extranjería tiene 9 dígitos.";
  if (/^(\d)\1{8}$/.test(v)) return "Ese carnet no es válido.";
  return null;
}

export const largoDocumento = (tipo) => (tipo === "ce" ? 9 : 8);

export function validarTelefono(telefono) {
  const v = (telefono || "").trim();
  if (!v) return "Ingresa tu número de celular.";
  if (!/^9\d{8}$/.test(v))
    return "El celular debe tener 9 dígitos y empezar con 9.";
  return null;
}

export function validarNombre(valor, campo) {
  const v = (valor || "").trim();
  if (!v) return `Ingresa tus ${campo}.`;
  if (v.length < 2) return `Tus ${campo} son demasiado cortos.`;
  if (v.length > 60) return `Tus ${campo} son demasiado largos.`;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/.test(v))
    return `Tus ${campo} solo pueden tener letras.`;
  return null;
}

/** Cada regla de la contraseña por separado, para mostrarlas en pantalla. */
export function reglasPassword(password, confirmacion) {
  const p = password || "";
  return {
    length: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
    match: p.length > 0 && p === confirmacion,
  };
}

export function validarPassword(password, confirmacion) {
  const r = reglasPassword(password, confirmacion);
  if (!r.length) return "La contraseña debe tener al menos 8 caracteres.";
  if (!r.upper) return "La contraseña debe tener al menos una mayúscula.";
  if (!r.lower) return "La contraseña debe tener al menos una minúscula.";
  if (!r.number) return "La contraseña debe tener al menos un número.";
  if (!r.special) return "La contraseña debe tener al menos un símbolo.";
  if (!r.match) return "Las contraseñas no coinciden.";
  return null;
}

/**
 * Para números que se escriben dígito a dígito: mientras falta largo
 * dice cuántos faltan; completo, el motivo real.
 */
export function errorDeDigitos(valor, largo, validar) {
  if (valor.length > 0 && valor.length < largo) {
    const faltan = largo - valor.length;
    return `Faltan ${faltan} dígito${faltan === 1 ? "" : "s"}.`;
  }
  return validar(valor);
}

export function validarUltimos4(valor) {
  if (!/^\d{4}$/.test((valor || "").trim()))
    return "Ingresa exactamente los 4 últimos dígitos.";
  return null;
}

/** Largo típico de una cuenta de ahorros por banco, para dar un mejor mensaje. */
export const LARGO_AHORROS = {
  BCP: [14],
  BBVA: [18, 20],
  Interbank: [13, 20],
  Scotiabank: [10, 11, 12],
  BanBif: [12, 14],
};

export function validarCuenta(numero, tipo, banco) {
  const v = (numero || "").replace(/\D/g, "");
  if (!v) return "Ingresa el número de cuenta.";
  if (tipo === "interbancaria") {
    if (v.length !== 20)
      return "El CCI debe tener exactamente 20 dígitos. Revísalo en la app de tu banco.";
    return null;
  }
  const esperados = LARGO_AHORROS[banco];
  if (esperados && !esperados.includes(v.length)) {
    return `Una cuenta de ahorros ${banco} tiene ${esperados.join(" o ")} dígitos y escribiste ${v.length}.`;
  }
  if (v.length < 10 || v.length > 20)
    return "El número de cuenta debe tener entre 10 y 20 dígitos.";
  return null;
}
