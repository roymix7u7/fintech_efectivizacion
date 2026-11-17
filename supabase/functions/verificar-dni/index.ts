/**
 * Compara el nombre que registró un cliente con el de su DNI.
 *
 * La pide el panel al abrir a un cliente (Verificación, Clientes). La
 * función:
 *   1. Revisa que quien llama sea del personal.
 *   2. Busca el DNI en consultas_dni; si ya se consultó antes, no gasta
 *      la cuota gratuita del proveedor.
 *   3. Si no está, lo consulta en los proveedores configurados, en
 *      orden, y pasa al siguiente si uno falla o se le acabó la cuota:
 *        · DNI_DECOLECTA_TOKEN  → api.decolecta.com
 *        · DNI_APISPERU_TOKEN   → dniruc.apisperu.com
 *      (secretos de la función; con uno basta).
 *   4. Compara nombres y apellidos sin tildes ni orden, y guarda el
 *      resultado en revision_identidad: coincide, parcial, parecido
 *      (errores de tipeo), no_coincide, no_encontrado, no_aplica (carnet
 *      de extranjería) o error.
 *
 * Con { accion: "usar_oficial" } reemplaza el nombre del cliente por el
 * del DNI (solo si salió parecido o parcial; permiso kyc.nombre-dni).
 *
 * No bloquea a nadie: el panel muestra un aviso y decide el personal.
 *
 * Despliegue:
 *   npx supabase functions deploy verificar-dni
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES_PERSONAL = ["admin", "supervisor", "gestor", "pagos"];

/** Recortes del super administrador (migración 078). Sin la función, deja pasar. */
// deno-lint-ignore no-explicit-any
async function accesoPermite(comoUsuario: any, clave: string): Promise<boolean> {
  const { data, error } = await comoUsuario.rpc("acceso_permite", { p_clave: clave, p_escribir: true });
  if (error) return error.code === "PGRST202";
  return data !== false;
}
const SIN_ACCESO = "Tu acceso no permite esta acción (o estás fuera de la red autorizada). Si la necesitas, pídesela al administrador.";

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Oficial = { encontrado: boolean; nombres?: string; paterno?: string; materno?: string; fuente: string };

/** Lee la respuesta de cualquiera de los proveedores (cada uno nombra distinto los campos). */
function leerPersona(j: Record<string, unknown>): { nombres: string; paterno: string; materno: string } | null {
  const d = (j?.data && typeof j.data === "object" ? j.data : j) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nombres = s(d.first_name) || s(d.nombres) || s(d.nombre);
  const paterno = s(d.first_last_name) || s(d.apellidoPaterno) || s(d.apellido_paterno);
  const materno = s(d.second_last_name) || s(d.apellidoMaterno) || s(d.apellido_materno);
  return nombres || paterno ? { nombres, paterno, materno } : null;
}

const NO_EXISTE = /no se encontr|not found|no existe|no encontrado|invalid dni|dni inv/i;

async function consultar(dni: string): Promise<Oficial | { error: string }> {
  const proveedores: { fuente: string; url: string; headers: Record<string, string> }[] = [];
  const dec = Deno.env.get("DNI_DECOLECTA_TOKEN");
  if (dec) proveedores.push({ fuente: "decolecta", url: `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, headers: { Authorization: `Bearer ${dec}` } });
  const ape = Deno.env.get("DNI_APISPERU_TOKEN");
  if (ape) proveedores.push({ fuente: "apisperu", url: `https://dniruc.apisperu.com/api/v1/dni/${dni}?token=${encodeURIComponent(ape)}`, headers: {} });
  if (!proveedores.length) return { error: "Falta configurar el token del proveedor de DNI (DNI_DECOLECTA_TOKEN o DNI_APISPERU_TOKEN)." };

  const fallos: string[] = [];
  for (const p of proveedores) {
    try {
      const res = await fetch(p.url, { headers: { Accept: "application/json", ...p.headers }, signal: AbortSignal.timeout(8000) });
      const texto = await res.text();
      let j: Record<string, unknown> = {};
      try {
        j = JSON.parse(texto);
      } catch {
        // respuesta que no es JSON
      }
      const persona = res.ok ? leerPersona(j) : null;
      if (persona) return { encontrado: true, ...persona, fuente: p.fuente };
      const mensaje = String(j?.message ?? j?.error ?? texto).slice(0, 160);
      // DNI inexistente: es una respuesta, no un fallo del proveedor.
      // (Un 404 sin ese mensaje puede ser una ruta mal escrita: se prueba el siguiente.)
      if (NO_EXISTE.test(mensaje) || (res.ok && j?.success === false)) {
        return { encontrado: false, fuente: p.fuente };
      }
      fallos.push(`${p.fuente}: ${res.status} ${mensaje}`);
    } catch (e) {
      fallos.push(`${p.fuente}: ${(e as Error).message}`);
    }
  }
  return { error: "No se pudo consultar el DNI. " + fallos.join(" · ") };
}

/** Palabras de un nombre: mayúsculas, sin tildes ni signos, sin "DE", "LA", "DEL"... */
const SOBRAN = new Set(["DE", "LA", "DEL", "LOS", "LAS", "Y", "VDA"]);
function palabras(t: string): string[] {
  return String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SOBRAN.has(w));
}

/**
 * Cuántas letras hay que cambiar para pasar de una palabra a otra. Dos
 * letras cambiadas de lugar ("JAUN" por "JUAN") cuentan como un error.
 */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * La misma palabra salvo un error de tipeo: 1 letra en palabras de 4 a 6
 * letras, 2 en las de 7 o más. Las de 3 o menos tienen que ser iguales
 * (si no, "ANA" y "AMA" pasarían por la misma).
 */
function casiIgual(a: string, b: string): boolean {
  if (a === b) return true;
  const corta = Math.min(a.length, b.length);
  const tolera = corta >= 7 ? 2 : corta >= 4 ? 1 : 0;
  return tolera > 0 && distancia(a, b) <= tolera;
}

/**
 * coincide: las mismas palabras, en cualquier orden.
 * parcial: el apellido paterno y al menos un nombre, sin palabras de más
 * (escribió menos nombres o le faltó el materno).
 * parecido: lo mismo, pero con errores de tipeo ("FASANADO" por
 * "FASANANDO"). El personal puede corregirlo con el nombre del DNI.
 */
function comparar(registrado: { nombres: string; apellidos: string }, oficial: { nombres: string; paterno: string; materno: string }) {
  const regNom = palabras(registrado.nombres);
  const regApe = palabras(registrado.apellidos);
  const ofiNom = palabras(oficial.nombres);
  const ofiApe = [...palabras(oficial.paterno), ...palabras(oficial.materno)];
  const todasReg = new Set([...regNom, ...regApe]);
  const todasOfi = new Set([...ofiNom, ...ofiApe]);
  const iguales = todasReg.size === todasOfi.size && [...todasReg].every((w) => todasOfi.has(w));
  if (iguales) return "coincide";
  // Basta el apellido paterno (hay quien no escribe el materno).
  const paterno = palabras(oficial.paterno);
  const apellidosOk = paterno.length > 0 && paterno.every((w) => todasReg.has(w));
  const algunNombre = ofiNom.some((w) => todasReg.has(w));
  const sobranEnReg = [...todasReg].filter((w) => !todasOfi.has(w)).length;
  if (apellidosOk && algunNombre && sobranEnReg === 0) return "parcial";
  // Con errores de tipeo: cada palabra suya se parece a una del DNI, y
  // están el apellido paterno y algún nombre.
  const parecida = (w: string, lista: Iterable<string>) => [...lista].some((o) => casiIgual(w, o));
  const todasSeParecen = todasReg.size > 0 && [...todasReg].every((w) => parecida(w, todasOfi));
  const paternoParecido = paterno.length > 0 && paterno.every((w) => parecida(w, todasReg));
  const nombreParecido = ofiNom.some((w) => parecida(w, todasReg));
  if (todasSeParecen && paternoParecido && nombreParecido) return "parecido";
  return "no_coincide";
}

/**
 * El nombre del DNI escrito como nombre propio ("JUAN JOSE" → "Juan
 * José"). Si el cliente escribió la misma palabra con tilde, se respeta
 * la suya: RENIEC no siempre trae las tildes.
 */
function comoNombre(oficial: string, registrado: string): string {
  const norm = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  const propias = String(registrado || "").split(/\s+/).filter(Boolean);
  return String(oficial || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const suya = propias.find((p) => norm(p) === norm(w));
      const base = (suya ?? w).toLowerCase();
      if (i > 0 && SOBRAN.has(norm(w))) return base;
      return base.charAt(0).toUpperCase() + base.slice(1);
    })
    .join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Quién llama ──
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return responder({ error: "Falta la sesión." }, 401);
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user: quien } } = await comoUsuario.auth.getUser();
  if (!quien) return responder({ error: "Tu sesión no es válida o caducó." }, 401);

  const admin = createClient(url, servicio, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: yo } = await admin.from("users").select("rol, estado").eq("id", quien.id).maybeSingle();
  if (!yo || !ROLES_PERSONAL.includes(yo.rol) || yo.estado === "bloqueado") {
    return responder({ error: "Solo el personal puede verificar identidades." }, 403);
  }

  // ── A quién ──
  let cuerpo: { user_id?: string; forzar?: boolean; accion?: string } = {};
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido." }, 400);
  }
  const userId = String(cuerpo.user_id ?? "");
  if (!UUID.test(userId)) return responder({ error: "Falta el cliente." }, 400);

  const { data: perfil } = await admin
    .from("perfiles_cliente")
    .select("id, user_id, nombres, apellidos, dni, tipo_documento")
    .eq("user_id", userId)
    .maybeSingle();
  if (!perfil) return responder({ error: "Ese cliente todavía no completó su registro." }, 404);

  const dni = String(perfil.dni || "").replace(/\D/g, "");

  // ── Corregir el nombre con el del DNI ──
  // Solo cuando la diferencia es de tipeo o le faltó un nombre (parecido
  // o parcial): si es otra persona, no se corrige, se observa.
  if (cuerpo.accion === "usar_oficial") {
    if (!["admin", "supervisor", "gestor"].includes(yo.rol)) {
      return responder({ error: "Tu rol no puede corregir datos del cliente." }, 403);
    }
    if (!(await accesoPermite(comoUsuario, "kyc.nombre-dni"))) {
      return responder({ error: SIN_ACCESO, detalle: "sin_acceso" }, 403);
    }
    const { data: rev } = await admin.from("revision_identidad").select("resultado, dni").eq("user_id", userId).maybeSingle();
    if (!rev || rev.dni !== dni || !["parecido", "parcial"].includes(rev.resultado)) {
      return responder({ error: "Solo se corrige cuando el nombre se parece al del DNI. Si es otra persona, obsérvalo." }, 409);
    }
    const { data: ofi } = await admin.from("consultas_dni").select("*").eq("dni", dni).maybeSingle();
    if (!ofi?.encontrado) return responder({ error: "No hay datos del DNI para corregir." }, 409);

    const registrado = `${perfil.nombres || ""} ${perfil.apellidos || ""}`;
    const nombres = comoNombre(ofi.nombres ?? "", registrado);
    const apellidos = comoNombre(`${ofi.apellido_paterno ?? ""} ${ofi.apellido_materno ?? ""}`, registrado);
    if (!nombres || !apellidos) return responder({ error: "Los datos del DNI vienen incompletos." }, 409);

    const { error: eUpd } = await admin.from("perfiles_cliente").update({ nombres, apellidos }).eq("user_id", userId);
    if (eUpd) return responder({ error: "No se pudo guardar el nombre: " + eUpd.message }, 500);

    await admin.from("auditoria_logs").insert({
      usuario_id: quien.id,
      accion: "CORREGIR_NOMBRE_DNI",
      entidad: "perfiles_cliente",
      entidad_id: perfil.id,
      datos_antes: { nombres: perfil.nombres, apellidos: perfil.apellidos },
      datos_despues: { nombres, apellidos, fuente: ofi.fuente },
    });

    const fila = {
      user_id: userId,
      dni,
      nombre_registrado: `${nombres} ${apellidos}`,
      nombre_oficial: `${ofi.nombres ?? ""} ${ofi.apellido_paterno ?? ""} ${ofi.apellido_materno ?? ""}`.replace(/\s+/g, " ").trim(),
      resultado: "coincide",
      detalle: "Corregido con el nombre del DNI por el personal.",
      fuente: ofi.fuente,
      revisado_en: new Date().toISOString(),
    };
    await admin.from("revision_identidad").upsert(fila, { onConflict: "user_id" });
    return responder({ ...fila, nombres, apellidos });
  }
  const nombreRegistrado = `${perfil.nombres || ""} ${perfil.apellidos || ""}`.trim();
  const guardar = async (fila: Record<string, unknown>) => {
    const r = { user_id: userId, dni, nombre_registrado: nombreRegistrado, revisado_en: new Date().toISOString(), ...fila };
    await admin.from("revision_identidad").upsert(r, { onConflict: "user_id" });
    return responder(r);
  };

  if (perfil.tipo_documento === "ce") {
    return guardar({ resultado: "no_aplica", detalle: "Carnet de extranjería: no se consulta en RENIEC." });
  }
  if (dni.length !== 8) return guardar({ resultado: "no_encontrado", detalle: "El DNI no tiene 8 dígitos." });

  // ── El DNI, de la memoria o del proveedor ──
  let oficial: Oficial | null = null;
  const { data: guardado } = await admin.from("consultas_dni").select("*").eq("dni", dni).maybeSingle();
  if (guardado && !cuerpo.forzar) {
    oficial = {
      encontrado: guardado.encontrado,
      nombres: guardado.nombres ?? "",
      paterno: guardado.apellido_paterno ?? "",
      materno: guardado.apellido_materno ?? "",
      fuente: guardado.fuente,
    };
  } else {
    const r = await consultar(dni);
    if ("error" in r) return guardar({ resultado: "error", detalle: r.error });
    oficial = r;
    await admin.from("consultas_dni").upsert(
      {
        dni,
        encontrado: r.encontrado,
        nombres: r.nombres ?? null,
        apellido_paterno: r.paterno ?? null,
        apellido_materno: r.materno ?? null,
        fuente: r.fuente,
        consultado_en: new Date().toISOString(),
      },
      { onConflict: "dni" },
    );
  }

  if (!oficial.encontrado) return guardar({ resultado: "no_encontrado", fuente: oficial.fuente, detalle: "El proveedor no encontró ese DNI." });

  const nombreOficial = `${oficial.nombres} ${oficial.paterno} ${oficial.materno}`.replace(/\s+/g, " ").trim();
  const resultado = comparar(
    { nombres: perfil.nombres || "", apellidos: perfil.apellidos || "" },
    { nombres: oficial.nombres || "", paterno: oficial.paterno || "", materno: oficial.materno || "" },
  );
  return guardar({ resultado, nombre_oficial: nombreOficial, fuente: oficial.fuente });
});
