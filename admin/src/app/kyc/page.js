"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Persona, Flecha } from "@/components/shell";
import { Estado, Vacio, Aviso } from "@/components/marca";

const FILTROS = [
  { clave: "pendiente", etiqueta: "Por revisar" },
  { clave: "activo", etiqueta: "Verificados" },
  { clave: "observado", etiqueta: "Observados" },
  { clave: "bloqueado", etiqueta: "Bloqueados" },
];

function espera(iso) {
  if (!iso) return null;
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (horas < 1) return "Recién llegado";
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export default function KYCPage() {
  const [session, setSession] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const router = useRouter();

  const cargar = useCallback(async (estado) => {
    setLoading(true);
    setError("");
    setFiltro(estado);

    const { data: usuarios, error: consultaError } = await supabase
      .from("users")
      .select("id, email, estado, created_at")
      .eq("rol", "cliente")
      .eq("estado", estado)
      .order("created_at", { ascending: estado === "pendiente" });

    if (consultaError) {
      setError("No se pudieron cargar los clientes: " + consultaError.message);
      setClientes([]);
      setLoading(false);
      return;
    }

    if (!usuarios || usuarios.length === 0) {
      setClientes([]);
      setLoading(false);
      return;
    }

    const { data: perfiles } = await supabase
      .from("perfiles_cliente")
      .select("*")
      .in(
        "user_id",
        usuarios.map((u) => u.id),
      );

    setClientes(
      usuarios.map((u) => ({
        ...u,
        perfil: perfiles?.find((p) => p.user_id === u.id) || null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "admin"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      cargar("pendiente");
      contarPendientes();
    });
  }, [router, cargar]);

  async function contarPendientes() {
    const cuenta = async (tabla, filtros) => {
      let q = supabase.from(tabla).select("*", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
      const { count } = await q;
      return count || 0;
    };
    setContadores({
      solicitudesPendientes: await cuenta("solicitudes", { estado: "pendiente" }),
      kycPendientes: await cuenta("users", { rol: "cliente", estado: "pendiente" }),
      tarjetasPendientes: await cuenta("tarjetas", { estado: "pendiente", activa: true }),
    });
  }

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return clientes;
    return clientes.filter((c) =>
      [c.email, c.perfil?.nombres, c.perfil?.apellidos, c.perfil?.dni, c.perfil?.telefono]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [clientes, busqueda]);

  if (!session) return null;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Verificación de clientes"
      descripcion={
        loading
          ? "Cargando..."
          : filtro === "pendiente"
            ? `${clientes.length} ${clientes.length === 1 ? "cliente espera" : "clientes esperan"} revisión`
            : `${clientes.length} en esta lista`
      }
      acciones={
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 lg:flex">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => cargar(f.clave)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                filtro === f.clave
                  ? "bg-card text-foreground shadow-panel"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      }
    >
      {error && (
        <div className="mb-5">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => cargar(f.clave)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
              filtro === f.clave
                ? "border-marca-600 bg-marca-50 text-marca-700"
                : "border-border text-muted-foreground",
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre, DNI, correo o teléfono"
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<Persona className="h-5 w-5" />}
          titulo={busqueda ? "Sin coincidencias" : "Nada por aquí"}
          detalle={
            busqueda
              ? "Ningún cliente de esta lista coincide con lo que buscas."
              : filtro === "pendiente"
                ? "No queda ningún cliente por verificar."
                : "No hay clientes con este estado."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <ul className="divide-y divide-border">
            {visibles.map((c) => {
              const sinPerfil = !c.perfil;
              return (
                <li key={c.id}>
                  <Link
                    href={`/kyc/${c.id}`}
                    className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                        sinPerfil
                          ? "bg-muted text-muted-foreground"
                          : "bg-marca-50 text-marca-700",
                      )}
                    >
                      {sinPerfil
                        ? "?"
                        : (c.perfil.nombres?.[0] || "") +
                          (c.perfil.apellidos?.[0] || "")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {sinPerfil
                          ? "Registro sin completar"
                          : `${c.perfil.nombres} ${c.perfil.apellidos}`}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {c.email}
                      </p>
                    </div>

                    <div className="hidden min-w-0 shrink-0 text-right sm:block">
                      {c.perfil?.dni && (
                        <p className="cifras font-mono text-[13px] text-foreground">
                          {c.perfil.dni}
                        </p>
                      )}
                      {filtro === "pendiente" && (
                        <p className="text-[12px] text-muted-foreground">
                          {espera(c.created_at)}
                        </p>
                      )}
                    </div>

                    <Estado valor={c.estado} className="hidden shrink-0 md:inline-flex" />
                    <Flecha className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Shell>
  );
}
