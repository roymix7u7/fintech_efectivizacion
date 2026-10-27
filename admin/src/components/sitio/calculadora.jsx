"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TARIFAS, comisionDe, enlaceWhatsapp } from "./datos";

const soles = (n) => `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctTexto = (p) => `${p.toLocaleString("es-PE")} %`;

/**
 * Cuánto recibe el cliente, con las comisiones estándar de la hoja
 * oficial (components/sitio/datos.js): porcentaje por banco y comisión
 * mínima en montos menores al límite de cada uno.
 */
export default function Calculadora() {
  const [banco, setBanco] = useState("BCP");
  const [texto, setTexto] = useState("1500");

  const tarifa = TARIFAS.find((t) => t.nombre === banco) || TARIFAS[0];
  const monto = Number(texto);
  const comision = Number.isFinite(monto) ? comisionDe(tarifa, monto) : 0;
  const aplicaMinimo = Number.isFinite(monto) && monto < tarifa.limite && comision === tarifa.minimo && monto * tarifa.pct < tarifa.minimo * 100;

  const error = !texto
    ? "Escribe cuánto vas a efectivizar."
    : !Number.isFinite(monto) || monto <= 0
      ? "Escribe un monto válido, por ejemplo 1500 o 1500.50."
      : comision >= monto
        ? `Con este monto la comisión mínima (${soles(tarifa.minimo)}) supera lo que efectivizas.`
        : null;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-6 text-marca-700 shadow-[0_40px_80px_-30px_rgba(11,20,38,0.45)] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-oro-500/15 blur-3xl" />

      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-oro-700">Calculadora</p>
      <h3 className="mt-1 font-heading text-2xl font-semibold">¿Cuánto recibes?</h3>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-bold text-[#4F5B74]">Tarjeta</legend>
        <div className="flex flex-wrap gap-2">
          {TARIFAS.map((b) => (
            <button
              key={b.nombre}
              type="button"
              onClick={() => setBanco(b.nombre)}
              aria-pressed={banco === b.nombre}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-bold transition",
                banco === b.nombre ? "border-marca-700 bg-marca-700 text-white shadow-md" : "border-[#DCE3EE] bg-white text-[#4F5B74] hover:border-marca-300",
              )}
            >
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: b.color }} />
              {b.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="monto" className="mt-6 block text-sm font-bold text-[#4F5B74]">
        Monto que efectivizas
      </label>
      <div
        className={cn(
          "mt-2 flex items-center rounded-2xl border-2 bg-[#F6F8FC] px-4 transition focus-within:bg-white",
          error && texto ? "border-red-300 focus-within:border-red-400" : "border-[#DCE3EE] focus-within:border-marca-500",
        )}
      >
        <span className="font-heading text-2xl font-semibold text-[#8A93A6]">S/</span>
        <input
          id="monto"
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            // Solo números y un punto decimal, con hasta dos decimales.
            const limpio = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
            const [entero, ...resto] = limpio.split(".");
            setTexto(resto.length ? `${entero.slice(0, 7)}.${resto.join("").slice(0, 2)}` : entero.slice(0, 7));
          }}
          aria-invalid={Boolean(error)}
          aria-describedby="monto-ayuda"
          className="cifras w-full bg-transparent px-2 py-4 font-heading text-3xl font-semibold text-marca-700 outline-none"
        />
      </div>
      <p id="monto-ayuda" role={error ? "alert" : undefined} className="mt-1.5 min-h-[1.25rem] text-chico font-semibold text-red-600">
        {error}
      </p>

      <div className="mt-4 rounded-2xl bg-marca-900 p-5 text-white">
        <div className="flex items-center justify-between gap-3 text-sm text-white/65">
          <span>{aplicaMinimo ? "Comisión mínima" : `Comisión (${pctTexto(tarifa.pct)})`}</span>
          <span className="cifras font-semibold text-white/90">{error ? "—" : `− ${soles(comision)}`}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-sm font-bold text-white/80">Recibes en tu cuenta</span>
          <span className="cifras font-heading text-3xl font-semibold text-oro-500" aria-live="polite">
            {error ? "S/ —" : soles(monto - comision)}
          </span>
        </div>
      </div>

      <a
        href={enlaceWhatsapp("Hola, quiero consultar la tasa preferencial para efectivizar mi tarjeta.")}
        target="_blank"
        rel="noopener"
        className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-oro-300 bg-oro-50 px-4 py-3 transition hover:bg-oro-100"
      >
        <span>
          <span className="block text-sm font-extrabold text-oro-700">¿Operas seguido?</span>
          <span className="block text-chico text-[#6E5300]">Pide tu tasa preferencial por WhatsApp.</span>
        </span>
        <span aria-hidden className="text-xl text-oro-700">→</span>
      </a>
    </div>
  );
}
