/**
 * Revision estatica de las pantallas. Busca tres fallos que Metro no
 * reporta y que solo aparecen cuando el usuario abre la pantalla:
 *
 *   1. Errores de sintaxis.
 *   2. Imports que apuntan a un archivo o a un export que no existe.
 *   3. Estilos usados como s.algo que no estan en el StyleSheet.
 *   4. Identificadores usados sin declarar ni importar.
 *
 * Uso:  npm run verificar
 */
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const IGNORAR = ["node_modules", ".expo", ".next", "dist", ".git", "pruebas"];

const GLOBALES = new Set([
  "console", "require", "module", "exports", "process", "global",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "Promise", "JSON", "Math", "Date", "Object", "Array", "String",
  "Number", "Boolean", "Error", "RegExp", "Map", "Set", "Symbol",
  "parseInt", "parseFloat", "isNaN", "encodeURIComponent",
  "decodeURIComponent", "Uint8Array", "ArrayBuffer", "Buffer",
  "fetch", "window", "document", "localStorage", "navigator", "atob",
  "btoa", "URL", "FormData", "Blob", "React", "undefined", "NaN",
  "Infinity", "__DEV__", "alert", "confirm",
  // React Native los trae en su entorno desde la version 0.60.
  "AbortController", "AbortSignal", "TextEncoder", "TextDecoder",
  "Headers", "Request", "Response", "WebSocket", "performance",
]);

const archivos = [];
(function recorrer(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (!IGNORAR.includes(f.name)) recorrer(p);
    } else if (f.name.endsWith(".js") || f.name.endsWith(".jsx")) {
      archivos.push(p);
    }
  }
})(RAIZ);

const rel = (f) => path.relative(RAIZ, f).split(path.sep).join("/");
const problemas = [];
const exportados = {};
const importados = [];

for (const f of archivos) {
  const src = fs.readFileSync(f, "utf8");
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "objectRestSpread"],
    });
  } catch (e) {
    problemas.push(`SINTAXIS   ${rel(f)}\n           ${e.message}`);
    continue;
  }

  // --- exports e imports ---
  exportados[rel(f)] = new Set();
  for (const n of ast.program.body) {
    if (n.type === "ExportDefaultDeclaration") exportados[rel(f)].add("default");
    if (n.type === "ExportNamedDeclaration") {
      if (n.declaration && n.declaration.declarations)
        n.declaration.declarations.forEach((d) =>
          exportados[rel(f)].add(d.id.name),
        );
      if (n.declaration && n.declaration.id)
        exportados[rel(f)].add(n.declaration.id.name);
      if (n.specifiers)
        n.specifiers.forEach((sp) => exportados[rel(f)].add(sp.exported.name));
    }
    if (n.type === "ImportDeclaration" && n.source.value.startsWith(".")) {
      importados.push({
        desde: rel(f),
        destino: n.source.value,
        nombres: n.specifiers.map((sp) =>
          sp.type === "ImportDefaultSpecifier"
            ? "default"
            : sp.imported && sp.imported.name,
        ),
      });
    }
  }

  // --- estilos e identificadores ---
  const estilos = {};
  const usos = [];
  const sinDefinir = new Set();

  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (
        init &&
        init.type === "CallExpression" &&
        init.callee.type === "MemberExpression" &&
        init.callee.object.name === "StyleSheet" &&
        init.callee.property.name === "create"
      ) {
        estilos[p.node.id.name] = new Set(
          (init.arguments[0].properties || [])
            .filter((pr) => pr.key)
            .map((pr) => pr.key.name || pr.key.value),
        );
      }
    },
    MemberExpression(p) {
      const o = p.node.object;
      const pr = p.node.property;
      if (o.type === "Identifier" && !p.node.computed && pr.type === "Identifier")
        usos.push({ objeto: o.name, prop: pr.name, linea: p.node.loc.start.line });
    },
    ReferencedIdentifier(p) {
      const nombre = p.node.name;
      if (GLOBALES.has(nombre)) return;
      if (p.scope.hasBinding(nombre, true)) return;
      if (sinDefinir.has(nombre)) return;
      sinDefinir.add(nombre);
      problemas.push(
        `INDEFINIDO ${rel(f)}:${p.node.loc.start.line}  ${nombre}`,
      );
    },
  });

  for (const u of usos) {
    if (!estilos[u.objeto]) continue;
    if (!estilos[u.objeto].has(u.prop))
      problemas.push(
        `ESTILO     ${rel(f)}:${u.linea}  ${u.objeto}.${u.prop} no esta en el StyleSheet`,
      );
  }
}

for (const imp of importados) {
  const base = path.posix.join(path.posix.dirname(imp.desde), imp.destino);
  const candidatos = [base, base + ".js", base + ".jsx", base + "/index.js"];
  const encontrado = candidatos.find((c) => exportados[c] !== undefined);
  if (!encontrado) {
    problemas.push(`IMPORT     ${imp.desde} -> "${imp.destino}" no existe`);
    continue;
  }
  for (const nombre of imp.nombres) {
    if (nombre && !exportados[encontrado].has(nombre))
      problemas.push(
        `EXPORT     ${imp.desde} importa "${nombre}" de ${encontrado}, que no lo exporta`,
      );
  }
}

problemas.forEach((p) => console.log(p));
console.log(
  `\n${archivos.length} archivos revisados, ${problemas.length} problemas`,
);
process.exit(problemas.length ? 1 : 0);
