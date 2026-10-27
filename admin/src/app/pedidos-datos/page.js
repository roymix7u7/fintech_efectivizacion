"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { cn } from "@/lib/utils";
import Shell, { Escudo, Reloj, Basura } from "@/components/shell";
import { Aviso, Vacio } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Barra, Leyenda, Motivo, Dialogo, Avatar, Campo, IconoAlerta, IconoCheck } from "@/components/piezas";
import Pista from "@/components/pista";

/**
 * Pedidos de los clientes sobre sus datos (migración 54). Hoy: eliminar
 * la cuenta.
 *
 * Tienen plazo legal de respuesta (10 días hábiles): por eso cada pedido
 * muestra cuánto falta y se pinta en rojo al vencer. Qué se borra y qué
 * se conserva depende de si el cliente operó (política de privacidad
 * 1.0); lo decide la función eliminar-cuenta.
 */
const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "bg-oro-100 text-oro-700" },
  en_proceso: { texto: "En proceso", clase: "bg-marca-100 text-marca-700" },
  completada: { texto: "Eliminada", clase: "bg-emerald-50 text-emerald-700" },
  rechazada: { texto: "Rechazada", clase: "bg-red-50 text-red-700" },
  cancelada: { texto: "Cancelada por el cliente", clase: "bg-muted text-muted-foreground" },
};

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "");

function plazo(vence) {
  const dias = Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`, clase: "bg-red-50 text-red-700", urgente: true };
  if (dias === 0) return { texto: "Vence hoy", clase: "bg-red-50 text-red-700", urgente: true };
  if (dias <= 2) return { texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, clase: "bg-oro-100 text-oro-700", urgente: true };
  return { texto: `Vence el ${fecha(vence)}`, clase: "bg-muted text-muted-foreground" };
}

const perfilDe = (p) => (Array.isArray(p.cliente?.perfiles_cliente) ? p.cliente.perfiles_cliente[0] : p.cliente?.perfiles_cliente);

export default function PedidosDatosPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [pedidos, setPedidos] = useState([]);
  const [enCurso, setEnCurso] = useState({});
  const [filtro, setFiltro] = useState("abiertas");
  const [abiertas, setAbiertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rechazando, setRechazando] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [eliminando, setEliminando] = useState(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [resultado, setResultado] = useState(null);
  const [accion, setAccion] = useState(null);
  const router = useRouter();

  const esAdmin = session?.rol === "admin";

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
    });
  }, [router]);

  useEffect(() => {
    if (session) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filtro]);

  async function cargar() {
    setLoading(true);
    setError("");
    const estados = filtro === "abiertas" ? ["pendiente", "en_proceso"] : ["completada", "rechazada", "cancelada"];
    const { data, error: e } = await supabase
      .from("solicitudes_datos")
      .select(
        `id, user_id, tipo, estado, motivo, respuesta, creada_en, vence_en, atendida_en,
         cliente:users!solicitudes_datos_user_id_fkey (
           email,
           perfiles_cliente!perfiles_cliente_user_id_fkey (id, nombres, apellidos)
         )`,
      )
      .in("estado", estados)
      .order(filtro === "abiertas" ? "vence_en" : "creada_en", { ascending: filtro === "abiertas" });
    if (e) {
      setError(explicarError(e));
      setLoading(false);
      return;
    }
    setPedidos(data || []);
    if (filtro === "abiertas") setAbiertas((data || []).length);

    // Solicitudes de dinero en curso: no se elimina a nadie con un pago pendiente.
    const ids = (data || []).map((p) => perfilDe(p)?.id).filter(Boolean);
    if (ids.length && filtro === "abiertas") {
      const { data: abiertasDinero } = await supabase
        .from("solicitudes")
        .select("cliente_id")
        .in("cliente_id", ids)
        .in("estado", ["pendiente", "aprobado"]);
      const cuenta = {};
      for (const s of abiertasDinero || []) cuenta[s.cliente_id] = (cuenta[s.cliente_id] || 0) + 1;
      setEnCurso(cuenta);
    } else setEnCurso({});
    setLoading(false);
  }

  async function atender(p, estado, texto = null) {
    setAccion(p.id);
    setError("");
    const { data, error: e } = await supabase.rpc("atender_solicitud_datos", {
      p_id: p.id,
      p_estado: estado,
      p_respuesta: texto,
    });
    setAccion(null);
    if (e) return setError(explicarError(e));
    if (data?.ok === false) setError("Ese pedido ya estaba cerrado.");
    setRechazando(null);
    setRespuesta("");
    cargar();
  }

  async function eliminar(p) {
    setAccion(p.id);
    setError("");
    const { data, error: e } = await supabase.functions.invoke("eliminar-cuenta", { body: { solicitud_id: p.id } });
    setAccion(null);
    if (e) {
      // La función devuelve el motivo en el cuerpo (p. ej. solicitudes en curso).
      let detalle = e.message;
      try {
        detalle = (await e.context?.json())?.error || detalle;
      } catch {}
      setEliminando(null);
      return setError(detalle);
    }
    setEliminando(null);
    setConfirmacion("");
    setResultado(data || {});
    cargar();
  }

  if (!session) return <CargaPantalla />;

  const perfilEliminando = eliminando ? perfilDe(eliminando) : null;

  return (
    <Shell
      session={session}
      titulo="Pedidos de datos"
      descripcion="Clientes que pidieron eliminar su cuenta"
      ayuda="Hay 10 días hábiles para atender cada pedido. Si el cliente ya operó, sus fotos se conservan bloqueadas 5 años y su identidad 10, y se borran solas al vencer. Si nunca operó, se borra todo."
      contadores={abiertas != null ? { pedidosDatos: abiertas } : {}}
    >
      {error && (
        <Aviso className="mb-4" titulo="No se pudo completar" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      {!esAdmin && (
        <Aviso className="mb-4" tono="info">
          Como supervisor puedes ver los pedidos. Atenderlos y eliminar cuentas es del administrador.
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={setFiltro}
          opciones={[
            { clave: "abiertas", etiqueta: "Por atender", cuenta: abiertas, urgente: true },
            { clave: "cerradas", etiqueta: "Cerrados" },
          ]}
        />
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={3} alto="h-[88px]" />
      ) : pedidos.length === 0 ? (
        <Vacio icono={<Escudo />} titulo={filtro === "abiertas" ? "No hay pedidos por atender" : "Todavía no hay pedidos cerrados"} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
            <ul className="divide-y divide-border">
              {pedidos.map((p) => {
                const perfil = perfilDe(p);
                const dinero = perfil ? enCurso[perfil.id] || 0 : 0;
                const e = ESTADOS[p.estado];
                const abierta = ["pendiente", "en_proceso"].includes(p.estado);
                const pl = plazo(p.vence_en);
                const nombre = perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Sin perfil";
                return (
                  <li key={p.id} className={cn("flex flex-wrap items-start gap-4 px-4 py-3.5", abierta && pl.urgente && "border-l-4 border-l-red-500")}>
                    <Avatar texto={nombre} />
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-md font-bold">{nombre}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", e?.clase)}>{e?.texto}</span>
                        {abierta && (
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", pl.clase)}>
                            {pl.urgente && <Reloj className="h-3 w-3" />}
                            {pl.texto}
                          </span>
                        )}
                      </div>
                      <p className="text-chico text-muted-foreground">
                        {p.cliente?.email} · pedido el {fecha(p.creada_en)}
                        {!abierta && p.atendida_en && ` · cerrado el ${fecha(p.atendida_en)}`}
                      </p>
                      {p.motivo && (
                        <p className="mt-1.5 text-sm">
                          <span className="font-semibold text-muted-foreground">Motivo del cliente: </span>
                          {p.motivo}
                        </p>
                      )}
                      {p.respuesta && (
                        <p className="mt-1 text-sm">
                          <span className="font-semibold text-muted-foreground">Respuesta: </span>
                          {p.respuesta}
                        </p>
                      )}
                      {abierta && dinero > 0 && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-oro-50 px-2.5 py-1 text-chico font-semibold text-oro-700">
                          <IconoAlerta className="h-3.5 w-3.5" />
                          Tiene {dinero} solicitud{dinero === 1 ? "" : "es"} de dinero en curso: hay que terminarla{dinero === 1 ? "" : "s"} y pagarle antes.
                        </p>
                      )}
                    </div>

                    {abierta && esAdmin && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {p.estado === "pendiente" && (
                          <Pista texto="Márcalo como en proceso para que el equipo sepa que lo estás atendiendo.">
                            <BotonAccion tono="neutro" tamano="chico" cargando={accion === p.id && !eliminando} onClick={() => atender(p, "en_proceso")}>
                              Tomar
                            </BotonAccion>
                          </Pista>
                        )}
                        <BotonAccion
                          tono="neutro"
                          tamano="chico"
                          onClick={() => {
                            setRechazando(p);
                            setRespuesta("");
                          }}
                        >
                          Rechazar
                        </BotonAccion>
                        <Pista texto={dinero > 0 ? "Primero hay que terminar sus solicitudes en curso." : null}>
                          <BotonAccion
                            tono="peligro"
                            tamano="chico"
                            disabled={dinero > 0}
                            icono={<Basura className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setEliminando(p);
                              setConfirmacion("");
                            }}
                          >
                            Eliminar cuenta
                          </BotonAccion>
                        </Pista>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {filtro === "abiertas" && (
            <Leyenda
              className="mt-3"
              titulo="Plazo"
              items={[
                { texto: "Vence en 2 días o menos", color: "bg-red-500", pista: "El plazo legal es de 10 días hábiles desde el pedido." },
                { texto: "Pendiente", marca: <span className="rounded-full bg-oro-100 px-1.5 text-xs font-bold text-oro-700">P</span>, pista: "Nadie lo ha tomado todavía." },
                { texto: "En proceso", marca: <span className="rounded-full bg-marca-100 px-1.5 text-xs font-bold text-marca-700">E</span>, pista: "Alguien del equipo lo está atendiendo." },
              ]}
            />
          )}
        </>
      )}

      {/* Rechazar */}
      <Dialogo
        abierto={Boolean(rechazando)}
        onCerrar={() => setRechazando(null)}
        bloqueado={accion === rechazando?.id}
        titulo="Rechazar el pedido"
        descripcion="El cliente ve la respuesta en sus avisos de la app. Explica por qué y qué puede hacer."
        tono="atencion"
        icono={<IconoAlerta />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setRechazando(null)}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              cargando={accion === rechazando?.id}
              disabled={respuesta.trim().length < 10}
              onClick={() => atender(rechazando, "rechazada", respuesta.trim())}
            >
              Enviar respuesta y rechazar
            </BotonAccion>
          </>
        }
      >
        <Motivo
          id="respuestaRechazo"
          etiqueta="Respuesta para el cliente"
          valor={respuesta}
          onCambio={setRespuesta}
          minimo={10}
          sugerencias={["Tienes una solicitud pendiente de pago. Te pagaremos y luego eliminaremos tu cuenta."]}
          placeholder="Ej: Tienes una solicitud pendiente de pago. Te pagaremos y luego eliminaremos tu cuenta."
        />
      </Dialogo>

      {/* Eliminar */}
      <Dialogo
        abierto={Boolean(eliminando)}
        onCerrar={() => setEliminando(null)}
        bloqueado={accion === eliminando?.id}
        titulo={`¿Eliminar la cuenta de ${perfilEliminando ? perfilEliminando.nombres : "este cliente"}?`}
        descripcion="Esto no se puede deshacer."
        tono="peligro"
        icono={<Basura className="h-5 w-5" />}
        ancho="max-w-lg"
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setEliminando(null)} disabled={accion === eliminando?.id}>
              Cancelar
            </BotonAccion>
            <BotonAccion tono="peligro" cargando={accion === eliminando?.id} disabled={confirmacion !== "ELIMINAR"} onClick={() => eliminar(eliminando)}>
              Eliminar definitivamente
            </BotonAccion>
          </>
        }
      >
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            Pierde el acceso a la app y se borran su celular, dirección y correo.
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-oro-500" />
            Si ya operó: sus fotos se conservan bloqueadas 5 años y su nombre, documento y operaciones 10 años desde su última operación. Solo los ve la
            administración y se borran solos al vencer.
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-300" />
            Si nunca operó: se borran sus fotos y sus datos.
          </li>
        </ul>
        <Campo
          className="mt-4"
          etiqueta={
            <>
              Escribe <span className="font-mono font-bold text-red-700">ELIMINAR</span> para confirmar
            </>
          }
          htmlFor="confirmacion"
        >
          <input
            id="confirmacion"
            autoComplete="off"
            value={confirmacion}
            onChange={(ev) => setConfirmacion(ev.target.value.toUpperCase())}
            className="campo font-mono"
          />
        </Campo>
      </Dialogo>

      {/* Resultado */}
      <Dialogo
        abierto={Boolean(resultado)}
        onCerrar={() => setResultado(null)}
        titulo="Cuenta eliminada"
        descripcion={
          resultado?.opero
            ? `Como había operado, se conservaron ${resultado?.fotos_conservadas ?? 0} foto(s) y su identidad, bloqueadas, hasta que venza cada plazo. Se borran solas.`
            : `Nunca había operado: se borraron ${resultado?.fotos_borradas ?? 0} foto(s) y sus datos.`
        }
        tono="exito"
        icono={<IconoCheck />}
        pie={<BotonAccion onClick={() => setResultado(null)}>Entendido</BotonAccion>}
      />
    </Shell>
  );
}
