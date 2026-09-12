import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * binario.js y validaciones.js estan escritos como modulos ES, pero
 * app/package.json no declara "type": "module", asi que Node los leeria
 * como CommonJS y fallaria. Como ninguno de los dos importa nada, se
 * cargan aqui como data URI. Asi no hay que tocar la configuracion de
 * Expo ni mantener copias del codigo.
 */
const carpetaLib = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
);

async function cargar(nombre) {
  const fuente = fs.readFileSync(path.join(carpetaLib, nombre), "utf8");
  const base64 = Buffer.from(fuente, "utf8").toString("base64");
  return import("data:text/javascript;base64," + base64);
}

const { base64ToArrayBuffer, extraerPath } = await cargar("binario.js");
const {
  validarEmail,
  validarDni,
  validarTelefono,
  validarNombre,
  validarUltimos4,
  validarCuenta,
  validarPassword,
  reglasPassword,
  primerError,
} = await cargar("validaciones.js");

// ─────────────────────────────────────────────────────────────
// base64ToArrayBuffer
// Es la pieza mas critica: si falla, los comprobantes suben
// corruptos y el admin no puede revisar nada.
// ─────────────────────────────────────────────────────────────
test("base64: texto de ida y vuelta", () => {
  for (const texto of ["", "a", "ab", "abc", "hola mundo", "ñáé", "x".repeat(1000)]) {
    const b64 = Buffer.from(texto, "utf8").toString("base64");
    const salida = Buffer.from(base64ToArrayBuffer(b64)).toString("utf8");
    assert.equal(salida, texto, `fallo con "${texto.slice(0, 20)}"`);
  }
});

test("base64: bytes binarios exactos, que es el caso de un JPEG", () => {
  for (const n of [1, 2, 3, 255, 1024, 4097, 100000]) {
    const origen = Buffer.from(
      Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256),
    );
    const salida = Buffer.from(base64ToArrayBuffer(origen.toString("base64")));
    assert.equal(salida.length, n, `largo distinto con ${n} bytes`);
    assert.ok(salida.equals(origen), `contenido distinto con ${n} bytes`);
  }
});

test("base64: ignora saltos de linea y espacios", () => {
  const origen = Buffer.from("comprobante de prueba", "utf8");
  const sucio = origen.toString("base64").replace(/(.{4})/g, "$1\n ");
  assert.ok(Buffer.from(base64ToArrayBuffer(sucio)).equals(origen));
});

test("base64: entrada vacia o nula no revienta", () => {
  assert.equal(base64ToArrayBuffer("").byteLength, 0);
  assert.equal(base64ToArrayBuffer(null).byteLength, 0);
});

// ─────────────────────────────────────────────────────────────
// extraerPath: compatibilidad con las filas antiguas
// ─────────────────────────────────────────────────────────────
test("extraerPath: devuelve el path tal cual si ya es un path", () => {
  assert.equal(extraerPath("comprobantes", "uid/123.jpg"), "uid/123.jpg");
});

test("extraerPath: recupera el path de una URL firmada antigua", () => {
  const url =
    "https://x.supabase.co/storage/v1/object/sign/comprobantes/uid/123.jpg?token=abc";
  assert.equal(extraerPath("comprobantes", url), "uid/123.jpg");
});

test("extraerPath: desescapa caracteres codificados", () => {
  const url = "https://x.co/sign/kyc-documentos/uid/mi%20foto.jpg?t=1";
  assert.equal(extraerPath("kyc-documentos", url), "uid/mi foto.jpg");
});

test("extraerPath: null cuando no hay valor o el bucket no aparece", () => {
  assert.equal(extraerPath("comprobantes", null), null);
  assert.equal(extraerPath("comprobantes", ""), null);
  assert.equal(extraerPath("comprobantes", "https://x.co/sign/otro/u/1.jpg"), null);
});

// ─────────────────────────────────────────────────────────────
// Validaciones de formulario
// ─────────────────────────────────────────────────────────────
test("DNI: ocho digitos y no todos iguales", () => {
  assert.equal(validarDni("70123456"), null);
  assert.ok(validarDni("7012345"));
  assert.ok(validarDni("701234567"));
  assert.ok(validarDni("11111111"));
  assert.ok(validarDni("7012345a"));
  assert.ok(validarDni(""));
});

test("Email: exige dominio con punto", () => {
  assert.equal(validarEmail("roy@mail.com"), null);
  assert.equal(validarEmail("  roy@mail.com  "), null);
  assert.ok(validarEmail("roy@mail"));
  assert.ok(validarEmail("roy.mail.com"));
  assert.ok(validarEmail("   "));
});

test("Celular: nueve digitos que empiezan en 9", () => {
  assert.equal(validarTelefono("987654321"), null);
  assert.ok(validarTelefono("187654321"));
  assert.ok(validarTelefono("98765432"));
});

test("Nombres: acepta tildes y enie, rechaza numeros", () => {
  assert.equal(validarNombre("Jose Maria", "nombres"), null);
  assert.equal(validarNombre("Iñigo Muñóz", "apellidos"), null);
  assert.equal(validarNombre("O'Brien", "apellidos"), null);
  assert.ok(validarNombre("Jose2", "nombres"));
  assert.ok(validarNombre("J", "nombres"));
});

test("Ultimos 4 digitos de la tarjeta", () => {
  assert.equal(validarUltimos4("5678"), null);
  assert.ok(validarUltimos4("567"));
  assert.ok(validarUltimos4("56789"));
});

test("CCI: exactamente 20 digitos", () => {
  assert.equal(validarCuenta("00219100234567890123", "interbancaria", "BCP"), null);
  assert.ok(validarCuenta("0021910023456789012", "interbancaria", "BCP"));
  assert.ok(validarCuenta("", "interbancaria", "BCP"));
});

test("Cuenta de ahorros: respeta el largo de cada banco", () => {
  assert.equal(validarCuenta("19123456789012", "ahorros", "BCP"), null);
  assert.ok(validarCuenta("191234567890", "ahorros", "BCP"));
  // Un banco fuera de la lista solo comprueba el rango general.
  assert.equal(validarCuenta("1234567890123", "ahorros", "Otros"), null);
  assert.ok(validarCuenta("123", "ahorros", "Otros"));
});

test("Contrasena: cubre las cinco reglas y la confirmacion", () => {
  assert.equal(validarPassword("Hola123!", "Hola123!"), null);
  assert.ok(validarPassword("Hola1234", "Hola1234"), "falta simbolo");
  assert.ok(validarPassword("hola123!", "hola123!"), "falta mayuscula");
  assert.ok(validarPassword("HOLA123!", "HOLA123!"), "falta minuscula");
  assert.ok(validarPassword("HolaHola!", "HolaHola!"), "falta numero");
  assert.ok(validarPassword("Ho1!", "Ho1!"), "muy corta");
  assert.ok(validarPassword("Hola123!", "Hola123?"), "no coinciden");
});

test("Contrasena: el guion bajo cuenta como simbolo", () => {
  // La version anterior usaba \W, que no considera simbolo al guion
  // bajo, asi que rechazaba contrasenas validas como Hola123_.
  assert.equal(reglasPassword("Hola123_", "Hola123_").special, true);
  assert.equal(validarPassword("Hola123_", "Hola123_"), null);
});

test("primerError devuelve el primer problema encontrado", () => {
  assert.equal(primerError(null, "b", "c"), "b");
  assert.equal(primerError(null, null), null);
  assert.equal(primerError(), null);
});
