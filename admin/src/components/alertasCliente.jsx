"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Avisos sobre un cliente (migración 079), arriba de su ficha:
 *   · Nombre contra DNI (función verificar-dni; se consulta sola la
 *     primera vez y queda guardada).
 *   · Su DNI, celular o cuentas en la lista de bloqueo.
 *   · Su celular o sus cuentas registrados también por otro cliente.
 *
 * Si el nombre es parecido (error de tipeo) o le falta una parte,
 * `puedeCorregir` muestra "Usar el nombre del DNI": lo reemplaza por el
 * oficial con un clic. Si es otra persona no se ofrece: se observa.
 *
 * Solo avisa: decide el personal. `id` es el usuario o su perfil.
 * Sin la migración aplicada no muestra nada.
 */

// Lo mismo que compara la función: sin tildes, mayúsculas, sin "DE", "LA"...
const SOBRAN = new Set(["DE", "LA", "DEL", "LOS", "LAS", "Y", "VDA"]);
const normal = (w) =>
  String(w || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

/** El nombre con las palabras que no están en el otro, resaltadas. */
function Resaltado({ texto, contra }) {
  const otras = new Set(String(contra || "").split(/\s+/).map(normal));
  return String(texto || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const n = normal(w);
      const distinta = n && !SOBRAN.has(n) && !otras.has(n);
      return (
        <span key={i}>
          {i > 0 && " "}
          <span className={distinta ? "rounded bg-oro-200/80 px-0.5 font-bold text-oro-900 underline decoration-oro-600 decoration-2 underline-offset-2" : ""}>{w}</span>
        </span>
      );
    });
}

const TEXTO_IDENTIDAD = {
  parecido: "El nombre se parece al del DNI, pero tiene letras distintas.",
  parcial: "El nombre coincide solo en parte con el DNI.",
  no_coincide: "El nombre registrado no coincide con el del DNI.",
};

export default function AlertasCliente({ id, className, onIdentidad, puedeCorregir = false, onCorregido }) {
  const [datos, setDatos] = useState(null);
  const [registrado, setRegistrado] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [fallo, setFallo] = useState("");
  const [falloCorregir, setFalloCorregir] = useState("");
  const pedido = useRef(null);
  // Para que la ficha pueda mostrar el resultado junto al nombre.
  const avisar = useRef(onIdentidad);
  avisar.current = onIdentidad;

  const cargar = useCallback(async () => {
    if (!id) return null;
    const { data, error } = await supabase.rpc("alertas_cliente", { p_id: id });
    if (error) {
      setDatos(null);
      return null;
    }
    setDatos(data);
    avisar.current?.(data?.identidad || null);
    // El nombre que escribió, para resaltar la diferencia.
    if (data?.user_id && data.identidad && data.identidad.resultado !== "coincide") {
      const { data: p } = await supabase.from("perfiles_cliente").select("nombres, apellidos").eq("user_id", data.user_id).maybeSingle();
      setRegistrado(p ? `${p.nombres || ""} ${p.apellidos || ""}`.trim() : "");
    }
    return data;
  }, [id]);

  const llamar = useCallback(async (cuerpo) => {
    const { data, error } = await supabase.functions.invoke("verificar-dni", { body: cuerpo });
    if (!error) return { data };
    let detalle = error.message;
    try {
      detalle = (await error.context?.json())?.error || detalle;
    } catch {}
    return { error: detalle };
  }, []);

  const verificar = useCallback(
    async (userId, forzar = false) => {
      setConsultando(true);
      setFallo("");
      const { data, error } = await llamar({ user_id: userId, forzar });
      setConsultando(false);
      if (error) {
        // Si la función todavía no está desplegada, se calla.
        if (!/not found|404/i.test(error)) setFallo(error);
        return;
      }
      if (data?.resultado === "error") setFallo(data.detalle || "No se pudo consultar el DNI.");
      await cargar();
    },
    [cargar, llamar],
  );

  async function usarOficial() {
    if (!datos?.user_id) return;
    setCorrigiendo(true);
    setFalloCorregir("");
    const { error } = await llamar({ user_id: datos.user_id, accion: "usar_oficial" });
    setCorrigiendo(false);
    if (error) return setFalloCorregir(error);
    await cargar();
    onCorregido?.();
  }

  useEffect(() => {
    let vivo = true;
    cargar().then((d) => {
      // Se consulta la primera vez, si la última falló, o si no coincidió
      // (por si el cliente corrigió su nombre). Un DNI ya consultado sale
      // de la memoria y no gasta cuota.
      const r = d?.identidad?.resultado;
      const falta = !r || ["error", "no_coincide", "parcial"].includes(r);
      if (vivo && d && d.dni_peruano && falta && d.user_id && pedido.current !== d.user_id) {
        pedido.current = d.user_id;
        verificar(d.user_id);
      }
    });
    return () => {
      vivo = false;
    };
  }, [cargar, verificar]);

  if (!datos) return null;
  // La identidad se pinta aparte (con la diferencia resaltada).
  const alertas = (datos.alertas || []).filter((a) => a.tipo !== "identidad");
  const ident = datos.identidad;
  const res = ident?.resultado;
  const conDiferencia = ["parecido", "parcial", "no_coincide"].includes(res);
  if (!alertas.length && !ident && !consultando && !fallo) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {consultando && <p className="text-chico text-muted-foreground">Consultando el DNI…</p>}
      {res === "coincide" && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-chico font-semibold text-emerald-800">
          <span aria-hidden="true">✓</span> El nombre coincide con el DNI.
        </p>
      )}
      {res === "no_aplica" && <p className="text-chico text-muted-foreground">Carnet de extranjería: el nombre no se consulta en RENIEC.</p>}
      {res === "no_encontrado" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">El DNI no aparece en la consulta: puede no existir.</p>
        </div>
      )}

      {conDiferencia && (
        <div
          role={res === "no_coincide" ? "alert" : undefined}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm",
            res === "no_coincide" ? "border-red-200 bg-red-50 text-red-800" : "border-oro-300 bg-oro-50 text-oro-800",
          )}
        >
          <p className="font-semibold">{TEXTO_IDENTIDAD[res]}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-chico">
            {registrado && (
              <>
                <dt className="opacity-75">Registró</dt>
                <dd className="font-medium text-foreground">
                  <Resaltado texto={registrado} contra={ident.nombre_oficial} />
                </dd>
              </>
            )}
            <dt className="opacity-75">Según DNI</dt>
            <dd className="font-medium text-foreground">
              <Resaltado texto={ident.nombre_oficial} contra={registrado} />
            </dd>
          </dl>
          {res === "no_coincide" ? (
            <p className="mt-1.5 text-chico">Puede estar usando el DNI de otra persona: obsérvalo y pide su propio documento.</p>
          ) : (
            puedeCorregir && (
              <button
                type="button"
                onClick={usarOficial}
                disabled={corrigiendo}
                className="pulsable mt-2 inline-flex items-center gap-1.5 rounded-lg bg-marca-700 px-3 py-1.5 text-chico font-semibold text-white transition hover:bg-marca-800 disabled:opacity-60"
              >
                {corrigiendo ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                Usar el nombre del DNI
              </button>
            )
          )}
          {falloCorregir && <p className="mt-1.5 text-chico font-semibold text-red-700">{falloCorregir}</p>}
        </div>
      )}

      {alertas.map((a, i) => (
        <div
          key={i}
          role={a.nivel === "rojo" ? "alert" : undefined}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            a.nivel === "rojo" ? "border-red-200 bg-red-50 text-red-800" : "border-oro-300 bg-oro-50 text-oro-800",
          )}
        >
          <p className="font-semibold">{a.texto}</p>
          {a.otros?.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-chico">
              {a.otros.slice(0, 5).map((o) => (
                <li key={o.user_id}>
                  {o.nombre || "Sin nombre"} · DNI <span className="cifras">{o.dni || "—"}</span>
                </li>
              ))}
              {a.otros.length > 5 && <li>y {a.otros.length - 5} más</li>}
            </ul>
          )}
        </div>
      ))}
      {fallo && (
        <p className="flex flex-wrap items-center gap-x-2 text-chico text-muted-foreground">
          No se pudo verificar el DNI: {fallo}
          {datos.user_id && (
            <button type="button" onClick={() => verificar(datos.user_id, true)} className="font-semibold text-marca-600 underline underline-offset-2">
              Reintentar
            </button>
          )}
        </p>
      )}
    </div>
  );
}
