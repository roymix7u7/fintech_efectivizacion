"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseCliente, mensajeError } from "@/lib/cliente";
import { BANCOS_PRINCIPALES } from "@/lib/bancos";
import { validarCuenta, LARGO_AHORROS } from "@/lib/validacionesCliente";
import { Campo, Aviso, Cargando } from "@/components/cliente/piezas";
import MarcoFormulario, {
  Opcion,
  Pista,
  BotonEnviar,
  IlustracionBanco,
} from "@/components/cliente/formulario";
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

  // Cuántos dígitos tiene una cuenta de ese banco, para guiar al escribir.
  const esperados = cci ? [20] : LARGO_AHORROS[banco] || null;
  const textoLargo = esperados ? esperados.join(" o ") : "10 a 20";
  const mostrarError =
    intento || numero.length >= (cci ? 20 : Math.max(...(esperados || [10])));

  return (
    <PantallaCuenta activa="cuenta" sesion={sesion}>
      <MarcoFormulario
        ilustracion={<IlustracionBanco />}
        mensaje="Agrega tu cuenta bancaria de forma"
        resaltado="segura"
        texto="Aquí registras la cuenta donde depositaremos el dinero. Debe estar a tu nombre."
        condiciones={[
          {
            tono: "si",
            texto: "Cuenta a tu nombre",
            corto: "A tu nombre",
            detalle: "La misma persona que la cuenta de AlToque.",
          },
          {
            tono: "no",
            texto: "No depositamos a terceros",
            corto: "No a terceros",
            detalle: "Ni a familiares ni a empresas.",
          },
          {
            tono: "banco",
            texto: "1 de ahorros y 1 CCI por banco",
            corto: "1 por tipo",
            detalle: "La de ahorros es la que recibe el depósito.",
          },
          {
            tono: "info",
            texto: "Del mismo banco que tu tarjeta",
            corto: "Mismo banco",
            detalle: "Con CMR, iO u otro banco, te depositamos en cualquiera.",
          },
        ]}
        titulo="Agregar cuenta"
        subtitulo="Aquí te depositamos. Debe estar a tu nombre."
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
            <legend className="mb-2.5 text-sm font-semibold text-marca-900">
              Tipo
            </legend>
            <div
              className="grid grid-cols-2 gap-2.5"
              role="radiogroup"
              aria-label="Tipo de cuenta"
            >
              <Opcion
                activa={tipo === "ahorros"}
                deshabilitada={tomado(banco, "ahorros")}
                onClick={() => {
                  setTipo("ahorros");
                  setIntento(false);
                }}
                icono={<IconoAlcancia />}
                titulo="Cuenta de ahorros"
                detalle={
                  tomado(banco, "ahorros")
                    ? "Ya registrada"
                    : "Recibe los depósitos"
                }
              />
              <Opcion
                activa={tipo === "interbancaria"}
                deshabilitada={tomado(banco, "interbancaria")}
                onClick={() => {
                  setTipo("interbancaria");
                  setIntento(false);
                }}
                icono={<IconoTarjeta />}
                titulo="CCI"
                detalle={
                  tomado(banco, "interbancaria")
                    ? "Ya registrado"
                    : "Código interbancario, opcional"
                }
              />
            </div>
          </fieldset>

          <div>
            <Campo
              id="numero"
              etiqueta={
                cci
                  ? "CCI (20 dígitos)"
                  : `Número de cuenta de ahorros ${banco}`
              }
              inputMode="numeric"
              maxLength={20}
              placeholder={cci ? "20 dígitos" : `${textoLargo} dígitos`}
              prefijo={
                <IconoTarjeta className="-ml-0.5 mr-1 h-5 w-5 text-[#8A93A6]" />
              }
              value={numero}
              onChange={(e) =>
                setNumero(e.target.value.replace(/\D/g, "").slice(0, 20))
              }
              error={mostrarError ? error : null}
              ok={numero.length > 0 && !error}
              derecha={
                <span
                  className={cn(
                    "cifras mr-3.5 shrink-0 text-chico font-semibold",
                    !error ? "text-emerald-600" : "text-[#AFBCD0]",
                  )}
                >
                  {numero.length}/{esperados ? Math.max(...esperados) : 20}
                </span>
              }
            />
            <Pista>
              {cci
                ? "El CCI tiene 20 dígitos. Lo encuentras en la app de tu banco, en el detalle de la cuenta."
                : `Una cuenta de ahorros ${banco} tiene ${textoLargo} dígitos. Escribe solo los números, sin guiones.`}
            </Pista>
          </div>

          <BotonEnviar cargando={guardando}>Guardar cuenta</BotonEnviar>
        </form>
      </MarcoFormulario>
    </PantallaCuenta>
  );
}

function IconoAlcancia({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 10c.6-1.6 0-3-1-3.5-.7 1-1.7 1.5-3 1.5H9a6 6 0 0 0-6 6c0 1.9.9 3.6 2.3 4.7L6 21h3l.6-1.6h4.8L15 21h3l.8-2.3A6 6 0 0 0 21 14v-1h-1.5" />
      <path d="M8 11h4M15.5 12h.01" />
    </svg>
  );
}

function IconoTarjeta({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18v12H3z" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}
