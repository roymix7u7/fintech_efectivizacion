"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { nombreBanco } from "@/lib/bancos";
import { prepararFoto, ElegirFoto } from "./fotos";
import { Encabezado } from "./piezas";
import { useCuenta } from "./contexto";

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
      <legend className="mb-2 text-sm font-semibold">{etiqueta}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
        {bancos.map((b) => {
          const motivo = deshabilitado(b);
          const activo = valor === b;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={Boolean(motivo)}
              title={motivo || undefined}
              onClick={() => onCambio(b)}
              className={cn(
                "h-12 rounded-xl border px-3 text-sm font-semibold transition",
                activo
                  ? "border-marca-900 bg-marca-900 text-white"
                  : "border-[#DCE3EE] bg-white hover:bg-[#F6F8FC]",
                motivo && "cursor-not-allowed opacity-40",
              )}
            >
              {nombreBanco(b)}
            </button>
          );
        })}
      </div>
    </fieldset>
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
        consejos={consejos}
        onFoto={elegir}
      />
    </div>
  );
}
