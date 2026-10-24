import { supabase } from "./supabase";

/**
 * Derechos del titular desde la app (migración 54): descargar todo lo
 * que hay de uno y pedir que se elimine la cuenta.
 */

const fecha = (iso) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const ESTADOS = {
  pendiente: "En revisión",
  aprobado: "Aprobada",
  pagado: "Pagada",
  rechazado: "Rechazada",
  activo: "Activa",
  observado: "Observada",
  bloqueado: "Bloqueada",
};
const estado = (v) => ESTADOS[v] || v || "—";
const si = (v) => (v ? "Sí" : "No");

/**
 * Todo lo que hay del cliente, como texto que se lee sin ayuda técnica.
 * Se comparte con la hoja del sistema: guardarlo, enviárselo por
 * correo, etc.
 */
export async function textoMisDatos() {
  const { data: d, error } = await supabase.rpc("mis_datos");
  if (error) throw error;
  if (!d) throw new Error("No encontramos tu cuenta.");

  const l = [];
  const titulo = (t) => l.push("", `== ${t.toUpperCase()} ==`);
  const fila = (k, v) => l.push(`${k}: ${v ?? "—"}`);

  l.push("MIS DATOS EN ALTOQUE PERU WK S.A.C.", `Generado el ${fecha(d.generado_en)}`);

  titulo("Cuenta");
  fila("Correo", d.cuenta?.correo);
  fila("Estado", estado(d.cuenta?.estado));
  fila("Creada", fecha(d.cuenta?.creada_en));

  titulo("Datos personales");
  const p = d.perfil || {};
  fila("Nombres", p.nombres);
  fila("Apellidos", p.apellidos);
  fila(p.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI", p.documento);
  fila("Celular", p.celular);
  fila("Dirección", p.direccion);
  fila("Código promocional", p.codigo_promocional);
  fila("Identidad verificada el", fecha(p.verificado_el));
  fila("Foto del documento (frente) guardada", si(p.fotos_guardadas?.documento_frente));
  fila("Foto del documento (reverso) guardada", si(p.fotos_guardadas?.documento_reverso));
  fila("Selfie guardada", si(p.fotos_guardadas?.selfie));

  titulo("Tarjetas");
  if (!d.tarjetas?.length) l.push("Ninguna");
  for (const t of d.tarjetas || []) {
    l.push(
      `- ${t.banco} ···· ${t.ultimos_4} · ${t.nombre_impreso || "sin nombre"} · ${estado(t.estado)}${t.activa ? "" : " · dada de baja"} · registrada ${fecha(t.registrada_el)}`,
    );
  }

  titulo("Cuentas bancarias");
  if (!d.cuentas?.length) l.push("Ninguna");
  for (const c of d.cuentas || []) {
    l.push(`- ${c.banco} · ${c.tipo === "interbancaria" ? "CCI" : "Ahorros"} ${c.numero}${c.activa ? "" : " · dada de baja"}`);
  }

  titulo("Solicitudes");
  if (!d.solicitudes?.length) l.push("Ninguna");
  for (const s of d.solicitudes || []) {
    l.push(
      `- ${s.codigo} · ${s.banco} · ${estado(s.estado)} · enviada ${fecha(s.enviada_el)}${s.pagada_el ? ` · pagada ${fecha(s.pagada_el)}` : ""}${s.motivo_rechazo ? ` · motivo: ${s.motivo_rechazo}` : ""}${s.nota ? ` · tu nota: ${s.nota}` : ""}`,
    );
  }

  titulo("Comisiones");
  for (const b of d.comisiones?.bancos || []) l.push(`- ${b.banco}: ${b.porcentaje}%`);

  titulo("Documentos que aceptaste");
  for (const c of d.consentimientos || []) l.push(`- ${c.documento} versión ${c.version} · ${fecha(c.aceptado_el)}`);

  titulo("Avisos que te enviamos");
  if (!d.avisos?.length) l.push("Ninguno");
  for (const a of d.avisos || []) l.push(`- ${fecha(a.fecha)} · ${a.titulo}${a.mensaje ? `: ${a.mensaje}` : ""}`);

  l.push(
    "",
    "Las fotos no van en este archivo. Si necesitas una copia, pídela a contacto@altoqueperu.com desde tu correo registrado.",
  );
  return l.join("\n");
}

/** El último pedido de eliminación, o null. */
export async function miPedido() {
  const { data, error } = await supabase
    .from("solicitudes_datos")
    .select("id, estado, motivo, respuesta, creada_en, vence_en, atendida_en")
    .eq("tipo", "eliminacion")
    .order("creada_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function pedirEliminacion(motivo) {
  const { data, error } = await supabase.rpc("solicitar_eliminacion", { p_motivo: motivo || null });
  if (error) throw error;
  return data;
}

export async function cancelarEliminacion() {
  const { data, error } = await supabase.rpc("cancelar_eliminacion");
  if (error) throw error;
  return data;
}
