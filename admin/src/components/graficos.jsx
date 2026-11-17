"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Gráficos del panel, dibujados a mano en SVG (sin librerías).
 *
 * Reglas que siguen todos:
 *   · Un solo eje vertical, que siempre parte de cero.
 *   · Los colores de las series van en orden fijo (azul, naranja, verde
 *     agua): se validaron juntos para que se distingan también con
 *     daltonismo. El rojo y el verde de "estado" no se usan como serie.
 *   · Con dos o más series hay leyenda; el texto nunca lleva el color de
 *     la serie.
 *   · Al pasar el puntero (o tocar) se ve el valor exacto de ese punto, y
 *     "Ver tabla" muestra los mismos números sin depender del puntero.
 */
export const SERIE = { azul: "#2a78d6", naranja: "#eb6834", aqua: "#1baf7a" };
const EJE = "#7b8499";
const GRILLA = "#e6e9f0";
const BASE = "#c7cedb";

const numero = (n, decimales = 0) =>
  n == null ? "—" : Number(n).toLocaleString("es-PE", { maximumFractionDigits: decimales });

function useAncho() {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    obs.observe(el);
    setAncho(el.clientWidth);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho];
}

/** Tope "redondo" del eje: 4, 10, 20, 50, 100… */
function topeDe(max) {
  if (!(max > 0)) return 4;
  if (max <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(max));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
}

/** Barra con la punta de arriba redondeada y la base recta, apoyada en el eje. */
function barra(x, y, w, h, r) {
  const k = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
}

export function Leyenda({ series, lineas }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-chico text-muted-foreground">
      {series.map((s) => (
        <li key={s.clave} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={lineas ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: s.color }}
          />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Evolución en el tiempo (o por categoría ordenada, como las horas del día).
 *
 * datos: [{ etiqueta, ...valores }]   series: [{ clave, nombre, color }]
 * tipo: "lineas" | "barras" (las barras se apilan si hay más de una serie)
 * etiquetaLarga(d): texto del punto en el aviso y en la tabla.
 */
export function Tendencia({ datos, series, tipo = "lineas", alto = 210, decimales = 0, unidad = "", etiquetaLarga, vacio = "Sin datos en este periodo." }) {
  const [ref, ancho] = useAncho();
  const [sobre, setSobre] = useState(null);
  const [tabla, setTabla] = useState(false);

  const n = datos.length;
  const valor = (d, s) => (d[s.clave] == null ? null : Number(d[s.clave]));
  const maximo = Math.max(
    0,
    ...datos.map((d) => (tipo === "barras" ? series.reduce((t, s) => t + (valor(d, s) || 0), 0) : Math.max(0, ...series.map((s) => valor(d, s) || 0)))),
  );
  const hayDatos = maximo > 0;
  const tope = topeDe(maximo);
  const marcas = [0, tope / 2, tope];

  const m = { izq: 34, der: 8, arr: 10, aba: 22 };
  const w = Math.max(0, ancho - m.izq - m.der);
  const h = alto - m.arr - m.aba;
  const banda = n ? w / n : 0;
  const cx = (i) => m.izq + banda * (i + 0.5);
  const y = (v) => m.arr + h - (v / tope) * h;
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64))));
  const larga = (d) => (etiquetaLarga ? etiquetaLarga(d) : d.etiqueta);

  function mover(e) {
    const caja = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - caja.left - m.izq) / banda);
    setSobre(i >= 0 && i < n ? i : null);
  }

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2">
          <Leyenda series={series} lineas={tipo === "lineas"} />
        </div>
      )}
      <div ref={ref} className="relative" style={{ height: alto }}>
        {ancho > 0 && (
          <svg
            width={ancho}
            height={alto}
            role="img"
            aria-label={`${series.map((s) => s.nombre).join(" y ")}. Usa "Ver tabla" para leer los valores.`}
            onPointerMove={mover}
            onPointerLeave={() => setSobre(null)}
            className="block touch-pan-y select-none"
          >
            {marcas.map((v) => (
              <g key={v}>
                <line x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASE : GRILLA} strokeWidth="1" />
                <text x={m.izq - 6} y={y(v) + 3.5} textAnchor="end" fontSize="11" fill={EJE} className="cifras">
                  {numero(v, v < 10 && !Number.isInteger(v) ? 1 : 0)}
                </text>
              </g>
            ))}
            {datos.map((d, i) =>
              i % cada === 0 ? (
                <text key={i} x={cx(i)} y={alto - 6} textAnchor="middle" fontSize="11" fill={EJE} className="cifras">
                  {d.etiqueta}
                </text>
              ) : null,
            )}

            {sobre != null && hayDatos && (
              <line x1={cx(sobre)} x2={cx(sobre)} y1={m.arr} y2={m.arr + h} stroke={BASE} strokeWidth="1" strokeDasharray={tipo === "lineas" ? "3 3" : undefined} />
            )}

            {hayDatos &&
              tipo === "barras" &&
              datos.map((d, i) => {
                const anchoBarra = Math.max(2, Math.min(22, banda - 4));
                let base = 0;
                const ultimo = series.reduce((u, s, k) => ((valor(d, s) || 0) > 0 ? k : u), -1);
                return series.map((s, k) => {
                  const v = valor(d, s) || 0;
                  if (v <= 0) return null;
                  const y0 = y(base);
                  base += v;
                  const y1 = y(base);
                  const alt = Math.max(1, y0 - y1 - (k === ultimo ? 0 : 2));
                  const x0 = cx(i) - anchoBarra / 2;
                  return k === ultimo ? (
                    <path key={s.clave} d={barra(x0, y0 - alt, anchoBarra, alt, 4)} fill={s.color} opacity={sobre == null || sobre === i ? 1 : 0.45} />
                  ) : (
                    <rect key={s.clave} x={x0} y={y0 - alt} width={anchoBarra} height={alt} fill={s.color} opacity={sobre == null || sobre === i ? 1 : 0.45} />
                  );
                });
              })}

            {hayDatos &&
              tipo === "lineas" &&
              series.map((s) => {
                // Un tramo por cada racha de días con dato; un día suelto se dibuja como punto.
                const tramos = [];
                let actual = [];
                datos.forEach((d, i) => {
                  const v = valor(d, s);
                  if (v == null) {
                    if (actual.length) tramos.push(actual);
                    actual = [];
                  } else actual.push([cx(i), y(v)]);
                });
                if (actual.length) tramos.push(actual);
                return (
                  <g key={s.clave}>
                    {tramos.map((t, k) =>
                      t.length === 1 ? (
                        <circle key={k} cx={t[0][0]} cy={t[0][1]} r="3.5" fill={s.color} />
                      ) : (
                        <polyline key={k} points={t.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      ),
                    )}
                    {sobre != null && valor(datos[sobre], s) != null && (
                      <circle cx={cx(sobre)} cy={y(valor(datos[sobre], s))} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
                    )}
                  </g>
                );
              })}
          </svg>
        )}

        {!hayDatos && ancho > 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center pb-4 text-sm text-muted-foreground">{vacio}</p>
        )}

        {sobre != null && hayDatos && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[132px] rounded-lg border border-border bg-popover px-3 py-2 text-chico shadow-alzado"
            style={cx(sobre) > ancho / 2 ? { right: ancho - cx(sobre) + 10 } : { left: cx(sobre) + 10 }}
          >
            <p className="mb-1 font-semibold text-foreground">{larga(datos[sobre])}</p>
            {series.map((s) => (
              <p key={s.clave} className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <span className="cifras font-semibold text-foreground">
                  {numero(valor(datos[sobre], s), decimales)}
                  {valor(datos[sobre], s) != null ? unidad : ""}
                </span>
                {series.length > 1 && <span>{s.nombre}</span>}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => setTabla((v) => !v)}
          aria-expanded={tabla}
          className="rounded px-1.5 py-0.5 text-chico font-semibold text-marca-600 hover:bg-muted hover:text-marca-700"
        >
          {tabla ? "Ocultar tabla" : "Ver tabla"}
        </button>
      </div>
      {tabla && (
        <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-border">
          <table className="w-full text-chico">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-1.5 font-semibold"> </th>
                {series.map((s) => (
                  <th key={s.clave} className="px-3 py-1.5 text-right font-semibold">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {datos.map((d, i) => (
                <tr key={i}>
                  <td className="px-3 py-1 text-muted-foreground">{larga(d)}</td>
                  {series.map((s) => (
                    <td key={s.clave} className="cifras px-3 py-1 text-right">
                      {numero(valor(d, s), decimales)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Comparación entre categorías: una barra horizontal por fila, ordenadas
 * de mayor a menor por quien llama. Con "partes" la barra se divide
 * (por ejemplo aprobadas y rechazadas) y lleva leyenda.
 *
 * filas: [{ nombre, valor, detalle?, partes?: { clave: n } }]
 */
export function BarrasH({ filas, color = SERIE.azul, partes, decimales = 0, unidad = "", vacio = "Sin datos en este periodo." }) {
  const max = Math.max(0, ...filas.map((f) => Number(f.valor) || 0));
  if (!filas.length || max <= 0) return <p className="py-8 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div>
      {partes && (
        <div className="mb-3">
          <Leyenda series={partes} />
        </div>
      )}
      <ul className="space-y-2.5">
        {filas.map((f) => {
          const total = Number(f.valor) || 0;
          return (
            <li key={f.nombre} className="grid grid-cols-[minmax(0,34%)_minmax(0,1fr)_auto] items-center gap-3" title={f.detalle || undefined}>
              <span className="min-w-0 truncate text-sm font-medium">{f.nombre}</span>
              <span className="flex h-3 items-stretch gap-0.5">
                {partes ? (
                  partes.map((p, k, lista) => {
                    const v = Number(f.partes?.[p.clave]) || 0;
                    if (v <= 0) return null;
                    const ultima = lista.slice(k + 1).every((q) => !(Number(f.partes?.[q.clave]) > 0));
                    return (
                      <span
                        key={p.clave}
                        className={cn("block h-full", ultima && "rounded-r")}
                        style={{ width: `${(v / max) * 100}%`, background: p.color }}
                      />
                    );
                  })
                ) : (
                  <span className="block h-full rounded-r" style={{ width: `${Math.max(1, (total / max) * 100)}%`, background: color }} />
                )}
              </span>
              <span className="cifras min-w-[2.5rem] text-right text-sm font-semibold">
                {numero(total, decimales)}
                {unidad}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Cifra principal con su cambio frente al periodo anterior.
 * menosEsMejor: para tiempos (bajar es bueno).
 */
export function Cifra({ titulo, valor, anterior, sufijo = "", decimales = 0, menosEsMejor = false, pista }) {
  const a = valor == null ? null : Number(valor);
  const b = anterior == null ? null : Number(anterior);
  let cambio = null;
  if (a != null && b != null && b > 0) cambio = ((a - b) / b) * 100;
  const sube = cambio != null && cambio > 0.5;
  const baja = cambio != null && cambio < -0.5;
  const bueno = menosEsMejor ? baja : sube;
  const malo = menosEsMejor ? sube : baja;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-panel" title={pista}>
      <p className="text-sm font-semibold text-muted-foreground">{titulo}</p>
      <p className="cifras mt-1 font-heading text-3xl font-semibold leading-tight">
        {a == null ? "—" : numero(a, decimales)}
        {a != null && sufijo && <span className="ml-0.5 text-lg font-medium text-muted-foreground">{sufijo}</span>}
      </p>
      <p className={cn("mt-1 text-chico", bueno ? "text-emerald-700" : malo ? "text-red-700" : "text-muted-foreground")}>
        {cambio == null ? (
          "Sin periodo anterior para comparar"
        ) : (
          <>
            <span aria-hidden>{sube ? "▲" : baja ? "▼" : "•"}</span>{" "}
            {sube ? "Subió" : baja ? "Bajó" : "Igual que"} {sube || baja ? `${numero(Math.abs(cambio), 0)} % frente al` : "el"} periodo anterior
          </>
        )}
      </p>
    </div>
  );
}
