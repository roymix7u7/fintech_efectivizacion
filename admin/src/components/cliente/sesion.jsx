"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { nombreBanco, colorBanco } from "@/lib/bancos";
import { prepararFoto, ElegirFoto } from "./fotos";
import { Encabezado } from "./piezas";
import { useCuenta } from "./contexto";
import { Visto } from "./formulario";

/**
 * Las pantallas para operar (tarjeta, cuenta, solicitud) son solo para
 * clientes con la cuenta aprobada. La sesión la carga una sola vez el
 * layout de /cuenta (ProveedorCuenta); aquí solo se lee.
 */
export function useClienteActivo() {
  const cuenta = useCuenta();
  if (!cuenta || cuenta.estado !== "activo" || !cuenta.perfil) return null;
  return { usuario: cuenta.usuario, perfil: cuenta.perfil };
}

/** Encabezado de las pantallas internas: siempre se puede volver a Mi cuenta. */
export function EncabezadoInterno() {
  return (
    <Encabezado
      derecha={
        <Link
          href="/cuenta"
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Mi cuenta
        </Link>
      }
    />
  );
}

/**
 * Contenido de una pantalla de Mi cuenta. El encabezado y la barra los
 * pone el layout, así que al navegar solo cambia esto.
 */
// eslint-disable-next-line no-unused-vars
export function PantallaCuenta({ activa, sesion, children }) {
  return children;
}

/** Grilla para elegir banco. `deshabilitado(b)` devuelve el motivo, o null. */
export function ElegirBanco({
  bancos,
  valor,
  onCambio,
  deshabilitado = () => null,
  etiqueta = "Banco",
}) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold text-marca-900">
        {etiqueta}
      </legend>
      {/* En el celular, 3 por fila con la sigla encima: ocupa menos alto. */}
      <div
        className={cn("grid grid-cols-3 gap-2 sm:gap-2.5", "sm:grid-cols-4")}
        role="radiogroup"
        aria-label={etiqueta}
      >
        {bancos.map((b) => {
          const motivo = deshabilitado(b);
          const activo = valor === b;
          const c = colorBanco(b);
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={Boolean(motivo)}
              title={motivo || undefined}
              onClick={() => onCambio(b)}
              // El elegido se pinta con el color de su banco.
              style={
                activo
                  ? {
                      background: c.fondo,
                      borderColor: c.fondo,
                      color: c.texto,
                      boxShadow: `0 12px 24px -12px ${c.fondo}`,
                    }
                  : undefined
              }
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2.5 text-xs font-semibold transition sm:h-14 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3 sm:py-0 sm:text-sm",
                !activo &&
                  "border-[#DCE3EE] bg-white hover:border-[#C3CFE0] hover:bg-[#F6F8FC]",
                motivo && "cursor-not-allowed opacity-40",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold tracking-wide",
                  activo && "ring-2 ring-white/40",
                )}
                style={{
                  background: activo ? "rgba(255,255,255,0.18)" : c.fondo,
                  color: c.texto,
                }}
                aria-hidden
              >
                {c.sigla}
              </span>
              <span className="max-w-full truncate">{nombreBanco(b)}</span>
              {activo && (
                <Visto className="absolute -right-1.5 -top-1.5 h-5 w-5" />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Ícono y color de cada tipo de regla, como el "Consejo" de la app. */
const TONOS_REGLA = {
  si: { clase: "bg-emerald-100 text-emerald-700", d: "M20 6 9 17l-5-5" },
  no: { clase: "bg-red-100 text-red-700", d: "M18 6 6 18M6 6l12 12" },
  banco: {
    clase: "bg-[#DCE6F7] text-[#1E3A8A]",
    d: "M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  },
  candado: {
    clase: "bg-[#FCEFC7] text-[#6E5300]",
    d: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  },
  info: {
    clase: "bg-[#E6ECF5] text-[#3D4A63]",
    d: "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
};

/**
 * "Importante antes de agregarla": las condiciones de una tarjeta o
 * cuenta, con el mismo contenido que la app (Consejo).
 */
export function Condiciones({
  titulo = "Importante antes de agregarla",
  reglas,
}) {
  return (
    <section
      className="rounded-2xl border border-[#E3E9F2] bg-[#F7F9FC] p-4"
      aria-label={titulo}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-marca-900">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-oro-600"
          aria-hidden
        >
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        {titulo}
      </p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {reglas.map((r) => {
          const t = TONOS_REGLA[r.tono] || TONOS_REGLA.info;
          return (
            <li
              key={r.texto}
              className="flex items-start gap-2.5 text-sm text-[#2E3A52]"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  t.clase,
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d={t.d} />
                </svg>
              </span>
              <span className="pt-0.5 leading-snug">
                <span className="font-semibold">{r.texto}</span>
                {r.detalle && (
                  <span className="block text-chico text-[#6B7690]">
                    {r.detalle}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Vista previa de la tarjeta en el color de su banco: se completa en
 * vivo con los últimos 4 dígitos y el nombre que escribe el cliente.
 */
export function VistaTarjeta({ banco, ultimos4, nombre }) {
  const c = banco ? colorBanco(banco) : { fondo: "#1B2A4A", texto: "#FFFFFF" };
  const digitos = (ultimos4 || "").padEnd(4, "•");
  return (
    <div
      className="relative flex aspect-[1.586] w-full max-w-[320px] flex-col justify-between overflow-hidden rounded-2xl p-5 shadow-[0_18px_36px_-18px_rgba(15,27,51,0.55)] transition-colors duration-500"
      style={{
        background: `linear-gradient(135deg, ${c.fondo} 0%, ${c.fondo}d9 55%, #0B1426 150%)`,
        color: c.texto,
      }}
      aria-label={
        banco
          ? `Vista previa de tu tarjeta ${nombreBanco(banco)}`
          : "Vista previa de tu tarjeta"
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10"
      />
      <span className="relative flex items-start justify-between">
        <span className="text-lg font-bold">
          {banco ? nombreBanco(banco) : "Elige tu banco"}
        </span>
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] opacity-70">
          Crédito
        </span>
      </span>
      <span
        aria-hidden
        className="relative h-7 w-10 rounded-md bg-gradient-to-br from-[#F5D976] to-[#C49B00]"
      />
      <span className="relative">
        <span className="cifras block text-lg tracking-[0.18em]">
          •••• •••• •••• {digitos}
        </span>
        <span className="mt-1 block truncate text-[0.72rem] font-semibold uppercase tracking-[0.12em] opacity-80">
          {nombre || "Nombre del titular"}
        </span>
      </span>
    </div>
  );
}

/**
 * Una foto (tarjeta o comprobante). Al tocarla se abre la guía con
 * "Tomar foto" o "Elegir de la galería", como en la app. Se ve entera,
 * sin recortes.
 */
export function FotoUnica({
  id,
  titulo,
  ayuda,
  opcional,
  foto,
  onCambio,
  deshabilitado,
  consejos = [],
  forma = "documento",
}) {
  const [error, setError] = useState("");
  const [preparando, setPreparando] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);

  async function elegir(fuente) {
    setError("");
    setPreparando(true);
    try {
      onCambio(await prepararFoto(fuente));
    } catch (e) {
      setError(e.message);
    } finally {
      setPreparando(false);
    }
  }

  return (
    <div>
      <button
        id={id}
        type="button"
        disabled={deshabilitado || preparando}
        onClick={() => setEligiendo(true)}
        className={cn(
          "relative flex min-h-[170px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center transition disabled:opacity-60",
          foto
            ? "border-emerald-400 bg-[#0B1426]"
            : error
              ? "border-red-300 bg-red-50/40"
              : "border-[#CBD5E3] bg-[#F6F8FC] hover:border-marca-600",
        )}
      >
        {foto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.vista}
              alt={titulo}
              className="max-h-64 w-auto object-contain"
            />
            <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-marca-900">
              Cambiar
            </span>
          </>
        ) : (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-marca-900 text-oro-500">
              {preparando ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              )}
            </span>
            <span className="font-semibold text-marca-900">
              {titulo}
              {opcional && (
                <span className="font-normal text-[#8A93A6]"> (opcional)</span>
              )}
            </span>
            {ayuda && (
              <span className="max-w-xs text-chico text-[#8A93A6]">
                {ayuda}
              </span>
            )}
            <span className="text-chico font-semibold text-marca-700 underline underline-offset-4">
              Tomar foto o elegir de la galería
            </span>
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-chico font-medium text-red-600">
          {error}
        </p>
      )}
      <ElegirFoto
        abierto={eligiendo}
        onCerrar={() => setEligiendo(false)}
        titulo={titulo}
        forma={forma}
        consejos={consejos}
        onFoto={elegir}
      />
    </div>
  );
}
