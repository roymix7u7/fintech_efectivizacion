"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { BANCOS_TARJETA, nombreBanco } from "@/lib/bancos";
import { cn } from "@/lib/utils";
import Shell, { Porcentaje, Mas } from "@/components/shell";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, CargaPantalla } from "@/components/carga";
import {
  Segmentos,
  Buscador,
  Barra,
  Campo,
  Dialogo,
  Tostada,
  useConfirmar,
} from "@/components/piezas";
import Pista from "@/components/pista";
import {
  pct,
  soles,
  aNumero,
  vacio,
  filasDe,
  difiereDeLaWeb,
  SiglaBanco,
  EditorCupon,
  textoDuracion,
} from "@/components/cupones";
import Desplegable from "@/components/desplegable";

/**
 * Comisiones.
 *
 * TARIFA ESTÁNDAR: la que paga todo cliente sin un cupón vigente. Es la
 * publicada en la web y no vence.
 *
 * CUPONES: tarifas especiales por un tiempo (por ejemplo, 12 meses). Se
 * asignan a cada cliente desde Clientes; cuando el cupón vence, el
 * cliente vuelve solo a la tarifa estándar. Si un cupón no define un
 * banco, ese banco se cobra con la estándar.
 *
 * ESPECIALES: un acuerdo con un cliente en un banco. Gana sobre todo lo
 * demás y no vence.
 *
 * Por dentro, la estándar y los cupones son "bloques" (bloques_comision),
 * y el cálculo vive en la base (comision_efectiva).
 */
const UNIDADES = [
  { k: "dias", t: "días", x: 1 },
  { k: "meses", t: "meses (30 días)", x: 30 },
  { k: "anios", t: "años", x: 365 },
];
/** Días → { cantidad, unidad } para el formulario. */
function aDuracion(dias) {
  if (!dias) return { cantidad: "1", unidad: "anios" };
  if (dias % 365 === 0)
    return { cantidad: String(dias / 365), unidad: "anios" };
  if (dias % 30 === 0) return { cantidad: String(dias / 30), unidad: "meses" };
  return { cantidad: String(dias), unidad: "dias" };
}

export default function ComisionesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [vista, setVista] = useState("estandar");
  const [cupones, setCupones] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState(null); // id del cupón cuyas tarifas se editan
  const [ficha, setFicha] = useState(null); // { id?, nombre, descripcion, cantidad, unidad, base }
  const [tocadoFicha, setTocadoFicha] = useState(false);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();
  const esAdmin = session?.rol === "admin";

  const cargarCupones = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listar_bloques");
    if (e) setError(explicarError(e, "No se pudieron cargar las tarifas."));
    else setCupones(data || []);
  }, []);

  const cargarEspeciales = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listar_especiales");
    if (e) setError(explicarError(e, "No se pudieron cargar las especiales."));
    else setEspeciales(data || []);
  }, []);

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      await Promise.all([cargarCupones(), cargarEspeciales()]);
      setLoading(false);
    });
  }, [router, cargarCupones, cargarEspeciales]);

  const estandar = cupones.find((c) => c.es_default) || null;
  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return cupones
      .filter((c) => !c.es_default)
      .filter((c) => verInactivos || c.activo)
      .filter(
        (c) =>
          !t ||
          c.nombre.toLowerCase().includes(t) ||
          (c.descripcion || "").toLowerCase().includes(t),
      );
  }, [cupones, busqueda, verInactivos]);
  const cuponPorId = useMemo(
    () => Object.fromEntries(cupones.map((b) => [b.id, b])),
    [cupones],
  );
  const cuponEditando = editando ? cuponPorId[editando] : null;
  // Sin la migración 063 los cupones llegan sin "duracion_dias".
  const sinMigracion = cupones.length > 0 && !("duracion_dias" in cupones[0]);

  // ── Acciones ──

  /** Guarda las tarifas cambiadas. Devuelve true, o el motivo si falló. */
  async function guardarTarifas(cupon, cambios) {
    setGuardando(cupon.id);
    let hechas = 0;
    for (const [banco, f] of cambios) {
      const { error: e } = await supabase.rpc("guardar_tarifa_cupon", {
        p_cupon: cupon.id,
        p_banco: banco,
        p_porcentaje: aNumero(f.porcentaje),
        p_minimo: vacio(f.minimo) ? null : aNumero(f.minimo),
        p_limite: vacio(f.limite) ? null : aNumero(f.limite),
      });
      if (e) {
        setGuardando(null);
        await cargarCupones();
        return explicarError(
          e,
          `No se guardó ${nombreBanco(banco)}${hechas ? ` (sí se guardaron ${hechas} antes)` : ""}.`,
        );
      }
      hechas++;
    }
    setGuardando(null);
    setOk(
      `${cupon.es_default ? "Tarifa estándar" : `Cupón "${cupon.nombre}"`} guardada (${hechas} banco${hechas === 1 ? "" : "s"}).`,
    );
    await cargarCupones();
    return true;
  }

  const diasFicha = ficha
    ? Math.round(
        aNumero(ficha.cantidad) *
          (UNIDADES.find((u) => u.k === ficha.unidad)?.x || 1),
      )
    : null;
  const fallasFicha = (() => {
    if (!ficha) return {};
    const n = ficha.nombre.trim();
    const r = {};
    if (n.length < 3) r.nombre = "El nombre necesita al menos 3 letras.";
    else if (n.length > 40) r.nombre = "Máximo 40 letras.";
    else if (
      cupones.some(
        (b) =>
          b.id !== ficha.id &&
          b.nombre.trim().toLowerCase() === n.toLowerCase(),
      )
    )
      r.nombre = "Ya hay un cupón con ese nombre.";
    if (!ficha.esEstandar) {
      const c = aNumero(ficha.cantidad);
      if (vacio(ficha.cantidad) || !Number.isInteger(c) || c < 1)
        r.duracion = "Escribe una cantidad entera mayor que 0.";
      else if (diasFicha > 3650) r.duracion = "Máximo 10 años.";
    }
    return r;
  })();

  async function guardarFicha() {
    setTocadoFicha(true);
    if (Object.values(fallasFicha).some(Boolean)) return;
    const nombre = ficha.nombre.trim();
    setGuardando("ficha");
    const actual = ficha.id ? cuponPorId[ficha.id] : null;
    const { data: id, error: e } = await supabase.rpc("guardar_cupon", {
      p_id: ficha.id || null,
      p_nombre: nombre,
      p_descripcion: ficha.descripcion.trim() || null,
      p_activo: actual ? actual.activo : true,
      p_duracion_dias: ficha.esEstandar ? null : diasFicha,
    });
    if (e) {
      setGuardando(null);
      return setError(
        e.code === "PGRST202"
          ? "Falta aplicar la migración 20261029000063_cupones_con_vigencia.sql en Supabase."
          : explicarError(e, "No se pudo guardar el cupón."),
      );
    }
    // Un cupón nuevo arranca con las tarifas del que se eligió como base.
    let copiadas = 0;
    if (!ficha.id && ficha.base) {
      for (const t of cuponPorId[ficha.base]?.bancos || []) {
        const { error: e2 } = await supabase.rpc("guardar_tarifa_cupon", {
          p_cupon: id,
          p_banco: t.banco,
          p_porcentaje: Number(t.porcentaje),
          p_minimo: t.minimo ?? null,
          p_limite: t.limite ?? null,
        });
        if (e2) {
          setError(
            explicarError(
              e2,
              `El cupón se creó, pero no se copió la tarifa de ${t.banco}.`,
            ),
          );
          break;
        }
        copiadas++;
      }
    }
    setGuardando(null);
    setFicha(null);
    setOk(
      ficha.id
        ? `"${nombre}" actualizado.`
        : `Cupón "${nombre}" creado${copiadas ? " con las tarifas copiadas" : ""}. Ajusta sus tarifas.`,
    );
    await cargarCupones();
    if (!ficha.id) setEditando(id);
  }

  async function cambiarActivo(cupon, activo) {
    const si = await confirmar({
      titulo: activo
        ? `¿Reactivar "${cupon.nombre}"?`
        : `¿Desactivar "${cupon.nombre}"?`,
      texto: activo
        ? "Vuelve a poder asignarse a clientes."
        : "Ya no se podrá asignar. Los clientes que lo tienen lo conservan hasta que venza.",
      boton: activo ? "Reactivar" : "Desactivar",
      tono: activo ? undefined : "atencion",
    });
    if (!si) return;
    setGuardando(cupon.id);
    const { error: e } = await supabase.rpc("guardar_cupon", {
      p_id: cupon.id,
      p_nombre: cupon.nombre,
      p_descripcion: cupon.descripcion,
      p_activo: activo,
      p_duracion_dias: cupon.duracion_dias || 365,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo cambiar."));
    setOk(`"${cupon.nombre}" ${activo ? "reactivado" : "desactivado"}.`);
    cargarCupones();
  }

  async function quitarEspecial(fila) {
    const si = await confirmar({
      titulo: `¿Quitar la comisión especial de ${fila.nombres}?`,
      texto: `En ${nombreBanco(fila.banco)} vuelve a su tarifa${fila.tarifa_bloque != null ? ` (${pct(fila.tarifa_bloque)})` : ""} desde su próxima solicitud.`,
      boton: "Quitar especial",
      tono: "atencion",
    });
    if (!si) return;
    setGuardando(`${fila.cliente_id}-${fila.banco}`);
    const { error: e } = await supabase.rpc("quitar_comision_especial", {
      p_banco: fila.banco,
      p_clientes: [fila.cliente_id],
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo quitar."));
    setOk(`${fila.nombres} vuelve a su tarifa en ${nombreBanco(fila.banco)}.`);
    cargarEspeciales();
  }

  if (!session) return <CargaPantalla />;

  const VISTAS = [
    {
      clave: "estandar",
      etiqueta: "Tarifa estándar",
      pista: "La que paga todo cliente sin un cupón vigente. No vence.",
    },
    {
      clave: "cupones",
      etiqueta: "Cupones",
      cuenta: cupones.filter((c) => !c.es_default && c.activo).length,
      pista: "Tarifas por un tiempo que asignas a clientes.",
    },
    {
      clave: "especiales",
      etiqueta: "Especiales",
      cuenta: especiales.length,
      pista: "Acuerdos con un cliente en un banco.",
    },
  ];
  const abrirNuevo = () => {
    setFicha({
      nombre: "",
      descripcion: "",
      cantidad: "1",
      unidad: "anios",
      base: estandar?.id || "",
    });
    setTocadoFicha(false);
  };

  return (
    <Shell
      session={session}
      titulo="Comisiones"
      descripcion="Tarifa estándar, cupones y comisiones especiales"
      ayuda="La tarifa estándar es la publicada en la web y no vence. Un cupón da otra tarifa por un tiempo: se asigna en Clientes y, al vencer, el cliente vuelve a la estándar. Una especial es un acuerdo con un cliente en un banco y gana sobre todo."
      acciones={
        esAdmin &&
        vista === "cupones" && (
          <BotonAccion onClick={abrirNuevo} icono={<Mas className="h-4 w-4" />}>
            <span className="hidden sm:inline">Nuevo cupón</span>
          </BotonAccion>
        )
      }
    >
      {error && (
        <Aviso
          className="mb-4"
          titulo="Revisa esto"
          onCerrar={() => setError("")}
        >
          {error}
        </Aviso>
      )}
      {sinMigracion && (
        <Aviso
          className="mb-4"
          tono="espera"
          titulo="Falta un paso en Supabase"
        >
          Para que los cupones tengan duración y se puedan asignar con fecha de
          vencimiento, ejecuta{" "}
          <code className="rounded bg-muted px-1 font-mono text-chico">
            supabase/migrations/20261029000063_cupones_con_vigencia.sql
          </code>{" "}
          en Supabase → SQL Editor.
        </Aviso>
      )}

      <Barra>
        <Segmentos valor={vista} onCambio={setVista} opciones={VISTAS} />
        {vista === "cupones" && (
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <Buscador
              valor={busqueda}
              onCambio={setBusqueda}
              placeholder="Buscar cupón"
              className="w-full sm:w-64"
              id="buscar-cupon"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={verInactivos}
                onChange={(e) => setVerInactivos(e.target.checked)}
                className="h-4 w-4 accent-marca-700"
              />
              Ver desactivados
            </label>
          </div>
        )}
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={5} />
      ) : vista === "estandar" ? (
        estandar ? (
          <TarifaEstandar
            estandar={estandar}
            esAdmin={esAdmin}
            onEditar={() => setEditando(estandar.id)}
          />
        ) : (
          <Vacio
            icono={<Porcentaje />}
            titulo="No hay tarifa estándar"
            detalle="Revisa las migraciones de comisiones."
          />
        )
      ) : vista === "cupones" ? (
        lista.length === 0 ? (
          <Vacio
            icono={<Porcentaje />}
            titulo={
              busqueda
                ? "Ningún cupón con ese nombre"
                : "Todavía no hay cupones"
            }
            detalle="Un cupón da otra tarifa por un tiempo. Lo asignas a un cliente desde Clientes."
            accion={
              esAdmin &&
              !busqueda && (
                <BotonAccion
                  onClick={abrirNuevo}
                  icono={<Mas className="h-4 w-4" />}
                >
                  Nuevo cupón
                </BotonAccion>
              )
            }
          />
        ) : (
          <ListaCupones
            lista={lista}
            estandar={estandar}
            esAdmin={esAdmin}
            guardando={guardando}
            onTarifas={(c) => setEditando(c.id)}
            onEditar={(c) => {
              setFicha({
                id: c.id,
                nombre: c.nombre,
                descripcion: c.descripcion || "",
                ...aDuracion(c.duracion_dias),
              });
              setTocadoFicha(false);
            }}
            onActivo={cambiarActivo}
          />
        )
      ) : especiales.length === 0 ? (
        <Vacio
          icono={<Porcentaje />}
          titulo="Ninguna comisión especial"
          detalle="Se dan desde Clientes: busca al cliente y pulsa “Comisión especial”."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 t-etiqueta">Cliente</th>
                  <th className="px-4 py-2.5 t-etiqueta">Banco</th>
                  <th className="px-4 py-2.5 t-etiqueta">Especial</th>
                  <th className="px-4 py-2.5 t-etiqueta">Pagaría sin ella</th>
                  <th className="px-4 py-2.5 t-etiqueta">Motivo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {especiales.map((f) => (
                  <tr
                    key={`${f.cliente_id}-${f.banco}`}
                    className="hover:bg-muted/20"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-foreground">
                        {f.nombres} {f.apellidos}
                      </p>
                      <p className="cifras text-chico text-muted-foreground">
                        DNI {f.dni}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <SiglaBanco banco={f.banco} conNombre chica />
                    </td>
                    <td className="cifras px-4 py-2.5 text-md font-bold text-marca-700">
                      {pct(f.porcentaje)}
                    </td>
                    <td className="cifras px-4 py-2.5 text-muted-foreground">
                      {f.tarifa_bloque != null ? pct(f.tarifa_bloque) : "—"}
                      {f.bloque && (
                        <span className="block text-chico">{f.bloque}</span>
                      )}
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

      {/* Tarifas de la estándar o de un cupón */}
      <Dialogo
        abierto={Boolean(cuponEditando)}
        onCerrar={() => setEditando(null)}
        bloqueado={guardando === editando}
        titulo={
          cuponEditando
            ? cuponEditando.es_default
              ? "Tarifa estándar"
              : `Tarifas del cupón "${cuponEditando.nombre}"`
            : ""
        }
        descripcion={
          cuponEditando
            ? cuponEditando.es_default
              ? "La paga todo cliente sin cupón vigente. Debería coincidir con la web."
              : "Los bancos que dejes vacíos se cobran con la tarifa estándar."
            : ""
        }
        icono={<Porcentaje className="h-5 w-5" />}
        ancho="max-w-3xl"
      >
        {cuponEditando && (
          <EditorCupon
            key={cuponEditando.id}
            cupon={cuponEditando}
            guardando={guardando === cuponEditando.id}
            onGuardar={(cambios) => guardarTarifas(cuponEditando, cambios)}
            onCerrar={() => setEditando(null)}
          />
        )}
      </Dialogo>

      {/* Crear o editar un cupón */}
      <Dialogo
        abierto={Boolean(ficha)}
        onCerrar={() => setFicha(null)}
        bloqueado={guardando === "ficha"}
        titulo={ficha?.id ? "Editar cupón" : "Nuevo cupón"}
        descripcion={
          ficha?.id
            ? "El cambio de duración aplica a las próximas asignaciones."
            : "Una tarifa por un tiempo, para los clientes que elijas."
        }
        icono={<Porcentaje className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setFicha(null)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              onClick={guardarFicha}
              cargando={guardando === "ficha"}
            >
              {ficha?.id ? "Guardar" : "Crear y poner tarifas"}
            </BotonAccion>
          </>
        }
      >
        {ficha && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              guardarFicha();
            }}
          >
            <Campo
              etiqueta="Nombre"
              htmlFor="nombreCupon"
              requerido
              error={tocadoFicha ? fallasFicha.nombre : null}
            >
              <input
                id="nombreCupon"
                autoFocus
                maxLength={40}
                value={ficha.nombre}
                onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })}
                placeholder="Ej: Bienvenida 2026, Convenio empresa"
                className="campo"
              />
            </Campo>
            {!ficha.esEstandar && (
              <Campo
                etiqueta="Duración"
                htmlFor="cantidadCupon"
                requerido
                error={tocadoFicha ? fallasFicha.duracion : null}
                ayuda={
                  !fallasFicha.duracion && diasFicha
                    ? `Cada cliente lo tendrá ${diasFicha} días desde que se lo asignes.`
                    : null
                }
              >
                <div className="flex gap-2">
                  <input
                    id="cantidadCupon"
                    inputMode="numeric"
                    value={ficha.cantidad}
                    onChange={(e) =>
                      setFicha({
                        ...ficha,
                        cantidad: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    className="campo cifras w-24"
                  />
                  <Desplegable
                    variante="panel"
                    className="flex-1"
                    aria-label="Unidad"
                    valor={ficha.unidad}
                    onCambio={(v) => setFicha({ ...ficha, unidad: v })}
                    opciones={UNIDADES.map((u) => ({ valor: u.k, texto: u.t }))}
                  />
                </div>
              </Campo>
            )}
            <Campo
              etiqueta="Descripción"
              htmlFor="descCupon"
              opcional
              ayuda="Para el equipo: a quién se le da."
            >
              <input
                id="descCupon"
                maxLength={120}
                value={ficha.descripcion}
                onChange={(e) =>
                  setFicha({ ...ficha, descripcion: e.target.value })
                }
                placeholder="Ej: clientes con más de 10 operaciones al mes"
                className="campo"
              />
            </Campo>
            {!ficha.id && (
              <Campo
                etiqueta="Empezar con las tarifas de"
                htmlFor="baseCupon"
                ayuda="Se copian y luego las ajustas."
              >
                <Desplegable
                  id="baseCupon"
                  variante="panel"
                  valor={ficha.base}
                  onCambio={(v) => setFicha({ ...ficha, base: v })}
                  opciones={[
                    ...cupones
                      .filter((c) => c.activo)
                      .map((c) => ({
                        valor: c.id,
                        texto: c.es_default ? "Tarifa estándar" : c.nombre,
                      })),
                    {
                      valor: "",
                      texto: "En blanco",
                      detalle: "Todo a tarifa estándar",
                    },
                  ]}
                />
              </Campo>
            )}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialogo>

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/* ───────── Tarifa estándar ───────── */

function TarifaEstandar({ estandar, esAdmin, onEditar }) {
  const filas = filasDe(estandar);
  const difieren = BANCOS_TARJETA.filter(
    (b) => !vacio(filas[b].porcentaje) && difiereDeLaWeb(b, filas[b]),
  );
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
      <header className="flex flex-wrap items-center gap-3 bg-[#0F1B33] px-5 py-4 text-white">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg">Tarifa estándar</h2>
          <p className="text-sm text-white/65">
            La publicada en la web. La paga todo cliente sin cupón vigente ·{" "}
            <span className="cifras">{estandar.clientes}</span> clientes hoy.
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={onEditar}
            className="rounded-lg bg-oro-500 px-4 py-2 text-sm font-semibold text-marca-900 transition hover:bg-oro-300"
          >
            Editar tarifas
          </button>
        )}
      </header>
      {difieren.length > 0 && (
        <p className="border-b border-border bg-red-50 px-5 py-2 text-sm text-red-800">
          <strong>No coincide con la web:</strong>{" "}
          {difieren.map(nombreBanco).join(", ")}.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {BANCOS_TARJETA.map((banco) => {
          const f = filas[banco];
          return (
            <li
              key={banco}
              className="flex items-center gap-3 bg-card px-4 py-3"
            >
              <SiglaBanco banco={banco} />
              <span className="min-w-0">
                <span className="block truncate text-chico text-muted-foreground">
                  {nombreBanco(banco)}
                </span>
                {vacio(f.porcentaje) ? (
                  <span className="text-sm font-semibold text-oro-700">
                    Sin tarifa
                  </span>
                ) : (
                  <>
                    <span className="cifras block font-heading text-lg leading-tight">
                      {pct(f.porcentaje)}
                    </span>
                    <span className="cifras block text-[0.7rem] text-muted-foreground">
                      {vacio(f.minimo)
                        ? "sin mínimo"
                        : `mín. ${soles(f.minimo)} bajo ${soles(f.limite)}`}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ───────── Cupones ───────── */

/** Resumen corto de las tarifas: agrupa los bancos que tienen el mismo porcentaje. */
function resumenTarifas(cupon) {
  const grupos = new Map();
  for (const t of cupon.bancos || []) {
    const k = Number(t.porcentaje);
    grupos.set(k, [...(grupos.get(k) || []), t.banco]);
  }
  return [...grupos.entries()].sort((a, b) => a[0] - b[0]);
}

function ListaCupones({
  lista,
  estandar,
  esAdmin,
  guardando,
  onTarifas,
  onEditar,
  onActivo,
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-4 py-2.5 t-etiqueta">Cupón</th>
              <th className="px-3 py-2.5 t-etiqueta">Duración</th>
              <th className="px-3 py-2.5 t-etiqueta">Clientes</th>
              <th className="px-3 py-2.5 t-etiqueta">Tarifas</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lista.map((c) => {
              const grupos = resumenTarifas(c);
              const faltan = BANCOS_TARJETA.filter(
                (b) => !(c.bancos || []).some((x) => x.banco === b),
              );
              return (
                <tr
                  key={c.id}
                  className={cn(
                    "align-top hover:bg-muted/20",
                    !c.activo && "opacity-60",
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      {c.nombre}
                      {!c.activo && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-bold text-muted-foreground">
                          Desactivado
                        </span>
                      )}
                    </p>
                    {c.descripcion && (
                      <p className="line-clamp-1 text-chico text-muted-foreground">
                        {c.descripcion}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {textoDuracion(c.duracion_dias) || (
                      <Pista texto="Este cupón no tiene duración. Edítalo para ponerle una; las asignaciones nuevas vencerán.">
                        <span className="cursor-help font-semibold text-oro-700">
                          Sin duración
                        </span>
                      </Pista>
                    )}
                  </td>
                  <td className="cifras whitespace-nowrap px-3 py-3">
                    <span className="font-semibold text-foreground">
                      {c.clientes}
                    </span>{" "}
                    vigentes
                    {c.vencidos > 0 && (
                      <span className="block text-chico text-muted-foreground">
                        {c.vencidos} vencidos
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {grupos.length === 0 ? (
                      <span className="text-chico text-muted-foreground">
                        Todo a tarifa estándar
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {grupos.map(([p, bancos]) => (
                          <span
                            key={p}
                            className="rounded-md bg-marca-50 px-2 py-0.5 text-chico text-marca-800 ring-1 ring-marca-100"
                          >
                            <strong className="cifras">{pct(p)}</strong>{" "}
                            {bancos.length === BANCOS_TARJETA.length
                              ? "todos los bancos"
                              : bancos.map(nombreBanco).join(", ")}
                          </span>
                        ))}
                        {faltan.length > 0 &&
                          faltan.length < BANCOS_TARJETA.length &&
                          estandar && (
                            <span className="rounded-md bg-muted px-2 py-0.5 text-chico text-muted-foreground">
                              estándar: {faltan.map(nombreBanco).join(", ")}
                            </span>
                          )}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {esAdmin ? (
                      <span className="inline-flex gap-1.5">
                        <BotonAccion
                          tamano="chico"
                          onClick={() => onTarifas(c)}
                        >
                          Tarifas
                        </BotonAccion>
                        <BotonAccion
                          tono="neutro"
                          tamano="chico"
                          onClick={() => onEditar(c)}
                        >
                          Editar
                        </BotonAccion>
                        <BotonAccion
                          tono={c.activo ? "peligroSuave" : "neutro"}
                          tamano="chico"
                          onClick={() => onActivo(c, !c.activo)}
                          cargando={guardando === c.id}
                        >
                          {c.activo ? "Desactivar" : "Reactivar"}
                        </BotonAccion>
                      </span>
                    ) : (
                      <BotonAccion
                        tono="neutro"
                        tamano="chico"
                        onClick={() => onTarifas(c)}
                      >
                        Ver tarifas
                      </BotonAccion>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-chico text-muted-foreground">
        Asigna o renueva cupones desde{" "}
        <Link
          href="/clientes"
          className="font-semibold text-marca-700 underline underline-offset-2"
        >
          Clientes
        </Link>
        . Al vencer, el cliente vuelve solo a la tarifa estándar.
      </p>
    </div>
  );
}
