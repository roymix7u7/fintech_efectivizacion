"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  supabaseCliente,
  tiempoRestante,
  cerrarSesionCliente,
  motivoDelBloqueo,
  mensajeError,
} from "@/lib/cliente";
import { Encabezado, Aviso, Boton, Cargando } from "./piezas";
import MarcoCuenta from "./barra";
import MisAvisos from "./avisos";
import MenuUsuario from "./usuario";
import ChatSoporte from "./soporte";
import AvisosNavegador from "./avisosNavegador";

/**
 * Sesión de Mi cuenta, compartida por /cuenta y sus pantallas (nueva
 * solicitud, agregar tarjeta o cuenta). Vive en el layout: el
 * encabezado, la barra lateral y la sesión se cargan una sola vez y, al
 * moverse entre vistas, solo cambia el área de contenido.
 *
 * También guarda en memoria lo último que cargó Mi cuenta, para que al
 * volver se vea al instante mientras se actualiza.
 */
const CuentaCtx = createContext(null);
export const useCuenta = () => useContext(CuentaCtx);

const VISTAS = ["resumen", "solicitudes", "bancos", "noticias", "perfil"];
const PANTALLAS = {
  "/cuenta/solicitud-nueva": "nueva",
  "/cuenta/tarjeta-nueva": "tarjeta",
  "/cuenta/cuenta-nueva": "cuenta",
};
// Como se llaman en la barra lateral: así las ve el asesor en el chat.
const NOMBRE_PANTALLA = {
  resumen: "Resumen",
  solicitudes: "Solicitudes",
  bancos: "Tarjetas y cuentas",
  noticias: "Noticias",
  perfil: "Mi perfil",
  nueva: "Nueva solicitud",
  tarjeta: "Agregar tarjeta",
  cuenta: "Agregar cuenta",
};

export function ProveedorCuenta({ children }) {
  const sb = supabaseCliente();
  const router = useRouter();
  const ruta = usePathname();
  const [estado, setEstado] = useState(null); // pendiente | observado | activo | bloqueado
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [legales, setLegales] = useState([]);
  const [bloqueo, setBloqueo] = useState(null);
  const [error, setError] = useState("");
  const [recienAprobada, setRecienAprobada] = useState(false);
  const [vista, setVista] = useState("resumen");
  const [enCurso, setEnCurso] = useState(0);
  const [noticiasNuevas, setNoticiasNuevas] = useState(0);
  // Mis avisos (notificaciones personales): la campana del encabezado.
  const [avisos, setAvisos] = useState([]);
  const estadoPrevio = useRef(null);
  const cache = useRef(null);

  const salir = useCallback(
    async (motivo) => {
      await cerrarSesionCliente();
      cache.current = null;
      router.replace(motivo ? `/ingresar?${motivo}=1` : "/ingresar");
    },
    [router],
  );

  const recargar = useCallback(async () => {
    setError("");
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) return router.replace("/ingresar");
      // Dos horas desde que se escribió la contraseña, como en la app.
      if (tiempoRestante() <= 0) return salir("expirada");

      const user = session.user;
      const [{ data: u }, { data: p }] = await Promise.all([
        sb.from("users").select("rol, estado").eq("id", user.id).maybeSingle(),
        sb
          .from("perfiles_cliente")
          .select(
            "id, nombres, apellidos, tipo_documento, dni, telefono, direccion, motivo_observacion, created_at, acepta_promociones",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (u && u.rol !== "cliente") return salir();
      // Verificó el correo pero no terminó: se retoma el registro.
      if (!p) return router.replace("/registro");
      if (u?.estado === "bloqueado") {
        const motivo = await motivoDelBloqueo(user.id);
        await cerrarSesionCliente();
        setBloqueo({ motivo });
        return setEstado("bloqueado");
      }
      setUsuario(user);
      setPerfil(p);
      setEstado(u?.estado || "pendiente");
      const { data: pend } = await sb.rpc("consentimientos_pendientes");
      setLegales(pend || []);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [sb, router, salir]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // La vista que pide la dirección (#solicitudes) o el aviso de retorno.
  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.slice(1);
      if (VISTAS.includes(h)) setVista(h);
      else if (new URLSearchParams(window.location.search).get("aviso"))
        setVista("bancos");
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  // Las pantallas para operar son solo para cuentas aprobadas.
  useEffect(() => {
    if (estado && estado !== "activo" && ruta !== "/cuenta")
      router.replace("/cuenta");
  }, [estado, ruta, router]);

  // Mientras espera la revisión se entera sola de la respuesta del
  // equipo, como en la app: en vivo, cada 30 s y al volver a la pestaña.
  const enEspera = estado === "pendiente" || estado === "observado";
  useEffect(() => {
    if (!usuario || !enEspera) return;
    const canal = sb
      .channel(`mi-revision-${usuario.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${usuario.id}`,
        },
        () => recargar(),
      )
      .subscribe();
    const reloj = setInterval(recargar, 30000);
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      sb.removeChannel(canal);
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sb, usuario, enEspera, recargar]);

  // Los avisos se leen aquí para que la campana funcione en todas las
  // pantallas; Mi cuenta los vuelve a poner al día con cada novedad.
  useEffect(() => {
    if (!usuario || !estado || estado === "bloqueado") return;
    const leer = () =>
      sb
        .from("notificaciones")
        .select("id, tipo, titulo, cuerpo, leida, created_at")
        .eq("user_id", usuario.id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => data && setAvisos(data));
    leer();
    const canal = sb
      .channel(`mis-avisos-${usuario.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificaciones",
          filter: `user_id=eq.${usuario.id}`,
        },
        () => leer(),
      )
      .subscribe();
    const alVolver = () => document.visibilityState === "visible" && leer();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      sb.removeChannel(canal);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sb, usuario, estado]);

  useEffect(() => {
    if (
      estado === "activo" &&
      (estadoPrevio.current === "pendiente" ||
        estadoPrevio.current === "observado")
    )
      setRecienAprobada(true);
    if (estado) estadoPrevio.current = estado;
  }, [estado]);

  // Cierre automático al cumplirse las dos horas.
  useEffect(() => {
    if (!estado || estado === "bloqueado") return;
    const t = setTimeout(
      () => salir("expirada"),
      Math.max(0, tiempoRestante()),
    );
    return () => clearTimeout(t);
  }, [estado, salir]);

  /** Ir a una vista de Mi cuenta sin recargar nada más que el contenido. */
  const irA = useCallback(
    (k) => {
      setVista(k);
      if (ruta === "/cuenta")
        window.history.replaceState(null, "", `/cuenta#${k}`);
      else router.push(`/cuenta#${k}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [ruta, router],
  );

  // Arriba a la derecha: la campana de avisos y el menú con el nombre
  // y "Cerrar sesión", en todas las vistas.
  const derecha = estado && estado !== "bloqueado" && perfil && (
    <div className="flex items-center gap-2 sm:gap-3">
      <MisAvisos sb={sb} avisos={avisos} />
      <MenuUsuario
        nombre={`${perfil.nombres} ${perfil.apellidos}`}
        correo={usuario?.email}
        onPerfil={estado === "activo" ? () => irA("perfil") : null}
        onSalir={() => salir()}
      />
    </div>
  );

  const valor = {
    sb,
    estado,
    usuario,
    perfil,
    legales,
    setLegales,
    bloqueo,
    recienAprobada,
    recargar,
    salir,
    vista,
    irA,
    setEnCurso,
    setNoticiasNuevas,
    setAvisos,
    cache,
  };

  let contenido;
  if (error)
    contenido = (
      <main className="mx-auto max-w-lg px-4 py-14">
        <Aviso>{error}</Aviso>
        <Boton onClick={recargar}>Reintentar</Boton>
      </main>
    );
  else if (!estado) contenido = <Cargando texto="Abriendo tu cuenta..." />;
  else if (estado === "activo")
    contenido = (
      <MarcoCuenta
        activa={ruta === "/cuenta" ? vista : PANTALLAS[ruta]}
        onIr={irA}
        enCurso={enCurso}
        noticiasNuevas={noticiasNuevas}
      >
        {children}
      </MarcoCuenta>
    );
  else contenido = ruta === "/cuenta" ? children : <Cargando />;

  return (
    <CuentaCtx.Provider value={valor}>
      <Encabezado derecha={derecha} completo={estado === "activo"} />
      {contenido}
      {usuario && estado && estado !== "bloqueado" && <AvisosNavegador sb={sb} usuarioId={usuario.id} />}
      {usuario && estado && estado !== "bloqueado" && (
        <ChatSoporte
          sb={sb}
          usuarioId={usuario.id}
          sobreBarra={estado === "activo"}
          pantalla={
            estado === "activo"
              ? NOMBRE_PANTALLA[ruta === "/cuenta" ? vista : PANTALLAS[ruta]]
              : "Revisión de su cuenta"
          }
        />
      )}
    </CuentaCtx.Provider>
  );
}
