/**
 * Piezas del reporte de Atención al cliente (chats de Chatwoot por sede).
 *
 * La sede une los dos sistemas por el nombre: "Sede Lince" en el panel
 * es la etiqueta "sede-lince" en Chatwoot. soporte/chatwoot/configurar.rb
 * crea esas etiquetas y guarda en cada asesor de Chatwoot su sede.
 */

/** "Sede Lince" → "sede-lince"; "Sede San Juan" → "sede-san-juan". */
export function etiquetaDeSede(nombre) {
  const base = String(nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^sede\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base ? `sede-${base}` : null;
}

/** Opciones del campo "Motivo de contacto". Las mismas de configurar.rb (MOTIVOS). */
export const MOTIVOS = [
  "Solicitud",
  "Depósito",
  "Tarjeta o cuenta",
  "Verificación de cuenta",
  "Comisiones",
  "Reclamo",
  "Problema con la app o la web",
  "Información general",
  "Otro",
];

export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Fecha de Lima (AAAA-MM-DD) de un instante en segundos. */
export function fechaLima(segundos) {
  return new Date(segundos * 1000 - LIMA_MS).toISOString().slice(0, 10);
}

/** Día (0 = lunes) y hora de Lima de un instante en segundos. */
export function diaYHoraLima(segundos) {
  const d = new Date(segundos * 1000 - LIMA_MS);
  return { dia: (d.getUTCDay() + 6) % 7, hora: d.getUTCHours() };
}

export const PERIODOS = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "7d", etiqueta: "7 días" },
  { clave: "30d", etiqueta: "30 días" },
];

// Lima no cambia de hora: siempre UTC-5.
const LIMA_MS = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

/** Desde y hasta (segundos) del periodo; los días empiezan a medianoche de Lima. */
export function rangoDe(periodo, ahora = Date.now()) {
  const inicioHoy = Math.floor((ahora - LIMA_MS) / DIA_MS) * DIA_MS + LIMA_MS;
  const dias = periodo === "30d" ? 29 : periodo === "7d" ? 6 : 0;
  return {
    since: Math.floor((inicioHoy - dias * DIA_MS) / 1000),
    until: Math.floor(ahora / 1000),
  };
}

/** Segundos → "45 s", "3 min", "1 h 20 min", "2 d 4 h". */
export function duracion(segundos) {
  if (segundos == null || Number.isNaN(Number(segundos))) return null;
  const s = Math.round(Number(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
