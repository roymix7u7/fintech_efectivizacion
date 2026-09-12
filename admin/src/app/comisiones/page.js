"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Lupa, Check } from "@/components/shell";
import { Vacio, Aviso, Estado } from "@/components/marca";

/**
 * Las comisiones viven en dos niveles. Cada banco tiene una tarifa
 * general, y encima un cliente puede tener una especial para ese banco
 * concreto. Lo especial gana sobre lo general.
 */
export default function ComisionesPage() {
  const [session, setSession] = useState(null);
  const [bancos, setBancos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [bancoActivo, setBancoActivo] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [marcados, setMarcados] = useState(new Set());
  const [valorMasivo, setValorMasivo] = useState("");
  const [motivoMasivo, setMotivoMasivo] = useState("");
  const [editandoBanco, setEditandoBanco] = useState(null);
  const [valorBanco, setValorBanco] = useState("");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: bancosData, error: eBancos } = await supabase
      .from("comisiones_banco")
      .select("*")
      .order("banco");
    if (eBancos) {
      setError(explicarError(eBancos, "No se pudieron cargar las comisiones."));
      setLoading(false);
      return;
    }
    setBancos(bancosData || []);
    setBancoActivo((b) => b || bancosData?.[0]?.banco || null);

    // Solo clientes activos: a un cliente sin verificar no tiene
    // sentido asignarle tarifa todavia.
    const { data: usuarios } = await supabase
      .from("users")
      .select("id, email, estado")
      .eq("rol", "cliente")
      .eq("estado", "activo");

    if (usuarios?.length) {
      const { data: perfiles } = await supabase
        .from("perfiles_cliente")
        .select("id, user_id, nombres, apellidos, dni, tasa_comision")
        .in(
          "user_id",
          usuarios.map((u) => u.id),
        );
      setClientes(
        (perfiles || []).map((p) => ({
          ...p,
          email: usuarios.find((u) => u.id === p.user_id)?.email,
        })),
      );
    } else {
      setClientes([]);
    }

    const { data: esp } = await supabase
      .from("comisiones_cliente")
      .select("cliente_id, banco, porcentaje, motivo, updated_at");
    setEspeciales(esp || []);

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

  /** Tarifa que aplica a un cliente en el banco abierto. */
  function tarifaDe(cliente) {
    const especial = especiales.find(
      (e) => e.cliente_id === cliente.id && e.banco === bancoActivo,
    );
    if (especial) return { valor: especial.porcentaje, especial: true, motivo: especial.motivo };
    const general = bancos.find((b) => b.banco === bancoActivo);
    if (general?.activa) return { valor: general.porcentaje, especial: false };
    return { valor: cliente.tasa_comision, especial: false, heredada: true };
  }

  async function guardarBanco(banco) {
    const valor = parseFloat(valorBanco);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setError("El porcentaje debe ser un número entre 0 y 100.");
      return;
    }
    setGuardando(true);
    setError("");
    const { error: e } = await supabase
      .from("comisiones_banco")
      .update({ porcentaje: valor, actualizado_por: session.user.id })
      .eq("banco", banco);
    setGuardando(false);
    if (e) return setError("No se pudo guardar: " + e.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "CAMBIAR_COMISION_BANCO",
      entidad: "comisiones_banco",
      datos_despues: { banco, porcentaje: valor },
    });
    setEditandoBanco(null);
    setOk(`Comisión general de ${banco} actualizada a ${valor} %.`);
    cargar();
  }

  /**
   * Cambio masivo. Sin selección aplica a todos los clientes activos;
   * con selección, solo a los marcados.
   */
  async function aplicarMasivo() {
    const valor = parseFloat(valorMasivo);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setError("El porcentaje debe ser un número entre 0 y 100.");
      return;
    }
    const objetivo = marcados.size > 0 ? [...marcados] : null;
    const cuantos = objetivo ? objetivo.length : clientes.length;
    if (
      !confirm(
        `Vas a fijar ${valor} % en ${bancoActivo} para ${cuantos} cliente${cuantos === 1 ? "" : "s"}. ¿Continuar?`,
      )
    )
      return;

    setGuardando(true);
    setError("");
    const { data, error: e } = await supabase.rpc("asignar_comision_masiva", {
      p_banco: bancoActivo,
      p_porcentaje: valor,
      p_clientes: objetivo,
      p_motivo: motivoMasivo.trim() || null,
    });
    setGuardando(false);
    if (e) return setError("No se pudo aplicar: " + e.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "COMISION_MASIVA",
      entidad: "comisiones_cliente",
      datos_despues: {
        banco: bancoActivo,
        porcentaje: valor,
        clientes: data,
        motivo: motivoMasivo.trim() || null,
      },
    });
    setOk(`${data} cliente${data === 1 ? "" : "s"} actualizado${data === 1 ? "" : "s"}.`);
    setMarcados(new Set());
    setValorMasivo("");
    setMotivoMasivo("");
    cargar();
  }

  async function quitarEspecial() {
    const objetivo = marcados.size > 0 ? [...marcados] : null;
    const cuantos = objetivo ? objetivo.length : clientes.length;
    if (
      !confirm(
        `Vas a quitar la comisión especial de ${bancoActivo} a ${cuantos} cliente${cuantos === 1 ? "" : "s"}. Volverán a la tarifa general del banco. ¿Continuar?`,
      )
    )
      return;

    setGuardando(true);
    setError("");
    const { data, error: e } = await supabase.rpc("quitar_comision_especial", {
      p_banco: bancoActivo,
      p_clientes: objetivo,
    });
    setGuardando(false);
    if (e) return setError("No se pudo quitar: " + e.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "QUITAR_COMISION_ESPECIAL",
      entidad: "comisiones_cliente",
      datos_despues: { banco: bancoActivo, clientes: data },
    });
    setOk(`${data} comisión${data === 1 ? "" : "es"} especial${data === 1 ? "" : "es"} eliminada${data === 1 ? "" : "s"}.`);
    setMarcados(new Set());
    cargar();
  }

  /** Cambio individual, sin pasar por la selección masiva. */
  async function guardarIndividual(cliente, texto) {
    const valor = parseFloat(texto);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setError("El porcentaje debe ser un número entre 0 y 100.");
      return;
    }
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.from("comisiones_cliente").upsert(
      {
        cliente_id: cliente.id,
        banco: bancoActivo,
        porcentaje: valor,
        asignado_por: session.user.id,
      },
      { onConflict: "cliente_id,banco" },
    );
    setGuardando(false);
    if (e) return setError("No se pudo guardar: " + e.message);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: "COMISION_INDIVIDUAL",
      entidad: "comisiones_cliente",
      entidad_id: cliente.id,
      datos_despues: { banco: bancoActivo, porcentaje: valor },
    });
    setOk(`${cliente.nombres} ${cliente.apellidos}: ${valor} % en ${bancoActivo}.`);
    cargar();
  }

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return clientes;
    return clientes.filter((c) =>
      [c.nombres, c.apellidos, c.dni, c.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [clientes, busqueda]);

  if (!session) return null;

  const general = bancos.find((b) => b.banco === bancoActivo);
  const conEspecial = especiales.filter((e) => e.banco === bancoActivo).length;
  const todosMarcados =
    visibles.length > 0 && visibles.every((c) => marcados.has(c.id));

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Comisiones"
      descripcion="Tarifa general por banco y excepciones por cliente"
    >
      {error && (
        <div className="mb-4">
          <Aviso titulo="No se pudo completar" onCerrar={() => setError("")}>
            {error}
          </Aviso>
        </div>
      )}
      {ok && (
        <div className="mb-4">
          <Aviso tono="info" onCerrar={() => setOk("")}>
            {ok}
          </Aviso>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : bancos.length === 0 ? (
        <Vacio
          titulo="Sin bancos configurados"
          detalle="Ejecuta server/07-comisiones.sql para crear la tabla de comisiones."
        />
      ) : (
        <>
          {/* ───── Tarifa general por banco ───── */}
          <section className="mb-6">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Comisión general por banco
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bancos.map((b) => {
                const abierto = bancoActivo === b.banco;
                const editando = editandoBanco === b.banco;
                return (
                  <div
                    key={b.banco}
                    className={cn(
                      "rounded-xl border bg-card p-4 shadow-panel transition",
                      abierto ? "border-marca-600 ring-1 ring-marca-600" : "border-border",
                    )}
                  >
                    <button
                      onClick={() => {
                        setBancoActivo(b.banco);
                        setMarcados(new Set());
                      }}
                      className="block w-full text-left"
                    >
                      <p className="text-[13px] font-semibold text-foreground">
                        {b.banco}
                      </p>
                    </button>

                    {editando ? (
                      <div className="mt-2 flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={valorBanco}
                          onChange={(e) => setValorBanco(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && guardarBanco(b.banco)
                          }
                          className="cifras w-full rounded-md border border-input px-2 py-1.5 font-mono text-sm outline-none focus:border-marca-500"
                        />
                        <button
                          onClick={() => guardarBanco(b.banco)}
                          disabled={guardando}
                          className="rounded-md bg-emerald-600 p-2 text-white transition hover:bg-emerald-700"
                          aria-label="Guardar"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditandoBanco(null)}
                          className="rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditandoBanco(b.banco);
                          setValorBanco(String(b.porcentaje));
                        }}
                        className="mt-1 flex w-full items-baseline gap-1 rounded-md py-0.5 text-left transition hover:bg-muted"
                      >
                        <span className="cifras font-mono text-[26px] font-bold text-marca-700">
                          {b.porcentaje}
                        </span>
                        <span className="text-sm text-muted-foreground">%</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          editar
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ───── Excepciones por cliente ───── */}
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Clientes en {bancoActivo}
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {clientes.length} activos, {conEspecial} con comisión especial.
                  Sin excepción se aplica el {general?.porcentaje} % general.
                </p>
              </div>
              <div className="relative w-full max-w-xs">
                <Lupa className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre, DNI o correo"
                  className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                />
              </div>
            </div>

            {/* Barra de cambio masivo */}
            <div className="mb-3 rounded-xl border border-border bg-card p-4 shadow-panel">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-28">
                  <label className="mb-1 block text-[12px] font-medium">
                    Porcentaje
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={valorMasivo}
                    onChange={(e) => setValorMasivo(e.target.value)}
                    placeholder="1.50"
                    className="cifras w-full rounded-lg border border-input px-3 py-2 font-mono text-sm outline-none focus:border-marca-500"
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-[12px] font-medium">
                    Motivo (opcional)
                  </label>
                  <input
                    value={motivoMasivo}
                    onChange={(e) => setMotivoMasivo(e.target.value)}
                    placeholder="Ej: campaña de septiembre"
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-marca-500"
                  />
                </div>
                <button
                  onClick={aplicarMasivo}
                  disabled={guardando || !valorMasivo}
                  className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-600 disabled:opacity-40"
                >
                  {marcados.size > 0
                    ? `Aplicar a ${marcados.size}`
                    : `Aplicar a los ${clientes.length}`}
                </button>
                <button
                  onClick={quitarEspecial}
                  disabled={guardando}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-40"
                >
                  Quitar especial
                </button>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Sin nadie marcado, el cambio alcanza a todos los clientes
                activos. Marca algunos para aplicarlo solo a ellos.
              </p>
            </div>

            {visibles.length === 0 ? (
              <Vacio
                titulo={busqueda ? "Sin coincidencias" : "Sin clientes activos"}
                detalle={
                  busqueda
                    ? "Ningún cliente coincide con lo que buscas."
                    : "Todavía no hay clientes verificados a los que asignar comisión."
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
                <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={(e) =>
                      setMarcados(
                        e.target.checked
                          ? new Set(visibles.map((c) => c.id))
                          : new Set(),
                      )
                    }
                    className="h-4 w-4 accent-marca-700"
                    aria-label="Marcar todos"
                  />
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {marcados.size > 0
                      ? `${marcados.size} marcado${marcados.size === 1 ? "" : "s"}`
                      : `${visibles.length} cliente${visibles.length === 1 ? "" : "s"}`}
                  </span>
                </div>

                <ul className="divide-y divide-border">
                  {visibles.map((c) => {
                    const t = tarifaDe(c);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={marcados.has(c.id)}
                          onChange={(e) => {
                            const s = new Set(marcados);
                            e.target.checked ? s.add(c.id) : s.delete(c.id);
                            setMarcados(s);
                          }}
                          className="h-4 w-4 shrink-0 accent-marca-700"
                          aria-label={`Marcar ${c.nombres}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {c.nombres} {c.apellidos}
                          </p>
                          <p className="cifras truncate font-mono text-[12px] text-muted-foreground">
                            {c.dni}
                          </p>
                        </div>

                        {t.especial ? (
                          <Estado
                            valor="especial"
                            etiqueta="Especial"
                            tono="info"
                            className="hidden sm:inline-flex"
                          />
                        ) : (
                          <span className="hidden text-[11px] text-muted-foreground sm:inline">
                            General
                          </span>
                        )}

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={t.valor}
                          key={`${c.id}-${bancoActivo}-${t.valor}`}
                          onBlur={(e) => {
                            if (parseFloat(e.target.value) !== parseFloat(t.valor))
                              guardarIndividual(c, e.target.value);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                          className="cifras w-20 shrink-0 rounded-md border border-input px-2 py-1.5 text-right font-mono text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/10"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          %
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
