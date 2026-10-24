import { supabase } from "./supabase";

/**
 * Libro de Reclamaciones virtual (migración 56). La misma hoja que se
 * llena en la web, desde la app y con los datos del cliente ya puestos.
 */

export const EMPRESA = {
  razonSocial: "ALTOQUE PERU WK S.A.C.",
  ruc: "20611531410",
  domicilio: "Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403, Lince, Lima, Perú",
};

export const SERVICIO = "Gestión de operaciones con tarjeta de crédito";

export async function registrarReclamo(hoja) {
  const { data, error } = await supabase.rpc("registrar_reclamo", { p: { ...hoja, origen: "app" } });
  if (error) throw error;
  return data;
}

export async function misReclamos() {
  const { data, error } = await supabase
    .from("reclamaciones")
    .select("id, codigo, tipo, creado_en, vence_en, estado, detalle, pedido, respuesta, respondido_en, monto, descripcion_bien")
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return data || [];
}

const fecha = (iso) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/** La constancia de la hoja, para que el cliente la guarde o la envíe. */
export function textoConstancia(h, r) {
  return [
    "LIBRO DE RECLAMACIONES",
    `Hoja de ${h.tipo === "queja" ? "queja" : "reclamo"} N.° ${r.codigo}`,
    `Fecha: ${fecha(r.creado_en)}`,
    "",
    `Proveedor: ${EMPRESA.razonSocial} · RUC ${EMPRESA.ruc}`,
    `Domicilio: ${EMPRESA.domicilio}`,
    "",
    "CONSUMIDOR",
    `Nombre: ${h.nombres}`,
    `Documento: ${h.tipo_documento.toUpperCase()} ${h.numero_documento}`,
    `Domicilio: ${h.domicilio}`,
    `Teléfono: ${h.telefono || "—"}`,
    `Correo: ${h.correo}`,
    h.menor_edad ? `Padre, madre o apoderado: ${h.apoderado}` : null,
    "",
    "SERVICIO",
    `${h.descripcion_bien}${h.monto ? ` · Monto reclamado: S/ ${h.monto}` : ""}`,
    "",
    h.tipo === "queja" ? "DETALLE DE LA QUEJA" : "DETALLE DEL RECLAMO",
    h.detalle,
    "",
    "PEDIDO",
    h.pedido,
    "",
    `Respuesta a más tardar el ${fecha(r.vence_en)}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
