"use client";

import { useCallback, useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  ORDEN_ESTADOS,
  SENAL_CADA_MS,
  memoria,
  faltaMigracion,
  fijarDisponibilidad,
  senalDisponibilidad,
} from "@/lib/disponibilidad";

/**
 * La cuenta en el pie de la barra lateral: iniciales, correo y rol. El
 * estado (en línea, ocupado o desconectado) va como un punto sobre las
 * iniciales y junto al rol, y toda la fila abre el selector para
 * cambiarlo: así no ocupa una fila propia. Además manda la señal de
 * "sigo aquí" cada minuto mientras el panel está abierto.
 *
 * Si la migración 070 todavía no está aplicada, se ve solo la cuenta y
 * el panel funciona igual que antes.
 */
export default function Disponibilidad({ compacta, iniciales, correo, rol }) {
  const [actual, setActual] = useState(memoria.valor);
  const [visible, setVisible] = useState(memoria.soportado);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");

  const aplicar = (valor) => {
    memoria.valor = valor;
    setActual(valor);
  };

  const senal = useCallback(async () => {
    if (!memoria.soportado) return;
    // Se marca antes de esperar: si dos barras se montan a la vez (al
    // cambiar de pantalla), la segunda no repite la señal.
    memoria.senalEn = Date.now();
    const { data, error } = await senalDisponibilidad();
    if (error) {
      if (faltaMigracion(error)) {
        memoria.soportado = false;
        setVisible(false);
      }
      return; // un corte de red no cambia lo que se muestra
    }
    if (memoria.valor && memoria.valor.estado !== "desconectado" && data?.estado === "desconectado") {
      setAviso("Quedaste desconectado por no tener el panel abierto. Márcate en línea para recibir casos.");
    }
    aplicar(data);
  }, []);

  useEffect(() => {
    // Al cambiar de pantalla no se repite la señal si es reciente.
    if (!memoria.valor || Date.now() - memoria.senalEn > SENAL_CADA_MS - 10_000) senal();
    const t = setInterval(senal, SENAL_CADA_MS);
    return () => clearInterval(t);
  }, [senal]);

  async function cambiar(estado) {
    if (guardando) return;
    setGuardando(true);
    const { data, error } = await fijarDisponibilidad(estado);
    setGuardando(false);
    if (error) {
      setAviso(faltaMigracion(error) ? "" : "No se pudo cambiar tu estado. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    memoria.senalEn = Date.now();
    aplicar(data);
    setAviso("");
    setAbierto(false);
  }

  const conEstado = visible && actual;
  const e = conEstado ? ESTADOS[actual.estado] || ESTADOS.desconectado : null;

  const fila = (
    <>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-oro-500 text-chico font-bold text-marca-900">
        {iniciales}
        {e && <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-marca-900", e.punto)} />}
      </span>
      <span className={cn("min-w-0 flex-1 text-left", compacta && "lg:hidden")}>
        <span className="block truncate text-chico font-semibold text-white/90">{correo}</span>
        <span className="block truncate text-xs font-semibold text-oro-500">
          {rol}
          {e && <span className="font-medium text-white/55"> · {e.texto}</span>}
        </span>
      </span>
    </>
  );
  const clase = cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5", compacta ? "px-2 lg:flex-none lg:justify-center lg:px-0" : "px-2");

  if (!conEstado) return <div className={clase} title={compacta ? `${correo} · ${rol}` : undefined}>{fila}</div>;

  const boton = (
    <button
      type="button"
      aria-label={`${correo}, ${rol}. Tu estado: ${e.texto}. Cambiar`}
      title={compacta ? `${correo} · ${rol} · ${e.texto}` : "Cambiar tu estado"}
      className={cn(clase, "transition hover:bg-white/5")}
    >
      {fila}
    </button>
  );

  return (
    <>
      <Popover.Root open={abierto} onOpenChange={setAbierto}>
        {/* Plegada, el texto va en el title: dos disparadores (pista y
            menú) sobre el mismo botón se pisan. */}
        <Popover.Trigger asChild>{boton}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 w-[260px] rounded-xl border border-border bg-card p-1.5 text-foreground shadow-alzado"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">Tu estado</p>
            <ul role="listbox" aria-label="Tu estado">
              {ORDEN_ESTADOS.map((clave) => {
                const op = ESTADOS[clave];
                const elegido = clave === actual.estado;
                return (
                  <li key={clave}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={elegido}
                      disabled={guardando}
                      onClick={() => cambiar(clave)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-muted disabled:opacity-60",
                        elegido && "bg-muted",
                      )}
                    >
                      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", clave === "desconectado" ? "bg-muted-foreground/40" : op.punto)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{op.texto}</span>
                        <span className="block text-xs text-muted-foreground">{op.detalle}</span>
                      </span>
                      {elegido && (
                        <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-marca-700" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
              Si cierras el panel, a los 10 minutos pasas a desconectado.
            </p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {aviso && !compacta && <p className="order-last w-full px-2 text-[11px] leading-snug text-oro-500">{aviso}</p>}
    </>
  );
}
