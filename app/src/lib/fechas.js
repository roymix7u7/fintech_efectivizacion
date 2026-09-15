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
