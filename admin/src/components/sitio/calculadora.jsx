"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TARIFAS, comisionDe } from "./datos";

const soles = (n) => `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const esMinimo = Number.isFinite(monto) && monto < tarifa.limite && (monto * tarifa.pct) / 100 < tarifa.minimo;

  const error = !texto
    ? "Escribe un monto."
    : !Number.isFinite(monto) || monto <= 0
      ? "Escribe un monto válido."
      : comision >= monto
        ? `La comisión mínima es ${soles(tarifa.minimo)}.`
        : null;

  return (
    <div className="rounded-2xl border border-[#E3E9F2] bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_24px_48px_-24px_rgba(15,27,51,0.18)] sm:p-8">
      <p id="banco-calc" className="text-sm font-medium text-[#626D82]">
        Tarjeta
      </p>
      <div role="radiogroup" aria-labelledby="banco-calc" className="mt-3 flex flex-wrap gap-2">
        {TARIFAS.map((b) => (
          <button
            key={b.nombre}
            type="button"
            role="radio"
            aria-checked={banco === b.nombre}
            onClick={() => setBanco(b.nombre)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              banco === b.nombre ? "border-marca-900 bg-marca-900 text-white" : "border-[#E3E9F2] text-[#4F5B74] hover:border-[#C3CEE2]",
            )}
          >
            {b.nombre}
          </button>
        ))}
      </div>

      <label htmlFor="monto" className="mt-8 block text-sm font-medium text-[#626D82]">
        Monto
      </label>
      <div className={cn("mt-2 flex items-baseline gap-2 border-b-2 pb-2 transition", error ? "border-red-300" : "border-[#E3E9F2] focus-within:border-marca-900")}>
        <span className="font-heading text-3xl font-normal text-[#8A93A6]">S/</span>
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
          aria-describedby="monto-error"
          className="cifras w-full bg-transparent font-heading text-5xl font-normal tracking-tight text-marca-900 outline-none"
        />
      </div>
      <p id="monto-error" role={error ? "alert" : undefined} className="mt-2 min-h-[1.25rem] text-chico font-medium text-red-600">
        {error}
      </p>

      <dl className="mt-4 space-y-3 text-md">
        <div className="flex justify-between text-[#626D82]">
          <dt>{esMinimo ? "Comisión mínima" : `Comisión ${tarifa.pct.toLocaleString("es-PE")} %`}</dt>
          <dd className="cifras">{error ? "—" : `− ${soles(comision)}`}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-[#E3E9F2] pt-4">
          <dt className="font-medium text-marca-900">Recibes</dt>
          <dd className="cifras font-heading text-4xl font-normal tracking-tight text-marca-900" aria-live="polite">
            {error ? "S/ —" : soles(monto - comision)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
