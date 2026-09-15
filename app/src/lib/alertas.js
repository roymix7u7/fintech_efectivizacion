import { supabase } from "./supabase";

/**
 * Alertas: los avisos urgentes, separados de las noticias.
 *
 * Una noticia se navega cuando el cliente quiere. Una alerta
 * interrumpe, porque si se entera manana ya no le sirve: "el BCP no
 * esta procesando hoy" leido pasado manana no es informacion, es
 * historia.
 *
 * El riesgo de avisar con una burbuja es que si el cliente la pierde,
 * se perdio para siempre. Por eso se guarda por cliente cuando la vio:
 * la burbuja es la forma de llamar la atencion, no el lugar donde vive
 * el mensaje. La alerta se queda en su lista, marcada como nueva, hasta
 * que la abra.
 */

/** Columnas que necesitan tanto la lista como la burbuja. */
const CAMPOS =
  "id, titulo, mensaje, tipo, fecha_inicio, fecha_fin, alertas_vistas(vista_en)";

/**
 * Alertas al aire, con la marca de si este cliente ya las abrio.
 *
 * La vigencia la filtra la politica de la base, asi que aqui no llega
 * nada vencido. Y alertas_vistas solo devuelve las filas del propio
 * usuario, tambien por politica: si el arreglo viene vacio, es que no
 * la ha visto.
 */
export async function listarAlertas() {
  const { data, error } = await supabase
    .from("alertas_sistema")
    .select(CAMPOS)
    .eq("categoria", "alerta")
    .order("fecha_inicio", { ascending: false });

  if (error) return { alertas: [], error };

  return {
    alertas: (data || []).map((a) => ({
      ...a,
      vista: (a.alertas_vistas || []).length > 0,
    })),
    error: null,
  };
}

/**
 * Marca alertas como vistas.
 *
 * ignoreDuplicates hace que Postgres use "no hagas nada si ya existe",
 * asi que se puede llamar cada vez que se abre la pestana sin comprobar
 * antes cuales ya estaban marcadas.
 *
 * Nunca tumba a quien la llama: que falle el registro de lectura no
 * puede impedir que el cliente lea la alerta.
 */
export async function marcarVistas(ids) {
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!limpios.length) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("alertas_vistas").upsert(
    limpios.map((alerta_id) => ({ alerta_id, user_id: user.id })),
    { onConflict: "alerta_id,user_id", ignoreDuplicates: true },
  );
  if (error) console.warn("No se pudo marcar la alerta:", error.message);
}

/**
 * Alertas urgentes al aire en este momento.
 *
 * Se consulta en el instante de enviar, no se reutiliza lo que cargo la
 * pantalla: una alerta publicada mientras el cliente llenaba el
 * formulario tiene que alcanzarlo igual.
 *
 * Nunca lanza. Si no se puede consultar, devuelve una lista vacia con
 * el error: no poder leer las alertas no puede impedir enviar, y si el
 * problema es la conexion, el envio lo va a reportar con su propio
 * mensaje.
 */
export async function alertasUrgentes() {
  try {
    const { data, error } = await supabase
      .from("alertas_sistema")
      .select("id, titulo, mensaje, tipo, fecha_inicio")
      .eq("categoria", "alerta")
      .eq("tipo", "critico")
      .order("fecha_inicio", { ascending: false });
    if (error) return { alertas: [], error };
    return { alertas: data || [], error: null };
  } catch (e) {
    return { alertas: [], error: e };
  }
}

/**
 * Nombre de canal unico por montaje.
 *
 * supabase.channel(nombre) devuelve el canal existente si ya hay uno con
 * ese nombre, y agregarle una escucha despues de suscribirlo lanza
 * "cannot add postgres_changes callbacks after subscribe()". Como
 * removeChannel es asincrono, basta con que un componente se monte dos
 * veces seguidas para chocar. Con un sufijo propio, cada montaje tiene
 * su canal y no se pisan.
 */
export function nombreCanal(base) {
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Reglas de presentacion por gravedad. */
export const GRAVEDAD = {
  critico: {
    etiqueta: "Urgente",
    icono: "warning",
    color: "#D93025",
    fondo: "#FDE8E6",
    // Una alerta urgente no se va sola: si desaparece mientras el
    // cliente mira otra cosa, es como no haberla enviado.
    permanece: true,
  },
  advertencia: {
    etiqueta: "Importante",
    icono: "alert-circle",
    color: "#E8A500",
    fondo: "#FFF5D6",
    permanece: false,
  },
  info: {
    etiqueta: "Aviso",
    icono: "information-circle",
    color: "#1A73E8",
    fondo: "#E8F0FE",
    permanece: false,
  },
};

export const gravedadDe = (tipo) => GRAVEDAD[tipo] || GRAVEDAD.info;
