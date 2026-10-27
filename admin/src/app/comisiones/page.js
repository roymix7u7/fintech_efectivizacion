"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { BANCOS_TARJETA } from "@/lib/bancos";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Porcentaje, Mas, Check } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, Rueda, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Campo, Dialogo, Tostada, Leyenda, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";

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
 * Quién hace qué: el administrador arma bloques y mueve clientes entre
 * ellos; el supervisor solo ajusta especiales, de a un cliente.
 */
const pct = (n) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(2).replace(/\.00$/, "")} %`);

/** null si es un porcentaje válido; si no, qué está mal. */
function fallaPorcentaje(texto) {
  if (texto === "" || texto === null || texto === undefined) return "Escribe un porcentaje.";
  const n = Number(String(texto).replace(",", "."));
  if (!Number.isFinite(n)) return "Solo números.";
  if (n < 0 || n > 100) return "Entre 0 y 100.";
  if (Math.round(n * 100) !== n * 100) return "Máximo dos decimales.";
  return null;
}
const aNumero = (t) => Number(String(t).replace(",", "."));

export default function ComisionesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [vista, setVista] = useState("bloques");

  const [bloques, setBloques] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const termino = useRetraso(busqueda);
  const [nuevoBloque, setNuevoBloque] = useState(null); // null | texto
  const [tocadoBloque, setTocadoBloque] = useState(false);
  const [especial, setEspecial] = useState(null); // { cliente, banco, valor, motivo }
  const [tocadoEspecial, setTocadoEspecial] = useState(false);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [confirmar, ventanaConfirmar] = useConfirmar();
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
    let q = supabase.from("perfiles_cliente").select("id, nombres, apellidos, dni, bloque_id").order("apellidos").limit(60);
    const t = termino.trim();
    if (t.length >= 2) q = q.or(`nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%`);
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

  const bloquePorId = useMemo(() => Object.fromEntries(bloques.map((b) => [b.id, b])), [bloques]);
  const tarifaDe = (bloqueId, banco) => (bloquePorId[bloqueId]?.bancos || []).find((x) => x.banco === banco)?.porcentaje;

  // ── Acciones ──

  const fallaNombre = (() => {
    if (nuevoBloque === null) return null;
    const n = nuevoBloque.trim();
    if (n.length < 3) return "El nombre necesita al menos 3 letras.";
    if (bloques.some((b) => b.nombre.trim().toLowerCase() === n.toLowerCase())) return "Ya hay un bloque con ese nombre.";
    return null;
  })();

  async function crearBloque() {
    setTocadoBloque(true);
    if (fallaNombre) return;
    const nombre = nuevoBloque.trim();
    setGuardando("nuevo");
    const { error: e } = await supabase.rpc("guardar_bloque", { p_id: null, p_nombre: nombre, p_descripcion: null, p_activo: true });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo crear el bloque."));
    setNuevoBloque(null);
    setOk(`Bloque "${nombre}" creado. Pon sus tarifas banco por banco en la tabla.`);
    cargarBloques();
  }

  async function guardarTarifa(bloque, banco, valor) {
    const n = aNumero(valor);
    setGuardando(`${bloque.id}-${banco}`);
    const { error: e } = await supabase.rpc("guardar_tarifa_bloque", { p_bloque: bloque.id, p_banco: banco, p_porcentaje: n });
    setGuardando(null);
    if (e) {
      setError(explicarError(e, "No se pudo guardar la tarifa."));
      return false;
    }
    setOk(
      `${banco} al ${pct(n)} en "${bloque.nombre}": aplica a ${bloque.clientes} cliente${bloque.clientes === 1 ? "" : "s"}, salvo los que tengan comisión especial.`,
    );
    cargarBloques();
    return true;
  }

  async function moverCliente(cliente, bloqueId) {
    const destino = bloquePorId[bloqueId];
    const si = await confirmar({
      titulo: `¿Pasar a ${cliente.nombres} al bloque ${destino?.nombre}?`,
      texto: "Sus comisiones cambian desde su próxima solicitud. Las especiales que tenga se mantienen.",
      detalle: (
        <div className="flex flex-wrap gap-1.5">
          {(destino?.bancos || []).map((x) => (
            <span key={x.banco} className="rounded-full bg-muted px-2.5 py-1 text-chico font-semibold">
              {x.banco} <span className="cifras">{pct(x.porcentaje)}</span>
            </span>
          ))}
        </div>
      ),
      boton: "Cambiar bloque",
    });
    if (!si) return;
    setGuardando(cliente.id);
    const { error: e } = await supabase.rpc("asignar_bloque", { p_clientes: [cliente.id], p_bloque: bloqueId });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo mover al cliente."));
    setOk(`${cliente.nombres} pasó al bloque ${destino?.nombre}.`);
    cargarClientes();
    cargarBloques();
  }

  const fallasEspecial = especial
    ? {
        valor: fallaPorcentaje(especial.valor),
        motivo: especial.motivo.trim().length < 5 ? "Explica el acuerdo en pocas palabras: queda en el registro." : null,
      }
    : {};

  async function guardarEspecial() {
    setTocadoEspecial(true);
    if (fallasEspecial.valor || fallasEspecial.motivo) return;
    const n = aNumero(especial.valor);
    setGuardando("especial");
    const { error: e } = await supabase.rpc("fijar_comision_especial", {
      p_cliente: especial.cliente.id,
      p_banco: especial.banco,
      p_porcentaje: n,
      p_motivo: especial.motivo.trim(),
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo guardar la comisión."));
    setOk(`${especial.cliente.nombres} queda al ${pct(n)} en ${especial.banco}. Los cambios de bloque ya no la tocan.`);
    setEspecial(null);
    cargarEspeciales();
  }

  async function quitarEspecial(fila) {
    const si = await confirmar({
      titulo: `¿Quitar la comisión especial de ${fila.nombres}?`,
      texto: `En ${fila.banco} vuelve a la tarifa de su bloque${fila.tarifa_bloque != null ? ` (${pct(fila.tarifa_bloque)})` : ""} desde su próxima solicitud.`,
      boton: "Quitar especial",
      tono: "atencion",
    });
    if (!si) return;
    setGuardando(`${fila.cliente_id}-${fila.banco}`);
    const { error: e } = await supabase.rpc("quitar_comision_especial", { p_banco: fila.banco, p_clientes: [fila.cliente_id] });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo quitar."));
    setOk(`${fila.nombres} vuelve a la tarifa de su bloque en ${fila.banco}.`);
    cargarEspeciales();
  }

  if (!session) return <CargaPantalla />;

  const VISTAS = [
    ...(esAdmin
      ? [{ clave: "bloques", etiqueta: "Bloques", cuenta: bloques.length, pista: "Tarifas por banco que comparten muchos clientes." }]
      : []),
    { clave: "clientes", etiqueta: "Clientes", pista: "Busca un cliente para ver su bloque o darle una comisión especial." },
    { clave: "especiales", etiqueta: "Especiales", cuenta: especiales.length, pista: "Acuerdos con un cliente en un banco: ganan sobre su bloque." },
  ];

  return (
    <Shell
      session={session}
      titulo="Comisiones"
      descripcion={esAdmin ? "Bloques de tarifas, clientes y excepciones" : "Ajusta la comisión de un cliente en un banco"}
      ayuda="Cada cliente pertenece a un bloque, que fija su comisión en cada banco. Una comisión especial es un acuerdo con un cliente en un banco y gana sobre la de su bloque."
      acciones={
        esAdmin &&
        vista === "bloques" && (
          <BotonAccion
            onClick={() => {
              setNuevoBloque("");
              setTocadoBloque(false);
            }}
            icono={<Mas className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Nuevo bloque</span>
          </BotonAccion>
        )
      }
    >
      {error && (
        <Aviso className="mb-4" titulo="Revisa esto" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos valor={vista} onCambio={setVista} opciones={VISTAS} />
        {vista === "clientes" && (
          <Buscador
            valor={busqueda}
            onCambio={setBusqueda}
            pendiente={busqueda !== termino}
            placeholder="Nombre, apellido o DNI"
            className="w-full sm:w-80"
            autoFocus
          />
        )}
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={5} />
      ) : vista === "bloques" ? (
        /* ── Bloques: una fila por bloque, una columna por banco ── */
        bloques.length === 0 ? (
          <Vacio
            icono={<Porcentaje />}
            titulo="Todavía no hay bloques"
            detalle="Crea el primero: cada cliente necesita uno para que la app le calcule la comisión."
            accion={
              <BotonAccion onClick={() => setNuevoBloque("")} icono={<Mas className="h-4 w-4" />}>
                Nuevo bloque
              </BotonAccion>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="sticky left-0 bg-muted/95 px-4 py-2.5 t-etiqueta">Bloque</th>
                    {BANCOS_TARJETA.map((b) => (
                      <th key={b} className="px-2 py-2.5 text-center t-etiqueta">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bloques.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20">
                      <td className="sticky left-0 bg-card px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{b.nombre}</span>
                          {b.es_default && (
                            <Pista texto="Se propone al aprobar a un cliente nuevo.">
                              <span className="cursor-help rounded-full bg-oro-100 px-2 py-0.5 text-xs font-bold text-oro-700">Por defecto</span>
                            </Pista>
                          )}
                        </div>
                        <p className="cifras text-chico text-muted-foreground">
                          {b.clientes} cliente{b.clientes === 1 ? "" : "s"}
                        </p>
                      </td>
                      {BANCOS_TARJETA.map((banco) => (
                        <td key={banco} className="px-2 py-3 text-center">
                          <CeldaTarifa
                            banco={banco}
                            bloque={b.nombre}
                            valor={(b.bancos || []).find((x) => x.banco === banco)?.porcentaje}
                            guardando={guardando === `${b.id}-${banco}`}
                            onGuardar={(v) => guardarTarifa(b, banco, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-4 py-2.5">
              <p className="text-chico text-muted-foreground">
                Escribe el porcentaje y pulsa Enter o sal de la celda para guardar. Cambia la tarifa de todos los clientes del bloque, salvo sus especiales.
              </p>
              <Leyenda
                titulo={null}
                items={[
                  { texto: "Sin tarifa", marca: <span className="h-3 w-5 rounded border border-dashed border-oro-500 bg-oro-50" />, pista: "Ese banco no tiene tarifa en el bloque: ponle una." },
                  { texto: "Guardado", marca: <Check className="h-3.5 w-3.5 text-emerald-600" /> },
                ]}
              />
            </div>
          </div>
        )
      ) : vista === "clientes" ? (
        /* ── Clientes ── */
        clientes.length === 0 ? (
          <Vacio icono={<Porcentaje />} titulo="Sin clientes" detalle="Prueba con otro nombre o DNI." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-4 py-2.5 t-etiqueta">Cliente</th>
                    <th className="px-4 py-2.5 t-etiqueta">DNI</th>
                    <th className="px-4 py-2.5 t-etiqueta">Bloque</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clientes.map((c) => {
                    const nEsp = especiales.filter((f) => f.cliente_id === c.id).length;
                    return (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <span className="font-semibold">
                            {c.nombres} {c.apellidos}
                          </span>
                          {nEsp > 0 && (
                            <span className="ml-2 rounded-full bg-marca-100 px-2 py-0.5 text-xs font-bold text-marca-700">
                              {nEsp} especial{nEsp === 1 ? "" : "es"}
                            </span>
                          )}
                        </td>
                        <td className="cifras px-4 py-2.5 font-mono text-muted-foreground">{c.dni}</td>
                        <td className="px-4 py-2.5">
                          {esAdmin ? (
                            <select
                              aria-label={`Bloque de ${c.nombres}`}
                              value={c.bloque_id || ""}
                              onChange={(e) => moverCliente(c, e.target.value)}
                              disabled={guardando === c.id}
                              className="campo h-9 w-48 py-1 text-sm"
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
                            <span className="rounded-full bg-muted px-2.5 py-1 text-chico font-semibold text-muted-foreground">
                              {bloquePorId[c.bloque_id]?.nombre || "Sin bloque"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <BotonAccion
                            tono="neutro"
                            tamano="chico"
                            icono={<Porcentaje className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setEspecial({ cliente: c, banco: BANCOS_TARJETA[0], valor: "", motivo: "" });
                              setTocadoEspecial(false);
                            }}
                          >
                            Comisión especial
                          </BotonAccion>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {clientes.length >= 60 && (
              <p className="border-t border-border px-4 py-2 text-chico text-muted-foreground">Se muestran los primeros 60. Busca por nombre o DNI para encontrar a otro.</p>
            )}
          </div>
        )
      ) : /* ── Especiales ── */
      especiales.length === 0 ? (
        <Vacio icono={<Porcentaje />} titulo="Ninguna comisión especial" detalle="Todos los clientes están con la tarifa de su bloque." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 t-etiqueta">Cliente</th>
                  <th className="px-4 py-2.5 t-etiqueta">Banco</th>
                  <th className="px-4 py-2.5 t-etiqueta">Especial</th>
                  <th className="px-4 py-2.5 t-etiqueta">Su bloque</th>
                  <th className="px-4 py-2.5 t-etiqueta">Motivo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {especiales.map((f) => (
                  <tr key={`${f.cliente_id}-${f.banco}`} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-foreground">
                        {f.nombres} {f.apellidos}
                      </p>
                      <p className="cifras text-chico text-muted-foreground">DNI {f.dni}</p>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{f.banco}</td>
                    <td className="cifras px-4 py-2.5 text-md font-bold text-marca-700">{pct(f.porcentaje)}</td>
                    <td className="cifras px-4 py-2.5 text-muted-foreground">
                      {f.bloque || "—"}
                      {f.tarifa_bloque != null && ` · ${pct(f.tarifa_bloque)}`}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5 text-muted-foreground">
                      <span className="line-clamp-2">{f.motivo || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BotonAccion
                        tono="peligroSuave"
                        tamano="chico"
                        onClick={() => quitarEspecial(f)}
                        cargando={guardando === `${f.cliente_id}-${f.banco}`}
                      >
                        Quitar
                      </BotonAccion>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nuevo bloque */}
      <Dialogo
        abierto={nuevoBloque !== null}
        onCerrar={() => setNuevoBloque(null)}
        bloqueado={guardando === "nuevo"}
        titulo="Nuevo bloque de comisiones"
        descripcion="Después de crearlo, pon su tarifa en cada banco desde la tabla."
        icono={<Mas className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setNuevoBloque(null)}>
              Cancelar
            </BotonAccion>
            <BotonAccion onClick={crearBloque} cargando={guardando === "nuevo"} disabled={tocadoBloque && Boolean(fallaNombre)}>
              Crear bloque
            </BotonAccion>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearBloque();
          }}
        >
          <Campo etiqueta="Nombre" htmlFor="nombreBloque" requerido error={tocadoBloque ? fallaNombre : null}>
            <input
              id="nombreBloque"
              autoFocus
              maxLength={40}
              value={nuevoBloque || ""}
              onChange={(e) => setNuevoBloque(e.target.value)}
              onBlur={() => nuevoBloque && setTocadoBloque(true)}
              aria-invalid={tocadoBloque && Boolean(fallaNombre)}
              placeholder="Ej: Preferentes"
              className="campo"
            />
          </Campo>
        </form>
      </Dialogo>

      {/* Comisión especial de un cliente */}
      <Dialogo
        abierto={Boolean(especial)}
        onCerrar={() => setEspecial(null)}
        bloqueado={guardando === "especial"}
        titulo="Comisión especial"
        descripcion={especial ? `${especial.cliente.nombres} ${especial.cliente.apellidos} · DNI ${especial.cliente.dni}` : ""}
        icono={<Porcentaje className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setEspecial(null)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              onClick={guardarEspecial}
              cargando={guardando === "especial"}
              disabled={tocadoEspecial && Boolean(fallasEspecial.valor || fallasEspecial.motivo)}
            >
              Guardar
            </BotonAccion>
          </>
        }
      >
        {especial && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              guardarEspecial();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Banco" htmlFor="banco">
                <select id="banco" value={especial.banco} onChange={(e) => setEspecial({ ...especial, banco: e.target.value })} className="campo">
                  {BANCOS_TARJETA.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Porcentaje" htmlFor="valor" requerido error={tocadoEspecial ? fallasEspecial.valor : null}>
                <div className="relative">
                  <input
                    id="valor"
                    inputMode="decimal"
                    autoFocus
                    value={especial.valor}
                    onChange={(e) => setEspecial({ ...especial, valor: e.target.value })}
                    aria-invalid={tocadoEspecial && Boolean(fallasEspecial.valor)}
                    placeholder="Ej: 4.5"
                    className="campo cifras pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </Campo>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Hoy paga{" "}
              <strong className="cifras text-foreground">
                {(() => {
                  const esp = especiales.find((f) => f.cliente_id === especial.cliente.id && f.banco === especial.banco);
                  return esp ? `${pct(esp.porcentaje)} (especial)` : pct(tarifaDe(especial.cliente.bloque_id, especial.banco));
                })()}
              </strong>{" "}
              en {especial.banco}
              {bloquePorId[especial.cliente.bloque_id] ? `, según el bloque ${bloquePorId[especial.cliente.bloque_id].nombre}` : ""}.
            </p>
            <Campo
              etiqueta="Motivo"
              htmlFor="motivo"
              requerido
              ayuda="Queda registrado con tu nombre. Esta tarifa deja de seguir a su bloque hasta que alguien la quite."
              error={tocadoEspecial ? fallasEspecial.motivo : null}
            >
              <input
                id="motivo"
                maxLength={200}
                value={especial.motivo}
                onChange={(e) => setEspecial({ ...especial, motivo: e.target.value })}
                aria-invalid={tocadoEspecial && Boolean(fallasEspecial.motivo)}
                placeholder="Ej: cliente de alto volumen"
                className="campo"
              />
            </Campo>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialogo>

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/**
 * Tarifa de un banco dentro de un bloque. Guarda al pulsar Enter o salir
 * de la celda, y avisa en la misma celda si el valor no sirve.
 */
function CeldaTarifa({ banco, bloque, valor, guardando, onGuardar }) {
  const [texto, setTexto] = useState(valor ?? "");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setTexto(valor ?? "");
  }, [valor]);

  const cambiada = String(texto) !== String(valor ?? "");
  const falla = cambiada ? fallaPorcentaje(texto) : null;
  const vacia = valor === null || valor === undefined;

  async function confirmar() {
    if (!cambiada) return;
    if (falla) return;
    const listo = await onGuardar(texto);
    if (listo) {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1800);
    }
  }

  return (
    <Pista texto={falla ? `${banco}: ${falla}` : null}>
      <span className="relative inline-flex items-center">
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTexto(valor ?? "");
              e.currentTarget.blur();
            }
          }}
          aria-label={`Tarifa de ${banco} en ${bloque}`}
          aria-invalid={Boolean(falla)}
          placeholder="—"
          className={cn(
            "campo cifras h-9 w-[86px] pr-6 text-center text-md font-semibold",
            vacia && !cambiada && "border-dashed border-oro-500 bg-oro-50",
            cambiada && !falla && "border-marca-500 bg-marca-50",
          )}
        />
        <span className="pointer-events-none absolute right-2 text-chico text-muted-foreground">
          {guardando ? <Rueda className="h-3 w-3" /> : guardado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : "%"}
        </span>
      </span>
    </Pista>
  );
}
