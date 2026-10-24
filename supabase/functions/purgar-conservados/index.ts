/**
 * Borra lo que ya cumplió su plazo de conservación (migración 58).
 *
 * La llama pg_cron cada día a las 3:00 a. m. de Lima. De las cuentas
 * eliminadas que habían operado:
 *   - a los 5 años de la última operación, borra las fotos (documento,
 *     selfie, tarjetas) del bucket "conservados";
 *   - a los 10 años, borra los comprobantes y la identidad conservada.
 *
 * No usa sesión de usuario: valida la cabecera x-purga contra la clave
 * guardada en la bóveda de la base (verificar_purga), así la clave no
 * vive en ningún otro lado.
 *
 * Despliegue (sin verificación de JWT: la valida la clave):
 *   npx supabase functions deploy purgar-conservados --no-verify-jwt
 */
import { createClient } from "npm:@supabase/supabase-js@2";

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !servicio) return responder({ error: "Faltan variables de entorno." }, 500);

  const admin = createClient(url, servicio, { auth: { autoRefreshToken: false, persistSession: false } });

  const clave = req.headers.get("x-purga") ?? "";
  const { data: valida } = await admin.rpc("verificar_purga", { p_clave: clave });
  if (!clave || valida !== true) return responder({ error: "No autorizado." }, 401);

  const ahora = new Date().toISOString();
  const resultado = { fotos_borradas: 0, cuentas_fotos: 0, comprobantes_borrados: 0, identidades_borradas: 0, errores: [] as string[] };

  // ── 5 años: fotos ──
  const { data: conFotos } = await admin
    .from("datos_conservados")
    .select("user_id, fotos")
    .is("fotos_purgadas_en", null)
    .lte("fotos_hasta", ahora);

  for (const fila of conFotos ?? []) {
    const rutas = (fila.fotos as string[]) ?? [];
    if (rutas.length) {
      const { error } = await admin.storage.from("conservados").remove(rutas);
      if (error) {
        resultado.errores.push(`fotos ${fila.user_id}: ${error.message}`);
        continue;
      }
      resultado.fotos_borradas += rutas.length;
    }
    await admin
      .from("datos_conservados")
      .update({ fotos: [], fotos_purgadas_en: ahora })
      .eq("user_id", fila.user_id);
    resultado.cuentas_fotos++;
  }

  // ── 10 años: comprobantes e identidad ──
  const { data: vencidos } = await admin
    .from("datos_conservados")
    .select("user_id, perfil_id, fotos")
    .lte("datos_hasta", ahora);

  for (const fila of vencidos ?? []) {
    // Por si quedó alguna foto (no debería: vencen antes).
    const restantes = (fila.fotos as string[]) ?? [];
    if (restantes.length) await admin.storage.from("conservados").remove(restantes);

    if (fila.perfil_id) {
      const { data: sols } = await admin
        .from("solicitudes")
        .select("id, comprobante_url")
        .eq("cliente_id", fila.perfil_id)
        .not("comprobante_url", "is", null);
      const rutas = (sols ?? []).map((s) => s.comprobante_url as string).filter(Boolean);
      if (rutas.length) {
        const { error } = await admin.storage.from("comprobantes").remove(rutas);
        if (error) {
          resultado.errores.push(`comprobantes ${fila.user_id}: ${error.message}`);
          continue;
        }
        await admin.from("solicitudes").update({ comprobante_url: null }).eq("cliente_id", fila.perfil_id);
        resultado.comprobantes_borrados += rutas.length;
      }
    }
    await admin.from("datos_conservados").delete().eq("user_id", fila.user_id);
    resultado.identidades_borradas++;
  }

  return responder({ ok: true, ...resultado });
});
