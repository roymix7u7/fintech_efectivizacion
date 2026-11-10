import { supabase } from "./supabase";

/**
 * Disponibilidad del personal (migración 070): en línea, ocupado o
 * desconectado. El reparto automático solo da casos nuevos a los
 * gestores en línea.
 *
 * El panel manda una señal cada minuto mientras está abierto; sin señal
 * por 10 minutos la persona cuenta como desconectada.
 */
export const ESTADOS = {
  en_linea: {
    texto: "En línea",
    detalle: "Atiendo: recibo casos nuevos",
    punto: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700",
  },
  ocupado: {
    texto: "Ocupado",
    detalle: "Estoy, pero no me asignen más por ahora",
    punto: "bg-oro-500",
    chip: "bg-oro-50 text-oro-700",
  },
  desconectado: {
    texto: "Desconectado",
    detalle: "Fuera de turno: no recibo casos",
    punto: "bg-white/30",
    chip: "bg-muted text-muted-foreground",
  },
};

export const ORDEN_ESTADOS = ["en_linea", "ocupado", "desconectado"];

export const SENAL_CADA_MS = 60_000;

/**
 * Lo último que se supo, guardado entre pantallas: cada pantalla monta su
 * propia barra lateral y, sin esto, cada cambio de sección mandaría una
 * señal y se vería un parpadeo. Vive solo en memoria.
 */
export const memoria = { valor: null, senalEn: 0, soportado: true };

/** Al cerrar sesión: el siguiente que entre no ve el estado del anterior. */
export function olvidarDisponibilidad() {
  memoria.valor = null;
  memoria.senalEn = 0;
}

/** La migración 070 todavía no se aplicó: la función no existe. */
export const faltaMigracion = (e) =>
  e?.code === "PGRST202" || /fijar_disponibilidad|senal_disponibilidad/.test(e?.message || "");

/**
 * Cambia el propio estado. Devuelve { data: { estado, desde }, error }.
 * esperarChat: false al entrar, para no demorar la entrada esperando a
 * Chatwoot (el aviso sale igual, por detrás).
 */
export async function fijarDisponibilidad(estado, { esperarChat = true } = {}) {
  const { data, error } = await supabase.rpc("fijar_disponibilidad", { p_estado: estado });
  if (!error) {
    const aviso = avisarAlChat();
    if (esperarChat) await aviso;
  }
  return { data, error };
}

/**
 * Quien atiende el chat queda igual en Chatwoot (/api/atencion/disponibilidad).
 * No se espera más de 3 s ni se informa un fallo: el panel no depende
 * del chat, y la próxima sincronización lo corrige.
 */
async function avisarAlChat() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const pedido = fetch("/api/atencion/disponibilidad", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      keepalive: true,
    }).catch(() => {});
    await Promise.race([pedido, new Promise((r) => setTimeout(r, 3000))]);
  } catch {}
}

/** "Sigo aquí". Devuelve el estado vigente (puede volver desconectado). */
export async function senalDisponibilidad() {
  const { data, error } = await supabase.rpc("senal_disponibilidad");
  return { data, error };
}
