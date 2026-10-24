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
  validarDocumento,
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

test("Carnet de extranjeria: nueve digitos", () => {
  assert.equal(validarDocumento("ce", "001234567"), null);
  assert.ok(validarDocumento("ce", "00123456"));
  assert.ok(validarDocumento("ce", "999999999"));
  assert.equal(validarDocumento("dni", "70123456"), null);
  assert.ok(validarDocumento("dni", "001234567"));
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

// ─────────────────────────────────────────────────────────────
//  fechas.js: divisores del historial
//  Las fechas se construyen en hora local, igual que las ve el
//  telefono, para que la prueba no dependa de la zona horaria.
// ─────────────────────────────────────────────────────────────
const { claveDia, tituloDia, agruparPorDia, hora } = await cargar("fechas.js");

// "Ahora" fijo: 15 de septiembre de 2026, 08:00 local.
const AHORA = new Date(2026, 8, 15, 8, 0);

test("hoy y ayer se deciden por calendario, no por 24 horas", () => {
  assert.equal(tituloDia(new Date(2026, 8, 15, 0, 5), AHORA), "Hoy");
  // Anoche a las 23:00: pasaron 9 horas, pero fue ayer.
  assert.equal(tituloDia(new Date(2026, 8, 14, 23, 0), AHORA), "Ayer");
  // Antes de ayer a las 9:00: pasaron menos de 48 horas, pero no es ayer.
  const antes = tituloDia(new Date(2026, 8, 13, 9, 0), AHORA);
  assert.notEqual(antes, "Ayer");
  assert.match(antes, /13/);
  assert.match(antes, /^[A-ZÁÉÍÓÚ]/, "empieza en mayuscula");
});

test("el año solo aparece si no es el actual", () => {
  assert.doesNotMatch(tituloDia(new Date(2026, 5, 1, 10), AHORA), /2026/);
  assert.match(tituloDia(new Date(2025, 11, 31, 10), AHORA), /2025/);
});

test("agrupa por dia respetando el orden de llegada", () => {
  const filas = [
    { id: 1, created_at: new Date(2026, 8, 15, 7, 50).toISOString() },
    { id: 2, created_at: new Date(2026, 8, 15, 0, 10).toISOString() },
    { id: 3, created_at: new Date(2026, 8, 14, 23, 59).toISOString() },
    { id: 4, created_at: new Date(2026, 8, 10, 12, 0).toISOString() },
    { id: 5, created_at: null },
  ];
  const secciones = agruparPorDia(filas, "created_at", AHORA);
  assert.deepEqual(
    secciones.map((s) => [s.titulo === "Hoy" || s.titulo === "Ayer" ? s.titulo : "otro", s.data.map((f) => f.id)]),
    [["Hoy", [1, 2]], ["Ayer", [3]], ["otro", [4]]],
  );
  assert.equal(agruparPorDia([], "created_at", AHORA).length, 0);
  assert.equal(agruparPorDia(null, "created_at", AHORA).length, 0);
});

test("clave de dia y hora en formato local", () => {
  const d = new Date(2026, 0, 5, 9, 7);
  assert.equal(claveDia(d), "2026-01-05");
  assert.equal(hora(d), "09:07");
});

// ─────────────────────────────────────────────────────────────
// deposito.js
// Decide si el cliente puede enviar: si se equivoca, o bloquea a
// quien sí puede cobrar, o deja pasar una operación sin destino.
// ─────────────────────────────────────────────────────────────
const { cuentasDeDeposito, puedeRecibir, faltaParaRecibir, estadoBanco, bancosDelCliente } =
  await cargar("deposito.js");

const ahorros = (banco) => ({ banco, tipo: "ahorros" });
const cci = (banco) => ({ banco, tipo: "interbancaria" });

test("deposito: banco principal recibe en la cuenta normal del mismo banco", () => {
  assert.equal(puedeRecibir("BCP", [ahorros("BCP")]), true);
  assert.equal(puedeRecibir("BCP", [ahorros("BBVA")]), false);
});

test("deposito: con normal y CCI del mismo banco, recibe la normal", () => {
  const destino = cuentasDeDeposito("BCP", [cci("BCP"), ahorros("BCP")]);
  assert.equal(destino.length, 1);
  assert.equal(destino[0].tipo, "ahorros");
});

test("deposito: la CCI sola no alcanza, y el aviso lo explica", () => {
  assert.equal(puedeRecibir("Interbank", [cci("Interbank")]), false);
  assert.match(faltaParaRecibir("Interbank", [cci("Interbank")]).detalle, /CCI/);
});

test("deposito: CMR y Otros reciben en la cuenta normal de cualquier banco", () => {
  assert.equal(puedeRecibir("CMR", [ahorros("Scotiabank")]), true);
  assert.equal(puedeRecibir("Otros", [ahorros("BanBif"), ahorros("BCP")]), true);
  assert.equal(cuentasDeDeposito("CMR", [ahorros("BCP"), ahorros("BBVA")]).length, 2);
});

test("deposito: CMR sin cuenta normal no puede enviar, aunque tenga CCI", () => {
  assert.equal(puedeRecibir("CMR", []), false);
  assert.equal(puedeRecibir("CMR", [cci("BCP")]), false);
  assert.equal(faltaParaRecibir("CMR", []).banco, null);
});

test("deposito: cuentas viejas sin tipo cuentan como normales", () => {
  assert.equal(puedeRecibir("BBVA", [{ banco: "BBVA" }]), true);
});

test("deposito: sin tarjeta no hay destino ni aviso", () => {
  assert.deepEqual(cuentasDeDeposito(null, [ahorros("BCP")]), []);
  assert.equal(faltaParaRecibir(null, []), null);
});

test("estado por banco: listo, falta cuenta, verificando y falta tarjeta", () => {
  const t = (banco, estado) => ({ banco, estado });
  assert.equal(estadoBanco("BCP", [t("BCP", "aprobado")], [ahorros("BCP")]), "listo");
  assert.equal(estadoBanco("BBVA", [t("BBVA", "aprobado")], [cci("BBVA")]), "falta_cuenta");
  assert.equal(estadoBanco("Interbank", [t("Interbank", "pendiente")], [ahorros("Interbank")]), "verificando");
  assert.equal(estadoBanco("BanBif", [], [ahorros("BanBif")]), "falta_tarjeta");
  assert.equal(estadoBanco("CMR", [t("CMR", "aprobado")], [ahorros("BCP")]), "listo");
  // La rechazada no cuenta: va en "Requiere tu atención".
  assert.equal(estadoBanco("Scotiabank", [t("Scotiabank", "rechazado")], []), null);
  assert.deepEqual(bancosDelCliente([t("CMR", "aprobado")], [ahorros("BCP")]), ["BCP", "CMR"]);
});

// El ubigeo vive en src/data y no en src/lib: se carga igual, como data URI.
const PERU = (
  await import(
    "data:text/javascript;base64," +
      Buffer.from(fs.readFileSync(path.join(carpetaLib, "..", "data", "peru.js"), "utf8")).toString("base64")
  )
).default;

test("ubigeo: el listado completo del INEI", () => {
  const provincias = Object.values(PERU).flatMap((p) => Object.keys(p));
  const distritos = Object.values(PERU).flatMap((p) => Object.values(p).flat());
  assert.equal(Object.keys(PERU).length, 25);
  assert.equal(provincias.length, 196);
  assert.equal(distritos.length, 1891);
  // Callao es su propia región, no una provincia de Lima.
  assert.deepEqual(Object.keys(PERU.Callao), ["Callao"]);
  assert.equal(PERU.Lima.Callao, undefined);
  assert.ok(PERU.Lima.Lima.includes("Santiago de Surco"));
  // Sin repetidos dentro de una provincia, y sin espacios sueltos.
  for (const [dep, provs] of Object.entries(PERU)) {
    assert.equal(dep, dep.trim());
    for (const [prov, ds] of Object.entries(provs)) {
      assert.equal(prov, prov.trim());
      assert.equal(new Set(ds).size, ds.length, `${dep}/${prov} repite distritos`);
    }
  }
  // Ordenado como lo lee una persona: Áncash va junto a Amazonas.
  assert.deepEqual(Object.keys(PERU).slice(0, 3), ["Amazonas", "Áncash", "Apurímac"]);
});
