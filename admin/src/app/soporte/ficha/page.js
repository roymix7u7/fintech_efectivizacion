"use client";

import { useCallback, useEffect, useState } from "react";
import { getSession, login } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { nombreBanco } from "@/lib/bancos";
import { cn } from "@/lib/utils";
import { Estado, Dato, Aviso, Vacio } from "@/components/marca";
import { Panel, Copiar } from "@/components/piezas";

/**
 * Ficha del cliente dentro de Chatwoot.
 *
 * Chatwoot la abre como pestaña junto a cada conversación (una
 * "Dashboard App") y le pasa por postMessage el contacto que se está
 * atendiendo. Con eso la ficha busca al cliente en Supabase con la
 * sesión del asesor en el panel: los datos salen de la base, no de lo
 * que diga el navegador del cliente.
 *
 * El contacto llega identificado por su id de cuenta cuando escribió
 * desde la web o el app (firmado con HMAC: es él). Si solo trae
 * teléfono (WhatsApp, más adelante), se busca por teléfono y se avisa
 * que hay que confirmar la identidad antes de dar datos.
 *
 * Para probarla fuera de Chatwoot: /soporte/ficha?usuario=<id de cuenta>
 */

// Quién puede leer fichas: las políticas de la base abren los datos de
// clientes solo a estos roles (es_staff).
const ROLES_FICHA = ["admin", "supervisor", "gestor"];

const ORIGEN_CHATWOOT = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CHATWOOT_URL).origin;
  } catch {
    return null;
  }
})();

const fecha = (f, conHora = false) =>
  f
    ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleString("es-PE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(conHora && { hour: "numeric", minute: "2-digit" }),
      })
    : "";

const ultimos4 = (n) => (n ? `•••• ${String(n).slice(-4)}` : "");

/** Celular guardado de cualquier forma → los 9 dígitos. */
const nueveDigitos = (t) => {
  const d = String(t || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};

export default function FichaCliente() {
  const [sesion, setSesion] = useState(undefined); // undefined = comprobando
  const [contacto, setContacto] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // ── El contacto que se está atendiendo ──
  useEffect(() => {
    const prueba = new URLSearchParams(window.location.search).get("usuario");
    if (prueba) setContacto({ identifier: prueba, custom_attributes: {} });

    const alRecibir = (e) => {
      if (ORIGEN_CHATWOOT && e.origin !== ORIGEN_CHATWOOT) return;
      let msg = e.data;
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg);
        } catch {
          return;
        }
      }
      if (msg?.event === "appContext") setContacto(msg.data?.contact || null);
    };
    window.addEventListener("message", alRecibir);
    // Chatwoot manda el contexto al cargar; esto lo pide por si llegamos tarde.
    window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    return () => window.removeEventListener("message", alRecibir);
  }, []);

  useEffect(() => {
    getSession().then(setSesion);
  }, []);

  const cargar = useCallback(async () => {
    if (!contacto) return;
    setCargando(true);
    setError("");
    try {
      setFicha(await leerFicha(contacto));
    } catch (e) {
      setError(explicarError(e, "No se pudo leer la ficha del cliente."));
    } finally {
      setCargando(false);
    }
  }, [contacto]);

  const puedeVer = sesion && ROLES_FICHA.includes(sesion.rol);
  useEffect(() => {
    if (puedeVer) cargar();
  }, [puedeVer, cargar]);

  let contenido;
  if (sesion === undefined) contenido = <Esqueleto />;
  else if (!sesion) contenido = <Ingresar onListo={setSesion} />;
  else if (!puedeVer)
    contenido = (
      <Aviso tono="info" titulo="Tu rol no ve fichas de clientes">
        Las fichas son para administradores, supervisores y gestores.
      </Aviso>
    );
  else if (!contacto)
    contenido = (
      <Vacio
        titulo="Esperando la conversación"
        detalle="Abre esta pestaña desde una conversación de Chatwoot para ver los datos del cliente."
      />
    );
  else if (error)
    contenido = (
      <Aviso
        titulo="No se pudo cargar"
        accion={
          <button onClick={cargar} className="font-semibold underline">
            Reintentar
          </button>
        }
      >
        {error}
      </Aviso>
    );
  else if (cargando && !ficha) contenido = <Esqueleto />;
  else if (ficha && !ficha.perfil)
    contenido = (
      <Vacio
        titulo="Sin cuenta vinculada"
        detalle={
          contacto.phone_number
            ? `No hay ningún cliente con el celular ${contacto.phone_number}. Pídele su DNI y búscalo en el panel.`
            : "Este contacto no escribió desde una cuenta de AlToque. Pídele su DNI y búscalo en el panel."
        }
      />
    );
  else if (ficha) contenido = <Ficha ficha={ficha} contacto={contacto} onRecargar={cargar} cargando={cargando} />;

  return <main className="min-h-screen bg-background px-4 py-4 text-foreground">{contenido}</main>;
}

/** Todo lo que el asesor necesita saber del cliente, en una sola lectura. */
async function leerFicha(contacto) {
  const columnas =
    "id, user_id, nombres, apellidos, tipo_documento, dni, telefono, created_at, validado_por, " +
    "fecha_validacion, motivo_observacion, motivo_bloqueo, tasa_comision, cupon_desde, cupon_hasta, origen";

  let perfil = null;
  let porTelefono = false;
  if (contacto.identifier) {
    const { data, error } = await supabase
      .from("perfiles_cliente")
      .select(columnas)
      .eq("user_id", contacto.identifier)
      .maybeSingle();
    if (error) throw error;
    perfil = data;
  }
  const cel = nueveDigitos(contacto.phone_number);
  if (!perfil && cel) {
    const { data, error } = await supabase
      .from("perfiles_cliente")
      .select(columnas)
      .or(`telefono.eq.${cel},telefono.eq.+51${cel},telefono.eq.51${cel}`)
      .limit(2);
    if (error) throw error;
    // Dos cuentas con el mismo celular: no se adivina cuál es.
    if (data?.length === 1) {
      perfil = data[0];
      porTelefono = true;
    }
  }
  if (!perfil) return { perfil: null };

  const [cuenta, solicitudes, tarjetas, cuentas, seguimientos, reclamos] = await Promise.all([
    supabase.from("users").select("email, estado, created_at").eq("id", perfil.user_id).maybeSingle(),
    supabase
      .from("solicitudes")
      .select(
        "id, codigo, banco, estado, motivo_rechazo, created_at, modalidad, fecha_deposito, deposito_banco, deposito_tipo, deposito_ultimos4, pagado_en",
      )
      .eq("cliente_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("tarjetas")
      .select("id, banco, ultimos_4, estado, activa, motivo_rechazo")
      .eq("cliente_id", perfil.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("cuentas_bancarias")
      .select("id, banco, tipo, numero_cuenta, activa")
      .eq("cliente_id", perfil.id)
      .order("created_at", { ascending: false }),
    // La tabla de gestiones está cerrada a propósito (migración 066): se
    // lee por la misma función que usa la ficha de Clientes en el panel.
    supabase.rpc("ficha_cliente", { p_cliente: perfil.id }),
    supabase
      .from("reclamaciones")
      .select("id, codigo, tipo, estado, creado_en, vence_en, respondido_en")
      .eq("user_id", perfil.user_id)
      .order("creado_en", { ascending: false })
      .limit(5),
  ]);
  const fallo = [cuenta, solicitudes, tarjetas, cuentas, seguimientos, reclamos].find((r) => r.error);
  if (fallo) throw fallo.error;

  return {
    perfil,
    porTelefono,
    cuenta: cuenta.data,
    solicitudes: solicitudes.data || [],
    tarjetas: tarjetas.data || [],
    cuentas: cuentas.data || [],
    seguimientos: (seguimientos.data?.seguimientos || []).filter((g) => g.canal !== "recordatorio").slice(0, 3),
    reclamos: reclamos.data || [],
  };
}

function Ficha({ ficha, contacto, onRecargar, cargando }) {
  const { perfil, cuenta, solicitudes, tarjetas, cuentas, seguimientos, reclamos, porTelefono } = ficha;
  const nombre = `${perfil.nombres || ""} ${perfil.apellidos || ""}`.trim();
  const estado = cuenta?.estado;
  const hoy = new Date().toISOString().slice(0, 10);
  const cuponVigente = perfil.tasa_comision != null && perfil.cupon_hasta && perfil.cupon_hasta.slice(0, 10) >= hoy;

  const cuenta_ = (k) => solicitudes.filter((s) => s.estado === k).length;
  const enCurso = solicitudes.filter((s) => s.estado === "pendiente" || s.estado === "aprobado");
  const reclamosAbiertos = reclamos.filter((r) => !r.respondido_en);
  const pantalla = contacto?.custom_attributes?.pantalla;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* ── Quién es ── */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-panel">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marca-900 font-heading text-md font-semibold text-oro-500">
            {(perfil.nombres?.[0] || "") + (perfil.apellidos?.[0] || "")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-lg font-semibold leading-tight">{nombre || "Sin nombre"}</h1>
              <Estado valor={estado} etiqueta={estado === "pendiente" ? "En revisión" : undefined} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {perfil.tipo_documento || "DNI"} {perfil.dni}
              {perfil.origen === "presencial" && " · Registrado en local"}
            </p>
          </div>
          <button
            onClick={onRecargar}
            disabled={cargando}
            title="Actualizar"
            aria-label="Actualizar la ficha"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className={cn("h-4 w-4", cargando && "animate-spin")} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
            </svg>
          </button>
        </div>

        <p
          className={cn(
            "mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            porTelefono ? "bg-oro-50 text-oro-700" : "bg-emerald-50 text-emerald-700",
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
            {porTelefono ? <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /> : <path d="M20 6 9 17l-5-5" />}
          </svg>
          {porTelefono
            ? "Encontrado por su celular. Confirma su DNI antes de darle datos de su cuenta."
            : "Escribe desde su cuenta: su identidad está confirmada."}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dato etiqueta="DNI" accion={perfil.dni && <Copiar texto={perfil.dni} soloIcono />}>
            <span className="cifras">{perfil.dni}</span>
          </Dato>
          <Dato etiqueta="Celular">{perfil.telefono}</Dato>
          <Dato etiqueta="Correo">{cuenta?.email}</Dato>
          <Dato etiqueta="Cliente desde">{fecha(perfil.created_at)}</Dato>
          <Dato etiqueta="Verificado el">{perfil.fecha_validacion ? fecha(perfil.fecha_validacion) : null}</Dato>
          <Dato etiqueta="Comisión especial">
            {cuponVigente ? `${Number(perfil.tasa_comision).toLocaleString("es-PE")} % hasta ${fecha(perfil.cupon_hasta)}` : null}
          </Dato>
        </dl>
      </section>

      {/* ── Lo que hay que saber antes de responder ── */}
      {estado === "bloqueado" && (
        <Aviso titulo="Cuenta bloqueada">{perfil.motivo_bloqueo || "Sin motivo registrado."}</Aviso>
      )}
      {estado === "observado" && (
        <Aviso tono="espera" titulo="Cuenta observada: debe corregir sus datos">
          {perfil.motivo_observacion || "Sin motivo registrado."}
        </Aviso>
      )}
      {estado === "pendiente" && (
        <Aviso tono="info" titulo="Cuenta en revisión">
          Todavía no puede operar. Se le avisa en la app apenas se apruebe.
        </Aviso>
      )}
      {reclamosAbiertos.length > 0 && (
        <Aviso titulo={`${reclamosAbiertos.length === 1 ? "Tiene un reclamo" : `Tiene ${reclamosAbiertos.length} reclamos`} sin responder`}>
          {reclamosAbiertos.map((r) => `${r.codigo}${r.vence_en ? ` (vence ${fecha(r.vence_en)})` : ""}`).join(" · ")}
        </Aviso>
      )}

      {/* ── Solicitudes ── */}
      <Panel
        titulo="Solicitudes"
        cuerpo="p-0"
        acciones={
          <span className="text-xs text-muted-foreground">
            {solicitudes.length} en total · {cuenta_("pagado")} {cuenta_("pagado") === 1 ? "pagada" : "pagadas"}
            {cuenta_("rechazado") > 0 &&
              ` · ${cuenta_("rechazado")} ${cuenta_("rechazado") === 1 ? "rechazada" : "rechazadas"}`}
          </span>
        }
      >
        {solicitudes.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Todavía no hizo ninguna solicitud.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...enCurso, ...solicitudes.filter((s) => !enCurso.includes(s))].slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cifras font-mono text-sm font-semibold">{s.codigo}</span>
                    <Estado valor={s.estado} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tarjeta {nombreBanco(s.banco)} · enviada el {fecha(s.created_at, true)}
                  </p>
                  {s.estado === "rechazado" && s.motivo_rechazo && (
                    <p className="mt-1 text-xs text-red-700">Motivo: {s.motivo_rechazo}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {s.estado === "pagado" && s.pagado_en ? (
                    <>
                      <span className="block font-semibold text-foreground">Pagada</span>
                      {fecha(s.pagado_en, true)}
                    </>
                  ) : s.fecha_deposito ? (
                    <>
                      <span className="block font-semibold text-foreground">Depósito {fecha(s.fecha_deposito)}</span>
                      {s.modalidad === "siguiente" ? "Al día siguiente" : "Para hoy"}
                    </>
                  ) : null}
                  {s.deposito_banco && (
                    <span className="block">
                      {nombreBanco(s.deposito_banco)} {ultimos4(s.deposito_ultimos4)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── Tarjetas y cuentas ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel titulo="Tarjetas" cuerpo="p-0">
          {tarjetas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Sin tarjetas registradas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tarjetas.map((t) => (
                <li key={t.id} className={cn("flex items-center justify-between gap-2 px-4 py-2.5", !t.activa && "opacity-60")}>
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {nombreBanco(t.banco)} <span className="cifras font-mono font-normal text-muted-foreground">{ultimos4(t.ultimos_4)}</span>
                  </span>
                  {t.activa ? <Estado valor={t.estado} /> : <Estado valor="bloqueado" etiqueta="De baja" />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel titulo="Cuentas para depósito" cuerpo="p-0">
          {cuentas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Sin cuentas registradas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {cuentas.map((c) => (
                <li key={c.id} className={cn("flex items-center justify-between gap-2 px-4 py-2.5", !c.activa && "opacity-60")}>
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {nombreBanco(c.banco)} <span className="cifras font-mono font-normal text-muted-foreground">{ultimos4(c.numero_cuenta)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.tipo === "interbancaria" ? "CCI" : "Ahorros"}
                    {!c.activa && " · de baja"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Lo último que hizo el equipo con él ── */}
      {seguimientos.length > 0 && (
        <Panel titulo="Últimas gestiones del equipo" cuerpo="p-0">
          <ul className="divide-y divide-border">
            {seguimientos.map((g) => (
              <li key={g.en} className="px-4 py-2.5 text-sm">
                <span className="font-semibold">{g.canal === "whatsapp" ? "WhatsApp" : "Llamada"}</span>
                {g.resultado && <span className="text-muted-foreground"> · {g.resultado}</span>}
                <span className="float-right text-xs text-muted-foreground">{fecha(g.en)}</span>
                {(g.nota || g.por) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.nota}
                    {g.por && <span className="block">Por {g.por.split("@")[0]}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs text-muted-foreground">
        <span>{pantalla ? `Está en: ${pantalla}` : ""}</span>
        <a
          href={`/clientes?buscar=${encodeURIComponent(perfil.dni || "")}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 rounded-lg bg-marca-900 px-3 py-1.5 font-semibold text-white hover:bg-marca-700"
        >
          Abrir en el panel
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </footer>
    </div>
  );
}

/** Si el navegador no tiene la sesión del panel, se ingresa aquí mismo. */
function Ingresar({ onListo }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      onListo(await login(correo, clave));
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mx-auto max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 shadow-panel">
      <div>
        <h1 className="font-heading text-md font-semibold">Ingresa con tu cuenta del panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Para ver la ficha del cliente que estás atendiendo.</p>
      </div>
      <label className="block text-sm font-semibold" htmlFor="ficha-correo">
        Correo
        <input
          id="ficha-correo"
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold" htmlFor="ficha-clave">
        Contraseña
        <input
          id="ficha-clave"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-normal"
        />
      </label>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-marca-900 px-3 py-2 font-semibold text-white hover:bg-marca-700 disabled:opacity-60"
      >
        {enviando ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-3" aria-label="Cargando">
      <div className="h-40 rounded-xl bg-muted" />
      <div className="h-48 rounded-xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-xl bg-muted" />
        <div className="h-28 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
