"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Objetos3D } from "@/components/sitio/tarjetas3d";

/* Piezas del área de clientes (registro, ingreso, recuperar, Mi cuenta).
   Mismo lenguaje visual que la web pública: azul noche, azul hielo y
   dorado como acento. */

/** Barra superior del área de clientes: solo la marca y una acción. */
export function Encabezado({ derecha, completo }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1426]/95 backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-16 items-center gap-3 px-4 lg:px-6",
          completo ? "max-w-none" : "max-w-7xl",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="ALTOQUE PERU WK, ir al inicio"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F1B33] ring-1 ring-white/10">
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              className="object-contain"
            />
          </span>
          <span className="whitespace-nowrap font-heading text-[0.9rem] font-bold tracking-[0.06em] text-white">
            ALTOQUE PERU <span className="text-oro-500">WK</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
          {derecha}
        </div>
      </div>
    </header>
  );
}

/**
 * Tarjeta central de los formularios, con título y pasos. Con `escena`
 * (ver escenas.js) va en dos columnas: a la izquierda un panel azul con
 * objetos 3D y el porqué de la pantalla; en el celular ese panel se
 * reduce a una franja sobre el formulario. La tarjeta entra animada cada
 * vez que cambia de paso.
 */
export function Marco({
  titulo,
  subtitulo,
  paso,
  pasos,
  children,
  ancho = "max-w-lg",
  escena,
}) {
  const contenido = (
    <>
      {pasos && <Pasos paso={paso} pasos={pasos} />}
      <div
        key={titulo}
        className="entra-tarjeta rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_30px_60px_-30px_rgba(15,27,51,0.3)] sm:p-9"
      >
        <h1 className="font-heading text-[1.75rem] font-normal leading-tight tracking-[-0.02em] text-marca-900">
          {titulo}
        </h1>
        {subtitulo && <p className="mt-2 text-[#4F5B74]">{subtitulo}</p>}
        <div className="mt-7">{children}</div>
      </div>
    </>
  );

  if (!escena)
    return (
      <main className="mx-auto w-full px-4 py-10 sm:py-14">
        <div className={cn("mx-auto", ancho)}>{contenido}</div>
      </main>
    );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[440px_minmax(0,1fr)]">
      <PanelEscena {...escena} />
      <div className={cn("mx-auto mt-6 w-full lg:mt-0", ancho)}>
        {contenido}
      </div>
    </main>
  );
}

/** Pasos con número, check al completarse y barra que se llena. */
function Pasos({ paso, pasos }) {
  return (
    <ol
      className="mb-6 flex items-start gap-2"
      aria-label={`Paso ${paso} de ${pasos.length}`}
    >
      {pasos.map((p, i) => {
        const n = i + 1;
        const hecho = n < paso;
        const actual = n === paso;
        return (
          <li key={p} className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="relative h-1.5 overflow-hidden rounded-full bg-[#DCE3EE]">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-oro-500 transition-[width] duration-700 ease-out",
                  n <= paso ? "w-full" : "w-0",
                )}
              />
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold transition-colors duration-500",
                  hecho && "bg-emerald-500 text-white",
                  actual && "pulso-paso bg-marca-900 text-oro-500",
                  !hecho && !actual && "bg-[#DCE3EE] text-[#8A93A6]",
                )}
              >
                {hecho ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                    aria-hidden
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                ) : (
                  n
                )}
              </span>
              <span
                className={cn(
                  "truncate text-xs font-semibold",
                  actual ? "text-marca-900" : "text-[#8A93A6]",
                )}
              >
                {p}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Panel azul con objetos 3D. Es un <section> para que los objetos sigan
 * al puntero dentro de él (Objetos3D busca la sección más cercana).
 */
const ICONOS_RAZON = {
  documento: [
    "M3 6h18v12H3z",
    "M8.5 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M5.5 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2",
    "M14 10h4M14 14h3",
  ],
  persona: [
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
  ],
  billetera: ["M3 7h18v12H3z", "M3 7V5h14v2", "M16 13h2"],
};

/**
 * razones: lo importante de la pantalla, en el panel y no en el
 * formulario, para que el formulario quede a la vista sin bajar.
 * ayuda: un enlace (por ejemplo, el modal de "¿Por qué?") que se ve
 * también en la franja del celular.
 */
function PanelEscena({
  titulo,
  texto,
  objetos,
  chispas,
  puntos = [],
  razonesTitulo,
  razones = [],
  ayuda,
}) {
  const conRazones = razones.length > 0;
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-[#0B1426] text-white shadow-[0_30px_60px_-30px_rgba(11,20,38,0.6)] lg:sticky lg:top-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.22),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(47,86,176,0.45),transparent)]"
      />

      {/* Celular y tablet: franja compacta */}
      <div className="flex items-center gap-3 p-5 lg:hidden">
        <div key={titulo} className="entra-tarjeta min-w-0 flex-1">
          <p className="font-heading text-lg leading-snug sm:text-xl">
            {titulo}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/60 sm:text-sm">
            {texto}
          </p>
          {ayuda && <div className="mt-2 text-sm">{ayuda}</div>}
        </div>
        <Objetos3D
          className="relative h-24 w-32 shrink-0 sm:h-28 sm:w-40"
          objetos={objetos}
          conScroll={false}
        />
      </div>

      {/* Escritorio: panel completo */}
      <div className="hidden p-8 lg:block xl:p-10">
        <Objetos3D
          className={cn(
            "relative mx-auto w-full max-w-[340px]",
            conRazones ? "h-[170px] max-w-[260px]" : "h-[230px]",
          )}
          objetos={objetos}
          conScroll={false}
          chispas={chispas}
        />
        <div key={titulo} className="entra-tarjeta">
          <h2
            className={cn(
              "text-balance font-heading font-normal leading-tight tracking-[-0.02em]",
              conRazones ? "mt-4 text-2xl" : "mt-6 text-3xl",
            )}
          >
            {titulo}
          </h2>
          {!conRazones && (
            <p className="mt-3 leading-relaxed text-white/65">{texto}</p>
          )}
          {conRazones && (
            <div className="mt-5 border-t border-white/10 pt-5">
              <h3 className="text-sm font-semibold text-oro-500">
                {razonesTitulo}
              </h3>
              <ul className="mt-4 space-y-4">
                {razones.map((r, i) => (
                  <li
                    key={r.titulo}
                    className="entra flex gap-3"
                    style={{ "--retraso": `${150 + i * 90}ms` }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-oro-500 ring-1 ring-white/10">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[18px] w-[18px]"
                        aria-hidden
                      >
                        {(ICONOS_RAZON[r.icono] || []).map((d) => (
                          <path key={d} d={d} />
                        ))}
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {r.titulo}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-white/60">
                        {r.texto}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {puntos.length > 0 && (
            <ul
              className={cn(
                "border-t border-white/10",
                conRazones ? "mt-5 space-y-2 pt-5" : "mt-6 space-y-3 pt-6",
              )}
            >
              {puntos.map((p, i) => (
                <li
                  key={p}
                  className="entra flex gap-3 text-sm leading-relaxed text-white/80"
                  style={{ "--retraso": `${200 + i * 90}ms` }}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oro-500/15 text-oro-500 ring-1 ring-oro-500/30">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                      aria-hidden
                    >
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          )}
          {ayuda && <div className="mt-5 text-sm">{ayuda}</div>}
        </div>
      </div>
    </section>
  );
}

/** Campo con etiqueta, ayuda, marca de correcto y error debajo. */
export function Campo({
  id,
  etiqueta,
  error,
  ok,
  ayuda,
  prefijo,
  derecha,
  className,
  ...props
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold text-marca-900"
      >
        {etiqueta}
      </label>
      <div
        className={cn(
          "flex items-center rounded-xl border bg-white transition focus-within:ring-4",
          error
            ? "border-red-400 focus-within:ring-red-500/10"
            : ok
              ? "border-emerald-500 focus-within:ring-emerald-500/10"
              : "border-[#DCE3EE] focus-within:border-marca-600 focus-within:ring-marca-600/10",
        )}
      >
        {prefijo && (
          <span className="pl-3.5 text-md font-semibold text-[#8A93A6]">
            {prefijo}
          </span>
        )}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined
          }
          className="h-12 w-full min-w-0 rounded-xl bg-transparent px-3.5 text-md text-marca-900 outline-none placeholder:text-[#AFBCD0]"
          {...props}
        />
        {derecha}
        {ok && !error && !derecha && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-3 h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-chico font-medium text-red-600"
        >
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="mt-1.5 text-chico text-[#8A93A6]">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/** Contraseña con botón para mostrarla u ocultarla. */
export function CampoClave(props) {
  const [ver, setVer] = useState(false);
  return (
    <Campo
      {...props}
      type={ver ? "text" : "password"}
      derecha={
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8A93A6] hover:bg-[#EFF3F9] hover:text-marca-900"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
            {ver && <path d="M3 3l18 18" />}
          </svg>
        </button>
      }
    />
  );
}

/** Las cinco reglas de la contraseña, cada una con su marca. */
export function ReglasClave({ reglas }) {
  const lista = [
    ["length", "8 caracteres o más"],
    ["upper", "Una mayúscula"],
    ["lower", "Una minúscula"],
    ["number", "Un número"],
    ["special", "Un símbolo (!@#$...)"],
  ];
  return (
    <ul
      className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-chico"
      aria-label="Requisitos de la contraseña"
    >
      {lista.map(([k, t]) => (
        <li
          key={k}
          className={cn(
            "flex items-center gap-1.5",
            reglas[k] ? "text-emerald-700" : "text-[#8A93A6]",
          )}
        >
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full",
              reglas[k] ? "bg-emerald-600 text-white" : "bg-[#E3E9F2]",
            )}
          >
            {reglas[k] && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-2.5 w-2.5"
                aria-hidden
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Código de 6 dígitos del correo. Al completarlo se verifica solo. */
export function CodigoSeis({ valor, onCambio, deshabilitado, error }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div>
      <label htmlFor="codigo" className="sr-only">
        Código de 6 dígitos
      </label>
      <div className="relative" onClick={() => ref.current?.focus()}>
        <input
          ref={ref}
          id="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={valor}
          disabled={deshabilitado}
          onChange={(e) =>
            onCambio(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          aria-invalid={Boolean(error)}
        />
        <div className="pointer-events-none grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => {
            const activo = i === Math.min(valor.length, 5);
            return (
              <span
                key={i}
                className={cn(
                  "cifras flex h-14 items-center justify-center rounded-xl border-2 bg-white font-heading text-2xl text-marca-900 transition",
                  error
                    ? "border-red-400"
                    : valor[i]
                      ? "border-marca-900"
                      : activo
                        ? "border-oro-500"
                        : "border-[#DCE3EE]",
                )}
              >
                {valor[i] || ""}
              </span>
            );
          })}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-chico font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Casilla({ id, marcada, onCambio, error, children }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm leading-snug transition",
        error
          ? "border-red-300 bg-red-50/50"
          : marcada
            ? "border-marca-200 bg-[#F6F8FC]"
            : "border-[#E3E9F2] hover:bg-[#F6F8FC]",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={marcada}
        onChange={(e) => onCambio(e.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-marca-900"
      />
      <span className="text-[#2E3A52]">{children}</span>
    </label>
  );
}

export function Boton({
  cargando,
  children,
  tono = "primario",
  className,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={cargando || props.disabled}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        tono === "primario" && "bg-marca-900 text-white hover:bg-marca-700",
        tono === "oro" && "bg-oro-500 text-marca-900 hover:bg-oro-300",
        tono === "neutro" &&
          "border border-[#DCE3EE] bg-white text-marca-900 hover:bg-[#F6F8FC]",
        tono === "enlace" &&
          "h-auto px-0 text-sm text-marca-700 underline underline-offset-4 hover:text-marca-900",
        className,
      )}
    >
      {cargando && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

/** Aviso dentro del formulario: error, atención o listo. */
export function Aviso({ tono = "error", children, onCerrar }) {
  if (!children) return null;
  const estilos = {
    error: "border-red-200 bg-red-50 text-red-800",
    atencion: "border-oro-300 bg-oro-50 text-[#6E5300]",
    exito: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-marca-200 bg-[#F6F8FC] text-marca-700",
  };
  return (
    <div
      role="alert"
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        estilos[tono],
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onCerrar && (
        <button
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Pantalla de espera mientras se confirma la sesión. */
export function Cargando({ texto = "Cargando..." }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-3 text-[#4F5B74]">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-marca-200 border-t-marca-900"
        aria-hidden
      />
      {texto}
    </div>
  );
}
