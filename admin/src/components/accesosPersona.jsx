"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { NIVELES, claveDe, nivelDe } from "@/lib/permisos";
import { partesDe } from "@/lib/catalogoPermisos";
import { MENU, SECCIONES } from "@/components/shell";
import { Aviso } from "@/components/marca";
import { BotonAccion } from "@/components/carga";
import Desplegable from "@/components/desplegable";
import Pista from "@/components/pista";

/** Texto de un campo de IP (una por línea, o separadas por coma o espacio) a lista. */
export const aListaIps = (texto) =>
  String(texto || "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export const faltaMigracion = (e) =>
  e?.code === "PGRST202" || e?.code === "42P01" || /guardar_acceso|guardar_ips_sede|permisos_personal|accesos_personal/.test(e?.message || "");
export const AVISO_MIGRACION = "Falta aplicar en Supabase la migración 20261118000078_superadmin_y_permisos_detallados.sql.";

export const ROL_TEXTO = { admin: "Administrador", supervisor: "Supervisor", gestor: "Gestor", pagos: "Pagos" };

/**
 * Pantallas que se pueden configurar, agrupadas como en el menú. La
 * pantalla Accesos (solo super administrador) no entra: no se recorta.
 * Las que no salen en el menú (el chat) van al final, en "Otras".
 */
export function gruposDePantallas(rol) {
  const deRol = (s) => s.roles.includes(rol) && !s.soloSuperadmin;
  const grupos = MENU.map((e) => ({
    grupo: e.items ? e.grupo : null,
    items: (e.items || [e]).filter(deRol),
  }));
  grupos.push({ grupo: "Otras", items: SECCIONES.filter((s) => s.oculta && deRol(s)) });
  return grupos.filter((g) => g.items.length > 0);
}

/** Cuántos recortes tiene una persona (pantallas y partes). */
export const contarRecortes = (permisos) => Object.keys(permisos || {}).length;

/**
 * Campo para escribir IP permitidas, con la IP desde la que está
 * conectado quien configura (para agregarla de un clic cuando está en el
 * local).
 */
export function CampoIps({ id, valor, onCambio, miIp, deshabilitado }) {
  const lista = aListaIps(valor);
  const yaEsta = miIp && lista.includes(miIp);
  return (
    <div>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        disabled={deshabilitado}
        rows={3}
        spellCheck={false}
        placeholder={"Una IP por línea. Ej:\n190.235.10.20"}
        className="campo cifras min-h-[84px] resize-y py-2 font-mono text-sm"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-chico text-muted-foreground">
        {miIp ? (
          <>
            <span>
              Ahora estás conectado desde <span className="cifras font-semibold text-foreground">{miIp}</span>
            </span>
            {!yaEsta && !deshabilitado && (
              <button
                type="button"
                onClick={() => onCambio([...lista, miIp].join("\n"))}
                className="rounded font-semibold text-marca-600 underline underline-offset-2 hover:text-marca-700"
              >
                Agregar esta IP
              </button>
            )}
          </>
        ) : (
          <span>No se pudo detectar tu IP actual.</span>
        )}
      </div>
    </div>
  );
}

/** Interruptor de sí/no (role="switch"). */
export function Interruptor({ activo, deshabilitado, onCambio, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(activo)}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onCambio}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        activo ? "bg-emerald-600" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", activo ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

function Niveles({ valor, onCambio, deshabilitado, etiqueta }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex shrink-0 rounded-lg bg-muted p-0.5">
      {NIVELES.map((n) => (
        <button
          key={n.valor}
          type="button"
          role="radio"
          aria-checked={valor === n.valor}
          disabled={deshabilitado}
          onClick={() => onCambio(n.valor)}
          className={cn(
            "h-7 rounded-md px-2.5 text-chico font-semibold transition disabled:cursor-not-allowed",
            valor === n.valor
              ? n.valor === "no"
                ? "bg-red-600 text-white"
                : n.valor === "ver"
                  ? "bg-oro-500 text-marca-900"
                  : "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {n.corto}
        </button>
      ))}
    </div>
  );
}

function Escudito(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" />
    </svg>
  );
}

/**
 * Accesos de una persona del equipo: qué pantallas ve, qué partes de
 * cada una y desde qué red puede entrar. Solo el super administrador
 * (función guardar_acceso).
 *
 * Se recorta dentro de lo que trae su rol: nunca se le da más.
 *
 * `protegidas`: claves que la base también frena (tabla permisos_api);
 * se marcan con un escudo.
 * `otros`: el resto del personal, para copiar permisos de alguien del mismo rol.
 */
export function EditorAccesos({ persona, acceso, sedes, miId, miIp, protegidas, otros, onGuardado, onCambios }) {
  const original = useMemo(
    () => ({
      permisos: acceso?.permisos || {},
      ipSede: Boolean(acceso?.ip_sede),
      ips: (acceso?.ips || []).join("\n"),
    }),
    [acceso],
  );
  const [permisos, setPermisos] = useState(original.permisos);
  const [ipSede, setIpSede] = useState(original.ipSede);
  const [ips, setIps] = useState(original.ips);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPermisos(original.permisos);
    setIpSede(original.ipSede);
    setIps(original.ips);
    setError("");
  }, [persona?.id, original]);

  const yo = persona.id === miId;
  const sede = sedes.find((s) => s.id === persona.sede_id);
  const ipsDeSede = sede?.ips || [];
  const grupos = gruposDePantallas(persona.rol);

  const hayCambios =
    JSON.stringify(ordenar(permisos)) !== JSON.stringify(ordenar(original.permisos)) ||
    ipSede !== original.ipSede ||
    aListaIps(ips).join(",") !== aListaIps(original.ips).join(",");

  useEffect(() => {
    onCambios?.(hayCambios);
  }, [hayCambios, onCambios]);

  const fijarPantalla = (ruta, nivel) => {
    const k = claveDe(ruta);
    setPermisos((p) => {
      const n = { ...p };
      if (nivel === "editar") delete n[k];
      else n[k] = nivel;
      return n;
    });
  };
  const alternarParte = (clave) =>
    setPermisos((p) => {
      const n = { ...p };
      if (n[clave] === "no") delete n[clave];
      else n[clave] = "no";
      return n;
    });

  const mismos = otros.filter((o) => o.id !== persona.id && o.rol === persona.rol && contarRecortes(o.permisos) > 0);

  async function guardar() {
    setGuardando(true);
    setError("");
    // Solo se guardan recortes de pantallas y partes que su rol trae.
    const validas = new Set(
      grupos.flatMap((g) => g.items.flatMap((s) => [claveDe(s.ruta), ...partesDe(claveDe(s.ruta), persona.rol).map((x) => `${claveDe(s.ruta)}.${x.clave}`)])),
    );
    const limpios = Object.fromEntries(Object.entries(permisos).filter(([k]) => validas.has(k)));
    const { error: e } = await supabase.rpc("guardar_acceso", {
      p_user: persona.id,
      p_permisos: limpios,
      p_ip_sede: ipSede,
      p_ips: aListaIps(ips),
    });
    setGuardando(false);
    if (e) return setError(faltaMigracion(e) ? AVISO_MIGRACION : e.code === "P0001" || e.code === "42501" ? e.message : "No se pudo guardar: " + e.message);
    onGuardado(`Accesos de ${nombreDe(persona)} guardados. Los verá la próxima vez que cargue el panel.`);
  }

  const recortes = contarRecortes(permisos);
  const libre = !ipSede && aListaIps(ips).length === 0;

  return (
    <div className="space-y-6">
      {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}

      {/* ── Pantallas y partes ── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="font-heading text-md font-semibold">Pantallas y permisos</h3>
          <p className="text-chico text-muted-foreground">
            {recortes === 0 ? `Como el perfil de ${ROL_TEXTO[persona.rol] || persona.rol}.` : `${recortes} ${recortes === 1 ? "recorte" : "recortes"} sobre su perfil.`}
          </p>
          {!yo && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {mismos.length > 0 && (
                <Desplegable
                  id="copiarDe"
                  variante="panel"
                  className="h-8 w-48 py-0.5 text-chico"
                  aria-label="Copiar permisos de otra persona"
                  valor=""
                  onCambio={(v) => {
                    const o = mismos.find((x) => x.id === v);
                    if (o) setPermisos({ ...(o.permisos || {}) });
                  }}
                  opciones={[{ valor: "", texto: "Copiar permisos de…" }, ...mismos.map((o) => ({ valor: o.id, texto: nombreDe(o) }))]}
                />
              )}
              {recortes > 0 && (
                <button
                  type="button"
                  onClick={() => setPermisos({})}
                  className="h-8 rounded-lg px-2.5 text-chico font-semibold text-marca-600 hover:bg-marca-50"
                >
                  Volver al perfil base
                </button>
              )}
            </div>
          )}
        </div>
        {yo && (
          <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-chico text-muted-foreground">
            No puedes quitarte permisos a ti mismo. Sí puedes fijar desde qué red entras (más abajo).
          </p>
        )}

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {grupos.map((g) => (
            <div key={g.grupo || g.items[0].ruta}>
              {g.grupo && <p className="t-etiqueta bg-muted/50 px-3 py-1.5">{g.grupo}</p>}
              <ul className="divide-y divide-border/70">
                {g.items.map((s) => {
                  const k = claveDe(s.ruta);
                  const nivel = nivelDe(permisos, s.ruta);
                  const partes = partesDe(k, persona.rol);
                  return (
                    <li key={s.ruta} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-semibold">
                            {s.titulo}
                            {protegidas.has(k) && <Protegida />}
                          </p>
                          {s.detalle && <p className="truncate text-chico text-muted-foreground">{s.detalle}</p>}
                        </div>
                        <Niveles valor={nivel} onCambio={(v) => fijarPantalla(s.ruta, v)} deshabilitado={yo} etiqueta={`Acceso a ${s.titulo}`} />
                      </div>
                      {partes.length > 0 && nivel !== "no" && (
                        <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
                          {partes.map((x) => {
                            const clave = `${k}.${x.clave}`;
                            const activa = permisos[clave] !== "no";
                            const apagadaPorLectura = nivel === "ver" && x.tipo === "accion";
                            return (
                              <li key={clave} className="flex items-center gap-3 py-0.5">
                                <div className="min-w-0 flex-1">
                                  <p className={cn("flex flex-wrap items-center gap-x-1.5 text-sm", !activa || apagadaPorLectura ? "text-muted-foreground" : "")}>
                                    {x.titulo}
                                    <span className="rounded bg-muted px-1 py-px text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                      {x.tipo === "vista" ? "Vista" : "Acción"}
                                    </span>
                                    {protegidas.has(clave) && <Protegida />}
                                  </p>
                                  {(x.detalle || apagadaPorLectura) && (
                                    <p className="text-chico text-muted-foreground">
                                      {apagadaPorLectura ? "Apagada: la pantalla está en solo lectura." : x.detalle}
                                    </p>
                                  )}
                                </div>
                                <Interruptor
                                  activo={activa && !apagadaPorLectura}
                                  deshabilitado={yo || apagadaPorLectura}
                                  onCambio={() => alternarParte(clave)}
                                  etiqueta={`${x.titulo}: ${activa ? "permitido" : "quitado"}`}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-1 text-chico text-muted-foreground">
          Solo aparece lo que trae su rol; para darle más hay que cambiarle el rol en Equipo.
          <span className="inline-flex items-center gap-1">
            <Escudito className="h-3.5 w-3.5 text-marca-600" /> = la base de datos también lo frena.
          </span>
        </p>
      </section>

      {/* ── Red ── */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
          <h3 className="font-heading text-md font-semibold">Desde dónde puede entrar</h3>
          <p className="text-chico text-muted-foreground">{libre ? "Libre: entra desde cualquier red." : "Solo desde las IP indicadas."}</p>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={ipSede}
            onChange={(e) => setIpSede(e.target.checked)}
            disabled={!sede}
            className="mt-0.5 h-4 w-4 accent-marca-700"
          />
          <span className="min-w-0 text-sm">
            <span className="font-medium">Solo desde las IP de su sede{sede ? ` (${sede.nombre})` : ""}</span>
            <span className="mt-0.5 block text-chico text-muted-foreground">
              {!sede
                ? "No tiene sede asignada."
                : ipsDeSede.length
                  ? `IP de la sede: ${ipsDeSede.join(", ")}`
                  : "La sede todavía no tiene IP: mientras tanto esta opción no restringe. Agrégalas en la pestaña IP de las sedes."}
            </span>
          </span>
        </label>
        <label htmlFor="ipsPersona" className="mb-1 mt-3 block text-sm font-medium">
          IP propias de esta persona <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <CampoIps id="ipsPersona" valor={ips} onCambio={setIps} miIp={miIp} />
        <p className="mt-2 text-chico text-muted-foreground">
          Sin la casilla y sin IP propias, entra libre. Si la IP del local cambia, esta persona no podrá entrar hasta que la actualices aquí.
        </p>
      </section>

      {/* ── Guardar ── */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <p className="mr-auto text-chico text-muted-foreground">{hayCambios ? "Hay cambios sin guardar." : "Sin cambios."}</p>
        {hayCambios && (
          <BotonAccion
            tono="neutro"
            onClick={() => {
              setPermisos(original.permisos);
              setIpSede(original.ipSede);
              setIps(original.ips);
            }}
            disabled={guardando}
          >
            Descartar
          </BotonAccion>
        )}
        <BotonAccion onClick={guardar} cargando={guardando} disabled={!hayCambios}>
          Guardar accesos
        </BotonAccion>
      </div>
    </div>
  );
}

function Protegida() {
  return (
    <Pista texto="La base de datos también lo frena: no sirve llamarlo a mano.">
      <span className="inline-flex text-marca-600">
        <Escudito className="h-3.5 w-3.5" />
      </span>
    </Pista>
  );
}

export const nombreDe = (p) => String(p?.email || "").split("@")[0] || "esta persona";

const ordenar = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
