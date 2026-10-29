"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseCliente, mensajeError } from "@/lib/cliente";
import { BANCOS_PRINCIPALES } from "@/lib/bancos";
import { validarCuenta } from "@/lib/validacionesCliente";
import {
  Marco,
  Campo,
  Boton,
  Aviso,
  Cargando,
} from "@/components/cliente/piezas";
import {
  useClienteActivo,
  PantallaCuenta,
  ElegirBanco,
} from "@/components/cliente/sesion";

/**
 * Agregar una cuenta para recibir depósitos, igual que la app
 * (app/app/cuenta-nueva.js). Por banco: una cuenta de ahorros (la que
 * recibe) y, opcional, su CCI. La base no deja repetir banco y tipo.
 */
export default function CuentaNuevaPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <CuentaNueva />
    </Suspense>
  );
}

function CuentaNueva() {
  const sesion = useClienteActivo();
  const router = useRouter();
  const params = useSearchParams();
  const [cuentas, setCuentas] = useState(null);
  const [banco, setBanco] = useState(
    BANCOS_PRINCIPALES.includes(params.get("banco"))
      ? params.get("banco")
      : "BCP",
  );
  const [tipo, setTipo] = useState(
    params.get("tipo") === "interbancaria" ? "interbancaria" : "ahorros",
  );
  const [numero, setNumero] = useState("");
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!sesion) return;
    supabaseCliente()
      .from("cuentas_bancarias")
      .select("id, banco, tipo, numero_cuenta")
      .eq("cliente_id", sesion.perfil.id)
      .eq("activa", true)
      .then(({ data }) => {
        const lista = data || [];
        setCuentas(lista);
        // Si el tipo pedido ya existe en ese banco, se abre en el otro.
        const tiene = (t) =>
          lista.some((x) => x.banco === banco && x.tipo === t);
        if (
          tiene(tipo) &&
          !tiene(tipo === "ahorros" ? "interbancaria" : "ahorros")
        )
          setTipo(tipo === "ahorros" ? "interbancaria" : "ahorros");
      });
    // Solo al cargar: después el banco y el tipo los elige la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  if (!sesion || !cuentas) return <Cargando />;

  const tomado = (b, t) => cuentas.some((c) => c.banco === b && c.tipo === t);
  const lleno = (b) => tomado(b, "ahorros") && tomado(b, "interbancaria");
  const cci = tipo === "interbancaria";
  const error = validarCuenta(numero, tipo, banco);

  function elegirBanco(b) {
    setBanco(b);
    setNumero("");
    setIntento(false);
    if (tomado(b, tipo))
      setTipo(tipo === "ahorros" ? "interbancaria" : "ahorros");
  }

  async function guardar(e) {
    e.preventDefault();
    setIntento(true);
    setAviso(null);
    if (tomado(banco, tipo))
      return setAviso({
        tono: "atencion",
        texto: `Ya tienes una cuenta ${cci ? "CCI" : "de ahorros"} ${banco}.`,
      });
    if (error) return;
    if (cuentas.some((c) => c.numero_cuenta.replace(/\D/g, "") === numero)) {
      return setAviso({
        tono: "atencion",
        texto: "Ese número de cuenta ya está registrado.",
      });
    }
    setGuardando(true);
    try {
      const { error: e2 } = await supabaseCliente()
        .from("cuentas_bancarias")
        .insert({
          cliente_id: sesion.perfil.id,
          banco,
          numero_cuenta: numero,
          tipo,
          activa: true,
        });
      if (e2) {
        if (e2.code === "23505")
          return setAviso({
            tono: "atencion",
            texto: "Ya tienes esa cuenta registrada.",
          });
        throw e2;
      }
      router.replace("/cuenta?aviso=cuenta");
    } catch (err) {
      setAviso({ tono: "error", texto: mensajeError(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PantallaCuenta activa="cuenta" sesion={sesion}>
      <Marco
        titulo="Agregar cuenta"
        subtitulo="Aquí te depositamos. Debe estar a tu nombre."
        ancho="max-w-xl"
      >
        <form onSubmit={guardar} noValidate className="space-y-6">
          {aviso && (
            <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>
              {aviso.texto}
            </Aviso>
          )}
          <ElegirBanco
            bancos={BANCOS_PRINCIPALES}
            valor={banco}
            onCambio={elegirBanco}
            deshabilitado={(b) =>
              lleno(b) ? `Ya tienes cuenta de ahorros y CCI en ${b}` : null
            }
          />

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Tipo</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[
                {
                  k: "ahorros",
                  t: "Cuenta de ahorros",
                  d: "Recibe los depósitos",
                },
                {
                  k: "interbancaria",
                  t: "CCI",
                  d: "Código interbancario, opcional",
                },
              ].map((o) => {
                const ocupado = tomado(banco, o.k);
                return (
                  <button
                    key={o.k}
                    type="button"
                    role="radio"
                    aria-checked={tipo === o.k}
                    disabled={ocupado}
                    onClick={() => {
                      setTipo(o.k);
                      setIntento(false);
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition",
                      tipo === o.k
                        ? "border-marca-900 bg-marca-900 text-white"
                        : "border-[#DCE3EE] hover:bg-[#F6F8FC]",
                      ocupado && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className="block font-semibold">{o.t}</span>
                    <span
                      className={cn(
                        "block text-chico",
                        tipo === o.k ? "text-white/70" : "text-[#8A93A6]",
                      )}
                    >
                      {ocupado ? "Ya registrada" : o.d}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Campo
            id="numero"
            etiqueta={
              cci ? "CCI (20 dígitos)" : `Número de cuenta de ahorros ${banco}`
            }
            inputMode="numeric"
            maxLength={20}
            placeholder={cci ? "20 dígitos" : "Solo números"}
            value={numero}
            onChange={(e) =>
              setNumero(e.target.value.replace(/\D/g, "").slice(0, 20))
            }
            error={intento || numero.length >= (cci ? 20 : 10) ? error : null}
            ok={numero.length > 0 && !error}
            ayuda={
              cci
                ? "Lo encuentras en la app de tu banco, en el detalle de la cuenta."
                : "La cuenta de ahorros es la que recibe tu dinero. El CCI solo es un dato extra."
            }
          />

          <Boton type="submit" cargando={guardando} className="w-full">
            Guardar cuenta
          </Boton>
        </form>
      </Marco>
    </PantallaCuenta>
  );
}
