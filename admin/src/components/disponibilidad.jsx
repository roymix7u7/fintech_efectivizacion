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
 * Selector de disponibilidad en la barra lateral del panel, como el del
 * chat: en línea, ocupado o desconectado. Además manda la señal de "sigo
 * aquí" cada minuto mientras el panel está abierto.
 *
 * Si la migración 070 todavía no está aplicada, no se muestra y el
 * panel funciona igual que antes.
 */
export default function Disponibilidad({ compacta }) {
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

  if (!visible || !actual) return null;
  const e = ESTADOS[actual.estado] || ESTADOS.desconectado;

  const boton = (
    <button
      type="button"
      aria-label={`Tu estado: ${e.texto}. Cambiar`}
      title={compacta ? `${e.texto} · cambiar estado` : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white",
        compacta ? "w-9 justify-center" : "w-full px-3",
      )}
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-marca-900", e.punto)} />
      {!compacta && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{e.texto}</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m7 15 5-5 5 5" />
          </svg>
        </>
      )}
    </button>
  );

  return (
    <div className={cn(compacta ? "lg:flex lg:justify-center" : "")}>
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
      {aviso && !compacta && <p className="mt-1 px-1 text-[11px] leading-snug text-oro-500">{aviso}</p>}
    </div>
  );
}
