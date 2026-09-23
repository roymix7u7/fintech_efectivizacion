/**
 * Un color fijo por persona.
 *
 * Con varias personas sobre la misma cola, el nombre escrito obliga a
 * leer fila por fila. Un color constante se reconoce de un vistazo:
 * "lo amarillo es de Mariana". Sale del identificador, así que es el
 * mismo en todas las pantallas y no hace falta guardarlo en la base.
 *
 * Son colores de identidad, no de estado: ninguno es el verde de
 * aprobado ni el rojo de rechazado, para no decir dos cosas con lo mismo.
 */
const PALETA = [
  { punto: "bg-violet-500", chip: "bg-violet-50 text-violet-700", borde: "border-l-violet-400" },
  { punto: "bg-sky-500", chip: "bg-sky-50 text-sky-700", borde: "border-l-sky-400" },
  { punto: "bg-amber-500", chip: "bg-amber-50 text-amber-700", borde: "border-l-amber-400" },
  { punto: "bg-teal-500", chip: "bg-teal-50 text-teal-700", borde: "border-l-teal-400" },
  { punto: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-700", borde: "border-l-fuchsia-400" },
  { punto: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700", borde: "border-l-indigo-400" },
  { punto: "bg-cyan-600", chip: "bg-cyan-50 text-cyan-700", borde: "border-l-cyan-400" },
  { punto: "bg-rose-400", chip: "bg-rose-50 text-rose-700", borde: "border-l-rose-300" },
];

/** Siempre el mismo color para el mismo identificador. */
export function colorDe(id) {
  if (!id) return PALETA[0];
  let suma = 0;
  for (let i = 0; i < id.length; i++) suma = (suma + id.charCodeAt(i)) % 997;
  return PALETA[suma % PALETA.length];
}

export default PALETA;
