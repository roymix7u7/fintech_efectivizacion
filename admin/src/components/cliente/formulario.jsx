"use client";

import { cn } from "@/lib/utils";

/**
 * Formularios de Mi cuenta (cuenta, tarjeta, solicitud) en dos columnas:
 * a la izquierda un panel azul noche con la ilustración, el mensaje y
 * las condiciones; a la derecha los campos, con todo el ancho.
 *
 * En el celular el panel se vuelve una franja corta y las condiciones
 * se pliegan, para no tener que bajar tanto antes de llenar.
 */
export default function MarcoFormulario({
  ilustracion,
  mensaje,
  resaltado,
  texto,
  condiciones,
  titulo,
  subtitulo,
  children,
}) {
  return (
    <div className="mx-auto w-full max-w-6xl lg:py-2">
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,27,51,0.05),0_30px_60px_-36px_rgba(15,27,51,0.35)] lg:grid lg:grid-cols-[minmax(0,400px)_1fr]">
        {/* ── Panel azul ── */}
        <aside className="relative isolate overflow-hidden bg-[#0B1426] px-5 py-5 text-white sm:px-7 lg:flex lg:flex-col lg:px-10 lg:py-10">
          <svg
            aria-hidden
            viewBox="0 0 400 400"
            className="pointer-events-none absolute -right-20 -top-16 -z-10 hidden h-80 w-80 opacity-80 lg:block"
          >
            <circle
              cx="200"
              cy="200"
              r="150"
              fill="none"
              stroke="#E8B800"
              strokeWidth="5"
              strokeDasharray="300 700"
              strokeLinecap="round"
            />
          </svg>
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-80 w-80 rounded-full bg-[#2B4C9B]/30 blur-3xl"
          />

          {ilustracion && (
            <div className="mx-auto hidden w-full max-w-[290px] lg:mb-8 lg:mt-6 lg:block">
              {ilustracion}
            </div>
          )}

          <h2 className="font-heading text-xl leading-tight sm:text-2xl lg:text-[1.65rem]">
            {mensaje}{" "}
            {resaltado && <span className="text-oro-500">{resaltado}</span>}
          </h2>
          <span
            aria-hidden
            className="mt-3 hidden h-1 w-12 rounded-full bg-oro-500 lg:block"
          />
          {texto && (
            <p className="mt-5 hidden text-[0.95rem] leading-relaxed text-white/70 lg:block">
              {texto}
            </p>
          )}

          {condiciones?.length > 0 && (
            <>
              {/* Computadora: siempre a la vista */}
              <ul className="mt-8 hidden space-y-3 lg:block">
                {condiciones.map((c) => (
                  <Condicion key={c.texto} {...c} />
                ))}
              </ul>
              {/* Celular: plegadas, para no alargar la pantalla */}
              <details className="group mt-3 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-oro-500"
                    aria-hidden
                  >
                    <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  <span className="flex-1">
                    Importante:{" "}
                    {condiciones.map((c) => c.corto || c.texto).join(" · ")}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="h-4 w-4 shrink-0 transition group-open:rotate-180"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <ul className="space-y-3 px-3.5 pb-3.5 pt-1">
                  {condiciones.map((c) => (
                    <Condicion key={c.texto} {...c} />
                  ))}
                </ul>
              </details>
            </>
          )}
        </aside>

        {/* ── Formulario ── */}
        <div className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
          {titulo && (
            <h1 className="font-heading text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-marca-900 sm:text-[2rem]">
              {titulo}
            </h1>
          )}
          {subtitulo && <p className="mt-1.5 text-[#6B7690]">{subtitulo}</p>}
          <div className={cn(titulo && "mt-6")}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const TONOS = {
  si: { clase: "bg-emerald-500/15 text-emerald-300", d: "M20 6 9 17l-5-5" },
  no: { clase: "bg-red-500/15 text-red-300", d: "M18 6 6 18M6 6l12 12" },
  banco: {
    clase: "bg-[#3B6FD8]/20 text-[#9DB8F5]",
    d: "M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  },
  candado: {
    clase: "bg-oro-500/15 text-oro-300",
    d: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  },
  info: {
    clase: "bg-white/10 text-white/70",
    d: "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
};

function Condicion({ tono, texto, detalle }) {
  const t = TONOS[tono] || TONOS.info;
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
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
      <span className="pt-0.5 text-sm leading-snug">
        <span className="font-semibold text-white">{texto}</span>
        {detalle && (
          <span className="block text-chico text-white/55">{detalle}</span>
        )}
      </span>
    </li>
  );
}

/** Opción grande con ícono (tipo de cuenta). La elegida, en azul noche con ✓ dorada. */
export function Opcion({
  activa,
  deshabilitada,
  onClick,
  icono,
  titulo,
  detalle,
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition sm:px-4 sm:py-3.5",
        activa
          ? "border-[#0B1426] bg-[#0B1426] text-white shadow-[0_12px_26px_-14px_rgba(11,20,38,0.8)]"
          : "border-[#DCE3EE] bg-white hover:border-[#C3CFE0] hover:bg-[#F6F8FC]",
        deshabilitada && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex",
          activa ? "bg-white/10 text-oro-500" : "bg-[#EFF3F9] text-marca-900",
        )}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold sm:text-[0.95rem]">
          {titulo}
        </span>
        <span
          className={cn(
            "block text-chico leading-snug",
            activa ? "text-white/65" : "text-[#8A93A6]",
          )}
        >
          {detalle}
        </span>
      </span>
      {activa && <Visto className="absolute -right-1.5 -top-1.5 h-5 w-5" />}
    </button>
  );
}

/** ✓ dorada de la opción elegida. */
export function Visto({ className }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-oro-500 text-marca-900 shadow",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** Pista bajo un campo, en recuadro azul claro con ícono de información. */
export function Pista({ children }) {
  return (
    <p className="mt-2.5 flex items-start gap-2.5 rounded-xl bg-[#EEF3FC] px-3.5 py-2.5 text-chico leading-relaxed text-[#3D4A63]">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#3B6FD8] text-[0.6rem] font-bold text-white"
        aria-hidden
      >
        i
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Botón principal del formulario: azul noche, ancho completo y flecha. */
export function BotonEnviar({ cargando, children, tono = "noche", ...props }) {
  return (
    <button
      type="submit"
      disabled={cargando || props.disabled}
      {...props}
      className={cn(
        "group flex h-14 w-full items-center justify-center gap-3 rounded-full px-6 text-[0.98rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        tono === "oro"
          ? "bg-oro-500 text-marca-900 hover:bg-oro-300"
          : "bg-[#0B1426] text-white hover:bg-marca-700",
      )}
    >
      {cargando && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      <span>{children}</span>
      {!cargando && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 transition group-hover:translate-x-0.5"
          aria-hidden
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

/* ───────── Ilustraciones ───────── */

const Degradados = ({ id }) => (
  <defs>
    <linearGradient id={`${id}-pilar`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#F4F6FF" />
      <stop offset="1" stopColor="#B9C2EE" />
    </linearGradient>
    <linearGradient id={`${id}-techo`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#FFFFFF" />
      <stop offset="1" stopColor="#C7CEF2" />
    </linearGradient>
    <linearGradient id={`${id}-oro`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#FFE07A" />
      <stop offset="1" stopColor="#E8A800" />
    </linearGradient>
    <linearGradient id={`${id}-tarjeta`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#1E3366" />
      <stop offset="1" stopColor="#0F1B33" />
    </linearGradient>
  </defs>
);

/** Banco con su tarjeta y una moneda dorada (Agregar cuenta). */
export function IlustracionBanco() {
  return (
    <svg
      viewBox="0 0 300 250"
      className="h-auto w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)]"
      aria-hidden
    >
      <Degradados id="ib" />
      <ellipse cx="150" cy="232" rx="120" ry="10" fill="#000" opacity="0.25" />
      <path d="M150 18 28 82h244z" fill="url(#ib-techo)" />
      <rect
        x="40"
        y="80"
        width="220"
        height="16"
        rx="4"
        fill="url(#ib-pilar)"
      />
      {[58, 104, 150, 196].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y="100"
            width="26"
            height="104"
            rx="5"
            fill="url(#ib-pilar)"
          />
          <rect
            x={x + 4}
            y="104"
            width="5"
            height="96"
            rx="2"
            fill="#FFFFFF"
            opacity="0.6"
          />
        </g>
      ))}
      <rect
        x="34"
        y="204"
        width="232"
        height="14"
        rx="4"
        fill="url(#ib-pilar)"
      />
      <rect x="24" y="216" width="252" height="12" rx="4" fill="#AEB8E6" />
      <circle cx="160" cy="98" r="30" fill="url(#ib-oro)" />
      <circle
        cx="160"
        cy="98"
        r="22"
        fill="none"
        stroke="#FFF3C4"
        strokeWidth="2"
        opacity="0.8"
      />
      <path
        d="M148 108h24M150 92h20l-10-7zM152 94v12M160 94v12M168 94v12"
        stroke="#8C6A00"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(150 140)">
        <rect
          width="132"
          height="84"
          rx="12"
          fill="url(#ib-tarjeta)"
          stroke="#2D4680"
        />
        <rect x="16" y="22" width="56" height="8" rx="4" fill="#E9EDFB" />
        <rect
          x="16"
          y="38"
          width="36"
          height="8"
          rx="4"
          fill="#E9EDFB"
          opacity="0.8"
        />
        <rect x="16" y="58" width="44" height="7" rx="3.5" fill="#E9EDFB" />
        <rect x="86" y="56" width="30" height="7" rx="3.5" fill="#E8B800" />
        <rect
          x="86"
          y="44"
          width="30"
          height="7"
          rx="3.5"
          fill="#E8B800"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

/** Tarjeta de crédito con escudo de seguridad (Agregar tarjeta). */
export function IlustracionTarjeta() {
  return (
    <svg
      viewBox="0 0 300 230"
      className="h-auto w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)]"
      aria-hidden
    >
      <Degradados id="it" />
      <ellipse cx="150" cy="214" rx="118" ry="10" fill="#000" opacity="0.25" />
      <g transform="rotate(-8 150 110)">
        <rect
          x="40"
          y="40"
          width="200"
          height="126"
          rx="16"
          fill="url(#it-pilar)"
        />
        <rect
          x="40"
          y="62"
          width="200"
          height="22"
          fill="#9AA6DD"
          opacity="0.6"
        />
      </g>
      <g transform="translate(60 74)">
        <rect
          width="200"
          height="126"
          rx="16"
          fill="url(#it-tarjeta)"
          stroke="#2D4680"
        />
        <rect x="20" y="28" width="34" height="26" rx="5" fill="url(#it-oro)" />
        <rect x="20" y="72" width="34" height="8" rx="4" fill="#3D4A7A" />
        <rect x="60" y="72" width="34" height="8" rx="4" fill="#3D4A7A" />
        <rect x="100" y="72" width="34" height="8" rx="4" fill="#3D4A7A" />
        <rect
          x="140"
          y="70"
          width="40"
          height="12"
          rx="4"
          fill="none"
          stroke="#34D399"
          strokeWidth="2.5"
        />
        <rect x="20" y="96" width="90" height="8" rx="4" fill="#E9EDFB" />
      </g>
      <g transform="translate(212 34)">
        <path
          d="M34 0 66 12v26c0 22-14 38-32 46C16 76 2 60 2 38V12z"
          fill="url(#it-oro)"
        />
        <path
          d="m20 40 10 10 18-20"
          stroke="#5C4600"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

/** Pago con tarjeta que llega como depósito (Nueva solicitud). */
export function IlustracionSolicitud() {
  return (
    <svg
      viewBox="0 0 300 230"
      className="h-auto w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)]"
      aria-hidden
    >
      <Degradados id="is" />
      <ellipse cx="150" cy="214" rx="118" ry="10" fill="#000" opacity="0.25" />
      <g transform="translate(18 40)">
        <rect
          width="150"
          height="96"
          rx="14"
          fill="url(#is-tarjeta)"
          stroke="#2D4680"
        />
        <rect x="16" y="20" width="28" height="22" rx="4" fill="url(#is-oro)" />
        <rect x="16" y="62" width="70" height="8" rx="4" fill="#E9EDFB" />
        <rect x="96" y="62" width="36" height="8" rx="4" fill="#E8B800" />
      </g>
      <path
        d="M170 92c40 0 56 18 62 44"
        stroke="#E8B800"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="2 12"
        fill="none"
      />
      <path
        d="m222 128 10 12 12-10"
        stroke="#E8B800"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <g transform="translate(150 140)">
        <rect width="130" height="66" rx="12" fill="url(#is-pilar)" />
        <circle cx="34" cy="33" r="18" fill="url(#is-oro)" />
        <text
          x="34"
          y="39"
          textAnchor="middle"
          fontSize="16"
          fontWeight="800"
          fill="#5C4600"
          fontFamily="Arial, sans-serif"
        >
          S/
        </text>
        <rect x="62" y="22" width="52" height="8" rx="4" fill="#7B86C4" />
        <rect
          x="62"
          y="38"
          width="36"
          height="8"
          rx="4"
          fill="#7B86C4"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}
