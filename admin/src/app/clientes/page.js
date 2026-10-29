"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { urlsFirmadas, extraerPath } from "@/lib/storage";
import { BANCOS_TARJETA, nombreBanco } from "@/lib/bancos";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Persona, Porcentaje, Ojo } from "@/components/shell";
import { Vacio, Aviso, Dato } from "@/components/marca";
import {
  EsqueletoFilas,
  BotonAccion,
  CargaPantalla,
  Rueda,
} from "@/components/carga";
import {
  Segmentos,
  Buscador,
  Barra,
  Campo,
  Dialogo,
  Tostada,
  Copiar,
} from "@/components/piezas";
import {
  pct,
  aNumero,
  SiglaBanco,
  VigenciaCupon,
  textoDuracion,
  fechaCorta,
  fallaPorcentaje,
} from "@/components/cupones";

/**
 * Clientes registrados. No se carga la lista completa: se muestran los
 * 10 últimos y, al buscar (nombre, apellido, DNI o fecha de registro),
 * hasta 20 resultados. La búsqueda y el límite los aplica la base
 * (buscar_clientes), así que el navegador nunca recibe a todos.
 *
 * La ven administrador, supervisor y pagos. El administrador asigna o
 * renueva cupones; administrador y supervisor dan comisiones especiales.
 * Las fotos de identidad se cargan solo al pedirlas y queda registrado
 * quién las vio.
 */
const ROLES = ["admin", "supervisor", "pagos"];
const ESTADOS = {
  activo: { t: "Activo", c: "bg-emerald-50 text-emerald-700" },
  pendiente: { t: "En revisión", c: "bg-marca-50 text-marca-700" },
  observado: { t: "Observado", c: "bg-oro-50 text-oro-700" },
  bloqueado: { t: "Bloqueado", c: "bg-red-50 text-red-700" },
};
const FILTROS = [
  { clave: "todos", etiqueta: "Todos" },
  { clave: "cupon", etiqueta: "Con cupón", pista: "Cupón vigente" },
  {
    clave: "por_vencer",
    etiqueta: "Por vencer",
    pista: "Su cupón vence en 30 días o menos",
  },
  {
    clave: "vencido",
    etiqueta: "Cupón vencido",
    pista: "Ya pagan la tarifa estándar",
  },
];
const hoyLima = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

export default function ClientesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [busqueda, setBusqueda] = useState("");
  const termino = useRetraso(busqueda);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [resultado, setResultado] = useState({ total: 0, clientes: [] });
  const [cupones, setCupones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const router = useRouter();

  const buscando =
    termino.trim().length >= 2 ||
    Boolean(desde) ||
    Boolean(hasta) ||
    filtro !== "todos";
  const fechasMal = desde && hasta && desde > hasta;

  const cargar = useCallback(async () => {
    if (fechasMal) return;
    setCargando(true);
    const { data, error: e } = await supabase.rpc("buscar_clientes", {
      p_texto: termino.trim() || null,
      p_desde: desde || null,
      p_hasta: hasta || null,
      p_filtro: filtro,
      p_limite: buscando ? 20 : 10,
    });
    setCargando(false);
    if (e) {
      return setError(
        e.code === "PGRST202"
          ? "Falta aplicar en Supabase las migraciones 20261029000063_cupones_con_vigencia.sql y 20261029000064_buscar_clientes.sql."
          : explicarError(e, "No se pudieron cargar los clientes."),
      );
    }
    setError("");
    setResultado(data || { total: 0, clientes: [] });
  }, [termino, desde, hasta, filtro, buscando, fechasMal]);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!ROLES.includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      // Solo el administrador asigna cupones: necesita la lista.
      if (s.rol === "admin")
        supabase
          .rpc("listar_bloques")
          .then(({ data }) => setCupones(data || []));
    });
  }, [router]);

  useEffect(() => {
    if (session) cargar();
  }, [session, cargar]);

  const clientes = resultado.clientes || [];
  const cliente = clientes.find((c) => c.id === abierto) || null;

  if (!session) return <CargaPantalla />;

  return (
    <Shell
      session={session}
      titulo="Clientes"
      descripcion="Busca un cliente para ver sus datos y su cupón"
      ayuda="Se muestran los 10 últimos registrados. Busca por nombre, apellido o DNI, o por fecha de registro, para encontrar a cualquier otro."
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

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 shadow-panel">
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          pendiente={busqueda !== termino}
          placeholder="Nombre, apellido o DNI"
          className="w-full sm:w-80"
          autoFocus
        />
        <label className="flex flex-col text-chico font-semibold text-muted-foreground">
          Registrado desde
          <input
            type="date"
            value={desde}
            max={hasta || hoyLima()}
            onChange={(e) => setDesde(e.target.value)}
            className="campo mt-1 h-10 w-40 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-chico font-semibold text-muted-foreground">
          hasta
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            max={hoyLima()}
            onChange={(e) => setHasta(e.target.value)}
            className="campo mt-1 h-10 w-40 py-1 text-sm"
          />
        </label>
        {(busqueda || desde || hasta) && (
          <BotonAccion
            tono="neutro"
            tamano="chico"
            onClick={() => {
              setBusqueda("");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar
          </BotonAccion>
        )}
        {fechasMal && (
          <p className="w-full text-chico font-semibold text-red-600">
            La fecha “desde” no puede ser posterior a “hasta”.
          </p>
        )}
      </div>

      <Barra>
        <Segmentos valor={filtro} onCambio={setFiltro} opciones={FILTROS} />
        <p className="cifras text-chico text-muted-foreground">
          {cargando
            ? "Buscando..."
            : buscando
              ? `${resultado.total} resultado${resultado.total === 1 ? "" : "s"}${resultado.total > clientes.length ? ` · se muestran ${clientes.length}, afina la búsqueda` : ""}`
              : `Los ${clientes.length} últimos registrados de ${resultado.total}`}
        </p>
      </Barra>

      {cargando && clientes.length === 0 ? (
        <EsqueletoFilas filas={6} />
      ) : clientes.length === 0 ? (
        <Vacio
          icono={<Persona />}
          titulo="Sin resultados"
          detalle="Prueba con otro nombre, DNI o rango de fechas."
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-border bg-card shadow-panel transition",
            cargando && "opacity-60",
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-2.5 t-etiqueta">Cliente</th>
                  <th className="px-3 py-2.5 t-etiqueta">Celular</th>
                  <th className="px-3 py-2.5 t-etiqueta">Estado</th>
                  <th className="w-[260px] px-3 py-2.5 t-etiqueta">Tarifa</th>
                  <th className="px-3 py-2.5 t-etiqueta">Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientes.map((c) => {
                  const e = ESTADOS[c.usuario?.estado] || {
                    t: c.usuario?.estado || "—",
                    c: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setAbierto(c.id)}
                      className="cursor-pointer hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          className="text-left"
                          onClick={() => setAbierto(c.id)}
                        >
                          <span className="block font-semibold text-foreground">
                            {c.nombres} {c.apellidos}
                          </span>
                          <span className="cifras block text-chico text-muted-foreground">
                            {c.tipo_documento === "ce" ? "CE" : "DNI"} {c.dni}
                          </span>
                        </button>
                      </td>
                      <td className="cifras whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                        {c.telefono || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            e.c,
                          )}
                        >
                          {e.t}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <VigenciaCupon
                          cupon={c.cupon}
                          desde={c.cupon_desde}
                          hasta={c.cupon_hasta}
                          compacto
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                        {fechaCorta(c.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialogo
        abierto={Boolean(cliente)}
        onCerrar={() => setAbierto(null)}
        titulo={cliente ? `${cliente.nombres} ${cliente.apellidos}` : ""}
        descripcion={
          cliente
            ? `${cliente.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI"} ${cliente.dni}`
            : ""
        }
        icono={<Persona className="h-5 w-5" />}
        ancho="max-w-3xl"
      >
        {cliente && (
          <FichaCliente
            key={cliente.id}
            cliente={cliente}
            cupones={cupones}
            rol={session.rol}
            onCambio={(texto) => {
              setOk(texto);
              cargar();
            }}
          />
        )}
      </Dialogo>

      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/* ───────── Ficha del cliente ───────── */

function FichaCliente({ cliente, cupones, rol, onCambio }) {
  const esAdmin = rol === "admin";
  const puedeEspecial = rol === "admin" || rol === "supervisor";
  const cuponActual = cliente.cupon;
  const asignables = cupones.filter((c) => c.activo);
  const [tarjetas, setTarjetas] = useState(null);
  const [cuentas, setCuentas] = useState(null);
  const [especiales, setEspeciales] = useState([]);
  const [fotos, setFotos] = useState(null); // null | "cargando" | { urls, fallos }
  const [asignar, setAsignar] = useState(null); // { cupon, dias }
  const [especial, setEspecial] = useState(null); // { banco, valor, motivo }
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .rpc("ficha_cliente", { p_cliente: cliente.id })
      .then(({ data, error: e }) => {
        if (e)
          setError(
            explicarError(e, "No se pudieron cargar sus tarjetas y cuentas."),
          );
        setTarjetas(data?.tarjetas || []);
        setCuentas(data?.cuentas || []);
        setEspeciales(data?.especiales || []);
      });
  }, [cliente.id]);

  async function verFotos() {
    setFotos("cargando");
    // Queda registrado quién las vio; si no se puede registrar, no se muestran.
    const { error: e } = await supabase.rpc("registrar_vista_fotos", {
      p_cliente: cliente.id,
    });
    if (e && e.code !== "PGRST202") {
      setFotos(null);
      return setError(explicarError(e, "No se pudieron abrir las fotos."));
    }
    const r = await urlsFirmadas(
      "kyc-documentos",
      [
        cliente.foto_dni_frontal,
        cliente.foto_dni_posterior,
        cliente.foto_selfie,
      ].filter(Boolean),
      300,
    );
    setFotos(r);
  }

  // ── Asignar o renovar cupón ──
  const cuponElegido = asignar
    ? cupones.find((c) => c.id === asignar.cupon)
    : null;
  const fallaDias = (() => {
    if (!asignar || !cuponElegido || cuponElegido.es_default) return null;
    const d = aNumero(asignar.dias);
    if (!Number.isInteger(d) || d < 1)
      return "Escribe los días (número entero).";
    if (d > 3650) return "Máximo 3650 días.";
    return null;
  })();

  async function guardarCupon() {
    setTocado(true);
    if (!cuponElegido || fallaDias) return;
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.rpc("asignar_cupon", {
      p_clientes: [cliente.id],
      p_cupon: cuponElegido.id,
      p_dias: cuponElegido.es_default ? null : aNumero(asignar.dias),
    });
    setGuardando(false);
    if (e)
      return setError(
        e.code === "PGRST202"
          ? "Falta aplicar la migración 20261029000063_cupones_con_vigencia.sql en Supabase."
          : explicarError(e, "No se pudo asignar."),
      );
    setAsignar(null);
    onCambio(
      cuponElegido.es_default
        ? `${cliente.nombres} vuelve a la tarifa estándar.`
        : `${cliente.nombres} tiene el cupón "${cuponElegido.nombre}" por ${aNumero(asignar.dias)} días.`,
    );
  }

  // ── Comisión especial ──
  const fallasEsp = especial
    ? {
        valor: fallaPorcentaje(especial.valor),
        motivo:
          especial.motivo.trim().length < 5
            ? "Explica el acuerdo en pocas palabras."
            : null,
      }
    : {};
  async function guardarEspecial() {
    setTocado(true);
    if (fallasEsp.valor || fallasEsp.motivo) return;
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.rpc("fijar_comision_especial", {
      p_cliente: cliente.id,
      p_banco: especial.banco,
      p_porcentaje: aNumero(especial.valor),
      p_motivo: especial.motivo.trim(),
    });
    setGuardando(false);
    if (e) return setError(explicarError(e, "No se pudo guardar la comisión."));
    setEspeciales((l) => [
      ...l.filter((x) => x.banco !== especial.banco),
      {
        banco: especial.banco,
        porcentaje: aNumero(especial.valor),
        motivo: especial.motivo,
      },
    ]);
    onCambio(
      `${cliente.nombres} queda al ${pct(especial.valor)} en ${nombreBanco(especial.banco)}.`,
    );
    setEspecial(null);
  }

  const estado = ESTADOS[cliente.usuario?.estado];

  return (
    <div className="space-y-5 pb-2">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {/* Datos principales */}
      <section className="grid gap-x-6 gap-y-3 rounded-xl border border-border p-4 sm:grid-cols-2">
        <Dato etiqueta="Estado">
          {estado ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                estado.c,
              )}
            >
              {estado.t}
            </span>
          ) : (
            "—"
          )}
        </Dato>
        <Dato
          etiqueta="Correo"
          accion={
            cliente.usuario?.email && (
              <Copiar texto={cliente.usuario.email} soloIcono />
            )
          }
        >
          <span className="break-all">{cliente.usuario?.email || "—"}</span>
        </Dato>
        <Dato
          etiqueta="Celular"
          mono
          accion={
            cliente.telefono && <Copiar texto={cliente.telefono} soloIcono />
          }
        >
          {cliente.telefono || "—"}
        </Dato>
        <Dato
          etiqueta={
            cliente.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI"
          }
          mono
          accion={<Copiar texto={cliente.dni} soloIcono />}
        >
          {cliente.dni}
        </Dato>
        <Dato etiqueta="Dirección" className="sm:col-span-2">
          {cliente.direccion || "—"}
        </Dato>
        <Dato etiqueta="Registrado">{fechaCorta(cliente.created_at)}</Dato>
        <Dato etiqueta="Identidad verificada">
          {cliente.fecha_validacion
            ? fechaCorta(cliente.fecha_validacion)
            : "Todavía no"}
        </Dato>
      </section>

      {/* Cupón */}
      <section className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-heading text-md font-semibold">
            Tarifa y cupón
          </h3>
          {esAdmin && !asignar && (
            <BotonAccion
              tamano="chico"
              onClick={() => {
                const base =
                  cuponActual && !cuponActual.es_default
                    ? cuponActual
                    : asignables.find((c) => !c.es_default) || asignables[0];
                setAsignar({
                  cupon: base?.id || "",
                  dias: String(base?.duracion_dias || 365),
                });
                setTocado(false);
              }}
            >
              {cuponActual && !cuponActual.es_default
                ? "Renovar o cambiar cupón"
                : "Asignar cupón"}
            </BotonAccion>
          )}
        </div>
        <VigenciaCupon
          cupon={cuponActual}
          desde={cliente.cupon_desde}
          hasta={cliente.cupon_hasta}
        />
        {especiales.length > 0 && (
          <p className="mt-3 text-chico text-muted-foreground">
            Especiales que ganan sobre su tarifa:{" "}
            {especiales
              .map((x) => `${nombreBanco(x.banco)} ${pct(x.porcentaje)}`)
              .join(" · ")}
          </p>
        )}

        {asignar && (
          <div className="mt-4 space-y-3 rounded-lg bg-muted/50 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <Campo etiqueta="Cupón" htmlFor="cuponAsignar">
                <select
                  id="cuponAsignar"
                  value={asignar.cupon}
                  onChange={(e) => {
                    const c = cupones.find((x) => x.id === e.target.value);
                    setAsignar({
                      cupon: e.target.value,
                      dias: String(c?.duracion_dias || 365),
                    });
                  }}
                  className="campo"
                >
                  {asignables
                    .filter((c) => !c.es_default)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {textoDuracion(c.duracion_dias)
                          ? ` · ${textoDuracion(c.duracion_dias)}`
                          : ""}
                      </option>
                    ))}
                  {asignables
                    .filter((c) => c.es_default)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Quitar cupón (tarifa estándar)
                      </option>
                    ))}
                </select>
              </Campo>
              {cuponElegido && !cuponElegido.es_default && (
                <Campo
                  etiqueta="Días"
                  htmlFor="diasCupon"
                  error={tocado ? fallaDias : null}
                >
                  <input
                    id="diasCupon"
                    inputMode="numeric"
                    value={asignar.dias}
                    onChange={(e) =>
                      setAsignar({
                        ...asignar,
                        dias: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    className="campo cifras"
                  />
                </Campo>
              )}
            </div>
            {cuponElegido && (
              <p className="text-chico text-muted-foreground">
                {cuponElegido.es_default
                  ? "Pagará la tarifa estándar desde su próxima solicitud."
                  : !fallaDias &&
                    `Desde hoy hasta el ${fechaCorta(new Date(Date.now() + aNumero(asignar.dias) * 86400000))}. Al vencer vuelve a la tarifa estándar.`}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <BotonAccion
                tono="neutro"
                tamano="chico"
                onClick={() => setAsignar(null)}
                disabled={guardando}
              >
                Cancelar
              </BotonAccion>
              <BotonAccion
                tamano="chico"
                onClick={guardarCupon}
                cargando={guardando}
                disabled={!cuponElegido}
              >
                {cuponElegido?.es_default ? "Quitar cupón" : "Guardar cupón"}
              </BotonAccion>
            </div>
          </div>
        )}
      </section>

      {/* Tarjetas y cuentas */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-2 font-heading text-md font-semibold">Tarjetas</h3>
          {tarjetas === null ? (
            <Rueda className="h-4 w-4" />
          ) : tarjetas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tarjetas.</p>
          ) : (
            <ul className="space-y-1.5">
              {tarjetas.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <SiglaBanco banco={t.banco} chica />
                  <span className="cifras flex-1">•••• {t.ultimos_4}</span>
                  <span
                    className={cn(
                      "text-chico font-semibold",
                      t.estado === "aprobado"
                        ? "text-emerald-700"
                        : t.estado === "rechazado"
                          ? "text-red-700"
                          : "text-marca-700",
                    )}
                  >
                    {t.estado === "aprobado"
                      ? "Verificada"
                      : t.estado === "rechazado"
                        ? "Rechazada"
                        : "En revisión"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-2 font-heading text-md font-semibold">Cuentas</h3>
          {cuentas === null ? (
            <Rueda className="h-4 w-4" />
          ) : cuentas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cuentas.</p>
          ) : (
            <ul className="space-y-1.5">
              {cuentas.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <SiglaBanco banco={c.banco} chica />
                  <span className="flex-1">
                    {c.tipo === "interbancaria" ? "CCI" : "Ahorros"}
                  </span>
                  <span className="cifras text-muted-foreground">
                    •••• {c.ultimos_4}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Comisión especial */}
      {puedeEspecial && (
        <section className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 font-heading text-md font-semibold">
              Comisión especial
            </h3>
            {!especial && (
              <BotonAccion
                tono="neutro"
                tamano="chico"
                icono={<Porcentaje className="h-3.5 w-3.5" />}
                onClick={() => {
                  setEspecial({
                    banco: BANCOS_TARJETA[0],
                    valor: "",
                    motivo: "",
                  });
                  setTocado(false);
                }}
              >
                Dar comisión especial
              </BotonAccion>
            )}
          </div>
          {especial && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Campo etiqueta="Banco" htmlFor="bancoEsp">
                  <select
                    id="bancoEsp"
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
                  htmlFor="valorEsp"
                  error={tocado ? fallasEsp.valor : null}
                >
                  <input
                    id="valorEsp"
                    inputMode="decimal"
                    value={especial.valor}
                    onChange={(e) =>
                      setEspecial({ ...especial, valor: e.target.value })
                    }
                    placeholder="Ej: 0.8"
                    className="campo cifras"
                  />
                </Campo>
              </div>
              <Campo
                etiqueta="Motivo"
                htmlFor="motivoEsp"
                ayuda="Queda registrado con tu nombre. No vence."
                error={tocado ? fallasEsp.motivo : null}
              >
                <input
                  id="motivoEsp"
                  maxLength={200}
                  value={especial.motivo}
                  onChange={(e) =>
                    setEspecial({ ...especial, motivo: e.target.value })
                  }
                  placeholder="Ej: cliente de alto volumen"
                  className="campo"
                />
              </Campo>
              <div className="flex justify-end gap-2">
                <BotonAccion
                  tono="neutro"
                  tamano="chico"
                  onClick={() => setEspecial(null)}
                  disabled={guardando}
                >
                  Cancelar
                </BotonAccion>
                <BotonAccion
                  tamano="chico"
                  onClick={guardarEspecial}
                  cargando={guardando}
                >
                  Guardar especial
                </BotonAccion>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Fotos de identidad: solo al pedirlas */}
      <section className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <h3 className="font-heading text-md font-semibold">
              Fotos de identidad
            </h3>
            <p className="text-chico text-muted-foreground">
              Se cargan solo al pedirlas y queda registrado quién las vio.
            </p>
          </div>
          {fotos === null && (
            <BotonAccion
              tono="neutro"
              tamano="chico"
              icono={<Ojo className="h-3.5 w-3.5" />}
              onClick={verFotos}
            >
              Ver fotos
            </BotonAccion>
          )}
        </div>
        {fotos === "cargando" && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Rueda className="h-4 w-4" /> Abriendo fotos...
          </p>
        )}
        {fotos && fotos !== "cargando" && (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["Documento · frente", cliente.foto_dni_frontal],
              ["Documento · reverso", cliente.foto_dni_posterior],
              ["Selfie", cliente.foto_selfie],
            ].map(([titulo, path]) => {
              const url = path
                ? fotos.urls[extraerPath("kyc-documentos", path)]
                : null;
              return (
                <li key={titulo}>
                  <p className="mb-1 text-chico font-semibold text-muted-foreground">
                    {titulo}
                  </p>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="block overflow-hidden rounded-lg bg-marca-950 ring-1 ring-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={titulo}
                        className="h-36 w-full object-contain"
                      />
                    </a>
                  ) : (
                    <p className="flex h-36 items-center justify-center rounded-lg bg-muted text-chico text-muted-foreground">
                      {path ? "No se pudo abrir" : "No subió esta foto"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
