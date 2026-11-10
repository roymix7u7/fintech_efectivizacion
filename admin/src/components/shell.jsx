"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Popover } from "radix-ui";
import { logout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/marca";
import Pista from "@/components/pista";
import Disponibilidad from "@/components/disponibilidad";

/**
 * Menú del panel.
 *
 * Cada entrada es una pantalla suelta (Resumen) o un grupo con sus
 * pantallas. Los grupos siguen el recorrido del negocio: primero lo que
 * se trabaja todos los días (Operación), luego las personas (Clientes),
 * cómo está armada la empresa (Organización), lo que se publica en la
 * app y, al final, lo legal.
 *
 * Para sumar una pantalla nueva basta con agregarla al grupo que le
 * toca (o crear un grupo) con su ruta, título, detalle, roles e ícono.
 * La barra, el submenú, la burbuja de la barra plegada, la migaja de la
 * cabecera y la guardia de rutas salen solos de aquí.
 *
 * Los roles se repiten aquí y en cada página a propósito: esto solo
 * decide qué se ve, la página decide qué se puede abrir, y las políticas
 * RLS deciden qué se puede tocar de verdad.
 *
 * `enGrupo` es el nombre corto que se usa dentro del submenú, cuando el
 * grupo ya da el contexto ("Clientes › Directorio").
 */
export const MENU = [
  {
    ruta: "/dashboard",
    titulo: "Resumen",
    detalle: "Lo pendiente de hoy, de un vistazo",
    roles: ["admin", "supervisor", "gestor"],
    icono: Cuadricula,
  },
  {
    grupo: "Operación",
    detalle: "Lo que se revisa y se paga cada día",
    icono: Bandeja,
    items: [
      {
        ruta: "/kyc",
        titulo: "Verificación",
        detalle: "Documentos de identidad de los clientes nuevos",
        roles: ["admin", "supervisor", "gestor"],
        icono: Persona,
        contador: "kycPendientes",
      },
      {
        ruta: "/tarjetas",
        titulo: "Tarjetas",
        detalle: "Tarjetas que registran los clientes y hay que verificar",
        roles: ["admin", "supervisor", "gestor"],
        icono: Tarjeta,
        contador: "tarjetasPendientes",
      },
      {
        ruta: "/solicitudes",
        titulo: "Solicitudes",
        detalle: "Comprobantes que envían los clientes para cobrar",
        roles: ["admin", "supervisor", "gestor"],
        icono: Documento,
        contador: "solicitudesPendientes",
      },
      {
        ruta: "/pagos",
        titulo: "Pagos",
        detalle: "Transferencias a los clientes, por banco",
        roles: ["admin", "pagos"],
        icono: Billete,
        contador: "porPagar",
      },
    ],
  },
  {
    grupo: "Clientes",
    detalle: "Buscar, registrar y atender a los clientes",
    icono: Persona,
    items: [
      {
        ruta: "/clientes",
        titulo: "Clientes",
        enGrupo: "Directorio",
        detalle: "Buscar clientes, ver sus datos y su cupón",
        roles: ["admin", "supervisor", "pagos"],
        icono: Lupa,
      },
      {
        ruta: "/alta-presencial",
        titulo: "Nuevo cliente",
        detalle: "Registrar en el local a un cliente que viene en persona",
        roles: ["admin", "supervisor", "gestor"],
        icono: PersonaMas,
      },
      {
        ruta: "/atencion",
        titulo: "Atención al cliente",
        enGrupo: "Atención",
        detalle: "Chats de tu sede: tiempos, asesores y satisfacción",
        roles: ["admin", "supervisor"],
        icono: Burbuja,
      },
    ],
  },
  {
    grupo: "Organización",
    detalle: "Personal, oficinas y tarifas",
    icono: Edificio,
    items: [
      {
        ruta: "/equipo",
        titulo: "Equipo",
        detalle: "Personal, roles, sedes y rendimiento",
        roles: ["admin", "supervisor"],
        icono: Personas,
      },
      {
        ruta: "/sedes",
        titulo: "Sedes",
        detalle: "Oficinas y quién las supervisa",
        roles: ["admin"],
        icono: Edificio,
      },
      {
        ruta: "/comisiones",
        titulo: "Comisiones",
        detalle: "Tarifa estándar, cupones y comisiones especiales",
        roles: ["admin", "supervisor"],
        icono: Porcentaje,
      },
    ],
  },
  {
    grupo: "App de clientes",
    detalle: "Lo que ven los clientes en la app",
    icono: Celular,
    items: [
      {
        ruta: "/alertas",
        titulo: "Noticias y alertas",
        detalle: "Avisos y novedades que aparecen en la app",
        roles: ["admin"],
        icono: Megafono,
      },
      {
        ruta: "/guias",
        titulo: "Guías de banco",
        detalle: "Pasos para operar en la app de cada banco",
        roles: ["admin"],
        icono: Libro,
      },
    ],
  },
  {
    grupo: "Cumplimiento",
    detalle: "Reclamos, datos personales y registros",
    icono: Balanza,
    items: [
      {
        ruta: "/reclamaciones",
        titulo: "Reclamaciones",
        detalle: "Libro de Reclamaciones: plazo de respuesta legal",
        roles: ["admin", "supervisor"],
        icono: Reclamo,
        contador: "reclamosPendientes",
      },
      {
        ruta: "/pedidos-datos",
        titulo: "Pedidos de datos",
        detalle: "Clientes que pidieron eliminar su cuenta",
        roles: ["admin", "supervisor"],
        icono: Escudo,
        contador: "pedidosDatos",
      },
      {
        ruta: "/legal",
        titulo: "Legal",
        detalle: "Términos, privacidad y autorización de fotos",
        roles: ["admin"],
        icono: Balanza,
      },
      {
        ruta: "/auditoria",
        titulo: "Auditoría",
        detalle: "Quién hizo qué y cuándo",
        roles: ["admin"],
        icono: Reloj,
      },
    ],
  },
];

/** Todas las pantallas en una lista, con el grupo al que pertenecen. */
export const SECCIONES = MENU.flatMap((e) =>
  e.items
    ? e.items.map((s) => ({ ...s, grupo: e.grupo }))
    : [{ ...e, grupo: null }],
);

/**
 * Con pocas pantallas los grupos estorban: a un gestor o a pagos se les
 * muestra la lista plana, sin clics de más. Pasado este número, la barra
 * se ordena en submenús.
 */
const PLANA_HASTA = 6;

/**
 * El menú tal como lo ve un rol: grupos sin pantallas desaparecen y un
 * grupo con una sola pantalla se muestra como enlace directo.
 */
function menuDe(rol) {
  const visibles = SECCIONES.filter((s) => s.roles.includes(rol));
  if (visibles.length <= PLANA_HASTA) {
    return { visibles, entradas: visibles, agrupada: false };
  }
  const entradas = [];
  for (const e of MENU) {
    if (!e.items) {
      if (e.roles.includes(rol)) entradas.push({ ...e, grupo: null });
      continue;
    }
    const items = e.items
      .filter((s) => s.roles.includes(rol))
      .map((s) => ({ ...s, grupo: e.grupo }));
    if (items.length === 1) entradas.push(items[0]);
    else if (items.length > 1) entradas.push({ ...e, items });
  }
  return { visibles, entradas, agrupada: true };
}

const esActiva = (ruta, pathname) =>
  pathname === ruta || pathname.startsWith(ruta + "/");

const ROL_TEXTO = {
  admin: "Administrador",
  supervisor: "Supervisor",
  gestor: "Gestor",
  pagos: "Pagos",
};

/* ── Contadores de la barra ──
   Viven fuera del componente: al cambiar de pantalla la barra nueva
   arranca con los últimos números en vez de ceros, y se refrescan por
   detrás. Antes solo algunas pantallas los pedían, así que en el resto
   la barra no avisaba de nada. */
let contadoresGuardados = {};
let pedidosEn = 0;

async function pedirContadores(rol) {
  const salida = {};
  const tareas = [];

  if (["admin", "supervisor", "gestor"].includes(rol)) {
    tareas.push(
      estadoCola().then(({ colas }) =>
        Object.assign(salida, contadoresDe(colas)),
      ),
    );
  }
  if (["admin", "supervisor"].includes(rol)) {
    tareas.push(
      supabase
        .from("reclamaciones")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .then(({ count }) => (salida.reclamosPendientes = count || 0)),
      supabase
        .from("solicitudes_datos")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pendiente", "en_proceso"])
        .then(({ count }) => (salida.pedidosDatos = count || 0)),
    );
  }
  if (["admin", "pagos"].includes(rol)) {
    tareas.push(
      supabase.rpc("pagos_resumen").then(({ data }) => {
        const filas = (data || []).filter((r) => rol === "admin" || r.es_mio);
        salida.porPagar = filas.reduce(
          (n, r) => n + Number(r.por_pagar || 0),
          0,
        );
      }),
    );
  }

  await Promise.allSettled(tareas);
  return salida;
}

function leerPlegado() {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem("panel-plegado") === "1"
    );
  } catch {
    return false;
  }
}

/** Grupos que la persona dejó abiertos la última vez. */
function leerGrupos() {
  try {
    const v = JSON.parse(window.localStorage.getItem("panel-grupos") || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function guardarGrupos(lista) {
  try {
    window.localStorage.setItem("panel-grupos", JSON.stringify(lista));
  } catch {}
}

/**
 * Armazón de todas las pantallas: barra lateral, cabecera con el título
 * y el área de contenido, que ocupa todo el ancho disponible.
 */
export default function Shell({
  session,
  titulo,
  descripcion,
  ayuda,
  acciones,
  volver,
  contadores = {},
  children,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { visibles, entradas, agrupada } = menuDe(session.rol);
  const actual = visibles.find((s) => esActiva(s.ruta, pathname));
  const grupoActual = actual?.grupo || null;

  const [abierto, setAbierto] = useState(false);
  const [plegado, setPlegado] = useState(leerPlegado);
  const [globales, setGlobales] = useState(contadoresGuardados);
  // El grupo de la pantalla abierta arranca desplegado, para que se vea
  // dónde se está sin tener que buscar.
  const [grupos, setGrupos] = useState(() => {
    const g = leerGrupos();
    return grupoActual && !g.includes(grupoActual) ? [...g, grupoActual] : g;
  });

  useEffect(() => {
    if (grupoActual)
      setGrupos((g) => (g.includes(grupoActual) ? g : [...g, grupoActual]));
  }, [grupoActual]);

  function alternarGrupo(nombre) {
    setGrupos((g) => {
      const nuevo = g.includes(nombre)
        ? g.filter((x) => x !== nombre)
        : [...g, nombre];
      guardarGrupos(nuevo);
      return nuevo;
    });
  }

  // Guardia de rutas. Esconder un enlace no impide escribir la
  // dirección a mano: se le devuelve a lo suyo. Los datos igual están
  // protegidos por las políticas; esto evita la pantalla confusa.
  const permitida = Boolean(actual);
  useEffect(() => {
    if (!permitida && visibles.length > 0) router.replace(visibles[0].ruta);
  }, [permitida, visibles, router]);

  const refrescar = useCallback(
    async (forzar = false) => {
      if (!forzar && Date.now() - pedidosEn < 20000) return;
      pedidosEn = Date.now();
      const nuevos = await pedirContadores(session.rol);
      contadoresGuardados = { ...contadoresGuardados, ...nuevos };
      setGlobales(contadoresGuardados);
    },
    [session.rol],
  );

  useEffect(() => {
    refrescar();
    const t = setInterval(
      () => document.visibilityState === "visible" && refrescar(true),
      60000,
    );
    const alVolver = () =>
      document.visibilityState === "visible" && refrescar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescar]);

  // Lo que manda la pantalla es más fresco que lo guardado.
  const cuentas = { ...globales, ...contadores };
  const cuenta = (s) => cuentas[s.contador] || 0;

  function alternarPlegado() {
    setPlegado((p) => {
      try {
        window.localStorage.setItem("panel-plegado", p ? "0" : "1");
      } catch {}
      return !p;
    });
  }

  async function salir() {
    await logout();
    contadoresGuardados = {};
    pedidosEn = 0;
    router.push("/login");
  }

  // Plegada solo en escritorio: en el teléfono la barra es un cajón.
  const compacta = plegado && !abierto;
  const cerrarCajon = () => setAbierto(false);

  return (
    <div className="min-h-screen lg:flex">
      {abierto && (
        <button
          aria-label="Cerrar menú"
          onClick={cerrarCajon}
          className="fixed inset-0 z-30 bg-marca-950/50 lg:hidden"
        />
      )}

      {/* ─────────── Barra lateral ─────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-marca-900 transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          abierto ? "translate-x-0" : "-translate-x-full",
          compacta ? "lg:w-[72px]" : "lg:w-[248px]",
        )}
      >
        <div
          className={cn(
            "flex h-[60px] shrink-0 items-center border-b border-white/10",
            compacta ? "lg:justify-center lg:px-0" : "",
            "px-4",
          )}
        >
          <Link
            href={visibles[0]?.ruta || "/"}
            className="min-w-0"
            onClick={cerrarCajon}
          >
            <span className={cn(compacta && "lg:hidden")}>
              <Logo />
            </span>
            {compacta && (
              <span className="hidden lg:block">
                <Logo conTexto={false} />
              </span>
            )}
          </Link>
        </div>

        <nav
          className="scroll-fino flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
          aria-label="Secciones del panel"
        >
          {entradas.map((e) =>
            e.items ? (
              compacta ? (
                <GrupoPlegado
                  key={e.grupo}
                  g={e}
                  pathname={pathname}
                  cuenta={cuenta}
                />
              ) : (
                <Grupo
                  key={e.grupo}
                  g={e}
                  abierto={grupos.includes(e.grupo)}
                  onAlternar={() => alternarGrupo(e.grupo)}
                  pathname={pathname}
                  cuenta={cuenta}
                  onNavegar={cerrarCajon}
                />
              )
            ) : (
              <Enlace
                key={e.ruta}
                s={e}
                activo={esActiva(e.ruta, pathname)}
                n={cuenta(e)}
                compacta={compacta}
                onClick={cerrarCajon}
              />
            ),
          )}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-1.5",
              compacta && "lg:justify-center lg:px-0",
            )}
          >
            <Pista
              texto={`${session.user.email} · ${ROL_TEXTO[session.rol] || session.rol}`}
              lado="right"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-oro-500 text-chico font-bold text-marca-900">
                {(session.user.email || "?").slice(0, 2).toUpperCase()}
              </span>
            </Pista>
            <div className={cn("min-w-0 flex-1", compacta && "lg:hidden")}>
              <p className="truncate text-chico font-semibold text-white/90">
                {session.user.email}
              </p>
              <p className="text-xs font-semibold text-oro-500">
                {ROL_TEXTO[session.rol] || session.rol}
              </p>
            </div>
          </div>
          <div className="mt-1">
            <Disponibilidad compacta={compacta} />
          </div>
          <div className={cn("mt-1 flex gap-1", compacta ? "lg:flex-col" : "")}>
            <BotonBarra
              onClick={salir}
              texto="Cerrar sesión"
              compacta={compacta}
              icono={<Salida className="h-[18px] w-[18px]" />}
            />
            <span className="hidden lg:block">
              <BotonBarra
                onClick={alternarPlegado}
                texto={plegado ? "Mostrar los nombres" : "Plegar la barra"}
                compacta
                icono={
                  <Plegar
                    className={cn(
                      "h-[18px] w-[18px] transition-transform",
                      plegado && "rotate-180",
                    )}
                  />
                }
              />
            </span>
          </div>
        </div>
      </aside>

      {/* ─────────── Contenido ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:px-6">
          <button
            onClick={() => setAbierto(true)}
            className="-ml-1 rounded-md p-2 text-muted-foreground transition hover:bg-muted lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {volver && (
            <Pista texto={volver.texto || "Volver"} lado="bottom">
              {volver.href ? (
                <Link
                  href={volver.href}
                  aria-label={volver.texto || "Volver"}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <FlechaAtras className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={volver.onClick}
                  aria-label={volver.texto || "Volver"}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <FlechaAtras className="h-4 w-4" />
                </button>
              )}
            </Pista>
          )}

          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            {/* Migaja: con la barra en submenús, dice en qué grupo se está. */}
            {agrupada && grupoActual && (
              <span className="hidden shrink-0 items-center gap-1.5 self-center text-sm font-semibold text-muted-foreground lg:flex">
                {grupoActual}
                <Chevron className="h-3.5 w-3.5 -rotate-90 opacity-60" />
              </span>
            )}
            <h1 className="t-pagina min-w-0 truncate">{titulo}</h1>
            {descripcion && (
              <p className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground md:block">
                {descripcion}
              </p>
            )}
            {ayuda && (
              <span className="self-center">
                <Pista texto={ayuda} lado="bottom" ancho={320} />
              </span>
            )}
          </div>

          {acciones && (
            <div className="flex shrink-0 items-center gap-2">{acciones}</div>
          )}
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function Globo({ n, activo }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "cifras rounded-full px-2 py-0.5 text-xs font-bold",
        activo ? "bg-oro-500 text-marca-900" : "bg-oro-500/20 text-oro-300",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Enlace({ s, activo, n, compacta, onClick }) {
  const Icono = s.icono;
  const enlace = (
    <Link
      href={s.ruta}
      onClick={onClick}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "group relative mb-0.5 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
        activo
          ? "bg-white/10 text-white"
          : "text-white/65 hover:bg-white/5 hover:text-white",
        compacta && "lg:justify-center lg:px-0",
      )}
    >
      {activo && (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-oro-500" />
      )}
      <span className="relative">
        <Icono
          className={cn(
            "h-[19px] w-[19px] shrink-0",
            activo ? "text-oro-500" : "text-white/50 group-hover:text-white/80",
          )}
        />
        {compacta && <Punto n={n} />}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", compacta && "lg:hidden")}>
        {s.titulo}
      </span>
      <span className={cn(compacta && "lg:hidden")}>
        <Globo n={n} activo={activo} />
      </span>
    </Link>
  );

  // Plegada, el nombre y lo pendiente viajan en la burbuja; desplegada,
  // la burbuja explica para qué sirve la sección.
  return (
    <Pista
      texto={
        compacta
          ? `${s.titulo}${n > 0 ? ` · ${n} pendiente${n === 1 ? "" : "s"}` : ""}`
          : s.detalle
      }
      lado="right"
      className="block w-full"
    >
      {enlace}
    </Pista>
  );
}

/** Contador chiquito sobre el ícono, para la barra plegada. */
function Punto({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -right-2 -top-1.5 hidden h-4 min-w-[16px] items-center justify-center rounded-full bg-oro-500 px-1 text-[0.6875rem] font-bold leading-none text-marca-900 lg:flex">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * Grupo con submenú. Cerrado, suma lo pendiente de sus pantallas para
 * que no se escape nada; abierto, cada pantalla muestra lo suyo.
 */
function Grupo({ g, abierto, onAlternar, pathname, cuenta, onNavegar }) {
  const Icono = g.icono;
  const contiene = g.items.some((s) => esActiva(s.ruta, pathname));
  const total = g.items.reduce((t, s) => t + cuenta(s), 0);
  const id = `submenu-${g.grupo.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        aria-controls={id}
        className={cn(
          "group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition",
          contiene && !abierto
            ? "bg-white/10 text-white"
            : contiene
              ? "text-white"
              : "text-white/65 hover:bg-white/5 hover:text-white",
        )}
      >
        {contiene && !abierto && (
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-oro-500" />
        )}
        <Icono
          className={cn(
            "h-[19px] w-[19px] shrink-0",
            contiene ? "text-oro-500" : "text-white/50 group-hover:text-white/80",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{g.grupo}</span>
        {!abierto && <Globo n={total} activo={false} />}
        <Chevron
          className={cn(
            "h-4 w-4 shrink-0 text-white/40 transition-transform duration-200",
            abierto && "rotate-180",
          )}
        />
      </button>

      <div
        id={id}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ul
          className="relative ml-[21px] min-h-0 overflow-hidden border-l border-white/10 pl-2"
          aria-hidden={abierto ? undefined : true}
        >
          {g.items.map((s) => {
            const activo = esActiva(s.ruta, pathname);
            const n = cuenta(s);
            return (
              <li key={s.ruta} className="first:pt-0.5 last:pb-1">
                <Pista texto={s.detalle} lado="right" className="block w-full">
                  <Link
                    href={s.ruta}
                    onClick={onNavegar}
                    tabIndex={abierto ? undefined : -1}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "relative my-px flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                      activo
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {activo && (
                      <span className="absolute -left-[9.5px] inset-y-2 w-[2px] rounded bg-oro-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {s.enGrupo || s.titulo}
                    </span>
                    <Globo n={n} activo={activo} />
                  </Link>
                </Pista>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Grupo con la barra plegada: queda el ícono, y al pasar el cursor (o
 * al hacer clic, o con el teclado) se abre al costado la lista de sus
 * pantallas. Va en una capa aparte para que la barra no la recorte.
 */
function GrupoPlegado({ g, pathname, cuenta }) {
  const [abierto, setAbierto] = useState(false);
  const espera = useRef(null);
  const porMouse = useRef(false);
  const Icono = g.icono;
  const contiene = g.items.some((s) => esActiva(s.ruta, pathname));
  const total = g.items.reduce((t, s) => t + cuenta(s), 0);

  useEffect(() => () => clearTimeout(espera.current), []);

  const entrar = () => {
    clearTimeout(espera.current);
    porMouse.current = true;
    setAbierto(true);
  };
  const salir = () => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => setAbierto(false), 160);
  };

  return (
    <Popover.Root
      open={abierto}
      onOpenChange={(v) => {
        porMouse.current = false;
        setAbierto(v);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={g.grupo}
          onPointerEnter={(e) => e.pointerType === "mouse" && entrar()}
          onPointerLeave={(e) => e.pointerType === "mouse" && salir()}
          className={cn(
            "group relative mb-0.5 flex h-10 w-full items-center justify-center rounded-lg transition",
            contiene || abierto
              ? "bg-white/10 text-white"
              : "text-white/65 hover:bg-white/5 hover:text-white",
          )}
        >
          {contiene && (
            <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-oro-500" />
          )}
          <span className="relative">
            <Icono
              className={cn(
                "h-[19px] w-[19px] shrink-0",
                contiene ? "text-oro-500" : "text-white/50 group-hover:text-white/80",
              )}
            />
            <Punto n={total} />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          onOpenAutoFocus={(e) => porMouse.current && e.preventDefault()}
          onPointerEnter={entrar}
          onPointerLeave={salir}
          className="z-[95] w-64 rounded-xl border border-white/10 bg-marca-900 p-1.5 shadow-flotante animate-aparecer"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-[0.08em] text-white/40">
            {g.grupo}
          </p>
          {g.items.map((s) => {
            const activo = esActiva(s.ruta, pathname);
            return (
              <Link
                key={s.ruta}
                href={s.ruta}
                onClick={() => setAbierto(false)}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oro-500/60",
                  activo ? "bg-white/10" : "hover:bg-white/5 focus-visible:bg-white/5",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-semibold",
                      activo ? "text-white" : "text-white/80",
                    )}
                  >
                    {s.enGrupo || s.titulo}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-white/45">
                    {s.detalle}
                  </span>
                </span>
                <Globo n={cuenta(s)} activo={activo} />
              </Link>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function BotonBarra({ onClick, texto, icono, compacta }) {
  const boton = (
    <button
      onClick={onClick}
      aria-label={texto}
      className={cn(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white",
        compacta ? "w-9 justify-center px-0" : "flex-1",
      )}
    >
      {icono}
      {!compacta && texto}
    </button>
  );
  return compacta ? (
    <Pista texto={texto} lado="right">
      {boton}
    </Pista>
  ) : (
    boton
  );
}

/* ───────────────── Iconos ─────────────────
   Dibujados a mano para no arrastrar una librería entera por unos
   trazos. Todos comparten grosor y caja, así la barra se ve pareja. */

function base(props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
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

/** Persona con un "+": dar de alta a alguien. */
export function PersonaMas(p) {
  return (
    <svg {...base(p)}>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21c0-3.9 3.1-6.5 7-6.5 1.6 0 3 .4 4.2 1.1" />
      <path d="M19 15v6M16 18h6" />
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

export function Reclamo(p) {
  return (
    <svg {...base(p)}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v4M12 14h.01" />
    </svg>
  );
}

export function Escudo(p) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function Balanza(p) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v18M7 21h10M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />
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

export function Burbuja(p) {
  return (
    <svg {...base(p)}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
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

export function Plegar(p) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      <path d="m15.5 10-2 2 2 2" />
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

export function Personas(p) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18.5 14.8c1.9.7 3 2.2 3 4.2" />
    </svg>
  );
}

export function Edificio(p) {
  return (
    <svg {...base(p)}>
      <path d="M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M7 9h4M7 13h4M7 17h4M17 14h1M17 18h1" />
      <path d="M2.5 21h19" />
    </svg>
  );
}

export function Porcentaje(p) {
  return (
    <svg {...base(p)}>
      <path d="M19 5 5 19" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  );
}

export function Billete(p) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </svg>
  );
}

export function Manos(p) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v6" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 13v4a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-4" />
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

export function FlechaAtras(p) {
  return (
    <svg {...base(p)}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
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

export function Refrescar(p) {
  return (
    <svg {...base(p)}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
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

export function Mas(p) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Lapiz(p) {
  return (
    <svg {...base(p)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function Basura(p) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

export function Ojo(p) {
  return (
    <svg {...base(p)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Candado(p) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Campana(p) {
  return (
    <svg {...base(p)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

export function Imagen(p) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

export function Enviar(p) {
  return (
    <svg {...base(p)}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function Correo(p) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

/** Bandeja de entrada: lo que llega para revisar. */
export function Bandeja(p) {
  return (
    <svg {...base(p)}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
    </svg>
  );
}

export function Celular(p) {
  return (
    <svg {...base(p)}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

export function Chevron(p) {
  return (
    <svg {...base(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
