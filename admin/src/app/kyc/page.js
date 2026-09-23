"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import {
  estadoCola,
  contadoresDe,
  tomarSiguiente,
  RESERVA_MINUTOS,
} from "@/lib/cola";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Persona, Flecha, Manos } from "@/components/shell";
import Paginador from "@/components/paginador";
import { EsqueletoFilas, BarraCarga, Esqueleto } from "@/components/carga";
import { Estado, Vacio, Aviso } from "@/components/marca";

const POR_PAGINA = 25;

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
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  // Cada gestor ve lo suyo. Antes la lista mostraba todos los
  // pendientes a todo el mundo, asi que cinco personas abrian el mismo
  // cliente aunque la cola ya lo hubiera repartido.
  const [soloMias, setSoloMias] = useState(true);
  const [pidiendo, setPidiendo] = useState(false);
  const router = useRouter();

  const termino = useRetraso(busqueda, 350);
  const peticion = useRef(0);

  const cargar = useCallback(async (estado, pag, buscar, silencioso, mias, yo) => {
    const mia = ++peticion.current;
    if (silencioso) setRefrescando(true);
    else setPrimeraCarga(true);
    setError("");

    // La busqueda va al servidor. Con treinta mil clientes, traer la
    // lista entera para filtrarla en el navegador no es viable.
    let ids = null;
    const t = (buscar || "").trim();
    if (t.length >= 2) {
      const patron = `%${t}%`;
      const { data: perfiles } = await supabase
        .from("perfiles_cliente")
        .select("user_id")
        .or(
          `nombres.ilike.${patron},apellidos.ilike.${patron},dni.ilike.${patron},telefono.ilike.${patron}`,
        )
        .limit(150);
      ids = (perfiles || []).map((p) => p.user_id);
    }

    let q = supabase
      .from("users")
      .select("id, email, estado, created_at, asignado_a, asignado_en", {
        count: "exact",
      })
      .eq("rol", "cliente")
      .eq("estado", estado);

    // Solo en la cola: en los verificados u observados no hay reparto
    // que respetar, son listas de consulta.
    if (estado === "pendiente" && mias && yo) {
      const vence = new Date(Date.now() - RESERVA_MINUTOS * 60000).toISOString();
      q = q.eq("asignado_a", yo).gt("asignado_en", vence);
    }

    if (t.length >= 2) {
      const patron = `%${t}%`;
      const partes = [`email.ilike.${patron}`];
      if (ids && ids.length > 0) partes.push(`id.in.(${ids.join(",")})`);
      q = q.or(partes.join(","));
    }

    const { data: usuarios, count, error: consultaError } = await q
      .order("created_at", { ascending: estado === "pendiente" })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);

    if (mia !== peticion.current) return;

    if (consultaError) {
      setError(explicarError(consultaError, "No se pudieron cargar los clientes."));
      setClientes([]);
      setTotal(0);
      setPrimeraCarga(false);
      setRefrescando(false);
      return;
    }

    setTotal(count || 0);

    if (!usuarios || usuarios.length === 0) {
      setClientes([]);
      setPrimeraCarga(false);
      setRefrescando(false);
      return;
    }

    // Solo se piden los perfiles de la pagina visible, no de todos.
    const { data: perfiles } = await supabase
      .from("perfiles_cliente")
      .select("user_id, nombres, apellidos, dni, telefono")
      .in(
        "user_id",
        usuarios.map((u) => u.id),
      );

    if (mia !== peticion.current) return;

    setClientes(
      usuarios.map((u) => ({
        ...u,
        perfil: perfiles?.find((p) => p.user_id === u.id) || null,
      })),
    );
    setPrimeraCarga(false);
    setRefrescando(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      cargar("pendiente", 0, "", false, true, s.user.id);
      estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
    });
  }, [router, cargar]);

  useEffect(() => {
    if (!session) return;
    cargar(filtro, pagina, termino, true, soloMias, session.user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, pagina, filtro, soloMias]);

  useEffect(() => {
    setPagina(0);
  }, [termino, filtro, soloMias]);

  /** Pide el siguiente caso libre y lo abre. */
  async function atenderSiguiente() {
    setPidiendo(true);
    setError("");
    const { id, vacia, error: e } = await tomarSiguiente("kyc");
    setPidiendo(false);
    if (e) return setError("No se pudo tomar el siguiente caso: " + e);
    if (vacia) {
      setError("No queda ninguna identidad libre en la cola por ahora.");
      estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
      return;
    }
    router.push(`/kyc/${id}`);
  }

  if (!session) return null;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Verificación de clientes"
      descripcion={
        primeraCarga
          ? "Cargando..."
          : filtro === "pendiente"
            ? soloMias
              ? `${total} ${total === 1 ? "identidad asignada" : "identidades asignadas"} a ti`
              : `${total} en la cola de todo el equipo`
            : `${total} en esta lista`
      }
      acciones={
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 lg:flex">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => setFiltro(f.clave)}
              className={cn(
                "pulsable rounded-md px-3 py-1.5 text-[0.8667rem] font-medium",
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
      <BarraCarga activa={refrescando} />

      {error && (
        <div className="mb-5 animate-aparecer">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => setFiltro(f.clave)}
            className={cn(
              "pulsable rounded-lg border px-3 py-1.5 text-[0.8667rem] font-medium",
              filtro === f.clave
                ? "border-marca-600 bg-marca-50 text-marca-700"
                : "border-border text-muted-foreground",
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {filtro === "pendiente" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {[
              { v: true, t: "Míos" },
              { v: false, t: "Toda la cola" },
            ].map((x) => (
              <button
                key={x.t}
                onClick={() => setSoloMias(x.v)}
                className={cn(
                  "pulsable rounded-md px-3 py-1.5 text-[0.8667rem] font-medium",
                  soloMias === x.v
                    ? "bg-card text-foreground shadow-panel"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {x.t}
              </button>
            ))}
          </div>

          <button
            onClick={atenderSiguiente}
            disabled={pidiendo}
            title="Te asigna la identidad libre que más tiempo lleva esperando"
            className="pulsable flex items-center gap-2 rounded-lg bg-marca-700 px-3.5 py-2 text-[0.8667rem] font-semibold text-white hover:bg-marca-600 disabled:opacity-50"
          >
            <Manos className="h-4 w-4" />
            {pidiendo ? "Buscando…" : "Tomar siguiente"}
          </button>
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre, DNI, correo o teléfono"
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-9 text-[0.9333rem] outline-none transition placeholder:text-muted-foreground focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
        />
        {busqueda !== termino && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Esqueleto className="h-3 w-3 rounded-full" />
          </span>
        )}
      </div>

      {primeraCarga ? (
        <EsqueletoFilas filas={8} alto="h-[68px]" />
      ) : clientes.length === 0 ? (
        <Vacio
          icono={<Persona className="h-5 w-5" />}
          titulo={termino ? "Sin coincidencias" : "Nada por aquí"}
          detalle={
            termino
              ? "Ningún cliente de esta lista coincide con lo que buscas."
              : filtro === "pendiente"
                ? soloMias
                  ? "No tienes identidades asignadas. Pulsa «Tomar siguiente» o mira toda la cola."
                  : "No queda ningún cliente por verificar."
                : "No hay clientes con este estado."
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card shadow-panel transition-opacity",
              refrescando && "opacity-60",
            )}
          >
            <ul className="divide-y divide-border">
              {clientes.map((c, i) => {
                const sinPerfil = !c.perfil;
                return (
                  <li
                    key={c.id}
                    className="entra"
                    style={{ "--retraso": `${Math.min(i, 14) * 25}ms` }}
                  >
                    <Link
                      href={`/kyc/${c.id}`}
                      className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-muted/40"
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[0.8667rem] font-bold",
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
                        <p className="truncate text-[0.9333rem] font-semibold">
                          {sinPerfil
                            ? "Registro sin completar"
                            : `${c.perfil.nombres} ${c.perfil.apellidos}`}
                        </p>
                        <p className="t-micro truncate">{c.email}</p>
                      </div>

                      <div className="hidden min-w-0 shrink-0 text-right sm:block">
                        {c.perfil?.dni && (
                          <p className="cifras font-mono text-[0.8667rem]">
                            {c.perfil.dni}
                          </p>
                        )}
                        {filtro === "pendiente" && (
                          <p className="t-micro">{espera(c.created_at)}</p>
                        )}
                      </div>

                      <Estado
                        valor={c.estado}
                        className="hidden shrink-0 md:inline-flex"
                      />
                      <Flecha className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <Paginador
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            cargando={refrescando}
            onCambio={setPagina}
          />
        </>
      )}
    </Shell>
  );
}
