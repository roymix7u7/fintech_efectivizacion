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
 * Solo avisa: decide el personal. `id` es el usuario o su perfil.
 * Sin la migración aplicada no muestra nada.
 */
export default function AlertasCliente({ id, className, onIdentidad }) {
  const [datos, setDatos] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [fallo, setFallo] = useState("");
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
    return data;
  }, [id]);

  const verificar = useCallback(
    async (userId, forzar = false) => {
      setConsultando(true);
      setFallo("");
      const { data, error } = await supabase.functions.invoke("verificar-dni", { body: { user_id: userId, forzar } });
      setConsultando(false);
      if (error) {
        let detalle = error.message;
        try {
          detalle = (await error.context?.json())?.error || detalle;
        } catch {}
        // Si la función todavía no está desplegada, se calla.
        if (!/not found|404/i.test(detalle)) setFallo(detalle);
        return;
      }
      if (data?.resultado === "error") setFallo(data.detalle || "No se pudo consultar el DNI.");
      await cargar();
    },
    [cargar],
  );

  useEffect(() => {
    let vivo = true;
    cargar().then((d) => {
      // La primera vez que se abre a este cliente (o si la última consulta
      // falló), se consulta su DNI. Un DNI ya consultado no gasta cuota.
      const falta = !d?.identidad || d.identidad.resultado === "error";
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
  const alertas = datos.alertas || [];
  const ident = datos.identidad;
  const identOk = ident?.resultado === "coincide";
  if (!alertas.length && !ident && !consultando && !fallo) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {consultando && <p className="text-chico text-muted-foreground">Consultando el DNI…</p>}
      {identOk && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-chico font-semibold text-emerald-800">
          <span aria-hidden="true">✓</span> El nombre coincide con el DNI.
        </p>
      )}
      {ident?.resultado === "no_aplica" && (
        <p className="text-chico text-muted-foreground">Carnet de extranjería: el nombre no se consulta en RENIEC.</p>
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
