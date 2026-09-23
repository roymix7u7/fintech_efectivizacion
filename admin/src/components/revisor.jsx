"use client";

import { cn } from "@/lib/utils";
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
 * Quien esta revisando un caso.
 *
 * Con varias personas sobre la misma cola, saber que un caso esta
 * tomado no alcanza: hace falta saber por quien para no ir a
 * preguntar por el pasillo. Se muestra el nombre y el rol.
 */
export default function Revisor({ persona, minutos, propio }) {
  if (propio) {
    return (
      <Pista
        fin
        className="shrink-0"
        texto={`Es tuya. Te quedan ${minutos} min antes de que vuelva a la cola.`}
      >
        <span className="flex items-center gap-1.5 rounded-full bg-marca-600 py-0.5 pl-1 pr-2 text-white">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[0.6667rem] font-bold">
            ✓
          </span>
          <span className="text-[0.7333rem] font-semibold">Tuya</span>
        </span>
      </Pista>
    );
  }

  const email = persona?.email;
  const rol = ROLES[persona?.rol] || "Del equipo";

  return (
    <Pista
      fin
      className="min-w-0 shrink-0"
      texto={`${rol} · ${email || "sin identificar"} · le quedan ${minutos} min`}
    >
      <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pl-1 pr-2">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-marca-100 text-[0.6667rem] font-bold text-marca-700">
          {(corto(email) || "?").charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[92px] truncate text-[0.7333rem] font-medium text-muted-foreground">
          {corto(email) || "otra persona"}
        </span>
      </span>
    </Pista>
  );
}

export { ROLES as ROLES_REVISOR, corto as nombreCorto };
