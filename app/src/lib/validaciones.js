/**
 * Validaciones compartidas. Cada funcion devuelve null si el valor es
 * valido, o un texto explicando el problema.
 */

export function validarEmail(email) {
  const v = (email || "").trim();
  if (!v) return "Ingresa tu correo electronico.";
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v))
    return "El correo no tiene un formato valido.";
  return null;
}

export function validarDni(dni) {
  const v = (dni || "").trim();
  if (!v) return "Ingresa tu DNI.";
  if (!/^\d{8}$/.test(v)) return "El DNI debe tener exactamente 8 digitos.";
  if (/^(\d)\1{7}$/.test(v)) return "Ese DNI no es valido.";
  return null;
}

export function validarTelefono(telefono) {
  const v = (telefono || "").trim();
  if (!v) return "Ingresa tu numero de celular.";
  if (!/^9\d{8}$/.test(v))
    return "El celular debe tener 9 digitos y empezar con 9.";
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

export function validarUltimos4(valor) {
  const v = (valor || "").trim();
  if (!/^\d{4}$/.test(v)) return "Ingresa exactamente los 4 ultimos digitos.";
  return null;
}

/** Largo tipico de cuenta de ahorros por banco, para dar mejor mensaje. */
const LARGO_AHORROS = {
  BCP: [14],
  BBVA: [18, 20],
  Interbank: [13, 20],
  Scotiabank: [10, 11, 12],
  BanBif: [12, 14],
};

export function validarCuenta(numero, tipo, banco) {
  const v = (numero || "").replace(/\D/g, "");
  if (!v) return "Ingresa el numero de cuenta.";

  if (tipo === "interbancaria") {
    if (v.length !== 20)
      return "El CCI debe tener exactamente 20 digitos. Revisa tu app del banco.";
    return null;
  }

  const esperados = LARGO_AHORROS[banco];
  if (esperados && !esperados.includes(v.length)) {
    return `Una cuenta de ahorros de ${banco} tiene ${esperados.join(" o ")} digitos y escribiste ${v.length}.`;
  }
  if (v.length < 10 || v.length > 20)
    return "El numero de cuenta debe tener entre 10 y 20 digitos.";
  return null;
}

/** Reglas de contrasena. Devuelve cada regla por separado para la UI. */
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
  if (!r.length) return "La contrasena debe tener al menos 8 caracteres.";
  if (!r.upper) return "La contrasena debe tener al menos una mayuscula.";
  if (!r.lower) return "La contrasena debe tener al menos una minuscula.";
  if (!r.number) return "La contrasena debe tener al menos un numero.";
  if (!r.special) return "La contrasena debe tener al menos un simbolo.";
  if (!r.match) return "Las contrasenas no coinciden.";
  return null;
}

/** Corre varias validaciones en orden y devuelve el primer error. */
export function primerError(...errores) {
  return errores.find((e) => e !== null && e !== undefined) || null;
}
