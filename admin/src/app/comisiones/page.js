"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { BANCOS_TARJETA } from "@/lib/bancos";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Porcentaje, Cruz } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, Rueda } from "@/components/carga";

/**
 * Comisiones en dos niveles.
 *
 * Un BLOQUE es un juego completo de tarifas, una por banco. Cada
 * cliente pertenece a uno, y cambiar la tarifa del bloque mueve a todos
 * sus clientes de una vez: ese es el cambio masivo.
 *
 * Una ESPECIAL es un acuerdo con un cliente concreto en un banco. Gana
 * sobre el bloque y los cambios masivos no la tocan, porque se puso a
 * mano. Por eso se listan aparte: son las excepciones que alguien tiene
 * que poder revisar.
 *
 * Quien hace que: el administrador arma bloques y mueve clientes entre
 * ellos; el supervisor solo ajusta especiales, de a un cliente.
 */
const VISTAS = [
  { clave: "bloques", titulo: "Bloques", soloAdmin: true },
  { clave: "clientes", titulo: "Clientes", soloAdmin: false },
  { clave: "especiales", titulo: "Especiales", soloAdmin: false },
];

const pct = (n) =>
  n === null || n === undefined ? "—" : `${Number(n).toFixed(2).replace(/\.00$/, "")} %`;

export default function ComisionesPage() {
  const [session, setSession] = useState(null);
  const [vista, setVista] = useState("bloques");

  const [bloques, setBloques] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const termino = useRetraso(busqueda);
  const [abierto, setAbierto] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [especial, setEspecial] = useState(null); // { cliente, banco, valor, motivo }

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const router = useRouter();

  const esAdmin = session?.rol === "admin";

  const cargarBloques = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listar_bloques");
    if (e) setError(explicarError(e, "No se pudieron cargar los bloques."));
    else setBloques(data || []);
  }, []);

  const cargarEspeciales = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listar_especiales");
    if (e) setError(explicarError(e, "No se pudieron cargar las especiales."));
    else setEspeciales(data || []);
  }, []);

  const cargarClientes = useCallback(async () => {
    let q = supabase
      .from("perfiles_cliente")
      .select("id, nombres, apellidos, dni, bloque_id")
      .order("apellidos")
      .limit(60);

    const t = termino.trim();
    if (t.length >= 2) {
      q = q.or(`nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%`);
    }
    const { data, error: e } = await q;
    if (e) setError(explicarError(e, "No se pudieron cargar los clientes."));
    else setClientes(data || []);
  }, [termino]);

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      // El supervisor no arma bloques: entra directo a sus clientes.
      if (s.rol !== "admin") setVista("clientes");
      await Promise.all([cargarBloques(), cargarEspeciales(), cargarClientes()]);
      setLoading(false);
    });
  }, [router, cargarBloques, cargarEspeciales, cargarClientes]);

  useEffect(() => {
    if (session) cargarClientes();
  }, [termino, session, cargarClientes]);

  const nombreBloque = useMemo(() => {
    const m = {};
    for (const b of bloques) m[b.id] = b.nombre;
    return m;
  }, [bloques]);

  // ── Acciones ──

  async function crearBloque() {
    const nombre = nuevoNombre.trim();
    if (nombre.length < 3) return setError("El bloque necesita un nombre.");
    setGuardando("nuevo");
    const { error: e } = await supabase.rpc("guardar_bloque", {
      p_id: null,
      p_nombre: nombre,
      p_descripcion: null,
      p_activo: true,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo crear el bloque."));
    setNuevoNombre("");
    setCreando(false);
    setOk(`Bloque "${nombre}" creado. Pon sus tarifas banco por banco.`);
    cargarBloques();
  }

  async function guardarTarifa(bloque, banco, valor) {
    const n = parseFloat(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return setError("El porcentaje debe ser un número entre 0 y 100.");

    setGuardando(`${bloque.id}-${banco}`);
    const { error: e } = await supabase.rpc("guardar_tarifa_bloque", {
      p_bloque: bloque.id,
      p_banco: banco,
      p_porcentaje: n,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo guardar la tarifa."));

    setOk(
      `${banco} al ${pct(n)} en "${bloque.nombre}": aplica a ${bloque.clientes} cliente${bloque.clientes === 1 ? "" : "s"}, salvo los que tengan comisión especial.`,
    );
    cargarBloques();
  }

  async function moverCliente(cliente, bloqueId) {
    setGuardando(cliente.id);
    const { error: e } = await supabase.rpc("asignar_bloque", {
      p_clientes: [cliente.id],
      p_bloque: bloqueId,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo mover al cliente."));
    setOk(`${cliente.nombres} pasó al bloque ${nombreBloque[bloqueId]}.`);
    cargarClientes();
    cargarBloques();
  }

  async function guardarEspecial() {
    const n = parseFloat(especial.valor);
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return setError("El porcentaje debe ser un número entre 0 y 100.");

    setGuardando("especial");
    const { error: e } = await supabase.rpc("fijar_comision_especial", {
      p_cliente: especial.cliente.id,
      p_banco: especial.banco,
      p_porcentaje: n,
      p_motivo: especial.motivo || null,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo guardar la comisión."));

    setOk(
      `${especial.cliente.nombres} queda al ${pct(n)} en ${especial.banco}. Los cambios de bloque ya no la tocan.`,
    );
    setEspecial(null);
    cargarEspeciales();
  }

  async function quitarEspecial(fila) {
    setGuardando(`${fila.cliente_id}-${fila.banco}`);
    const { error: e } = await supabase.rpc("quitar_comision_especial", {
      p_banco: fila.banco,
      p_clientes: [fila.cliente_id],
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo quitar."));
    setOk(
      `${fila.nombres} vuelve a la tarifa de su bloque en ${fila.banco}${fila.tarifa_bloque != null ? ` (${pct(fila.tarifa_bloque)})` : ""}.`,
    );
    cargarEspeciales();
  }

  if (!session) return null;

  const visibles = VISTAS.filter((v) => esAdmin || !v.soloAdmin);

  return (
    <Shell
      session={session}
      titulo="Comisiones"
      descripcion={
        esAdmin
          ? "Bloques de tarifas, clientes y excepciones"
          : "Ajusta la comisión de un cliente en un banco"
      }
    >
      <div className="space-y-4">
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {visibles.map((v) => (
            <button
              key={v.clave}
              onClick={() => setVista(v.clave)}
              className={cn(
                "pulsable rounded-md px-4 py-1.5 text-[0.8667rem] font-medium",
                vista === v.clave
                  ? "bg-card text-foreground shadow-panel"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.titulo}
            </button>
          ))}
        </div>

        {error && (
          <Aviso titulo="Revisa esto" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        )}
        {ok && (
          <Aviso tono="info" onCerrar={() => setOk("")}>
            {ok}
          </Aviso>
        )}

        {loading ? (
          <EsqueletoFilas filas={5} />
        ) : vista === "bloques" ? (
          /* ── Bloques ── */
          <div className="space-y-3">
            <p className="max-w-2xl text-[0.8667rem] text-muted-foreground">
              Cambiar una tarifa aquí cambia la de todos los clientes del
              bloque. Los que tienen comisión especial en ese banco no se
              tocan: figuran en la pestaña Especiales.
            </p>

            {!creando ? (
              <BotonAccion onClick={() => setCreando(true)} icono={<span>+</span>}>
                Nuevo bloque
              </BotonAccion>
            ) : (
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
                <div className="min-w-[220px] flex-1">
                  <label htmlFor="nombre" className="mb-1 block text-[12px] font-medium">
                    Nombre del bloque
                  </label>
                  <input
                    id="nombre"
                    autoFocus
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && crearBloque()}
                    placeholder="Ej: Preferentes"
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
                  />
                </div>
                <BotonAccion onClick={crearBloque} cargando={guardando === "nuevo"}>
                  Crear
                </BotonAccion>
                <BotonAccion tono="neutro" onClick={() => setCreando(false)}>
                  Cancelar
                </BotonAccion>
              </div>
            )}

            {bloques.map((b) => {
              const tarifas = Object.fromEntries(
                (b.bancos || []).map((x) => [x.banco, x.porcentaje]),
              );
              const expandido = abierto === b.id;
              return (
                <div key={b.id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    onClick={() => setAbierto(expandido ? null : b.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    aria-expanded={expandido}
                  >
                    <span className="text-[0.9333rem] font-semibold text-foreground">
                      {b.nombre}
                    </span>
                    {b.es_default && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        por defecto
                      </span>
                    )}
                    <span className="cifras text-[0.8rem] text-muted-foreground">
                      {b.clientes} cliente{b.clientes === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {expandido ? "▴" : "▾"}
                    </span>
                  </button>

                  {expandido && (
                    <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
                      {BANCOS_TARJETA.map((banco) => (
                        <TarifaBanco
                          key={banco}
                          banco={banco}
                          valor={tarifas[banco]}
                          guardando={guardando === `${b.id}-${banco}`}
                          onGuardar={(v) => guardarTarifa(b, banco, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : vista === "clientes" ? (
          /* ── Clientes ── */
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, apellido o DNI"
                className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-marca-500"
              />
            </div>

            {clientes.length === 0 ? (
              <Vacio
                icono={<Porcentaje className="h-5 w-5" />}
                titulo="Sin clientes"
                detalle="Prueba con otro nombre o DNI."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {clientes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-[0.9333rem] font-medium text-foreground">
                          {c.nombres} {c.apellidos}
                        </p>
                        <p className="cifras text-[12px] text-muted-foreground">
                          DNI {c.dni}
                        </p>
                      </div>

                      {esAdmin ? (
                        <select
                          value={c.bloque_id || ""}
                          onChange={(e) => moverCliente(c, e.target.value)}
                          disabled={guardando === c.id}
                          className="shrink-0 rounded-lg border border-input bg-card px-2 py-1.5 text-[13px] outline-none focus:border-marca-500 disabled:opacity-40"
                        >
                          <option value="" disabled>
                            Sin bloque
                          </option>
                          {bloques.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-[13px] text-muted-foreground">
                          {nombreBloque[c.bloque_id] || "Sin bloque"}
                        </span>
                      )}

                      <button
                        onClick={() =>
                          setEspecial({
                            cliente: c,
                            banco: BANCOS_TARJETA[0],
                            valor: "",
                            motivo: "",
                          })
                        }
                        className="pulsable shrink-0 rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-medium hover:bg-muted"
                      >
                        Comisión especial
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          /* ── Especiales ── */
          <div className="space-y-3">
            <p className="max-w-2xl text-[0.8667rem] text-muted-foreground">
              Acuerdos con un cliente en un banco concreto. Ganan sobre la
              tarifa del bloque y los cambios masivos no las tocan. Al
              quitarlas, el cliente vuelve a la tarifa de su bloque.
            </p>

            {especiales.length === 0 ? (
              <Vacio
                icono={<Porcentaje className="h-5 w-5" />}
                titulo="Ninguna comisión especial"
                detalle="Todos los clientes están con la tarifa de su bloque."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Cliente</th>
                      <th className="px-4 py-2.5 font-semibold">Banco</th>
                      <th className="px-4 py-2.5 font-semibold">Especial</th>
                      <th className="px-4 py-2.5 font-semibold">Su bloque</th>
                      <th className="px-4 py-2.5 font-semibold">Motivo</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {especiales.map((f) => (
                      <tr key={`${f.cliente_id}-${f.banco}`} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">
                            {f.nombres} {f.apellidos}
                          </p>
                          <p className="cifras text-[11.5px] text-muted-foreground">
                            DNI {f.dni}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">{f.banco}</td>
                        <td className="cifras px-4 py-2.5 font-semibold text-marca-700">
                          {pct(f.porcentaje)}
                        </td>
                        <td className="cifras px-4 py-2.5 text-muted-foreground">
                          {f.bloque || "—"}
                          {f.tarifa_bloque != null && ` · ${pct(f.tarifa_bloque)}`}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">
                          {f.motivo || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => quitarEspecial(f)}
                            disabled={guardando === `${f.cliente_id}-${f.banco}`}
                            className="pulsable rounded-lg px-3 py-1.5 text-[0.8rem] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comisión especial de un cliente */}
      {especial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 p-4"
          onClick={() => setEspecial(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="entra w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Comisión especial
                </h2>
                <p className="text-[0.8rem] text-muted-foreground">
                  {especial.cliente.nombres} {especial.cliente.apellidos}
                </p>
              </div>
              <button
                onClick={() => setEspecial(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <Cruz className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="banco" className="mb-1 block text-[12px] font-medium">
                  Banco
                </label>
                <select
                  id="banco"
                  value={especial.banco}
                  onChange={(e) => setEspecial({ ...especial, banco: e.target.value })}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
                >
                  {BANCOS_TARJETA.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="valor" className="mb-1 block text-[12px] font-medium">
                  Porcentaje
                </label>
                <input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  autoFocus
                  value={especial.valor}
                  onChange={(e) => setEspecial({ ...especial, valor: e.target.value })}
                  className="cifras w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
                />
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="motivo" className="mb-1 block text-[12px] font-medium">
                Motivo
              </label>
              <input
                id="motivo"
                value={especial.motivo}
                onChange={(e) => setEspecial({ ...especial, motivo: e.target.value })}
                placeholder="Ej: cliente de alto volumen"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-marca-500"
              />
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Queda registrado con tu nombre. Esta tarifa deja de seguir a
                su bloque hasta que alguien la quite.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <BotonAccion
                onClick={guardarEspecial}
                cargando={guardando === "especial"}
                className="flex-1"
              >
                Guardar
              </BotonAccion>
              <BotonAccion tono="neutro" onClick={() => setEspecial(null)}>
                Cancelar
              </BotonAccion>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Tarifa de un banco dentro de un bloque. Guarda al salir del campo. */
function TarifaBanco({ banco, valor, guardando, onGuardar }) {
  const [texto, setTexto] = useState(valor ?? "");

  useEffect(() => {
    setTexto(valor ?? "");
  }, [valor]);

  const cambiada = String(texto) !== String(valor ?? "");

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <span className="flex-1 text-[0.8667rem] font-medium text-foreground">
        {banco}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => cambiada && texto !== "" && onGuardar(texto)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Tarifa de ${banco}`}
        className="cifras w-20 rounded-md border border-input bg-card px-2 py-1 text-right text-sm outline-none focus:border-marca-500"
      />
      <span className="text-[13px] text-muted-foreground">%</span>
      {guardando && <Rueda className="h-3.5 w-3.5" />}
    </div>
  );
}
