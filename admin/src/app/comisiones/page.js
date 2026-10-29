"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { BANCOS_TARJETA, colorBanco, nombreBanco } from "@/lib/bancos";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { TARIFAS } from "@/components/sitio/datos";
import Shell, { Porcentaje, Mas, Check } from "@/components/shell";
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

/**
 * Comisiones en dos niveles.
 *
 * Un CUPÓN es un juego completo de tarifas, una por banco: porcentaje y,
 * si corresponde, una comisión mínima cuando la operación es menor a un
 * monto. Cada cliente tiene un cupón y cambiarlo mueve a todos sus
 * clientes de una vez. El cupón General es la tarifa estándar publicada
 * en la web y el que reciben los clientes nuevos.
 *
 * Una ESPECIAL es un acuerdo con un cliente concreto en un banco. Gana
 * sobre el cupón y los cambios del cupón no la tocan.
 *
 * Por dentro un cupón es un "bloque" (bloques_comision): mismas tablas y
 * mismo cálculo (comision_efectiva), así que la app no cambia.
 *
 * Quién hace qué: el administrador arma cupones y mueve clientes entre
 * ellos; el supervisor solo ajusta especiales, de a un cliente.
 */
const pct = (n) =>
  n === null || n === undefined || n === ""
    ? "—"
    : `${Number(n)
        .toFixed(2)
        .replace(/\.?0+$/, "")} %`;
const soles = (n) =>
  `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const aNumero = (t) => Number(String(t).replace(",", ".").trim());
const vacio = (t) => t === null || t === undefined || String(t).trim() === "";
const ESTANDAR = Object.fromEntries(TARIFAS.map((t) => [t.nombre, t]));

/** null si es un porcentaje válido; si no, qué está mal. */
function fallaPorcentaje(texto) {
  if (vacio(texto)) return "Escribe un porcentaje.";
  const n = aNumero(texto);
  if (!Number.isFinite(n)) return "Solo números.";
  if (n < 0 || n > 100) return "Entre 0 y 100.";
  if (Math.round(n * 100) !== Math.round(n * 1e6) / 1e4)
    return "Máximo dos decimales.";
  return null;
}

/** Errores de una fila del cupón: { porcentaje, minimo, limite }. */
function fallasFila(f) {
  const r = {
    porcentaje: fallaPorcentaje(f.porcentaje),
    minimo: null,
    limite: null,
  };
  const conMin = !vacio(f.minimo);
  const conLim = !vacio(f.limite);
  if (conMin !== conLim) {
    if (!conMin) r.minimo = "Falta el mínimo.";
    else r.limite = "Falta el monto.";
    return r;
  }
  if (conMin) {
    const m = aNumero(f.minimo);
    const l = aNumero(f.limite);
    if (!Number.isFinite(m) || m <= 0) r.minimo = "Mayor que 0.";
    else if (Math.round(m * 100) !== Math.round(m * 1e6) / 1e4)
      r.minimo = "Máximo dos decimales.";
    if (!Number.isFinite(l) || l <= 0) r.limite = "Mayor que 0.";
    if (!r.minimo && !r.limite && m >= l)
      r.minimo = "Debe ser menor que el monto.";
  }
  return r;
}
const filaValida = (f) => !Object.values(fallasFila(f)).some(Boolean);

/** Las filas editables de un cupón, una por banco. */
const filasDe = (cupon) =>
  Object.fromEntries(
    BANCOS_TARJETA.map((banco) => {
      const t = (cupon?.bancos || []).find((x) => x.banco === banco);
      return [
        banco,
        {
          porcentaje: t?.porcentaje ?? "",
          minimo: t?.minimo ?? "",
          limite: t?.limite ?? "",
        },
      ];
    }),
  );
const igual = (a, b) =>
  String(a ?? "").trim() === String(b ?? "").trim() ||
  (!vacio(a) && !vacio(b) && aNumero(a) === aNumero(b));
const filaCambiada = (a, b) =>
  !igual(a.porcentaje, b.porcentaje) ||
  !igual(a.minimo, b.minimo) ||
  !igual(a.limite, b.limite);

/** Ejemplo de cobro con un monto: el porcentaje, o el mínimo si el monto es menor al límite. */
function ejemplo(f) {
  if (fallaPorcentaje(f.porcentaje) || !filaValida(f)) return null;
  const p = aNumero(f.porcentaje);
  if (vacio(f.minimo)) return { monto: 1000, cobra: (1000 * p) / 100 };
  const l = aNumero(f.limite);
  const monto = Math.max(100, Math.round(l / 2 / 100) * 100);
  return { monto, cobra: Math.max((monto * p) / 100, aNumero(f.minimo)) };
}

/** ¿La fila difiere de la tarifa publicada en la web? */
function difiereDeLaWeb(banco, f) {
  const w = ESTANDAR[banco];
  if (!w) return false;
  return (
    !igual(f.porcentaje, w.pct) ||
    !igual(f.minimo, w.minimo) ||
    !igual(f.limite, w.limite)
  );
}

export default function ComisionesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [vista, setVista] = useState("cupones");

  const [cupones, setCupones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const termino = useRetraso(busqueda);
  const [ficha, setFicha] = useState(null); // nuevo o renombrar: { id?, nombre, descripcion, base }
  const [tocadoFicha, setTocadoFicha] = useState(false);
  const [especial, setEspecial] = useState(null); // { cliente, banco, valor, motivo }
  const [tocadoEspecial, setTocadoEspecial] = useState(false);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();

  const esAdmin = session?.rol === "admin";

  const cargarCupones = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listar_bloques");
    if (e) setError(explicarError(e, "No se pudieron cargar los cupones."));
    else setCupones(data || []);
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
    if (t.length >= 2)
      q = q.or(`nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%`);
    const { data, error: e } = await q;
    if (e) setError(explicarError(e, "No se pudieron cargar los clientes."));
    else setClientes(data || []);
  }, [termino]);

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      // El supervisor no arma cupones: entra directo a sus clientes.
      if (s.rol !== "admin") setVista("clientes");
      await Promise.all([
        cargarCupones(),
        cargarEspeciales(),
        cargarClientes(),
      ]);
      setLoading(false);
    });
  }, [router, cargarCupones, cargarEspeciales, cargarClientes]);

  useEffect(() => {
    if (session) cargarClientes();
  }, [termino, session, cargarClientes]);

  const cuponPorId = useMemo(
    () => Object.fromEntries(cupones.map((b) => [b.id, b])),
    [cupones],
  );
  const tarifaDe = (cuponId, banco) =>
    (cuponPorId[cuponId]?.bancos || []).find((x) => x.banco === banco);

  // ── Cupones ──

  const fallaNombre = (() => {
    if (!ficha) return null;
    const n = ficha.nombre.trim();
    if (n.length < 3) return "El nombre necesita al menos 3 letras.";
    if (n.length > 40) return "Máximo 40 letras.";
    if (
      cupones.some(
        (b) =>
          b.id !== ficha.id &&
          b.nombre.trim().toLowerCase() === n.toLowerCase(),
      )
    )
      return "Ya hay un cupón con ese nombre.";
    return null;
  })();

  async function guardarFicha() {
    setTocadoFicha(true);
    if (fallaNombre) return;
    const nombre = ficha.nombre.trim();
    const descripcion = ficha.descripcion.trim() || null;
    setGuardando("ficha");
    const actual = ficha.id ? cuponPorId[ficha.id] : null;
    const { data: id, error: e } = await supabase.rpc("guardar_bloque", {
      p_id: ficha.id || null,
      p_nombre: nombre,
      p_descripcion: descripcion,
      p_activo: actual ? actual.activo : true,
    });
    if (e) {
      setGuardando(null);
      return setError(
        explicarError(
          e,
          ficha.id
            ? "No se pudo renombrar el cupón."
            : "No se pudo crear el cupón.",
        ),
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
        ? `Cupón "${nombre}" actualizado.`
        : copiadas
          ? `Cupón "${nombre}" creado con las tarifas de "${cuponPorId[ficha.base]?.nombre}". Ajústalas abajo.`
          : `Cupón "${nombre}" creado. Ponle su tarifa en cada banco.`,
    );
    cargarCupones();
  }

  async function desactivar(cupon) {
    const si = await confirmar({
      titulo: `¿Desactivar el cupón "${cupon.nombre}"?`,
      texto:
        "No tiene clientes. Deja de aparecer al aprobar clientes y al moverlos de cupón.",
      boton: "Desactivar",
      tono: "atencion",
    });
    if (!si) return;
    setGuardando(cupon.id);
    const { error: e } = await supabase.rpc("guardar_bloque", {
      p_id: cupon.id,
      p_nombre: cupon.nombre,
      p_descripcion: cupon.descripcion,
      p_activo: false,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo desactivar."));
    setOk(`Cupón "${cupon.nombre}" desactivado.`);
    cargarCupones();
  }

  /** Guarda las filas cambiadas de un cupón. Devuelve true si guardó todo. */
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
        setError(
          e.code === "PGRST202" || /guardar_tarifa_cupon/.test(e.message || "")
            ? "Falta aplicar la migración de cupones (supabase/migrations/20261029000062_cupones.sql) en Supabase."
            : explicarError(
                e,
                `No se guardó ${nombreBanco(banco)}${hechas ? ` (sí se guardaron ${hechas} antes)` : ""}.`,
              ),
        );
        await cargarCupones();
        return false;
      }
      hechas++;
    }
    setGuardando(null);
    setOk(
      `Cupón "${cupon.nombre}" guardado (${hechas} banco${hechas === 1 ? "" : "s"}). Aplica a ${cupon.clientes} cliente${cupon.clientes === 1 ? "" : "s"}, salvo sus especiales.`,
    );
    await cargarCupones();
    return true;
  }

  // ── Clientes y especiales ──

  async function moverCliente(cliente, cuponId) {
    const destino = cuponPorId[cuponId];
    const si = await confirmar({
      titulo: `¿Pasar a ${cliente.nombres} al cupón ${destino?.nombre}?`,
      texto:
        "Sus comisiones cambian desde su próxima solicitud. Las especiales que tenga se mantienen.",
      detalle: (
        <div className="flex flex-wrap gap-1.5">
          {(destino?.bancos || []).map((x) => (
            <span
              key={x.banco}
              className="rounded-full bg-muted px-2.5 py-1 text-chico font-semibold"
            >
              {nombreBanco(x.banco)}{" "}
              <span className="cifras">{pct(x.porcentaje)}</span>
            </span>
          ))}
        </div>
      ),
      boton: "Cambiar cupón",
    });
    if (!si) return;
    setGuardando(cliente.id);
    const { error: e } = await supabase.rpc("asignar_bloque", {
      p_clientes: [cliente.id],
      p_bloque: cuponId,
    });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo cambiar el cupón."));
    setOk(`${cliente.nombres} pasó al cupón ${destino?.nombre}.`);
    cargarClientes();
    cargarCupones();
  }

  const fallasEspecial = especial
    ? {
        valor: fallaPorcentaje(especial.valor),
        motivo:
          especial.motivo.trim().length < 5
            ? "Explica el acuerdo en pocas palabras: queda en el registro."
            : null,
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
    setOk(
      `${especial.cliente.nombres} queda al ${pct(n)} en ${nombreBanco(especial.banco)}. Los cambios del cupón ya no la tocan.`,
    );
    setEspecial(null);
    cargarEspeciales();
  }

  async function quitarEspecial(fila) {
    const si = await confirmar({
      titulo: `¿Quitar la comisión especial de ${fila.nombres}?`,
      texto: `En ${nombreBanco(fila.banco)} vuelve a la tarifa de su cupón${fila.tarifa_bloque != null ? ` (${pct(fila.tarifa_bloque)})` : ""} desde su próxima solicitud.`,
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
    setOk(
      `${fila.nombres} vuelve a la tarifa de su cupón en ${nombreBanco(fila.banco)}.`,
    );
    cargarEspeciales();
  }

  if (!session) return <CargaPantalla />;

  const activos = cupones.filter((c) => c.activo);
  const VISTAS = [
    ...(esAdmin
      ? [
          {
            clave: "cupones",
            etiqueta: "Cupones",
            cuenta: activos.length,
            pista: "Tarifas por banco que comparten muchos clientes.",
          },
        ]
      : []),
    {
      clave: "clientes",
      etiqueta: "Clientes",
      pista:
        "Busca un cliente para ver su cupón o darle una comisión especial.",
    },
    {
      clave: "especiales",
      etiqueta: "Especiales",
      cuenta: especiales.length,
      pista: "Acuerdos con un cliente en un banco: ganan sobre su cupón.",
    },
  ];
  const abrirNuevo = () => {
    setFicha({
      nombre: "",
      descripcion: "",
      base: cupones.find((c) => c.es_default)?.id || "",
    });
    setTocadoFicha(false);
  };

  return (
    <Shell
      session={session}
      titulo="Comisiones"
      descripcion={
        esAdmin
          ? "Cupones de tarifas, clientes y excepciones"
          : "Ajusta la comisión de un cliente en un banco"
      }
      ayuda="Cada cliente tiene un cupón, que fija su comisión en cada banco (porcentaje y, si corresponde, un mínimo para montos pequeños). Una comisión especial es un acuerdo con un cliente en un banco y gana sobre su cupón."
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
      ) : vista === "cupones" ? (
        cupones.length === 0 ? (
          <Vacio
            icono={<Porcentaje />}
            titulo="Todavía no hay cupones"
            detalle="Crea el primero: cada cliente necesita uno para que la app le calcule la comisión."
            accion={
              <BotonAccion
                onClick={abrirNuevo}
                icono={<Mas className="h-4 w-4" />}
              >
                Nuevo cupón
              </BotonAccion>
            }
          />
        ) : (
          <div className="space-y-5">
            {cupones.map((c) => (
              <TarjetaCupon
                key={c.id}
                cupon={c}
                guardando={guardando === c.id}
                onGuardar={(cambios) => guardarTarifas(c, cambios)}
                onRenombrar={() => {
                  setFicha({
                    id: c.id,
                    nombre: c.nombre,
                    descripcion: c.descripcion || "",
                  });
                  setTocadoFicha(false);
                }}
                onDesactivar={() => desactivar(c)}
              />
            ))}
          </div>
        )
      ) : vista === "clientes" ? (
        clientes.length === 0 ? (
          <Vacio
            icono={<Porcentaje />}
            titulo="Sin clientes"
            detalle="Prueba con otro nombre o DNI."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-4 py-2.5 t-etiqueta">Cliente</th>
                    <th className="px-4 py-2.5 t-etiqueta">DNI</th>
                    <th className="px-4 py-2.5 t-etiqueta">Cupón</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clientes.map((c) => {
                    const nEsp = especiales.filter(
                      (f) => f.cliente_id === c.id,
                    ).length;
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
                        <td className="cifras px-4 py-2.5 font-mono text-muted-foreground">
                          {c.dni}
                        </td>
                        <td className="px-4 py-2.5">
                          {esAdmin ? (
                            <select
                              aria-label={`Cupón de ${c.nombres}`}
                              value={c.bloque_id || ""}
                              onChange={(e) => moverCliente(c, e.target.value)}
                              disabled={guardando === c.id}
                              className="campo h-9 w-48 py-1 text-sm"
                            >
                              <option value="" disabled>
                                Sin cupón
                              </option>
                              {cupones
                                .filter((b) => b.activo || b.id === c.bloque_id)
                                .map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.nombre}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="rounded-full bg-muted px-2.5 py-1 text-chico font-semibold text-muted-foreground">
                              {cuponPorId[c.bloque_id]?.nombre || "Sin cupón"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <BotonAccion
                            tono="neutro"
                            tamano="chico"
                            icono={<Porcentaje className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setEspecial({
                                cliente: c,
                                banco: BANCOS_TARJETA[0],
                                valor: "",
                                motivo: "",
                              });
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
              <p className="border-t border-border px-4 py-2 text-chico text-muted-foreground">
                Se muestran los primeros 60. Busca por nombre o DNI para
                encontrar a otro.
              </p>
            )}
          </div>
        )
      ) : especiales.length === 0 ? (
        <Vacio
          icono={<Porcentaje />}
          titulo="Ninguna comisión especial"
          detalle="Todos los clientes están con la tarifa de su cupón."
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
                  <th className="px-4 py-2.5 t-etiqueta">Su cupón</th>
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
                      <SiglaBanco banco={f.banco} conNombre />
                    </td>
                    <td className="cifras px-4 py-2.5 text-md font-bold text-marca-700">
                      {pct(f.porcentaje)}
                    </td>
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

      {/* Nuevo cupón o renombrar */}
      <Dialogo
        abierto={Boolean(ficha)}
        onCerrar={() => setFicha(null)}
        bloqueado={guardando === "ficha"}
        titulo={ficha?.id ? "Editar cupón" : "Nuevo cupón"}
        descripcion={
          ficha?.id
            ? "Cambia el nombre o la descripción. Las tarifas se editan en su tarjeta."
            : "Un juego de tarifas para un grupo de clientes."
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
              disabled={tocadoFicha && Boolean(fallaNombre)}
            >
              {ficha?.id ? "Guardar" : "Crear cupón"}
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
              error={tocadoFicha ? fallaNombre : null}
            >
              <input
                id="nombreCupon"
                autoFocus
                maxLength={40}
                value={ficha.nombre}
                onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })}
                onBlur={() => ficha.nombre && setTocadoFicha(true)}
                aria-invalid={tocadoFicha && Boolean(fallaNombre)}
                placeholder="Ej: Preferentes, Convenio empresa"
                className="campo"
              />
            </Campo>
            <Campo
              etiqueta="Descripción"
              htmlFor="descCupon"
              opcional
              ayuda="Para el equipo: a quién se le asigna."
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
                ayuda="Se copian y luego las ajustas. Así ningún banco queda sin tarifa."
              >
                <select
                  id="baseCupon"
                  value={ficha.base}
                  onChange={(e) => setFicha({ ...ficha, base: e.target.value })}
                  className="campo"
                >
                  {cupones
                    .filter((c) => c.activo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.es_default ? " (estándar)" : ""}
                      </option>
                    ))}
                  <option value="">En blanco</option>
                </select>
              </Campo>
            )}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialogo>

      {/* Comisión especial de un cliente */}
      <Dialogo
        abierto={Boolean(especial)}
        onCerrar={() => setEspecial(null)}
        bloqueado={guardando === "especial"}
        titulo="Comisión especial"
        descripcion={
          especial
            ? `${especial.cliente.nombres} ${especial.cliente.apellidos} · DNI ${especial.cliente.dni}`
            : ""
        }
        icono={<Porcentaje className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setEspecial(null)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              onClick={guardarEspecial}
              cargando={guardando === "especial"}
              disabled={
                tocadoEspecial &&
                Boolean(fallasEspecial.valor || fallasEspecial.motivo)
              }
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
                <select
                  id="banco"
                  value={especial.banco}
                  onChange={(e) =>
                    setEspecial({ ...especial, banco: e.target.value })
                  }
                  className="campo"
                >
                  {BANCOS_TARJETA.map((b) => (
                    <option key={b} value={b}>
                      {nombreBanco(b)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                etiqueta="Porcentaje"
                htmlFor="valor"
                requerido
                error={tocadoEspecial ? fallasEspecial.valor : null}
              >
                <div className="relative">
                  <input
                    id="valor"
                    inputMode="decimal"
                    autoFocus
                    value={especial.valor}
                    onChange={(e) =>
                      setEspecial({ ...especial, valor: e.target.value })
                    }
                    aria-invalid={
                      tocadoEspecial && Boolean(fallasEspecial.valor)
                    }
                    placeholder="Ej: 0.8"
                    className="campo cifras pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </Campo>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Hoy paga{" "}
              <strong className="cifras text-foreground">
                {(() => {
                  const esp = especiales.find(
                    (f) =>
                      f.cliente_id === especial.cliente.id &&
                      f.banco === especial.banco,
                  );
                  if (esp) return `${pct(esp.porcentaje)} (especial)`;
                  const t = tarifaDe(
                    especial.cliente.bloque_id,
                    especial.banco,
                  );
                  return t
                    ? `${pct(t.porcentaje)}${t.minimo ? `, mínimo ${soles(t.minimo)}` : ""}`
                    : "—";
                })()}
              </strong>{" "}
              en {nombreBanco(especial.banco)}
              {cuponPorId[especial.cliente.bloque_id]
                ? `, según el cupón ${cuponPorId[especial.cliente.bloque_id].nombre}`
                : ""}
              . La especial no lleva mínimo.
            </p>
            <Campo
              etiqueta="Motivo"
              htmlFor="motivo"
              requerido
              ayuda="Queda registrado con tu nombre. Esta tarifa deja de seguir a su cupón hasta que alguien la quite."
              error={tocadoEspecial ? fallasEspecial.motivo : null}
            >
              <input
                id="motivo"
                maxLength={200}
                value={especial.motivo}
                onChange={(e) =>
                  setEspecial({ ...especial, motivo: e.target.value })
                }
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

/* ───────── Piezas ───────── */

function SiglaBanco({ banco, conNombre }) {
  const c = colorBanco(banco);
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[0.68rem] font-bold tracking-wide"
        style={{ background: c.fondo, color: c.texto }}
        aria-hidden
      >
        {c.sigla}
      </span>
      {conNombre && <span className="font-semibold">{nombreBanco(banco)}</span>}
    </span>
  );
}

/** Entrada numérica con prefijo o sufijo (S/ o %). */
function Numero({
  id,
  valor,
  onCambio,
  error,
  prefijo,
  sufijo,
  placeholder,
  etiqueta,
  ancho = "w-full",
}) {
  return (
    <>
      <span className={cn("relative flex items-center", ancho)}>
        {prefijo && (
          <span className="pointer-events-none absolute left-2.5 text-chico font-semibold text-muted-foreground">
            {prefijo}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-label={etiqueta}
          aria-invalid={Boolean(error)}
          title={error || undefined}
          placeholder={placeholder}
          className={cn(
            "campo cifras h-10 w-full text-md font-semibold",
            prefijo ? "pl-8 pr-2" : "pl-2.5 pr-7",
            error && "border-red-400 bg-red-50 focus:ring-red-500/15",
          )}
        />
        {sufijo && (
          <span className="pointer-events-none absolute right-2.5 text-chico font-semibold text-muted-foreground">
            {sufijo}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Un cupón con su tarifa por banco. Se edita todo y se guarda de una vez:
 * cada fila se valida en el momento y "Guardar" no se activa mientras
 * haya un error. Si el cupón es el estándar, marca los bancos que no
 * coinciden con lo publicado en la web.
 */
function TarjetaCupon({
  cupon,
  guardando,
  onGuardar,
  onRenombrar,
  onDesactivar,
}) {
  const original = useMemo(() => filasDe(cupon), [cupon]);
  const [filas, setFilas] = useState(original);
  useEffect(() => setFilas(original), [original]);
  const [guardado, setGuardado] = useState(false);

  const cambios = BANCOS_TARJETA.filter((b) =>
    filaCambiada(filas[b], original[b]),
  ).map((b) => [b, filas[b]]);
  const errores = Object.fromEntries(
    BANCOS_TARJETA.map((b) => [b, fallasFila(filas[b])]),
  );
  const conError = BANCOS_TARJETA.filter(
    (b) =>
      Object.values(errores[b]).some(Boolean) &&
      (filaCambiada(filas[b], original[b]) || !vacio(filas[b].porcentaje)),
  );
  const sinTarifa = BANCOS_TARJETA.filter((b) => vacio(original[b].porcentaje));
  const difieren = cupon.es_default
    ? BANCOS_TARJETA.filter(
        (b) => !vacio(original[b].porcentaje) && difiereDeLaWeb(b, original[b]),
      )
    : [];
  const editar = (banco, campo, v) =>
    setFilas((f) => ({ ...f, [banco]: { ...f[banco], [campo]: v } }));

  async function guardar() {
    if (!cambios.length || conError.length) return;
    const listo = await onGuardar(cambios);
    if (listo) {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    }
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-panel",
        cupon.es_default ? "border-oro-300" : "border-border",
        !cupon.activo && "opacity-60",
      )}
    >
      {/* Cabecera */}
      <header
        className={cn(
          "flex flex-wrap items-start gap-4 px-5 py-4",
          cupon.es_default ? "bg-[#0F1B33] text-white" : "bg-muted/40",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            cupon.es_default
              ? "bg-oro-500 text-marca-900"
              : "bg-marca-100 text-marca-700",
          )}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z" />
            <path d="M14.5 9.5l-5 5M9.5 9.5h.01M14.5 14.5h.01" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg">{cupon.nombre}</h2>
            {cupon.es_default && (
              <Pista texto="Es la tarifa publicada en la web. La reciben los clientes nuevos al aprobarlos.">
                <span className="cursor-help rounded-full bg-oro-500 px-2.5 py-0.5 text-xs font-bold text-marca-900">
                  Estándar
                </span>
              </Pista>
            )}
            {!cupon.activo && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                Inactivo
              </span>
            )}
            <span
              className={cn(
                "cifras rounded-full px-2.5 py-0.5 text-xs font-semibold",
                cupon.es_default
                  ? "bg-white/10 text-white/80"
                  : "bg-card text-muted-foreground ring-1 ring-border",
              )}
            >
              {cupon.clientes} cliente{cupon.clientes === 1 ? "" : "s"}
            </span>
          </div>
          {cupon.descripcion && (
            <p
              className={cn(
                "mt-0.5 text-sm",
                cupon.es_default ? "text-white/65" : "text-muted-foreground",
              )}
            >
              {cupon.descripcion}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <BotonAccion tono="neutro" tamano="chico" onClick={onRenombrar}>
            Editar nombre
          </BotonAccion>
          {!cupon.es_default && cupon.activo && cupon.clientes === 0 && (
            <BotonAccion
              tono="peligroSuave"
              tamano="chico"
              onClick={onDesactivar}
              cargando={guardando}
            >
              Desactivar
            </BotonAccion>
          )}
        </div>
      </header>

      {/* Avisos del cupón */}
      {(sinTarifa.length > 0 || difieren.length > 0) && (
        <div className="space-y-1.5 border-b border-border px-5 py-3 text-sm">
          {sinTarifa.length > 0 && (
            <p className="text-oro-700">
              <strong>Sin tarifa:</strong>{" "}
              {sinTarifa.map(nombreBanco).join(", ")}. Sus clientes ven 0 % en
              esos bancos.
            </p>
          )}
          {difieren.length > 0 && (
            <p className="text-red-700">
              <strong>No coincide con la web:</strong>{" "}
              {difieren.map(nombreBanco).join(", ")}. La landing publica otra
              tarifa para {difieren.length === 1 ? "ese banco" : "esos bancos"}.
            </p>
          )}
        </div>
      )}

      {/* Tarifas */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="w-[24%] px-5 py-2.5 t-etiqueta">Banco</th>
              <th className="w-[130px] px-2 py-2.5 t-etiqueta">Comisión</th>
              <th className="w-[140px] px-2 py-2.5 t-etiqueta">
                <Pista texto="Se cobra este monto como mínimo cuando la operación es menor al monto de la columna siguiente. Déjalo vacío si no aplica.">
                  <span className="cursor-help underline decoration-dotted underline-offset-4">
                    Mínimo
                  </span>
                </Pista>
              </th>
              <th className="w-[160px] px-2 py-2.5 t-etiqueta">
                Si opera menos de
              </th>
              <th className="px-5 py-2.5 t-etiqueta">Ejemplo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {BANCOS_TARJETA.map((banco) => {
              const f = filas[banco];
              const err = errores[banco];
              const cambiada = filaCambiada(f, original[banco]);
              const mostrar = (k) =>
                cambiada || !vacio(f.porcentaje) ? err[k] : null;
              const ej = ejemplo(f);
              const msg =
                mostrar("porcentaje") || mostrar("minimo") || mostrar("limite");
              return (
                <tr
                  key={banco}
                  className={cn("align-top", cambiada && "bg-marca-50/60")}
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <SiglaBanco banco={banco} conNombre />
                      {cambiada && (
                        <span
                          className="h-2 w-2 rounded-full bg-marca-500"
                          title="Cambio sin guardar"
                        />
                      )}
                    </div>
                  </td>
                  <td className="w-[120px] px-2 py-2.5">
                    <Numero
                      id={`${cupon.id}-${banco}-pct`}
                      etiqueta={`Comisión de ${nombreBanco(banco)} en ${cupon.nombre}`}
                      valor={f.porcentaje}
                      onCambio={(v) => editar(banco, "porcentaje", v)}
                      error={mostrar("porcentaje")}
                      sufijo="%"
                      placeholder="—"
                    />
                  </td>
                  <td className="w-[130px] px-2 py-2.5">
                    <Numero
                      id={`${cupon.id}-${banco}-min`}
                      etiqueta={`Mínimo de ${nombreBanco(banco)}`}
                      valor={f.minimo}
                      onCambio={(v) => editar(banco, "minimo", v)}
                      error={mostrar("minimo")}
                      prefijo="S/"
                      placeholder="Sin mín."
                    />
                  </td>
                  <td className="w-[150px] px-2 py-2.5">
                    <Numero
                      id={`${cupon.id}-${banco}-lim`}
                      etiqueta={`Monto límite de ${nombreBanco(banco)}`}
                      valor={f.limite}
                      onCambio={(v) => editar(banco, "limite", v)}
                      error={mostrar("limite")}
                      prefijo="S/"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-5 py-2.5">
                    {msg ? (
                      <span className="text-chico font-semibold text-red-600">
                        {msg}
                      </span>
                    ) : ej ? (
                      <span className="text-chico text-muted-foreground">
                        Opera{" "}
                        <span className="cifras font-semibold text-foreground">
                          {soles(ej.monto)}
                        </span>{" "}
                        → paga{" "}
                        <span className="cifras font-semibold text-foreground">
                          {soles(Math.round(ej.cobra * 100) / 100)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-chico text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pie: guardar */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-5 py-3">
        <p className="text-chico text-muted-foreground">
          {conError.length
            ? `Corrige ${conError.length === 1 ? "la fila marcada" : `las ${conError.length} filas marcadas`} para guardar.`
            : cambios.length
              ? `${cambios.length} cambio${cambios.length === 1 ? "" : "s"} sin guardar. Aplica${cambios.length === 1 ? "" : "n"} a ${cupon.clientes} cliente${cupon.clientes === 1 ? "" : "s"}, salvo sus especiales.`
              : "Edita los valores y guarda. El mínimo y el monto van juntos: completa los dos o deja los dos vacíos."}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {guardado && (
            <span className="flex items-center gap-1 text-chico font-semibold text-emerald-700">
              <Check className="h-4 w-4" /> Guardado
            </span>
          )}
          {cambios.length > 0 && (
            <BotonAccion
              tono="neutro"
              tamano="chico"
              onClick={() => setFilas(original)}
              disabled={guardando}
            >
              Descartar
            </BotonAccion>
          )}
          <BotonAccion
            tamano="chico"
            onClick={guardar}
            cargando={guardando}
            disabled={!cambios.length || conError.length > 0}
          >
            Guardar cambios
          </BotonAccion>
        </div>
      </footer>
    </section>
  );
}
