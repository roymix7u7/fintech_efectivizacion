"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { actualizar, registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import Shell, { Personas, Mas, Candado, Basura, Lapiz, Burbuja } from "@/components/shell";
import { ChipBanco } from "@/components/banco";
import { fijarAccesoChat } from "@/components/abrirChat";
import { Vacio, Aviso } from "@/components/marca";
import { EsqueletoFilas, BotonAccion, CargaPantalla } from "@/components/carga";
import { Segmentos, Buscador, Barra, Campo, Dialogo, Tostada, Copiar, Avatar, useConfirmar, IconoCheck } from "@/components/piezas";
import Pista from "@/components/pista";
import { puede, soloLecturaEn } from "@/lib/permisos";
import { BANCOS_TARJETA, nombreBanco } from "@/lib/bancos";
import Desplegable from "@/components/desplegable";
import { ESTADOS } from "@/lib/disponibilidad";

const ROLES = [
  {
    clave: "gestor",
    etiqueta: "Gestor",
    detalle: "Atiende la cola que se le asigna. No ve el trabajo de los demás ni los totales de la empresa.",
  },
  {
    clave: "pagos",
    etiqueta: "Pagos",
    detalle: "Solo entra a Pagos. Marca y confirma envíos de los bancos que se le asignan; ve los de sus compañeros sin poder tocarlos.",
  },
  {
    clave: "supervisor",
    etiqueta: "Supervisor",
    detalle: "Ve todas las colas, verifica tarjetas, bloquea clientes, y crea o bloquea gestores de su sede.",
  },
  {
    clave: "admin",
    etiqueta: "Administrador",
    detalle: "Además configura comisiones, sedes, noticias, guías y textos legales, nombra supervisores y ve la auditoría.",
  },
];
const rolDe = (clave) => ROLES.find((r) => r.clave === clave);
// Color de cada rol: el rol se reconoce sin leerlo.
const ESTILO_ROL = {
  gestor: "bg-marca-50 text-marca-700 ring-marca-200",
  pagos: "bg-oro-50 text-oro-800 ring-oro-300",
  supervisor: "bg-marca-600 text-white ring-marca-600",
  admin: "bg-marca-900 text-white ring-marca-900",
};

const CORREO = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const NUEVO = { email: "", rol: "gestor", sede_id: "" };

export default function EquipoPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [equipo, setEquipo] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [rendimiento, setRendimiento] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [tocado, setTocado] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState("");
  const [credencial, setCredencial] = useState(null);
  // Bancos de cada encargado de pagos: { user_id: ["BCP", ...] }
  const [bancosPago, setBancosPago] = useState({});
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const [sincronizando, setSincronizando] = useState(false);
  // Ventana de rol, sede y bancos (se abre desde el menú ⋯ de cada fila).
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState({ rol: "gestor", sede_id: "" });
  const [errorEdicion, setErrorEdicion] = useState("");
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    // Todo junto: la lista abre en un solo viaje al servidor.
    const [{ data, error: e }, { data: asignados }, { data: sedesData }, { data: rend }, { colas }] = await Promise.all([
      supabase.rpc("listar_equipo"),
      supabase.from("pagos_bancos").select("user_id, banco"),
      supabase.from("sedes").select("id, nombre, activa").order("nombre"),
      supabase.rpc("rendimiento_equipo", { p_dias: 7, p_sede: null }),
      estadoCola(),
    ]);
    if (e) {
      setError(explicarError(e, "No se pudo cargar el equipo."));
      setLoading(false);
      return;
    }
    setEquipo(data || []);
    const mapa = {};
    for (const a of asignados || []) (mapa[a.user_id] ||= []).push(a.banco);
    setBancosPago(mapa);
    setSedes(sedesData || []);
    setRendimiento(rend || []);
    setContadores(contadoresDe(colas));
    setLoading(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["admin", "supervisor"].includes(s.rol)) return router.push("/dashboard");
      setSession(s);
      cargar();
    });
  }, [router, cargar]);

  // El estado de cada uno (en línea, ocupado...) cambia solo: se vuelve a
  // pedir cada 30 s sin recargar la pantalla entera.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.rpc("listar_equipo");
      if (data) setEquipo(data);
    }, 30000);
    return () => clearInterval(t);
  }, [session]);

  const esAdmin = session?.rol === "admin";
  const miSede = equipo.find((p) => p.id === session?.user.id)?.sede_id || "";

  const correoNuevo = nuevo.email.trim().toLowerCase();
  const fallaCorreo = !correoNuevo
    ? "Escribe el correo de la persona."
    : !CORREO.test(correoNuevo)
      ? "Ese correo no tiene un formato válido."
      : equipo.some((p) => (p.email || "").toLowerCase() === correoNuevo)
        ? "Ese correo ya está en el equipo: cámbiale el rol desde la lista."
        : null;

  function abrirAlta() {
    // Un supervisor crea siempre para su propia sede.
    setNuevo({ ...NUEVO, sede_id: esAdmin ? "" : miSede });
    setTocado(false);
    setErrorNuevo("");
    setCreando(true);
  }

  /**
   * Crea la cuenta llamando a la función crear-staff.
   *
   * No se puede hacer directamente desde aquí porque crear usuarios
   * exige la clave service_role, que nunca debe llegar al navegador.
   * La función vive en Supabase y comprueba por su cuenta que quien
   * llama tenga permiso.
   */
  async function crearStaff() {
    setTocado(true);
    if (fallaCorreo) return;

    setGuardando("nuevo");
    setErrorNuevo("");
    setCredencial(null);

    const { data, error: e } = await supabase.functions.invoke("crear-staff", {
      body: { email: correoNuevo, rol: nuevo.rol, sede_id: nuevo.sede_id || null },
    });
    setGuardando(null);

    if (e) {
      // El mensaje de arriba solo dice que la función devolvió un
      // código distinto de 200. El motivo real viene en el cuerpo.
      let mensaje = e.message;
      let motivo = null;
      try {
        const cuerpo = await e.context?.json?.();
        if (cuerpo?.error) mensaje = cuerpo.error;
        motivo = cuerpo?.detalle || null;
      } catch {}

      const ayudas = {
        sesion_invalida: "Tu sesión caducó. Cierra sesión y vuelve a entrar.",
        sin_fila: "Tu cuenta de acceso no tiene fila en la tabla de usuarios.",
        rol_insuficiente: "Entra con la cuenta de administrador, o pide que te asignen ese rol.",
        sin_variables: "La función quedó sin sus variables de entorno. Vuelve a desplegarla.",
        fallo_consulta: "La función no pudo leer la tabla de usuarios: es un problema de permisos en la base.",
        correo_repetido: "Busca ese correo en la lista y asígnale el rol desde ahí.",
      };

      if (mensaje.includes("Failed to send") || mensaje.includes("not found")) {
        setErrorNuevo("La función crear-staff no está desplegada. Ejecuta: npx supabase functions deploy crear-staff");
      } else {
        setErrorNuevo(ayudas[motivo] ? `${mensaje} ${ayudas[motivo]}` : mensaje);
      }
      return;
    }
    if (data?.error) return setErrorNuevo(data.error);

    setCredencial({ email: data.email, clave: data.clave_temporal, rol: nuevo.rol });
    setCreando(false);
    cargar();
  }

  /** Abre la ventana para cambiar rol, sede y bancos de una persona. */
  function abrirEdicion(persona) {
    setBorrador({ rol: persona.rol, sede_id: persona.sede_id || "" });
    setErrorEdicion("");
    setEditando(persona);
  }

  /**
   * Guarda rol y sede de una vez. La ventana ya muestra qué hace el rol
   * nuevo, así que no se pide otra confirmación encima.
   */
  async function guardarEdicion() {
    const p = editando;
    if (!p) return;
    const cambios = {};
    if (borrador.rol !== p.rol) {
      if (p.id === session.user.id) return setErrorEdicion("No puedes cambiarte el rol a ti mismo.");
      cambios.rol = borrador.rol;
    }
    // El administrador no pertenece a una sede: la suya no se toca.
    if (borrador.rol !== "admin" && (borrador.sede_id || "") !== (p.sede_id || "")) cambios.sede_id = borrador.sede_id || null;
    if (!Object.keys(cambios).length) return setEditando(null);

    setGuardando(p.id);
    setErrorEdicion("");
    const r = await actualizar("users", { id: p.id }, cambios);
    setGuardando(null);
    if (!r.ok) return setErrorEdicion("No se pudo guardar: " + r.error);

    if (cambios.rol) {
      await registrarAuditoria({
        usuario_id: session.user.id,
        accion: "CAMBIAR_ROL",
        entidad: "users",
        entidad_id: p.id,
        datos_antes: { rol: p.rol },
        datos_despues: { rol: cambios.rol },
      });
    }
    if ("sede_id" in cambios) {
      await registrarAuditoria({
        usuario_id: session.user.id,
        accion: "CAMBIAR_SEDE",
        entidad: "users",
        entidad_id: p.id,
        datos_despues: { sede_id: cambios.sede_id },
      });
    }
    setOk(
      cambios.rol
        ? `${p.email} ahora es ${rolDe(cambios.rol)?.etiqueta.toLowerCase()}.`
        : `Sede de ${p.email} actualizada.`,
    );
    setEditando(null);
    if (p.atiende_chat) sincronizarChat({ silencioso: true });
    cargar();
  }

  /**
   * Asigna o quita un banco a un encargado de pagos. Un banco puede tener
   * varios encargados y una persona varios bancos: para cubrir una
   * ausencia basta con sumarle el banco del compañero.
   */
  async function alternarBancoPago(persona, banco) {
    const tiene = (bancosPago[persona.id] || []).includes(banco);
    setGuardando(persona.id);
    setError("");

    const { error: e } = tiene
      ? await supabase.from("pagos_bancos").delete().eq("user_id", persona.id).eq("banco", banco)
      : await supabase.from("pagos_bancos").insert({ user_id: persona.id, banco });

    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo cambiar el banco."));

    setBancosPago((m) => ({
      ...m,
      [persona.id]: tiene ? (m[persona.id] || []).filter((b) => b !== banco) : [...(m[persona.id] || []), banco],
    }));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: tiene ? "QUITAR_BANCO_PAGOS" : "ASIGNAR_BANCO_PAGOS",
      entidad: "pagos_bancos",
      entidad_id: persona.id,
      datos_despues: { banco },
    });
  }

  async function alternarBloqueo(persona) {
    if (persona.id === session.user.id) return setError("No puedes bloquearte a ti mismo.");
    const nuevoEstado = persona.estado === "bloqueado" ? "activo" : "bloqueado";
    const si = await confirmar(
      nuevoEstado === "bloqueado"
        ? {
            titulo: `¿Bloquear a ${persona.email}?`,
            texto: "Dejará de poder entrar al panel de inmediato. Se puede revertir.",
            boton: "Bloquear",
            tono: "peligro",
          }
        : {
            titulo: `¿Desbloquear a ${persona.email}?`,
            texto: "Podrá volver a entrar al panel con su contraseña.",
            boton: "Desbloquear",
            tono: "exito",
          },
    );
    if (!si) return;

    setGuardando(persona.id);
    setError("");
    const r = await actualizar("users", { id: persona.id }, { estado: nuevoEstado });
    setGuardando(null);
    if (!r.ok) return setError("No se pudo cambiar el estado: " + r.error);

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: nuevoEstado === "bloqueado" ? "BLOQUEAR_STAFF" : "DESBLOQUEAR_STAFF",
      entidad: "users",
      entidad_id: persona.id,
    });
    setOk(`${persona.email} quedó ${nuevoEstado}.`);
    // Bloqueado sale también del chat; desbloqueado vuelve si lo atendía.
    if (persona.atiende_chat) sincronizarChat({ silencioso: true });
    cargar();
  }

  /**
   * Elimina una cuenta del personal (solo administrador; función
   * eliminar-staff y migración 074). Si nunca usó el sistema se borra por
   * completo; si ya trabajó, queda de baja y su historial se conserva.
   */
  async function eliminarPersona(persona) {
    if (persona.id === session.user.id) return setError("No puedes eliminar tu propia cuenta.");
    const si = await confirmar({
      titulo: `¿Eliminar a ${persona.email}?`,
      texto:
        "Si nunca usó el sistema, su cuenta se borra por completo. Si ya trabajó (revisó, pagó, atendió), queda dada de baja: no puede entrar más, sale de esta lista y su correo queda libre para otra cuenta; lo que hizo se conserva para la auditoría. No se puede deshacer.",
      boton: "Eliminar",
      tono: "peligro",
    });
    if (!si) return;

    setGuardando(persona.id);
    setError("");
    // Primero sale del chat, mientras todavía figura en la lista.
    if (persona.atiende_chat) {
      await supabase.rpc("fijar_chat_personal", { p_user: persona.id, p_activo: false });
      await sincronizarChat({ silencioso: true });
    }
    const { data, error: e } = await supabase.functions.invoke("eliminar-staff", { body: { id: persona.id } });
    setGuardando(null);
    if (e) {
      let mensaje = e.message;
      try {
        const cuerpo = await e.context?.json?.();
        if (cuerpo?.error) mensaje = cuerpo.error;
      } catch {}
      if (mensaje.includes("Failed to send") || mensaje.includes("not found")) {
        mensaje = "La función eliminar-staff no está desplegada. Ejecuta: npx supabase functions deploy eliminar-staff";
      }
      return setError(mensaje);
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: data?.resultado === "borrada" ? "ELIMINAR_STAFF" : "BAJA_STAFF",
      entidad: "users",
      entidad_id: persona.id,
      datos_antes: { email: persona.email, rol: persona.rol },
    });
    setOk(
      data?.resultado === "borrada"
        ? `Se eliminó la cuenta de ${persona.email}.`
        : `${persona.email} quedó dada de baja: ya no puede entrar y su correo quedó libre. Lo que hizo se conserva.`,
    );
    cargar();
  }

  /**
   * Lleva a Chatwoot lo que dice esta lista (quién atiende el chat, rol,
   * sede y disponibilidad). silencioso: solo avisa si algo cambió o falló.
   */
  async function sincronizarChat({ silencioso = false } = {}) {
    setSincronizando(true);
    try {
      const {
        data: { session: sb },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/atencion/sincronizar", {
        method: "POST",
        headers: { Authorization: `Bearer ${sb?.access_token || ""}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!(silencioso && res.status === 503)) setError(j.error || "No se pudo sincronizar con el chat.");
        return;
      }
      const partes = [
        j.altas?.length && `Ya pueden atender el chat: ${j.altas.join(", ")} (entran con el botón "Abrir chat de atención", sin otra contraseña).`,
        j.invitados?.length && `Invitamos al chat a ${j.invitados.join(", ")} (le llega un correo para crear su contraseña).`,
        j.quitados?.length && `Salieron del chat: ${j.quitados.join(", ")}.`,
        j.actualizados?.length && `Rol actualizado en el chat: ${j.actualizados.join(", ")}.`,
      ].filter(Boolean);
      if (partes.length) setOk(partes.join(" "));
      else if (!silencioso) setOk(`El chat ya estaba al día (${j.enChat} ${j.enChat === 1 ? "persona" : "personas"} atienden).`);
      if (j.avisos?.length) setError(j.avisos.join(" "));
    } catch {
      if (!silencioso) setError("No se pudo sincronizar con el chat. Revisa tu conexión.");
    } finally {
      setSincronizando(false);
    }
  }

  /** "Atiende chat": lo invita a Chatwoot o lo saca. */
  async function alternarChat(persona) {
    const activar = !persona.atiende_chat;
    const si = await confirmar(
      activar
        ? {
            titulo: `¿${persona.email} atenderá el chat?`,
            texto:
              persona.rol === "supervisor" || persona.rol === "admin"
                ? "Entrará al chat como jefe: ve todas las conversaciones y los reportes de su sede, sin recibir chats solos. Entra con el botón «Abrir chat de atención» del panel, sin otra contraseña."
                : "Entrará al chat como asesor y recibirá conversaciones de clientes por turnos. Entra con el botón «Abrir chat de atención» del panel, sin otra contraseña.",
            boton: "Sí, atiende el chat",
            tono: "info",
          }
        : {
            titulo: `¿Sacar a ${persona.email} del chat?`,
            texto: "Dejará de poder entrar al chat y de recibir conversaciones. Sus conversaciones pasadas se conservan.",
            boton: "Sacar del chat",
            tono: "atencion",
          },
    );
    if (!si) return;

    setGuardando(persona.id);
    setError("");
    const { error: e } = await supabase.rpc("fijar_chat_personal", { p_user: persona.id, p_activo: activar });
    setGuardando(null);
    if (e) return setError(explicarError(e, "No se pudo cambiar quién atiende el chat."));

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: activar ? "ACTIVAR_CHAT_STAFF" : "QUITAR_CHAT_STAFF",
      entidad: "chat_personal",
      entidad_id: persona.id,
    });
    setEquipo((lista) => lista.map((x) => (x.id === persona.id ? { ...x, atiende_chat: activar } : x)));
    if (persona.id === session.user.id) fijarAccesoChat(persona.id, activar);
    await sincronizarChat();
  }

  const visibles = useMemo(() => {
    let base = equipo;
    if (filtroRol !== "todos") base = base.filter((p) => p.rol === filtroRol);
    if (filtroSede) base = filtroSede === "sin" ? base.filter((p) => !p.sede_id) : base.filter((p) => p.sede_id === filtroSede);
    const t = busqueda.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) => [p.email, p.rol, p.sede].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [equipo, busqueda, filtroSede, filtroRol]);

  if (!session) return <CargaPantalla />;

  // Con la migración 071 aplicada, la lista trae quién atiende el chat.
  const conChat = equipo.length > 0 && "atiende_chat" in equipo[0];
  // Recortes del super administrador (pantalla Accesos, lib/catalogoPermisos.js).
  const lectura = soloLecturaEn(session, "equipo");
  const permite = (parte) => puede(session, `equipo.${parte}`);
  const verRendimiento = permite("rendimiento");
  const puedeCrear = permite("crear");
  const puedeBloquearPersonal = permite("bloquear");
  const puedeRol = esAdmin && permite("rol") && !lectura;
  const puedeBancos = esAdmin && permite("bancos") && !lectura;
  const puedeChatParte = permite("chat") && !lectura;
  const puedeEliminar = permite("eliminar");
  const puedeChat = (p) =>
    puedeChatParte && p.estado !== "bloqueado" && (esAdmin || (session.rol === "supervisor" && p.rol === "gestor" && p.sede_id === miSede));
  const metricasDe = (id) => rendimiento.find((r) => r.usuario_id === id);
  const cuentaRol = (r) => equipo.filter((p) => p.rol === r).length;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Equipo"
      descripcion={`${equipo.length} persona${equipo.length === 1 ? "" : "s"} con acceso al panel`}
      ayuda={
        esAdmin
          ? "Como administrador cambias roles, sedes y bancos de Pagos desde el menú ⋯ de cada persona. El punto sobre la inicial dice si está conectada."
          : "Cambiar roles y mover gente entre sedes es del administrador. Tú creas gestores para tu sede y puedes bloquearlos desde el menú ⋯."
      }
      acciones={
        <div className="flex items-center gap-2">
          {conChat && puedeChatParte && (
            <Pista texto="Pasa al chat quién lo atiende, con su rol, sede y disponibilidad" lado="bottom">
              <BotonAccion tono="neutro" onClick={() => sincronizarChat()} disabled={sincronizando}>
                {sincronizando ? "Sincronizando…" : <span><span className="hidden md:inline">Sincronizar </span>chat</span>}
              </BotonAccion>
            </Pista>
          )}
          {puedeCrear && (
            <BotonAccion onClick={abrirAlta} icono={<Mas className="h-4 w-4" />}>
              <span className="hidden sm:inline">Nueva cuenta</span>
            </BotonAccion>
          )}
        </div>
      }
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtroRol}
          onCambio={setFiltroRol}
          opciones={[
            { clave: "todos", etiqueta: "Todos", cuenta: equipo.length },
            ...ROLES.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, cuenta: cuentaRol(r.clave), pista: r.detalle })),
          ]}
        />
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Correo o sede" className="w-full sm:w-64" />
        {esAdmin && (
          <Desplegable
            id="filtroSede"
            variante="panel"
            className="h-10 sm:w-52"
            aria-label="Filtrar por sede"
            valor={filtroSede}
            onCambio={setFiltroSede}
            opciones={[
              { valor: "", texto: "Todas las sedes" },
              ...sedes.map((s) => ({ valor: s.id, texto: s.nombre })),
              { valor: "sin", texto: "Sin sede" },
            ]}
          />
        )}
      </Barra>

      {loading ? (
        <EsqueletoFilas filas={6} />
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<Personas />}
          titulo={busqueda || filtroSede || filtroRol !== "todos" ? "Sin coincidencias" : "Equipo vacío"}
          detalle={
            busqueda || filtroSede || filtroRol !== "todos"
              ? "Nadie coincide con el filtro."
              : "Todavía no hay nadie con acceso al panel además de ti."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-5 py-2.5 t-etiqueta">Persona</th>
                  <th className="px-4 py-2.5 t-etiqueta">Rol y sede</th>
                  {verRendimiento && (
                    <th className="px-4 py-2.5 t-etiqueta">
                      <span className="inline-flex items-center gap-1">
                        7 días
                        <Pista texto="Casos resueltos en los últimos 7 días (solicitudes, identidades y tarjetas). Pasa el cursor sobre el número para ver el detalle." />
                      </span>
                    </th>
                  )}
                  {conChat && (
                    <th className="px-4 py-2.5 t-etiqueta">
                      <Pista texto="Quién atiende el chat de clientes. Supervisor o administrador entra como jefe (ve todo y los reportes); gestor o pagos, como asesor (recibe chats).">
                        <span className="cursor-help">Chat</span>
                      </Pista>
                    </th>
                  )}
                  <th className="w-14 px-4 py-2.5">
                    <span className="sr-only">Opciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map((p) => {
                  const m = metricasDe(p.id);
                  const yo = p.id === session.user.id;
                  const bloqueado = p.estado === "bloqueado";
                  const puedeBloquear = !yo && (esAdmin || (p.rol === "gestor" && p.sede_id === miSede));
                  const bancos = bancosPago[p.id] || [];
                  const opciones = [
                    puedeRol && !yo && { texto: "Editar rol y sede", icono: <Lapiz />, onSelect: () => abrirEdicion(p) },
                    conChat &&
                      puedeChat(p) && {
                        texto: p.atiende_chat ? "Sacar del chat" : "Invitar al chat",
                        icono: <Burbuja />,
                        onSelect: () => alternarChat(p),
                        deshabilitado: sincronizando,
                      },
                    puedeBloquearPersonal &&
                      puedeBloquear && {
                        texto: bloqueado ? "Desbloquear" : "Bloquear el acceso",
                        icono: <Candado />,
                        onSelect: () => alternarBloqueo(p),
                        peligro: !bloqueado,
                        separar: true,
                      },
                    esAdmin &&
                      !yo &&
                      puedeEliminar && {
                        texto: "Eliminar cuenta",
                        icono: <Basura />,
                        onSelect: () => eliminarPersona(p),
                        peligro: true,
                        deshabilitado: sincronizando,
                      },
                  ].filter(Boolean);
                  return (
                    <tr key={p.id} className={cn("transition", bloqueado ? "bg-muted/40" : "hover:bg-muted/30")}>
                      {/* Persona: el punto sobre la inicial dice si está conectada */}
                      <td className="px-5 py-3">
                        <div className={cn("flex items-center gap-3", bloqueado && "opacity-60")}>
                          <Presencia p={p} bloqueado={bloqueado}>
                            <Avatar texto={p.email} tono={yo ? "oro" : "marca"} />
                          </Presencia>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-semibold">
                              <span className="truncate">{p.email}</span>
                              {yo && <span className="shrink-0 rounded bg-oro-100 px-1.5 py-0.5 text-xs font-bold text-oro-700">Tú</span>}
                              {bloqueado && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700">
                                  <Candado className="h-3 w-3" /> Bloqueado
                                </span>
                              )}
                            </p>
                            {!bloqueado && p.disponibilidad && p.disponibilidad !== "desconectado" && <EstadoAhora p={p} />}
                          </div>
                        </div>
                      </td>

                      {/* Rol y sede */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Pista texto={rolDe(p.rol)?.detalle || "Sin rol asignado"}>
                            <span
                              className={cn(
                                "cursor-help rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset",
                                ESTILO_ROL[p.rol] || "bg-muted text-muted-foreground ring-border",
                              )}
                            >
                              {rolDe(p.rol)?.etiqueta || "Sin rol"}
                            </span>
                          </Pista>
                          <span className={cn("text-sm", p.sede ? "text-foreground/80" : "text-muted-foreground")}>
                            {p.rol === "admin" ? "Todas las sedes" : p.sede || "Sin sede"}
                          </span>
                        </div>
                        {p.rol === "pagos" && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {bancos.length ? (
                              bancos.map((b) => <ChipBanco key={b} banco={b} />)
                            ) : (
                              <span className="text-xs font-semibold text-oro-700">Sin bancos: no podrá pagar nada</span>
                            )}
                          </div>
                        )}
                      </td>

                      {verRendimiento && (
                        <td className="px-4 py-3">
                          {m && Number(m.resueltas) > 0 ? (
                            <Pista
                              texto={`${m.aprobadas} aprobados · ${m.rechazadas} rechazados u observados${m.minutos_promedio ? ` · ${Math.round(m.minutos_promedio)} min por caso en promedio` : ""}`}
                            >
                              <span className="cursor-help">
                                <span className="cifras text-md font-bold">{m.resueltas}</span>{" "}
                                <span className="text-xs text-muted-foreground">resueltos</span>
                              </span>
                            </Pista>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      {conChat && (
                        <td className="px-4 py-3">
                          {p.atiende_chat && !bloqueado ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                              <Burbuja className="h-3.5 w-3.5" />
                              {p.rol === "supervisor" || p.rol === "admin" ? "Jefe" : "Asesor"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      <td className="px-4 py-3 text-right">
                        {opciones.length > 0 && (
                          <MenuOpciones etiqueta={`Opciones de ${p.email}`} opciones={opciones} ocupado={guardando === p.id} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alta de personal */}
      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        bloqueado={guardando === "nuevo"}
        titulo="Nueva cuenta del equipo"
        descripcion={
          esAdmin
            ? "Se crea la cuenta y se te entrega una contraseña temporal para dársela."
            : "Creas gestores para tu sede. Se te entrega una contraseña temporal para dársela."
        }
        icono={<Mas className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setCreando(false)} disabled={guardando === "nuevo"}>
              Cancelar
            </BotonAccion>
            <BotonAccion onClick={crearStaff} cargando={guardando === "nuevo"} disabled={tocado && Boolean(fallaCorreo)}>
              Crear cuenta
            </BotonAccion>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            crearStaff();
          }}
        >
          {errorNuevo && <Aviso>{errorNuevo}</Aviso>}
          <Campo etiqueta="Correo" htmlFor="correoNuevo" requerido error={tocado ? fallaCorreo : null}>
            <input
              id="correoNuevo"
              type="email"
              autoFocus
              autoComplete="off"
              value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              onBlur={() => nuevo.email && setTocado(true)}
              aria-invalid={tocado && Boolean(fallaCorreo)}
              placeholder="nombre@altoqueperu.com"
              className="campo"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Rol" htmlFor="rolNuevo" ayuda={!esAdmin ? "Un supervisor solo crea gestores." : undefined}>
              <Desplegable
                id="rolNuevo"
                variante="panel"
                valor={nuevo.rol}
                onCambio={(v) => setNuevo({ ...nuevo, rol: v })}
                deshabilitado={!esAdmin}
                opciones={ROLES.filter((r) => esAdmin || r.clave === "gestor").map((r) => ({
                  valor: r.clave,
                  texto: r.etiqueta,
                  detalle: r.detalle,
                }))}
              />
            </Campo>
            <Campo etiqueta="Sede" htmlFor="sedeNueva" ayuda={!esAdmin ? "Un supervisor solo crea para su sede." : undefined}>
              <Desplegable
                id="sedeNueva"
                variante="panel"
                valor={nuevo.sede_id}
                onCambio={(v) => setNuevo({ ...nuevo, sede_id: v })}
                deshabilitado={!esAdmin || nuevo.rol === "admin"}
                opciones={[
                  ...(esAdmin ? [{ valor: "", texto: "Sin sede" }] : []),
                  ...sedes
                    .filter((s) => (esAdmin ? s.activa !== false : s.id === miSede))
                    .map((s) => ({ valor: s.id, texto: s.nombre })),
                ]}
              />
            </Campo>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <strong className="text-foreground">{rolDe(nuevo.rol)?.etiqueta}:</strong> {rolDe(nuevo.rol)?.detalle}
          </p>
          {nuevo.rol === "pagos" && (
            <p className="text-chico text-muted-foreground">Después de crearla, asígnale sus bancos en la lista: sin bancos no podrá pagar nada.</p>
          )}
          <button type="submit" className="hidden" />
        </form>
      </Dialogo>

      {/* Credencial recién creada. Se muestra una sola vez. */}
      <Dialogo
        abierto={Boolean(credencial)}
        onCerrar={() => setCredencial(null)}
        titulo="Cuenta creada"
        descripcion="Entrégale estos datos por un canal seguro. La contraseña no se vuelve a mostrar."
        tono="exito"
        icono={<IconoCheck />}
        pie={<BotonAccion onClick={() => setCredencial(null)}>Ya los copié</BotonAccion>}
      >
        <div className="space-y-2">
          {[
            { l: "Correo", v: credencial?.email },
            { l: "Contraseña temporal", v: credencial?.clave },
          ].map((c) => (
            <div key={c.l} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">{c.l}</p>
                <p className="cifras truncate font-mono text-md font-bold text-foreground">{c.v}</p>
              </div>
              <Copiar texto={c.v} />
            </div>
          ))}
        </div>
      </Dialogo>

      {/* Rol, sede y bancos: desde el menú ⋯ de cada fila. */}
      <Dialogo
        abierto={Boolean(editando)}
        onCerrar={() => setEditando(null)}
        bloqueado={guardando === editando?.id}
        titulo="Editar rol y sede"
        descripcion={editando?.email}
        icono={<Lapiz className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setEditando(null)} disabled={guardando === editando?.id}>
              Cancelar
            </BotonAccion>
            <BotonAccion
              onClick={guardarEdicion}
              cargando={guardando === editando?.id}
              disabled={
                !editando ||
                (borrador.rol === editando.rol && (borrador.sede_id || "") === (editando.sede_id || ""))
              }
            >
              Guardar
            </BotonAccion>
          </>
        }
      >
        {editando && (
          <div className="space-y-4">
            {errorEdicion && <Aviso>{errorEdicion}</Aviso>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Rol" htmlFor="rolEditar">
                <Desplegable
                  id="rolEditar"
                  variante="panel"
                  valor={borrador.rol}
                  onCambio={(v) => setBorrador((b) => ({ ...b, rol: v }))}
                  opciones={[
                    ...(editando.rol === "cliente" ? [{ valor: "cliente", texto: "Sin rol asignado" }] : []),
                    ...ROLES.map((r) => ({ valor: r.clave, texto: r.etiqueta, detalle: r.detalle })),
                  ]}
                />
              </Campo>
              <Campo etiqueta="Sede" htmlFor="sedeEditar" ayuda={borrador.rol === "admin" ? "El administrador ve todas las sedes." : undefined}>
                <Desplegable
                  id="sedeEditar"
                  variante="panel"
                  valor={borrador.sede_id}
                  onCambio={(v) => setBorrador((b) => ({ ...b, sede_id: v }))}
                  deshabilitado={borrador.rol === "admin"}
                  opciones={[{ valor: "", texto: "Sin sede" }, ...sedes.map((s) => ({ valor: s.id, texto: s.nombre }))]}
                />
              </Campo>
            </div>
            {rolDe(borrador.rol) && (
              <p
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm",
                  borrador.rol === "admin" && editando.rol !== "admin" ? "bg-oro-50 text-oro-900" : "bg-muted text-muted-foreground",
                )}
              >
                <strong className="text-foreground">{rolDe(borrador.rol).etiqueta}:</strong> {rolDe(borrador.rol).detalle}
                {borrador.rol === "admin" && editando.rol !== "admin" && " Tendrá el control total del panel."}
              </p>
            )}

            {/* Bancos de Pagos: se guardan al pulsarlos. */}
            {editando.rol === "pagos" && borrador.rol === "pagos" && puedeBancos && (
              <div>
                <p className="mb-1.5 text-sm font-semibold">Bancos que paga</p>
                <div className="flex flex-wrap gap-1.5">
                  {BANCOS_TARJETA.map((b) => {
                    const activo = (bancosPago[editando.id] || []).includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => alternarBancoPago(editando, b)}
                        disabled={guardando === editando.id}
                        aria-pressed={activo}
                        className={cn(
                          "pulsable rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset transition disabled:opacity-60",
                          activo ? "bg-marca-700 text-white ring-marca-700" : "bg-card text-muted-foreground ring-border hover:text-foreground",
                        )}
                      >
                        {activo && "✓ "}
                        {nombreBanco(b)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Cada banco se guarda al pulsarlo. Sin bancos no podrá pagar nada.</p>
              </div>
            )}
          </div>
        )}
      </Dialogo>

      {ventanaConfirmar}
      <Tostada mensaje={ok} onCerrar={() => setOk("")} />
    </Shell>
  );
}

/** Estado de trabajo de la persona (migración 070) y desde cuándo. */
function EstadoAhora({ p }) {
  const e = ESTADOS[p.disponibilidad] || ESTADOS.desconectado;
  const d = p.disponibilidad_desde ? new Date(p.disponibilidad_desde) : null;
  const hoy = d && d.toDateString() === new Date().toDateString();
  const desde = d
    ? hoy
      ? `desde las ${d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" })}`
      : `desde el ${d.toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`
    : "";
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          p.disponibilidad === "desconectado" ? "bg-muted-foreground/40" : e.punto,
        )}
      />
      <span className="font-semibold text-foreground/80">{e.texto}</span>
      {desde && <span>· {desde}</span>}
    </p>
  );
}

/** La inicial con un punto de color: conectada, ocupada, desconectada... */
function Presencia({ p, bloqueado, children }) {
  const e = ESTADOS[p.disponibilidad] || ESTADOS.desconectado;
  const apagado = bloqueado || !p.disponibilidad || p.disponibilidad === "desconectado";
  const d = p.disponibilidad_desde ? new Date(p.disponibilidad_desde) : null;
  const desde = d ? ` desde el ${d.toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : "";
  return (
    <Pista texto={bloqueado ? "Bloqueado" : `${e.texto}${desde}`}>
      <span className="relative shrink-0 cursor-help">
        {children}
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card",
            apagado ? "bg-muted-foreground/40" : e.punto,
          )}
        />
      </span>
    </Pista>
  );
}

/**
 * Menú ⋯ con las acciones de una fila. modal={false}: así la ventana de
 * confirmación que abre una opción no queda trabada detrás del menú.
 */
function MenuOpciones({ etiqueta, opciones, ocupado }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={etiqueta}
          disabled={ocupado}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500 disabled:opacity-50 data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          {ocupado ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[210px] rounded-xl border border-border bg-card p-1 shadow-alzado animate-aparecer"
        >
          {opciones.map((o, i) => (
            <div key={o.texto}>
              {o.separar && i > 0 && <DropdownMenu.Separator className="my-1 h-px bg-border" />}
              <DropdownMenu.Item
                disabled={o.deshabilitado}
                onSelect={o.onSelect}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold outline-none transition data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  o.peligro ? "text-red-700 data-[highlighted]:bg-red-50" : "text-foreground data-[highlighted]:bg-muted",
                )}
              >
                <span className={cn("[&>svg]:h-4 [&>svg]:w-4", o.peligro ? "text-red-600" : "text-muted-foreground")}>{o.icono}</span>
                {o.texto}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
