"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { NIVELES, claveDe, nivelDe } from "@/lib/permisos";
import { MENU } from "@/components/shell";
import { Aviso } from "@/components/marca";
import { BotonAccion } from "@/components/carga";
import { Dialogo } from "@/components/piezas";

/** Texto de un campo de IP (una por línea, o separadas por coma o espacio) a lista. */
export const aListaIps = (texto) =>
  String(texto || "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const faltaMigracion = (e) => e?.code === "PGRST202" || e?.code === "42P01" || /guardar_acceso|guardar_ips_sede|permisos_personal/.test(e?.message || "");
export const AVISO_MIGRACION = "Falta aplicar en Supabase la migración 20261117000077_accesos_e_ip.sql.";

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

/**
 * Accesos de una persona del equipo: qué pantallas ve y desde qué red
 * puede entrar. Solo el administrador (función guardar_acceso).
 *
 * Las pantallas que se listan son las que trae su rol: aquí se recorta
 * (no ve / solo ve), nunca se le da más de lo que su rol permite.
 */
export default function AccesosPersona({ persona, sedes, miId, miIp, onCerrar, onGuardado }) {
  const [permisos, setPermisos] = useState({});
  const [ipSede, setIpSede] = useState(false);
  const [ips, setIps] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const abierto = Boolean(persona);
  const yo = persona?.id === miId;
  const sede = sedes.find((s) => s.id === persona?.sede_id);
  const ipsDeSede = sede?.ips || [];

  useEffect(() => {
    if (!persona) return;
    let vivo = true;
    setCargando(true);
    setError("");
    supabase
      .from("permisos_personal")
      .select("permisos, ip_sede, ips")
      .eq("user_id", persona.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) setError(faltaMigracion(e) ? AVISO_MIGRACION : "No se pudieron leer sus accesos: " + e.message);
        setPermisos(data?.permisos || {});
        setIpSede(Boolean(data?.ip_sede));
        setIps((data?.ips || []).join("\n"));
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [persona]);

  // Las pantallas de su rol, en el orden del menú.
  const grupos = persona
    ? MENU.map((e) => ({
        grupo: e.items ? e.grupo : null,
        items: (e.items || [e]).filter((s) => s.roles.includes(persona.rol)),
      })).filter((g) => g.items.length > 0)
    : [];

  const fijar = (ruta, nivel) => {
    const k = claveDe(ruta);
    setPermisos((p) => {
      const n = { ...p };
      if (nivel === "editar") delete n[k];
      else n[k] = nivel;
      return n;
    });
  };

  async function guardar() {
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.rpc("guardar_acceso", {
      p_user: persona.id,
      p_permisos: permisos,
      p_ip_sede: ipSede,
      p_ips: aListaIps(ips),
    });
    setGuardando(false);
    if (e) return setError(faltaMigracion(e) ? AVISO_MIGRACION : e.code === "P0001" || e.code === "42501" ? e.message : "No se pudo guardar: " + e.message);
    onGuardado(`Accesos de ${(persona.email || "").split("@")[0]} actualizados. ${yo ? "" : "Los verá la próxima vez que cargue el panel."}`.trim());
  }

  const recortes = Object.keys(permisos).length;
  const libre = !ipSede && aListaIps(ips).length === 0;

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={persona ? `Accesos de ${(persona.email || "").split("@")[0]}` : ""}
      descripcion="Qué pantallas ve y desde qué red puede entrar al panel."
      ancho="max-w-2xl"
      bloqueado={guardando}
      pie={
        <>
          <BotonAccion lectura tono="neutro" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonAccion>
          <BotonAccion onClick={guardar} cargando={guardando} disabled={cargando}>
            Guardar accesos
          </BotonAccion>
        </>
      }
    >
      {persona && (
        <div className="space-y-6">
          {error && <Aviso>{error}</Aviso>}

          {/* ── Pantallas ── */}
          <section>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
              <h3 className="font-heading text-md font-semibold">Pantallas</h3>
              <p className="text-chico text-muted-foreground">
                {recortes === 0 ? "Como las trae su rol." : `${recortes} ${recortes === 1 ? "pantalla recortada" : "pantallas recortadas"}.`}
              </p>
            </div>
            {yo && (
              <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-chico text-muted-foreground">
                No puedes quitarte pantallas a ti mismo: tendría que hacerlo otro administrador.
              </p>
            )}
            <div className="divide-y divide-border rounded-xl border border-border">
              {grupos.map((g) => (
                <div key={g.grupo || g.items[0].ruta} className="px-3 py-2">
                  {g.grupo && <p className="t-etiqueta mb-1 pt-1">{g.grupo}</p>}
                  <ul>
                    {g.items.map((s) => {
                      const nivel = nivelDe(permisos, s.ruta);
                      return (
                        <li key={s.ruta} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                          <span className="min-w-0 flex-1 text-sm font-medium">{s.titulo}</span>
                          <div role="radiogroup" aria-label={`Acceso a ${s.titulo}`} className="inline-flex rounded-lg bg-muted p-0.5">
                            {NIVELES.map((n) => (
                              <button
                                key={n.valor}
                                type="button"
                                role="radio"
                                aria-checked={nivel === n.valor}
                                disabled={yo || cargando}
                                onClick={() => fijar(s.ruta, n.valor)}
                                className={cn(
                                  "h-7 rounded-md px-2.5 text-chico font-semibold transition disabled:cursor-not-allowed",
                                  nivel === n.valor
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
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-2 text-chico text-muted-foreground">
              Solo aparecen las pantallas de su rol. Para darle una que no está aquí hay que cambiarle el rol.
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
                disabled={cargando || !sede}
                className="mt-0.5 h-4 w-4 accent-marca-700"
              />
              <span className="min-w-0 text-sm">
                <span className="font-medium">Solo desde las IP de su sede{sede ? ` (${sede.nombre})` : ""}</span>
                <span className="mt-0.5 block text-chico text-muted-foreground">
                  {!sede
                    ? "No tiene sede asignada."
                    : ipsDeSede.length
                      ? `IP de la sede: ${ipsDeSede.join(", ")}`
                      : "La sede todavía no tiene IP configuradas: mientras tanto esta opción no restringe. Agrégalas en Sedes."}
                </span>
              </span>
            </label>
            <label htmlFor="ipsPersona" className="mb-1 mt-3 block text-sm font-medium">
              IP propias de esta persona <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <CampoIps id="ipsPersona" valor={ips} onCambio={setIps} miIp={miIp} deshabilitado={cargando} />
            <p className="mt-2 text-chico text-muted-foreground">
              Sin la casilla y sin IP propias, entra libre. Si la IP del local cambia, esta persona no podrá entrar hasta que la actualices aquí.
            </p>
          </section>
        </div>
      )}
    </Dialogo>
  );
}
