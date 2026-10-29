"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  supabaseCliente,
  subirImagen,
  borrarImagenes,
  mensajeError,
} from "@/lib/cliente";
import { ORDEN_BANCOS, nombreBanco } from "@/lib/bancos";
import { validarUltimos4 } from "@/lib/validacionesCliente";
import { SeguridadFotos, EjemploFotoTarjeta } from "@/components/cliente/fotos";
import MarcoFormulario, {
  BotonEnviar,
  IlustracionTarjeta,
} from "@/components/cliente/formulario";
import { Campo, Aviso, Cargando } from "@/components/cliente/piezas";
import {
  useClienteActivo,
  PantallaCuenta,
  ElegirBanco,
  VistaTarjeta,
  FotoUnica,
} from "@/components/cliente/sesion";

/**
 * Registrar una tarjeta, igual que la app (app/app/tarjeta-nueva.js):
 * banco, últimos 4, nombre impreso y una foto donde se lean el nombre y
 * los últimos 4 (del plástico o una captura de la app del banco). Una
 * segunda foto es opcional. Queda en revisión hasta que el equipo la
 * verifique.
 */
const BUCKET = "tarjetas-fotos";

export default function TarjetaNuevaPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <TarjetaNueva />
    </Suspense>
  );
}

function TarjetaNueva() {
  const sesion = useClienteActivo();
  const router = useRouter();
  const pedido = useSearchParams().get("banco");
  const [tarjetas, setTarjetas] = useState([]);
  const [banco, setBanco] = useState(
    ORDEN_BANCOS.includes(pedido) ? pedido : null,
  );
  const [ultimos4, setUltimos4] = useState("");
  const [nombre, setNombre] = useState("");
  const [frente, setFrente] = useState(null);
  const [reverso, setReverso] = useState(null);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!sesion) return;
    const { perfil } = sesion;
    // Casi siempre el nombre impreso es el del titular.
    setNombre(
      (n) => n || `${perfil.nombres} ${perfil.apellidos}`.toUpperCase(),
    );
    supabaseCliente()
      .from("tarjetas")
      .select("banco, ultimos_4, estado")
      .eq("cliente_id", perfil.id)
      .eq("activa", true)
      .then(({ data }) => setTarjetas(data || []));
  }, [sesion]);

  if (!sesion) return <Cargando />;

  const errorUltimos =
    ultimos4.length === 4
      ? validarUltimos4(ultimos4)
      : intento
        ? "Escribe los 4 últimos dígitos."
        : null;
  const nombreOk = nombre.trim().length >= 3;
  const falta = !banco
    ? "Elige el banco."
    : ultimos4.length !== 4
      ? "Escribe los últimos 4 dígitos."
      : !nombreOk
        ? "Escribe el nombre impreso en la tarjeta."
        : !frente
          ? "Agrega la foto de la tarjeta."
          : null;

  async function enviar(e) {
    e.preventDefault();
    setIntento(true);
    setAviso(null);
    if (falta) return setAviso({ tono: "atencion", texto: falta });
    // El mismo plástico no se registra dos veces.
    if (
      tarjetas.some(
        (t) =>
          t.banco === banco &&
          t.ultimos_4 === ultimos4 &&
          t.estado !== "rechazado",
      )
    ) {
      return setAviso({
        tono: "atencion",
        texto: `Ya registraste una tarjeta ${nombreBanco(banco)} terminada en ${ultimos4}.`,
      });
    }

    setGuardando(true);
    const subidos = [];
    try {
      const { usuario, perfil } = sesion;
      const sello = Date.now();
      subidos.push(
        await subirImagen(
          BUCKET,
          `${usuario.id}/${sello}-frente.jpg`,
          frente.blob,
        ),
      );
      let pathReverso = null;
      if (reverso) {
        pathReverso = await subirImagen(
          BUCKET,
          `${usuario.id}/${sello}-reverso.jpg`,
          reverso.blob,
        );
        subidos.push(pathReverso);
      }
      // Se guarda el path, no una URL firmada que caduca.
      const { error } = await supabaseCliente().from("tarjetas").insert({
        cliente_id: perfil.id,
        banco,
        ultimos_4: ultimos4,
        nombre_impreso: nombre.trim().toUpperCase(),
        foto_tarjeta: subidos[0],
        foto_reverso: pathReverso,
        estado: "pendiente",
        activa: true,
      });
      if (error) throw error;
      router.replace("/cuenta?aviso=tarjeta");
    } catch (err) {
      await borrarImagenes(BUCKET, subidos);
      setAviso({ tono: "error", texto: mensajeError(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PantallaCuenta activa="tarjeta" sesion={sesion}>
      <MarcoFormulario
        ilustracion={<IlustracionTarjeta />}
        mensaje="Registra tu tarjeta de forma"
        resaltado="segura"
        texto="Una persona de nuestro equipo la verifica antes de que puedas operar con ella."
        condiciones={[
          {
            tono: "si",
            texto: "Tarjeta de crédito a tu nombre",
            corto: "A tu nombre",
            detalle: "Comparamos el nombre con tu documento.",
          },
          {
            tono: "no",
            texto: "No aceptamos tarjetas de terceros",
            corto: "No de terceros",
            detalle: "Ni de familiares ni de empresas.",
          },
          {
            tono: "candado",
            texto: "No se edita ni se elimina",
            corto: "No se edita",
            detalle: "Puedes agregar todas las que tengas.",
          },
          {
            tono: "info",
            texto: "Para darla de baja, habla con un asesor",
            corto: "Baja con un asesor",
            detalle: "Por WhatsApp o en nuestros locales.",
          },
        ]}
        titulo="Agregar tarjeta"
        subtitulo="Tarjeta de crédito a tu nombre."
      >
        <form onSubmit={enviar} noValidate className="space-y-6">
          {aviso && (
            <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>
              {aviso.texto}
            </Aviso>
          )}
          <ElegirBanco
            bancos={ORDEN_BANCOS}
            valor={banco}
            onCambio={setBanco}
          />
          <div className="grid items-center gap-5 md:grid-cols-[260px_1fr]">
            <div className="hidden md:block">
              <VistaTarjeta banco={banco} ultimos4={ultimos4} nombre={nombre} />
            </div>
            <div className="space-y-4">
              <Campo
                id="ultimos4"
                etiqueta="Últimos 4 dígitos"
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                value={ultimos4}
                onChange={(e) =>
                  setUltimos4(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                error={errorUltimos}
                ok={ultimos4.length === 4 && !errorUltimos}
              />
              <Campo
                id="nombre"
                etiqueta="Nombre impreso en la tarjeta"
                autoComplete="cc-name"
                value={nombre}
                maxLength={60}
                onChange={(e) => setNombre(e.target.value.toUpperCase())}
                error={
                  intento && !nombreOk
                    ? "Escribe el nombre como aparece en la tarjeta."
                    : null
                }
                ok={nombreOk}
              />
            </div>
          </div>

          <SeguridadFotos tipo="tarjeta" />

          <EjemploFotoTarjeta />

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FotoUnica
              id="foto-frente"
              forma="tarjeta"
              titulo="Foto de la tarjeta"
              ayuda="Frente o captura de la app del banco."
              consejos={[
                "Que se lean tu nombre y los últimos 4 dígitos.",
                "Tapa el resto del número con un papel o con el dedo.",
                "Nunca muestres el código de seguridad (CVV).",
                "También sirve una captura de la app de tu banco.",
              ]}
              foto={frente}
              onCambio={setFrente}
              deshabilitado={guardando}
            />
            <FotoUnica
              id="foto-reverso"
              forma="tarjeta"
              titulo="Segunda foto"
              opcional
              ayuda="Reverso u otra captura, si ayuda."
              consejos={[
                "Si es el reverso, tapa el código de seguridad (CVV).",
                "Sirve otra captura de la app del banco con tu nombre.",
              ]}
              foto={reverso}
              onCambio={setReverso}
              deshabilitado={guardando}
            />
          </div>

          <BotonEnviar tono="oro" cargando={guardando}>
            {guardando ? "Enviando..." : "Enviar a verificación"}
          </BotonEnviar>
        </form>
      </MarcoFormulario>
    </PantallaCuenta>
  );
}
