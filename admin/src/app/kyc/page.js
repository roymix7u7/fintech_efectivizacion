"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe, tomarSiguiente, RESERVA_MINUTOS } from "@/lib/cola";
import { useRetraso } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import Shell, { Persona, Flecha, Manos, Reloj } from "@/components/shell";
import Paginador from "@/components/paginador";
import { EsqueletoFilas, BarraCarga, BotonAccion, CargaPantalla } from "@/components/carga";
import SinPendientes from "@/components/sinPendientes";
import { Estado, Vacio, Aviso } from "@/components/marca";
import { Segmentos, Buscador, Barra, Leyenda, Avatar } from "@/components/piezas";
import Pista from "@/components/pista";
import Revisor from "@/components/revisor";
import { colorDe } from "@/lib/colores";
import BotonRefrescar from "@/components/refrescar";


/** Minutos que le quedan a una reserva, o 0 si ya vencio. */
function restan(asignadoEn) {
  if (!asignadoEn) return 0;
  const pasados = (Date.now() - new Date(asignadoEn).getTime()) / 60000;
  return Math.max(0, Math.ceil(RESERVA_MINUTOS - pasados));
}

const POR_PAGINA = 25;

const FILTROS = [
  { clave: "pendiente", etiqueta: "Por revisar" },
  { clave: "activo", etiqueta: "Verificados" },
  { clave: "observado", etiqueta: "Observados" },
  { clave: "bloqueado", etiqueta: "Bloqueados" },
];

function espera(iso) {
  if (!iso) return null;
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (horas < 1) return "Recién llegado";
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export default function KYCPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [clientes, setClientes] = useState([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [contadores, setContadores] = useState({});
  // Cada gestor ve lo suyo. Antes la lista mostraba todos los
  // pendientes a todo el mundo, asi que cinco personas abrian el mismo
  // cliente aunque la cola ya lo hubiera repartido.
  const [soloMias, setSoloMias] = useState(true);
  const [pidiendo, setPidiendo] = useState(false);
  const [equipo, setEquipo] = useState({});
  const [sinPendientes, setSinPendientes] = useState(false);
  const router = useRouter();

  const termino = useRetraso(busqueda, 350);

  // Se llega con ?vacia=1 desde la ficha cuando ya no queda ninguna.
  // Se lee de la dirección y no con useSearchParams: ese hook obliga a
  // envolver la página en Suspense y rompe la compilación estática.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("vacia")) {
      setSinPendientes(true);
      window.history.replaceState(null, "", "/kyc");
    }
  }, []);
  const peticion = useRef(0);

  const cargar = useCallback(async (estado, pag, buscar, silencioso, mias, yo) => {
    const mia = ++peticion.current;
    if (silencioso) setRefrescando(true);
    else setPrimeraCarga(true);
    setError("");

    // La busqueda va al servidor. Con treinta mil clientes, traer la
    // lista entera para filtrarla en el navegador no es viable.
    let ids = null;
    const t = (buscar || "").trim();
    if (t.length >= 2) {
      const patron = `%${t}%`;
      const { data: perfiles } = await supabase
        .from("perfiles_cliente")
        .select("user_id")
        .or(
          `nombres.ilike.${patron},apellidos.ilike.${patron},dni.ilike.${patron},telefono.ilike.${patron}`,
        )
        .limit(150);
      ids = (perfiles || []).map((p) => p.user_id);
    }

    let q = supabase
      .from("users")
      .select("id, email, estado, created_at, asignado_a, asignado_en", {
        count: "exact",
      })
      .eq("rol", "cliente")
      .eq("estado", estado);

    // Solo en la cola: en los verificados u observados no hay reparto
    // que respetar, son listas de consulta.
    if (estado === "pendiente" && mias && yo) {
      const vence = new Date(Date.now() - RESERVA_MINUTOS * 60000).toISOString();
      q = q.eq("asignado_a", yo).gt("asignado_en", vence);
    }

    if (t.length >= 2) {
      const patron = `%${t}%`;
      const partes = [`email.ilike.${patron}`];
      if (ids && ids.length > 0) partes.push(`id.in.(${ids.join(",")})`);
      q = q.or(partes.join(","));
    }

    const { data: usuarios, count, error: consultaError } = await q
      .order("created_at", { ascending: estado === "pendiente" })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);

    if (mia !== peticion.current) return;

    if (consultaError) {
      setError(explicarError(consultaError, "No se pudieron cargar los clientes."));
      setClientes([]);
      setTotal(0);
      setPrimeraCarga(false);
      setRefrescando(false);
      return;
    }

    setTotal(count || 0);

    if (!usuarios || usuarios.length === 0) {
      setClientes([]);
      setPrimeraCarga(false);
      setRefrescando(false);
      return;
    }

    // Solo se piden los perfiles de la pagina visible, no de todos.
    const { data: perfiles } = await supabase
      .from("perfiles_cliente")
      .select("user_id, nombres, apellidos, dni, telefono")
      .in(
        "user_id",
        usuarios.map((u) => u.id),
      );

    if (mia !== peticion.current) return;

    setClientes(
      usuarios.map((u) => ({
        ...u,
        perfil: perfiles?.find((p) => p.user_id === u.id) || null,
      })),
    );
    setPrimeraCarga(false);
    setRefrescando(false);
  }, []);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) return router.push("/login");
      if (!["gestor", "supervisor", "admin"].includes(s.rol))
        return router.push("/dashboard");
      setSession(s);
      // Supervisor y admin no reciben casos: abren viendo toda la cola.
      const mias = s.rol === "gestor";
      setSoloMias(mias);
      supabase
        .from("users")
        .select("id, email, rol")
        .neq("rol", "cliente")
        .then(({ data }) =>
          setEquipo(
            Object.fromEntries(
              (data || []).map((u) => [u.id, { email: u.email, rol: u.rol }]),
            ),
          ),
        );
      cargar("pendiente", 0, "", false, mias, s.user.id);
      estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
    });
  }, [router, cargar]);

  useEffect(() => {
    if (!session) return;
    cargar(filtro, pagina, termino, true, soloMias, session.user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, pagina, filtro, soloMias]);

  useEffect(() => {
    setPagina(0);
  }, [termino, filtro, soloMias]);

  /**
   * La cola se refresca sola mientras se mira: si otro gestor toma una
   * identidad o la resuelve, desaparece o cambia de dueño en el momento.
   */
  useEffect(() => {
    if (!session) return;
    const canal = supabase
      .channel(`cola-kyc-${Date.now().toString(36)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => {
          cargar(filtro, pagina, termino, true, soloMias, session.user.id);
          estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
        },
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filtro, pagina, termino, soloMias]);

  /** Pide el siguiente caso libre y lo abre. */
  async function atenderSiguiente() {
    setPidiendo(true);
    setError("");
    const { id, vacia, error: e } = await tomarSiguiente("kyc");
    setPidiendo(false);
    if (e) return setError("No se pudo tomar el siguiente caso: " + e);
    if (vacia) {
      setSinPendientes(true);
      estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
      return;
    }
    router.push(`/kyc/${id}`);
  }

  // Revisar es del gestor; el supervisor mira. El admin conserva el
  // mando como salida de emergencia.
  const puedeResolver = ["gestor", "admin"].includes(session?.rol);
  const esGestor = session?.rol === "gestor";

  if (!session) return <CargaPantalla />;

  const enCola = filtro === "pendiente";

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Verificación de clientes"
      descripcion={
        primeraCarga
          ? "Cargando..."
          : enCola
            ? soloMias
              ? `${total} ${total === 1 ? "identidad asignada" : "identidades asignadas"} a ti`
              : `${total} en la cola del equipo`
            : `${total} en esta lista`
      }
      ayuda="Cada cliente nuevo sube su documento y una selfie. Revisa que sean de la misma persona y que los datos coincidan; al aprobar se activa su cuenta."
      acciones={
        enCola &&
        puedeResolver && (
          <BotonAccion onClick={atenderSiguiente} cargando={pidiendo} icono={<Manos className="h-4 w-4" />} title="Te asigna la identidad libre que más tiempo lleva esperando">
            <span className="hidden sm:inline">{pidiendo ? "Buscando…" : "Tomar siguiente"}</span>
          </BotonAccion>
        )
      }
    >
      <BarraCarga activa={refrescando} />

      {error && (
        <Aviso className="mb-4 animate-aparecer" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      <Barra>
        <Segmentos
          valor={filtro}
          onCambio={setFiltro}
          opciones={FILTROS.map((f) => ({
            ...f,
            cuenta: f.clave === "pendiente" ? (contadores.kycPendientes ?? null) : null,
            urgente: f.clave === "pendiente",
          }))}
        />
        <Buscador
          valor={busqueda}
          onCambio={setBusqueda}
          pendiente={busqueda !== termino}
          placeholder="Nombre, DNI, correo o teléfono"
          className="w-full sm:w-80"
        />
        <div className="ml-auto flex items-center gap-2">
          {!puedeResolver && (
            <Pista texto="Como supervisor ves toda la cola. Aprobar u observar es del gestor; tú puedes bloquear cuentas desde la ficha.">
              <span className="cursor-help rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Solo lectura</span>
            </Pista>
          )}
          {enCola && (
            <BotonRefrescar
              girando={refrescando}
              onClick={() => {
                cargar(filtro, pagina, termino, true, soloMias, session.user.id);
                estadoCola().then(({ colas }) => setContadores(contadoresDe(colas)));
              }}
              texto="Actualizar la cola: identidades nuevas o ya tomadas por otros"
            />
          )}
        </div>
      </Barra>

      {primeraCarga ? (
        <EsqueletoFilas filas={8} alto="h-[64px]" />
      ) : clientes.length === 0 ? (
        <Vacio
          icono={<Persona />}
          titulo={termino ? "Sin coincidencias" : enCola && soloMias ? "No tienes identidades asignadas" : "Nada por aquí"}
          detalle={
            termino
              ? "Ningún cliente de esta lista coincide con lo que buscas."
              : enCola
                ? soloMias
                  ? "Pulsa «Tomar siguiente» y el sistema te asigna la que más tiempo lleva esperando."
                  : "No queda ningún cliente por verificar."
                : "No hay clientes con este estado."
          }
          accion={
            enCola && soloMias && puedeResolver && !termino ? (
              <BotonAccion onClick={atenderSiguiente} cargando={pidiendo} icono={<Manos className="h-4 w-4" />}>
                Tomar siguiente
              </BotonAccion>
            ) : null
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card shadow-panel transition-opacity",
              refrescando && "opacity-60",
            )}
          >
            {/* Encabezado de columnas, solo en pantallas anchas */}
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px_24px] gap-4 border-b border-border bg-muted/50 px-4 py-2 md:grid">
              <span className="t-etiqueta">Cliente</span>
              <span className="t-etiqueta">Documento</span>
              <span className="t-etiqueta">{enCola ? "Esperando" : "Registro"}</span>
              <span className="t-etiqueta">Atiende</span>
              <span className="t-etiqueta">Estado</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {clientes.map((c, i) => {
                const sinPerfil = !c.perfil;
                const tomada = c.asignado_a && restan(c.asignado_en) > 0;
                const largo = enCola && Date.now() - new Date(c.created_at).getTime() > 12 * 3600000;
                return (
                  <li key={c.id} className="entra" style={{ "--retraso": `${Math.min(i, 14) * 22}ms` }}>
                    <Link
                      href={`/kyc/${c.id}`}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px_24px]",
                        tomada &&
                          (c.asignado_a === session.user.id
                            ? "border-l-4 border-l-marca-600"
                            : `border-l-4 ${colorDe(c.asignado_a).borde}`),
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          texto={sinPerfil ? "?" : `${c.perfil.nombres} ${c.perfil.apellidos}`}
                          tono={sinPerfil ? "gris" : "marca"}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-md font-semibold">
                            {sinPerfil ? "Registro sin completar" : `${c.perfil.nombres} ${c.perfil.apellidos}`}
                          </p>
                          <p className="truncate text-chico text-muted-foreground">{c.email}</p>
                        </div>
                      </div>

                      <span className="cifras hidden truncate font-mono text-sm md:block">{c.perfil?.dni || "—"}</span>

                      <span
                        className={cn(
                          "hidden items-center gap-1 text-sm md:inline-flex",
                          largo ? "font-bold text-oro-700" : "text-muted-foreground",
                        )}
                      >
                        {largo && <Reloj className="h-3.5 w-3.5" />}
                        {enCola ? espera(c.created_at) : new Date(c.created_at).toLocaleDateString("es-PE")}
                      </span>

                      <span className="hidden min-w-0 md:block">
                        {tomada ? (
                          <Revisor
                            id={c.asignado_a}
                            persona={equipo[c.asignado_a]}
                            minutos={restan(c.asignado_en)}
                            propio={c.asignado_a === session.user.id}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{enCola ? "Libre" : "—"}</span>
                        )}
                      </span>

                      <span className="flex items-center gap-2 md:block">
                        <Estado valor={c.estado} />
                      </span>
                      <Flecha className="hidden h-4 w-4 text-muted-foreground md:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <Paginador pagina={pagina} porPagina={POR_PAGINA} total={total} cargando={refrescando} onCambio={setPagina} />

          {enCola && (
            <Leyenda
              className="mt-4"
              items={[
                {
                  texto: "Franja de color",
                  marca: <span className="h-3.5 w-1 rounded bg-marca-600" />,
                  pista: "Quién la atiende: azul oscuro eres tú; cada compañero tiene su color.",
                },
                {
                  texto: "Espera larga",
                  marca: <Reloj className="h-3.5 w-3.5 text-oro-700" />,
                  pista: "Lleva 12 horas o más sin verificar: el cliente no puede operar mientras tanto.",
                },
                {
                  texto: `Reserva de ${RESERVA_MINUTOS} min`,
                  marca: <span className="h-2.5 w-2.5 rounded-full bg-marca-300" />,
                  pista: `Al abrir una ficha queda a tu nombre por ${RESERVA_MINUTOS} minutos. Si no la resuelves, vuelve a la cola.`,
                },
              ]}
            />
          )}
        </>
      )}
      <SinPendientes
        visible={sinPendientes}
        onCerrar={() => setSinPendientes(false)}
        texto="No hay identidades esperando revisión. Cuando entre una nueva, el sistema te la asigna sola."
      />
    </Shell>
  );
}
