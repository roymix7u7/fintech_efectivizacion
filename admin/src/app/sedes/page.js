"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, sesionEnCache } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { registrarAuditoria, explicarError } from "@/lib/acciones";
import { estadoCola, contadoresDe } from "@/lib/cola";
import { cn } from "@/lib/utils";
import Shell, { Edificio, Flecha, Mas, Lapiz } from "@/components/shell";
import { Vacio, Aviso, Dato } from "@/components/marca";
import { Esqueleto, BotonAccion, CargaPantalla } from "@/components/carga";
import { Campo, Dialogo, Tostada, useConfirmar } from "@/components/piezas";
import Pista from "@/components/pista";

const VACIA = { nombre: "", ciudad: "", direccion: "", telefono: "" };

/** Lo que falta o está mal en el formulario, campo por campo. */
function validar(f, sedes, id) {
  const e = {};
  const nombre = f.nombre.trim();
  if (nombre.length < 3) e.nombre = "Ponle un nombre de al menos 3 letras.";
  else if (sedes.some((s) => s.id !== id && s.nombre.trim().toLowerCase() === nombre.toLowerCase()))
    e.nombre = `Ya existe una sede llamada ${nombre}.`;
  const tel = (f.telefono || "").replace(/[\s()-]/g, "");
  if (tel && !/^\+?\d{6,12}$/.test(tel)) e.telefono = "Escribe solo números: entre 6 y 12 dígitos.";
  return e;
}

export default function SedesPage() {
  const [session, setSession] = useState(sesionEnCache);
  const [sedes, setSedes] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [form, setForm] = useState(null); // { id|null, nombre, ciudad, direccion, telefono }
  const [tocado, setTocado] = useState({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [ok, setOk] = useState("");
  const [contadores, setContadores] = useState({});
  const [confirmar, ventanaConfirmar] = useConfirmar();
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: e } = await supabase.from("sedes").select("*").order("nombre");
    if (e) {
      setError(explicarError(e, "No se pudieron cargar las sedes."));
      setLoading(false);
      return;
    }
    setSedes(data || []);

    const [{ data: personal }, { colas }] = await Promise.all([supabase.rpc("listar_equipo"), estadoCola()]);
    setEquipo(personal || []);
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

  function abrir(sede) {
    setForm(
      sede
        ? { id: sede.id, nombre: sede.nombre || "", ciudad: sede.ciudad || "", direccion: sede.direccion || "", telefono: sede.telefono || "" }
        : { id: null, ...VACIA },
    );
    setTocado({});
    setErrorForm("");
  }

  const errores = form ? validar(form, sedes, form.id) : {};
  const hayErrores = Object.keys(errores).length > 0;

  async function guardar() {
    setTocado({ nombre: true, telefono: true });
    if (hayErrores) return;

    const campos = {
      nombre: form.nombre.trim(),
      ciudad: form.ciudad.trim() || null,
      direccion: form.direccion.trim() || null,
      telefono: form.telefono.trim() || null,
    };

    setGuardando(true);
    setErrorForm("");
    const { data, error: e } = form.id
      ? await supabase.from("sedes").update(campos).eq("id", form.id).select("id").single()
      : await supabase
          .from("sedes")
          .insert({ ...campos, creada_por: session.user.id })
          .select("id")
          .single();
    setGuardando(false);

    if (e) {
      return setErrorForm(
        e.message.includes("duplicate") ? `Ya existe una sede llamada ${campos.nombre}.` : explicarError(e, "No se pudo guardar."),
      );
    }

    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: form.id ? "EDITAR_SEDE" : "CREAR_SEDE",
      entidad: "sedes",
      entidad_id: data?.id || form.id,
      datos_despues: { nombre: campos.nombre },
    });
    setOk(form.id ? `Sede ${campos.nombre} actualizada.` : `Sede ${campos.nombre} creada. Ahora asígnale personal desde Equipo.`);
    setForm(null);
    cargar();
  }

  async function alternarActiva(sede, cuantos) {
    if (sede.activa) {
      const si = await confirmar({
        titulo: `¿Desactivar ${sede.nombre}?`,
        texto: cuantos
          ? `Tiene ${cuantos} persona${cuantos === 1 ? "" : "s"} asignada${cuantos === 1 ? "" : "s"}. Siguen pudiendo entrar; muévelas a otra sede desde Equipo si hace falta. Ya no aparecerá para crear cuentas nuevas.`
          : "Ya no aparecerá para crear cuentas nuevas. Se puede volver a activar.",
        boton: "Desactivar",
        tono: "atencion",
      });
      if (!si) return;
    }
    const { error: e } = await supabase.from("sedes").update({ activa: !sede.activa }).eq("id", sede.id);
    if (e) return setError("No se pudo cambiar: " + e.message);
    await registrarAuditoria({
      usuario_id: session.user.id,
      accion: sede.activa ? "DESACTIVAR_SEDE" : "ACTIVAR_SEDE",
      entidad: "sedes",
      entidad_id: sede.id,
    });
    setOk(`${sede.nombre} quedó ${sede.activa ? "inactiva" : "activa"}.`);
    cargar();
  }

  if (!session) return <CargaPantalla />;

  /** Personal de cada sede, para mostrar cómo está poblada. */
  function gente(sedeId) {
    const propios = equipo.filter((p) => p.sede_id === sedeId);
    return {
      todos: propios.length,
      supervisores: propios.filter((p) => p.rol === "supervisor"),
      gestores: propios.filter((p) => p.rol === "gestor"),
      pagos: propios.filter((p) => p.rol === "pagos"),
    };
  }

  const sinSede = equipo.filter((p) => !p.sede_id && p.rol !== "admin");
  const activas = sedes.filter((s) => s.activa).length;

  return (
    <Shell
      session={session}
      contadores={contadores}
      titulo="Sedes"
      descripcion={`${activas} activa${activas === 1 ? "" : "s"} de ${sedes.length}`}
      ayuda="Cada sede tiene un supervisor y sus gestores. El supervisor solo ve y gestiona al personal de su sede."
      acciones={
        <BotonAccion onClick={() => abrir(null)} icono={<Mas className="h-4 w-4" />}>
          <span className="hidden sm:inline">Nueva sede</span>
        </BotonAccion>
      }
    >
      {error && (
        <Aviso className="mb-4" onCerrar={() => setError("")}>
          {error}
        </Aviso>
      )}

      {sinSede.length > 0 && (
        <Aviso
          className="mb-4"
          tono="espera"
          titulo={`${sinSede.length} persona${sinSede.length === 1 ? "" : "s"} del equipo sin sede`}
          accion={
            <Link href="/equipo" className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-bold underline-offset-4 hover:underline">
              Asignar en Equipo <Flecha className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {sinSede.map((p) => p.email).join(", ")}
        </Aviso>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : sedes.length === 0 ? (
        <Vacio
          icono={<Edificio />}
          titulo="Sin sedes"
          detalle="Crea la primera sede y luego asígnale un supervisor y sus gestores desde Equipo."
          accion={
            <BotonAccion onClick={() => abrir(null)} icono={<Mas className="h-4 w-4" />}>
              Nueva sede
            </BotonAccion>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sedes.map((s) => {
            const g = gente(s.id);
            return (
              <div
                key={s.id}
                className={cn("flex flex-col rounded-xl border bg-card shadow-panel", s.activa ? "border-border" : "border-dashed border-marca-200 opacity-75")}
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600">
                    <Edificio className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-md font-semibold">{s.nombre}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[s.ciudad, s.direccion].filter(Boolean).join(" · ") || "Sin dirección"}
                    </p>
                    {s.telefono && <p className="cifras text-sm text-muted-foreground">{s.telefono}</p>}
                  </div>
                  {!s.activa && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">Inactiva</span>}
                </div>

                <dl className="grid grid-cols-3 gap-3 border-t border-border px-4 py-3">
                  <Dato etiqueta="Supervisor" className="col-span-3">
                    {g.supervisores.length > 0 ? g.supervisores.map((x) => x.email).join(", ") : null}
                  </Dato>
                  <Dato etiqueta="Gestores" mono>
                    {String(g.gestores.length)}
                  </Dato>
                  <Dato etiqueta="Pagos" mono>
                    {String(g.pagos.length)}
                  </Dato>
                  <Dato etiqueta="Total" mono>
                    {String(g.todos)}
                  </Dato>
                </dl>

                {s.activa && g.supervisores.length !== 1 && (
                  <p className="mx-4 mb-3 rounded-md bg-oro-50 px-2.5 py-1.5 text-chico font-semibold text-oro-700">
                    {g.supervisores.length === 0 ? "Esta sede no tiene supervisor." : `Hay ${g.supervisores.length} supervisores en esta sede.`}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-1 border-t border-border px-2 py-2">
                  <BotonAccion tono="suave" tamano="chico" onClick={() => abrir(s)} icono={<Lapiz className="h-3.5 w-3.5" />}>
                    Editar
                  </BotonAccion>
                  <Pista texto={s.activa ? "Deja de aparecer para crear cuentas nuevas" : "Volver a usar esta sede"}>
                    <BotonAccion tono="suave" tamano="chico" onClick={() => alternarActiva(s, g.todos)}>
                      {s.activa ? "Desactivar" : "Activar"}
                    </BotonAccion>
                  </Pista>
                  <Link href="/equipo" className="ml-auto inline-flex items-center gap-1 px-2 text-chico font-bold text-marca-600 hover:text-marca-700">
                    Ver equipo <Flecha className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialogo
        abierto={Boolean(form)}
        onCerrar={() => setForm(null)}
        bloqueado={guardando}
        titulo={form?.id ? "Editar sede" : "Nueva sede"}
        icono={<Edificio className="h-5 w-5" />}
        pie={
          <>
            <BotonAccion tono="neutro" onClick={() => setForm(null)} disabled={guardando}>
              Cancelar
            </BotonAccion>
            <BotonAccion onClick={guardar} cargando={guardando} disabled={tocado.nombre && hayErrores}>
              {form?.id ? "Guardar cambios" : "Crear sede"}
            </BotonAccion>
          </>
        }
      >
        {form && (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              guardar();
            }}
          >
            {errorForm && <Aviso className="sm:col-span-2">{errorForm}</Aviso>}
            <Campo etiqueta="Nombre" htmlFor="nombre" requerido error={tocado.nombre ? errores.nombre : null} className="sm:col-span-2">
              <input
                id="nombre"
                autoFocus
                value={form.nombre}
                maxLength={60}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                onBlur={() => setTocado((t) => ({ ...t, nombre: true }))}
                aria-invalid={Boolean(tocado.nombre && errores.nombre)}
                placeholder="Ej: Sede Lima Centro"
                className="campo"
              />
            </Campo>
            <Campo etiqueta="Ciudad" htmlFor="ciudad" opcional>
              <input id="ciudad" value={form.ciudad} maxLength={60} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ej: Lima" className="campo" />
            </Campo>
            <Campo etiqueta="Teléfono" htmlFor="telefono" opcional error={tocado.telefono ? errores.telefono : null}>
              <input
                id="telefono"
                inputMode="tel"
                value={form.telefono}
                maxLength={20}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                onBlur={() => setTocado((t) => ({ ...t, telefono: true }))}
                aria-invalid={Boolean(tocado.telefono && errores.telefono)}
                placeholder="Ej: 01 4567890"
                className="campo cifras"
              />
            </Campo>
            <Campo etiqueta="Dirección" htmlFor="direccion" opcional className="sm:col-span-2">
              <input
                id="direccion"
                value={form.direccion}
                maxLength={120}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Ej: Av. Abancay 123"
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
