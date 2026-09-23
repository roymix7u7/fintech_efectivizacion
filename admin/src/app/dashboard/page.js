"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Shell, { SECCIONES, Flecha } from "@/components/shell";
import { Aviso, Estado } from "@/components/marca";
import { EsqueletoTarjetas, Rueda } from "@/components/carga";

export default function DashboardPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({});
  const [recientes, setRecientes] = useState([]);
  const [mias, setMias] = useState(null);
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    getSession()
      .then(async (s) => {
        if (!vivo) return;
        if (!s) return router.push("/login");
        setSession(s);
        // Un gestor no necesita el volumen de la empresa, y tampoco
        // deberia verlo. Se le piden solo sus propios numeros.
        if (s.rol === "gestor") await cargarMias();
        else await Promise.all([cargarStats(), cargarRecientes()]);
      })
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [router]);

  async function cargarMias() {
    const { data, error } = await supabase.rpc("mis_metricas");
    if (error) {
      setError("No se pudieron cargar tus indicadores: " + error.message);
      return;
    }
    setMias(Array.isArray(data) ? data[0] : data);
  }

  async function cargarStats() {
    const contar = async (tabla, filtros) => {
      let q = supabase.from(tabla).select("*", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };

    try {
      const [
        kycPendientes,
        clientesActivos,
        solicitudesPendientes,
        tarjetasPendientes,
      ] = await Promise.all([
        contar("users", { rol: "cliente", estado: "pendiente" }),
        contar("users", { rol: "cliente", estado: "activo" }),
        contar("solicitudes", { estado: "pendiente" }),
        contar("tarjetas", { estado: "pendiente", activa: true }),
      ]);
      setStats({
        kycPendientes,
        clientesActivos,
        solicitudesPendientes,
        tarjetasPendientes,
      });
    } catch (e) {
      // Antes los errores de conteo se descartaban y el panel mostraba
      // ceros, como si de verdad no hubiera nada pendiente.
      setError("No se pudieron cargar los indicadores: " + e.message);
    }
  }

  async function cargarRecientes() {
    const { data } = await supabase
      .from("solicitudes")
      .select(
        "id, codigo, estado, created_at, perfiles_cliente (nombres, apellidos)",
      )
      .order("created_at", { ascending: false })
      .limit(6);
    setRecientes(data || []);
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-[0.8667rem] text-muted-foreground">
        <Rueda />
        Cargando el panel...
      </div>
    );
  if (!session) return null;

  const esGestor = session.rol === "gestor";
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  const pendientes =
    (stats.solicitudesPendientes || 0) +
    (stats.kycPendientes || 0) +
    (stats.tarjetasPendientes || 0);

  // Lo que ve un gestor: su cola y lo que lleva resuelto. Lo que ve
  // un supervisor o un administrador: el volumen de la operacion.
  const tarjetas = esGestor
    ? [
        {
          etiqueta: "Casos que tienes tomados",
          valor: mias?.asignadas,
          ruta: "/solicitudes",
          urgente: true,
        },
        {
          etiqueta: "Resueltos hoy",
          valor: mias?.resueltas_hoy,
          ruta: null,
          urgente: false,
        },
        {
          etiqueta: "Aprobados hoy",
          valor: mias?.aprobadas_hoy,
          ruta: null,
          urgente: false,
        },
        {
          etiqueta: "Resueltos esta semana",
          valor: mias?.resueltas_semana,
          ruta: null,
          urgente: false,
        },
      ]
    : [
        {
          etiqueta: "Comprobantes por revisar",
          valor: stats.solicitudesPendientes,
          ruta: "/solicitudes",
          urgente: true,
        },
        {
          etiqueta: "Clientes por verificar",
          valor: stats.kycPendientes,
          ruta: "/kyc",
          urgente: true,
        },
        {
          etiqueta: "Tarjetas por aprobar",
          valor: stats.tarjetasPendientes,
          ruta: ["admin", "supervisor"].includes(session.rol)
            ? "/tarjetas"
            : null,
          urgente: true,
        },
        {
          etiqueta: "Clientes activos",
          valor: stats.clientesActivos,
          ruta: null,
          urgente: false,
        },
      ];

  const accesos = SECCIONES.filter(
    (x) => x.roles.includes(session.rol) && x.ruta !== "/dashboard",
  );

  return (
    <Shell
      session={session}
      contadores={stats}
      titulo="Resumen"
      descripcion={
        pendientes > 0
          ? `${pendientes} ${pendientes === 1 ? "asunto pendiente" : "asuntos pendientes"} en total`
          : "Todo al día"
      }
    >
      {error && (
        <div className="mb-5">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      {/* Saludo y estado general */}
      <div className="mb-6 overflow-hidden rounded-xl bg-marca-900 p-6 text-white shadow-alzado">
        <p className="text-[13px] text-white/50">{saludo}</p>
        <h2 className="mt-1 text-[22px] font-semibold leading-tight">
          {esGestor
            ? mias?.asignadas > 0
              ? `Tienes ${mias.asignadas} ${mias.asignadas === 1 ? "caso tomado" : "casos tomados"}`
              : "No tienes casos tomados"
            : pendientes > 0
              ? `Tienes ${pendientes} ${pendientes === 1 ? "asunto" : "asuntos"} esperando`
              : "No queda nada pendiente"}
        </h2>
        {(esGestor || pendientes > 0) && (
          <Link
            href={
              esGestor
                ? "/solicitudes"
                : stats.solicitudesPendientes > 0
                  ? "/solicitudes"
                  : stats.kycPendientes > 0
                    ? "/kyc"
                    : "/tarjetas"
            }
            className="pulsable mt-4 inline-flex items-center gap-2 rounded-lg bg-oro-500 px-4 py-2.5 text-[0.8667rem] font-semibold text-marca-900 hover:bg-oro-300"
          >
            {esGestor && !mias?.asignadas
              ? "Atender el siguiente caso"
              : "Empezar a revisar"}
            <Flecha className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Indicadores */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => {
          const contenido = (
            <>
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.etiqueta}
              </p>
              <p
                className={cn(
                  "cifras mt-2 text-[30px] font-bold leading-none",
                  t.urgente && t.valor > 0
                    ? "text-oro-600"
                    : "text-foreground",
                )}
              >
                {t.valor ?? 0}
              </p>
            </>
          );
          return t.ruta ? (
            <Link
              key={t.etiqueta}
              href={t.ruta}
              className="rounded-xl border border-border bg-card p-4 shadow-panel transition hover:border-marca-200 hover:shadow-alzado"
            >
              {contenido}
            </Link>
          ) : (
            <div
              key={t.etiqueta}
              className="rounded-xl border border-border bg-card p-4 shadow-panel"
            >
              {contenido}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Últimas solicitudes. Un gestor no ve el trabajo de los demás. */}
        <div
          className={cn(
            "rounded-xl border border-border bg-card shadow-panel",
            esGestor && "hidden",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h3 className="text-[14px] font-semibold">Últimas solicitudes</h3>
            <Link
              href="/solicitudes"
              className="text-[13px] font-medium text-marca-600 transition hover:text-marca-700"
            >
              Ver todas
            </Link>
          </div>
          {recientes.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              Todavía no hay solicitudes.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recientes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="cifras font-mono text-[12px] font-semibold text-marca-700">
                      {s.codigo}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {s.perfiles_cliente
                        ? `${s.perfiles_cliente.nombres} ${s.perfiles_cliente.apellidos}`
                        : "Cliente sin perfil"}
                    </p>
                  </div>
                  <Estado valor={s.estado} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Accesos */}
        <div className="rounded-xl border border-border bg-card shadow-panel">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-[14px] font-semibold">Secciones</h3>
          </div>
          <ul className="divide-y divide-border">
            {accesos.map((s) => {
              const Icono = s.icono;
              return (
                <li key={s.ruta}>
                  <Link
                    href={s.ruta}
                    className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                      <Icono className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">
                        {s.titulo}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {s.detalle}
                      </span>
                    </span>
                    <Flecha className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
