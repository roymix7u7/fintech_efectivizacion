/**
 * Fechas para listas agrupadas por dia.
 *
 * Sin dependencias a proposito: las pruebas cargan este archivo tal cual
 * y lo ejercitan con un "ahora" fijo.
 *
 * Todo se calcula en la hora local del telefono. Comparar en UTC haria
 * que en Lima una operacion de las 8 de la noche apareciera en "Hoy" del
 * dia siguiente, porque para UTC ya es medianoche pasada.
 */

/** Clave del dia local, "AAAA-MM-DD". */
export function claveDia(fecha) {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Titulo de un dia: "Hoy", "Ayer" o la fecha escrita.
 *
 * "Ayer" se calcula restando un dia al calendario y no 24 horas: una
 * operacion de anoche a las 23:00 vista hoy a las 8:00 fue ayer, aunque
 * hayan pasado menos de 24 horas.
 */
export function tituloDia(fecha, ahora = new Date()) {
  const d = new Date(fecha);
  const hoy = new Date(ahora);
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);

  if (claveDia(d) === claveDia(hoy)) return "Hoy";
  if (claveDia(d) === claveDia(ayer)) return "Ayer";

  const texto = d.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    // El año solo si no es el actual: "martes 3 de septiembre" se
    // entiende solo, y repetir 2026 en cada divisor es ruido.
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: "numeric" } : {}),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Agrupa filas por dia, en el orden en que llegan.
 *
 * Devuelve [{ clave, titulo, data }], la forma que espera SectionList.
 * No reordena: la consulta ya las trae de la mas nueva a la mas vieja, y
 * reordenar aqui podria contradecir ese orden sin que nadie lo note.
 */
export function agruparPorDia(filas, campo = "created_at", ahora = new Date()) {
  const secciones = [];
  const indice = new Map();

  for (const fila of filas || []) {
    if (!fila?.[campo]) continue;
    const clave = claveDia(fila[campo]);
    let seccion = indice.get(clave);
    if (!seccion) {
      seccion = { clave, titulo: tituloDia(fila[campo], ahora), data: [] };
      indice.set(clave, seccion);
      secciones.push(seccion);
    }
    seccion.data.push(fila);
  }
  return secciones;
}

/** Hora local "14:32". */
export function hora(fecha) {
  const d = new Date(fecha);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Días completos que faltan para una fecha. Negativo si ya pasó. */
export function diasHasta(fecha, ahora = Date.now()) {
  return Math.ceil((new Date(fecha).getTime() - ahora) / 86400000);
}

/** "Quedan 5 días", "Queda 1 día", "Último día"; null sin fecha de fin. */
export function quedanTexto(fechaFin, ahora = Date.now()) {
  if (!fechaFin) return null;
  const q = diasHasta(fechaFin, ahora);
  if (q <= 0) return "Último día";
  if (q === 1) return "Queda 1 día";
  return `Quedan ${q} días`;
}

/**
 * Horario de atención: lunes a sábado, de 9:00 a. m. a 6:00 p. m., hora
 * de Lima (UTC-5, sin horario de verano). Las solicitudes que llegan
 * fuera de él se atienden en el transcurso de la mañana del siguiente
 * día de atención.
 *
 * Devuelve { abierto, cuando }: cuando es "hoy", "mañana" o "el lunes".
 */
export function horarioAtencion(ahora = new Date()) {
  const lima = new Date(new Date(ahora).getTime() - 5 * 3600 * 1000);
  const dia = lima.getUTCDay(); // 0 domingo … 6 sábado
  const hora = lima.getUTCHours();
  const laborable = dia >= 1 && dia <= 6;
  if (laborable && hora >= 9 && hora < 18) return { abierto: true, cuando: "hoy" };
  if (laborable && hora < 9) return { abierto: false, cuando: "hoy" };
  // Sábado después de las 6 p. m. o domingo: se atiende el lunes.
  if (dia === 6 || dia === 0) return { abierto: false, cuando: "el lunes" };
  return { abierto: false, cuando: "mañana" };
}

/** Lo que se le dice al cliente sobre cuándo le depositamos. */
export function plazoDeposito(ahora = new Date()) {
  const h = horarioAtencion(ahora);
  if (h.abierto) return "Normalmente te depositamos en 1 hora.";
  return `Estamos fuera de horario: la atendemos ${h.cuando} en el transcurso de la mañana.`;
}
