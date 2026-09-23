"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Edificio, Flecha, Check } from "@/components/shell";
import { Vacio, Aviso, Dato } from "@/components/marca";
import { Esqueleto } from "@/components/carga";

const VACIA = { nombre: "", ciudad: "", direccion: "", telefono: "" };

export default function SedesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [sedes, setSedes] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [nueva, setNueva] = useState(VACIA);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: e } = await supabase
      .from("sedes")
      .select("*")
      .order("nombre");
    if (e) {
      setError(explicarError(e, "No se pudieron cargar las sedes."));
      setLoading(false);
      return;
    }
    setSedes(data || []);

    const { data: personal } = await supabase.rpc("listar_equipo");
    setEquipo(personal || []);

    const { colas } = await estadoCola();
    setContadores(contadoresDe(colas));
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (s.rol !== "admin") return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  async function crear() {
    const nombre = nueva.nombre.trim();
    if (nombre.length < 2) {
      setError("Ponle un nombre a la sede.");
      return;
    }
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.from("sedes").insert({
      nombre,
      ciudad: nueva.ciudad.trim() || null,
      direccion: nueva.direccion.trim() || null,
      telefono: nueva.telefono.trim() || null,
      creada_por: session.user.id,
    });
    setGuardando(false);
    if (e) {
      setError(
        e.message.includes("duplicate")
          ? `Ya existe una sede llamada ${nombre}.`
          : "No se pudo crear: " + e.message,
      );
      return;
    }
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CREAR_SEDE",
      entidad: "sedes",
      datos_despues: { nombre },
    });
    setNueva(VACIA);
    setCreando(false);
    cargar();
  }

  async function guardar(sede) {
    setGuardando(true);
    setError("");
    const { error: e } = await supabase
      .from("sedes")
      .update({
        nombre: editando.nombre.trim(),
        ciudad: editando.ciudad?.trim() || null,
        direccion: editando.direccion?.trim() || null,
        telefono: editando.telefono?.trim() || null,
      })
      .eq("id", sede.id);
    setGuardando(false);
    if (e) return setError("No se pudo guardar: " + e.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "EDITAR_SEDE",
      entidad: "sedes",
      entidad_id: sede.id,
      datos_despues: { nombre: editando.nombre },
    });
    setEditando(null);
    cargar();
  }

  async function alternarActiva(sede) {
    const { error: e } = await supabase
      .from("sedes")
      .update({ activa: !sede.activa })
      .eq("id", sede.id);
    if (e) return setError("No se pudo cambiar: " + e.message);
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: sede.activa ? "DESACTIVAR_SEDE" : "ACTIVAR_SEDE",
      entidad: "sedes",
      entidad_id: sede.id,
    });
    cargar();
  }

  if (!session) return null;

  /** Personal de cada sede, para mostrar cómo está poblada. */
  function gente(sedeId) {
    const propios = equipo.filter((p) => p.sede_id === sedeId);
    return {
      supervisores: propios.filter((p) => p.rol === "supervisor"),
      gestores: propios.filter((p) => p.rol === "gestor"),
    };
  }

  const sinSede = equipo.filter((p) => !p.sede_id && p.rol !== "admin");

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Sedes"
      descripcion="Cada sede tiene un supervisor y sus gestores"
      acciones={
        <button
          onClick={() => setCreando((c) => !c)}
          className="rounded-lg bg-marca-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-marca-600"
        >
          {creando ? "Cancelar" : "Nueva sede"}
        </button>
      }
    >
      {error && (
        <div className="mb-4">
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      {creando && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-panel">
          <h2 className="mb-3 text-[14px] font-semibold">Nueva sede</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: "nombre", l: "Nombre *", p: "Ej: Sede Lima Centro" },
              { k: "ciudad", l: "Ciudad", p: "Ej: Lima" },
              { k: "direccion", l: "Dirección", p: "Ej: Av. Abancay 123" },
              { k: "telefono", l: "Teléfono", p: "Ej: 01 4567890" },
            ].map((c) => (
              <div key={c.k}>
                <label className="mb-1 block text-[12px] font-medium">
                  {c.l}
                </label>
                <input
                  value={nueva[c.k]}
                  onChange={(e) =>
                    setNueva({ ...nueva, [c.k]: e.target.value })
                  }
                  placeholder={c.p}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                />
              </div>
            ))}
          </div>
          <button
            onClick={crear}
            disabled={guardando || !nueva.nombre.trim()}
            className="mt-3 rounded-lg bg-marca-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-600 disabled:opacity-40"
          >
            {guardando ? "Creando..." : "Crear sede"}
          </button>
        </div>
      )}

      {sinSede.length > 0 && (
        <div className="mb-5">
          <Aviso tono="espera" titulo="Personal sin sede asignada">
            {sinSede.length} persona{sinSede.length === 1 ? "" : "s"} del equipo
            no pertenece a ninguna sede.{" "}
            <Link href="/equipo" className="font-semibold underline">
              Asígnalas desde Equipo
            </Link>
            .
          </Aviso>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : sedes.length === 0 ? (
        <Vacio
          icono={<Edificio className="h-5 w-5" />}
          titulo="Sin sedes"
          detalle="Crea la primera sede y luego asígnale un supervisor y sus gestores."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sedes.map((s) => {
            const g = gente(s.id);
            const enEdicion = editando?.id === s.id;
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-xl border bg-card p-4 shadow-panel",
                  s.activa ? "border-border" : "border-dashed border-border opacity-70",
                )}
              >
                {enEdicion ? (
                  <div className="space-y-2">
                    {["nombre", "ciudad", "direccion", "telefono"].map((k) => (
                      <input
                        key={k}
                        value={editando[k] || ""}
                        onChange={(e) =>
                          setEditando({ ...editando, [k]: e.target.value })
                        }
                        placeholder={k}
                        className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-marca-500"
                      />
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => guardar(s)}
                        disabled={guardando}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditando(null)}
                        className="flex-1 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                        <Edificio className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">
                          {s.nombre}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {s.ciudad || "Sin ciudad"}
                        </p>
                      </div>
                      {!s.activa && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          inactiva
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      <Dato etiqueta="Supervisor">
                        {g.supervisores.length > 0
                          ? g.supervisores.map((x) => x.email).join(", ")
                          : null}
                      </Dato>
                      <Dato etiqueta="Gestores" mono>
                        {g.gestores.length}
                      </Dato>
                    </dl>

                    {g.supervisores.length === 0 && (
                      <p className="mt-2 rounded-md bg-oro-50 px-2.5 py-1.5 text-[12px] text-oro-700">
                        Esta sede no tiene supervisor.
                      </p>
                    )}
                    {g.supervisores.length > 1 && (
                      <p className="mt-2 rounded-md bg-oro-50 px-2.5 py-1.5 text-[12px] text-oro-700">
                        Hay {g.supervisores.length} supervisores en esta sede.
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                      <button
                        onClick={() => setEditando(s)}
                        className="rounded-md px-2 py-1 text-[12px] font-medium text-marca-600 transition hover:bg-marca-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => alternarActiva(s)}
                        className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition hover:bg-muted"
                      >
                        {s.activa ? "Desactivar" : "Activar"}
                      </button>
                      <Link
                        href="/equipo"
                        className="ml-auto flex items-center gap-1 text-[12px] font-medium text-marca-600"
                      >
                        Ver equipo
                        <Flecha className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
