/**
 * Confirma con Cloudflare que quien quiere abrir el chat de visitantes es
 * una persona (Turnstile). La comprobación del navegador sola se podría
 * saltar; la que vale es esta, con la clave secreta, en el servidor.
 *
 * Cada token sirve una sola vez y caduca a los 5 minutos: no se puede
 * reutilizar ni compartir.
 */
export const dynamic = "force-dynamic";

const SECRETO = process.env.TURNSTILE_SECRET_KEY;

export async function POST(req) {
  if (!SECRETO) {
    return Response.json({ ok: false, error: "La verificación no está configurada (TURNSTILE_SECRET_KEY)." }, { status: 503 });
  }
  let token = "";
  try {
    token = (await req.json())?.token || "";
  } catch {}
  if (!token || token.length > 2048) {
    return Response.json({ ok: false, error: "Falta la verificación." }, { status: 400 });
  }

  const datos = new URLSearchParams({ secret: SECRETO, response: token });
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) datos.set("remoteip", ip);

  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: datos,
      cache: "no-store",
    });
    const j = await r.json();
    return j.success
      ? Response.json({ ok: true })
      : Response.json({ ok: false, error: "No pudimos verificar que eres una persona. Inténtalo de nuevo." }, { status: 403 });
  } catch {
    return Response.json({ ok: false, error: "No se pudo verificar ahora. Inténtalo en un momento." }, { status: 502 });
  }
}
