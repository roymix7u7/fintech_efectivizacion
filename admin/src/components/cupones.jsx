"use client";

import { useMemo, useState } from "react";
import { BANCOS_TARJETA, colorBanco, nombreBanco } from "@/lib/bancos";
import { cn } from "@/lib/utils";
import { TARIFAS } from "@/components/sitio/datos";
import { Check } from "@/components/shell";
import { BotonAccion } from "@/components/carga";
import Pista from "@/components/pista";

/**
 * Piezas de tarifas y cupones que comparten Comisiones y Clientes:
 * validación de cada fila, el editor de tarifas de un cupón, la sigla de
 * cada banco y cómo se muestra la vigencia de un cupón.
 */
export const pct = (n) =>
  n === null || n === undefined || n === ""
    ? "—"
    : `${Number(n)
        .toFixed(2)
        .replace(/\.?0+$/, "")} %`;
export const soles = (n) =>
  `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const aNumero = (t) => Number(String(t).replace(",", ".").trim());
export const vacio = (t) =>
  t === null || t === undefined || String(t).trim() === "";
export const ESTANDAR = Object.fromEntries(TARIFAS.map((t) => [t.nombre, t]));

/** null si es un porcentaje válido; si no, qué está mal. */
export function fallaPorcentaje(texto) {
  if (vacio(texto)) return "Escribe un porcentaje.";
  const n = aNumero(texto);
  if (!Number.isFinite(n)) return "Solo números.";
  if (n < 0 || n > 100) return "Entre 0 y 100.";
  if (Math.round(n * 100) !== Math.round(n * 1e6) / 1e4)
    return "Máximo dos decimales.";
  return null;
}

/** Errores de una fila del cupón: { porcentaje, minimo, limite }. */
export function fallasFila(f) {
  const r = {
    porcentaje: fallaPorcentaje(f.porcentaje),
    minimo: null,
    limite: null,
  };
  const conMin = !vacio(f.minimo);
  const conLim = !vacio(f.limite);
  if (conMin !== conLim) {
    if (!conMin) r.minimo = "Falta el mínimo.";
    else r.limite = "Falta el monto.";
    return r;
  }
  if (conMin) {
    const m = aNumero(f.minimo);
    const l = aNumero(f.limite);
    if (!Number.isFinite(m) || m <= 0) r.minimo = "Mayor que 0.";
    else if (Math.round(m * 100) !== Math.round(m * 1e6) / 1e4)
      r.minimo = "Máximo dos decimales.";
    if (!Number.isFinite(l) || l <= 0) r.limite = "Mayor que 0.";
    if (!r.minimo && !r.limite && m >= l)
      r.minimo = "Debe ser menor que el monto.";
  }
  return r;
}
export const filaValida = (f) => !Object.values(fallasFila(f)).some(Boolean);

/** Las filas editables de un cupón, una por banco. */
export const filasDe = (cupon) =>
  Object.fromEntries(
    BANCOS_TARJETA.map((banco) => {
      const t = (cupon?.bancos || []).find((x) => x.banco === banco);
      return [
        banco,
        {
          porcentaje: t?.porcentaje ?? "",
          minimo: t?.minimo ?? "",
          limite: t?.limite ?? "",
        },
      ];
    }),
  );
export const igual = (a, b) =>
  String(a ?? "").trim() === String(b ?? "").trim() ||
  (!vacio(a) && !vacio(b) && aNumero(a) === aNumero(b));
export const filaCambiada = (a, b) =>
  !igual(a.porcentaje, b.porcentaje) ||
  !igual(a.minimo, b.minimo) ||
  !igual(a.limite, b.limite);

/** Ejemplo de cobro con un monto: el porcentaje, o el mínimo si el monto es menor al límite. */
export function ejemplo(f) {
  if (fallaPorcentaje(f.porcentaje) || !filaValida(f)) return null;
  const p = aNumero(f.porcentaje);
  if (vacio(f.minimo)) return { monto: 1000, cobra: (1000 * p) / 100 };
  const l = aNumero(f.limite);
  const monto = Math.max(100, Math.round(l / 2 / 100) * 100);
  return { monto, cobra: Math.max((monto * p) / 100, aNumero(f.minimo)) };
}

/** ¿La fila difiere de la tarifa publicada en la web? */
export function difiereDeLaWeb(banco, f) {
  const w = ESTANDAR[banco];
  if (!w) return false;
  return (
    !igual(f.porcentaje, w.pct) ||
    !igual(f.minimo, w.minimo) ||
    !igual(f.limite, w.limite)
  );
}

export function SiglaBanco({ banco, conNombre, chica }) {
  const c = colorBanco(banco);
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg font-bold tracking-wide",
          chica ? "h-7 w-7 text-[0.6rem]" : "h-9 w-9 text-[0.68rem]",
        )}
        style={{ background: c.fondo, color: c.texto }}
        aria-hidden
      >
        {c.sigla}
      </span>
      {conNombre && (
        <span className="whitespace-nowrap font-semibold">
          {nombreBanco(banco)}
        </span>
      )}
    </span>
  );
}

/** Entrada numérica con prefijo o sufijo (S/ o %). */
export function Numero({
  id,
  valor,
  onCambio,
  error,
  prefijo,
  sufijo,
  placeholder,
  etiqueta,
  ancho = "w-full",
}) {
  return (
    <>
      <span className={cn("relative flex items-center", ancho)}>
        {prefijo && (
          <span className="pointer-events-none absolute left-2.5 text-chico font-semibold text-muted-foreground">
            {prefijo}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-label={etiqueta}
          aria-invalid={Boolean(error)}
          title={error || undefined}
          placeholder={placeholder}
          className={cn(
            "campo cifras h-9 w-full text-sm font-semibold",
            prefijo ? "pl-8 pr-2" : "pl-2.5 pr-7",
            error && "border-red-400 bg-red-50 focus:ring-red-500/15",
          )}
        />
        {sufijo && (
          <span className="pointer-events-none absolute right-2.5 text-chico font-semibold text-muted-foreground">
            {sufijo}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Edición de un cupón, dentro de una ventana. Cada fila se valida en el
 * momento y "Guardar" no se activa mientras haya un error. Si al guardar
 * algo falla, el motivo se muestra aquí mismo.
 */
export function EditorCupon({ cupon, guardando, onGuardar, onCerrar }) {
  const original = useMemo(() => filasDe(cupon), [cupon]);
  const [filas, setFilas] = useState(original);
  const [falla, setFalla] = useState("");

  const cambios = BANCOS_TARJETA.filter((b) =>
    filaCambiada(filas[b], original[b]),
  ).map((b) => [b, filas[b]]);
  const errores = Object.fromEntries(
    BANCOS_TARJETA.map((b) => [b, fallasFila(filas[b])]),
  );
  const conError = BANCOS_TARJETA.filter(
    (b) =>
      Object.values(errores[b]).some(Boolean) &&
      (filaCambiada(filas[b], original[b]) || !vacio(filas[b].porcentaje)),
  );
  const editar = (banco, campo, v) =>
    setFilas((f) => ({ ...f, [banco]: { ...f[banco], [campo]: v } }));

  async function guardar() {
    if (!cambios.length || conError.length) return;
    setFalla("");
    const r = await onGuardar(cambios);
    if (r === true) onCerrar();
    else setFalla(r || "No se pudo guardar.");
  }

  return (
    <div className="space-y-3">
      {cupon.es_default && (
        <p className="rounded-lg bg-oro-50 px-3 py-2 text-chico text-[#6E5300]">
          Es el cupón estándar: lo que pongas aquí es lo que paga la mayoría y
          debería coincidir con la web.
        </p>
      )}
      {falla && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {falla}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="w-[140px] px-3 py-2 t-etiqueta">Banco</th>
              <th className="w-[96px] px-1.5 py-2 t-etiqueta">Comisión</th>
              <th className="px-1.5 py-2 t-etiqueta">
                <Pista texto="Se cobra como mínimo cuando la operación es menor al monto. Deja los dos vacíos si no aplica.">
                  <span className="cursor-help underline decoration-dotted underline-offset-4">
                    Mínimo · si opera menos de
                  </span>
                </Pista>
              </th>
              <th className="w-[165px] px-3 py-2 t-etiqueta">Ejemplo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {BANCOS_TARJETA.map((banco) => {
              const f = filas[banco];
              const err = errores[banco];
              const cambiada = filaCambiada(f, original[banco]);
              const mostrar = (k) =>
                cambiada || !vacio(f.porcentaje) ? err[k] : null;
              const ej = ejemplo(f);
              const msg =
                mostrar("porcentaje") || mostrar("minimo") || mostrar("limite");
              return (
                <tr key={banco} className={cn(cambiada && "bg-marca-50/60")}>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <SiglaBanco banco={banco} conNombre chica />
                      {cambiada && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-marca-500"
                          title="Cambio sin guardar"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <Numero
                      id={`${cupon.id}-${banco}-pct`}
                      etiqueta={`Comisión de ${nombreBanco(banco)}`}
                      valor={f.porcentaje}
                      onCambio={(v) => editar(banco, "porcentaje", v)}
                      error={mostrar("porcentaje")}
                      sufijo="%"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Numero
                        id={`${cupon.id}-${banco}-min`}
                        etiqueta={`Mínimo de ${nombreBanco(banco)}`}
                        valor={f.minimo}
                        onCambio={(v) => editar(banco, "minimo", v)}
                        error={mostrar("minimo")}
                        prefijo="S/"
                        placeholder="—"
                      />
                      <span className="shrink-0 text-chico text-muted-foreground">
                        bajo
                      </span>
                      <Numero
                        id={`${cupon.id}-${banco}-lim`}
                        etiqueta={`Monto límite de ${nombreBanco(banco)}`}
                        valor={f.limite}
                        onCambio={(v) => editar(banco, "limite", v)}
                        error={mostrar("limite")}
                        prefijo="S/"
                        placeholder="—"
                      />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-chico leading-tight">
                    {msg ? (
                      <span className="font-semibold text-red-600">{msg}</span>
                    ) : ej ? (
                      <span className="text-muted-foreground">
                        <span className="cifras">{soles(ej.monto)}</span> → paga{" "}
                        <span className="cifras font-semibold text-foreground">
                          {soles(Math.round(ej.cobra * 100) / 100)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <p className="text-chico text-muted-foreground">
          {conError.length
            ? `Corrige ${conError.length === 1 ? "la fila marcada" : `las ${conError.length} filas marcadas`}.`
            : cambios.length
              ? `${cambios.length} cambio${cambios.length === 1 ? "" : "s"} · aplica a ${cupon.clientes} cliente${cupon.clientes === 1 ? "" : "s"}.`
              : "Sin cambios."}
        </p>
        <div className="ml-auto flex gap-2">
          <BotonAccion tono="neutro" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonAccion>
          <BotonAccion
            onClick={guardar}
            cargando={guardando}
            disabled={!cambios.length || conError.length > 0}
            icono={<Check className="h-4 w-4" />}
          >
            Guardar cambios
          </BotonAccion>
        </div>
      </div>
    </div>
  );
}

/* ───────── Vigencia ───────── */

/** "12 meses", "90 días", "1 año"; null si no vence. */
export function textoDuracion(dias) {
  if (!dias) return null;
  if (dias % 365 === 0) return dias === 365 ? "1 año" : `${dias / 365} años`;
  if (dias % 30 === 0) return dias === 30 ? "1 mes" : `${dias / 30} meses`;
  return dias === 1 ? "1 día" : `${dias} días`;
}

/** Días que le quedan a un cupón (0 si venció); null si no vence. */
export function diasRestantes(hasta) {
  if (!hasta) return null;
  return Math.max(
    0,
    Math.ceil((new Date(hasta).getTime() - Date.now()) / 86400000),
  );
}

export const fechaCorta = (f) =>
  f
    ? new Date(f).toLocaleDateString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * Estado del cupón de un cliente, con barra de días restantes.
 * `cupon` es el bloque (nombre, es_default); `desde`/`hasta` sus fechas.
 */
export function VigenciaCupon({ cupon, desde, hasta, compacto }) {
  if (!cupon || cupon.es_default) {
    return (
      <span className="text-chico font-semibold text-muted-foreground">
        Tarifa estándar
      </span>
    );
  }
  const quedan = diasRestantes(hasta);
  const total =
    desde && hasta
      ? Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000))
      : null;
  const vencido = quedan === 0;
  const pronto = quedan !== null && quedan > 0 && quedan <= 30;
  const tono = vencido
    ? "bg-red-500"
    : pronto
      ? "bg-oro-500"
      : "bg-emerald-500";
  const texto =
    quedan === null
      ? "Sin vencimiento"
      : vencido
        ? `Venció el ${fechaCorta(hasta)}`
        : `Quedan ${quedan} día${quedan === 1 ? "" : "s"}`;
  return (
    <span className={cn("block", compacto ? "min-w-[140px]" : "")}>
      <span className="flex items-center gap-2">
        <span className="truncate font-semibold text-foreground">
          {cupon.nombre}
        </span>
        <span
          className={cn(
            "shrink-0 text-chico font-semibold",
            vencido
              ? "text-red-700"
              : pronto
                ? "text-oro-700"
                : "text-emerald-700",
          )}
        >
          {texto}
        </span>
      </span>
      {total && (
        <span
          className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <span
            className={cn("block h-full rounded-full", tono)}
            style={{
              width: `${Math.min(100, Math.round(((quedan ?? 0) / total) * 100))}%`,
            }}
          />
        </span>
      )}
      {!compacto && hasta && (
        <span className="mt-1 block text-chico text-muted-foreground">
          Del {fechaCorta(desde)} al {fechaCorta(hasta)}
          {vencido ? " · ahora paga la tarifa estándar" : ""}
        </span>
      )}
    </span>
  );
}
