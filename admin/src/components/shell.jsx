"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/marca";

/**
 * Secciones del panel. Los roles se repiten aqui y en cada pagina a
 * proposito: esto solo decide que se ve, la pagina decide que se puede
 * abrir, y las politicas RLS deciden que se puede tocar de verdad.
 */
export const SECCIONES = [
  {
    ruta: "/dashboard",
    titulo: "Resumen",
    detalle: "Vista general del día",
    roles: ["admin", "gestor"],
    icono: Cuadricula,
  },
  {
    ruta: "/solicitudes",
    titulo: "Solicitudes",
    detalle: "Comprobantes por revisar",
    roles: ["admin", "gestor"],
    icono: Documento,
    contador: "solicitudesPendientes",
  },
  {
    ruta: "/kyc",
    titulo: "Verificación de clientes",
    detalle: "Documentos de identidad",
    roles: ["admin", "gestor"],
    icono: Persona,
    contador: "kycPendientes",
  },
  {
    ruta: "/tarjetas",
    titulo: "Tarjetas",
    detalle: "Altas por verificar",
    roles: ["admin"],
    icono: Tarjeta,
    contador: "tarjetasPendientes",
  },
  {
    ruta: "/alertas",
    titulo: "Noticias",
    detalle: "Avisos para clientes",
    roles: ["admin"],
    icono: Megafono,
  },
  {
    ruta: "/guias",
    titulo: "Guías de banco",
    detalle: "Pasos por entidad",
    roles: ["admin"],
    icono: Libro,
  },
  {
    ruta: "/auditoria",
    titulo: "Auditoría",
    detalle: "Historial de acciones",
    roles: ["admin"],
    icono: Reloj,
  },
];

/**
 * Armazon de todas las pantallas: barra lateral con la marca, cabecera
 * con el titulo y el area de contenido.
 */
export default function Shell({ session, titulo, descripcion, acciones, contadores = {}, children }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const visibles = SECCIONES.filter((s) => s.roles.includes(session.rol));

  async function salir() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Capa oscura en movil cuando el menu esta abierto */}
      {abierto && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-30 bg-marca-950/50 lg:hidden"
        />
      )}

      {/* ─────────── Barra lateral ─────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-marca-900 transition-transform duration-200 lg:static lg:translate-x-0",
          abierto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[68px] shrink-0 items-center border-b border-white/10 px-5">
          <Logo />
        </div>

        <nav className="scroll-fino flex-1 overflow-y-auto px-3 py-4">
          {visibles.map((s) => {
            const activo =
              pathname === s.ruta || pathname.startsWith(s.ruta + "/");
            const n = contadores[s.contador] || 0;
            const Icono = s.icono;
            return (
              <Link
                key={s.ruta}
                href={s.ruta}
                onClick={() => setAbierto(false)}
                className={cn(
                  "group relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                  activo
                    ? "barra-lateral-activa font-semibold text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90",
                )}
              >
                {activo && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-oro-500" />
                )}
                <Icono
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    activo ? "text-oro-500" : "text-white/45",
                  )}
                />
                <span className="flex-1 truncate">{s.titulo}</span>
                {n > 0 && (
                  <span
                    className={cn(
                      "cifras rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                      activo
                        ? "bg-oro-500 text-marca-900"
                        : "bg-white/10 text-white/70",
                    )}
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-oro-500 text-[13px] font-bold text-marca-900">
              {(session.user.email || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white/90">
                {session.user.email}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-oro-500">
                {session.rol}
              </p>
            </div>
          </div>
          <button
            onClick={salir}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/5 hover:text-white/90"
          >
            <Salida className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─────────── Contenido ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center gap-4 border-b border-border bg-card/85 px-5 backdrop-blur lg:px-8">
          <button
            onClick={() => setAbierto(true)}
            className="-ml-1 rounded-md p-2 text-muted-foreground transition hover:bg-muted lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 py-3">
            <h1 className="truncate text-[17px] font-semibold leading-tight text-foreground">
              {titulo}
            </h1>
            {descripcion && (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {descripcion}
              </p>
            )}
          </div>

          {acciones && (
            <div className="flex shrink-0 items-center gap-2">{acciones}</div>
          )}
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/* ───────────────── Iconos ─────────────────
   Dibujados a mano para no arrastrar una libreria entera por ocho
   trazos. Todos comparten grosor y caja, asi la barra se ve pareja. */

function base(props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function Cuadricula(p) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function Documento(p) {
  return (
    <svg {...base(p)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function Persona(p) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export function Tarjeta(p) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 15h3" />
    </svg>
  );
}

export function Megafono(p) {
  return (
    <svg {...base(p)}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

export function Libro(p) {
  return (
    <svg {...base(p)}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </svg>
  );
}

export function Reloj(p) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function Salida(p) {
  return (
    <svg {...base(p)}>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M11 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
    </svg>
  );
}

export function Menu(p) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function Lupa(p) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Flecha(p) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Check(p) {
  return (
    <svg {...base(p)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Cruz(p) {
  return (
    <svg {...base(p)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
