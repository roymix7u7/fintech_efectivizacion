"use client";

import { cn } from "@/lib/utils";
import { colorDe } from "@/lib/colores";
import Pista from "@/components/pista";

const ROLES = {
  gestor: "Gestor",
  supervisor: "Supervisor",
  admin: "Administrador",
  pagos: "Pagos",
};

/** "mariana_norte@gmail.com" -> "mariana_norte" */
const corto = (email) => (email || "").split("@")[0];

/**
 * Quién está revisando un caso.
 *
 * Con varias personas sobre la misma cola, saber que un caso está
 * tomado no alcanza: hace falta saber por quién. Se muestra el nombre,
 * y el rol y los minutos que le quedan van en la burbuja.
 */
export default function Revisor({ persona, minutos, propio, id }) {
  if (propio) {
    return (
      <Pista fin className="shrink-0" texto={`Es tuyo. Te quedan ${minutos} min antes de que vuelva a la cola.`}>
        <span className="flex items-center gap-1 rounded-full bg-marca-700 py-0.5 pl-1 pr-2 text-white">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span className="text-xs font-bold">Tuyo · {minutos} min</span>
        </span>
      </Pista>
    );
  }

  const email = persona?.email;
  const rol = ROLES[persona?.rol] || "Del equipo";
  const color = colorDe(id);

  return (
    <Pista fin className="min-w-0 shrink-0" texto={`${rol} · ${email || "sin identificar"} · le quedan ${minutos} min`}>
      <span className={cn("flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2", color.chip)}>
        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold text-white", color.punto)}>
          {(corto(email) || "?").charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[110px] truncate text-xs font-bold">{corto(email) || "otra persona"}</span>
      </span>
    </Pista>
  );
}

export { ROLES as ROLES_REVISOR, corto as nombreCorto };
