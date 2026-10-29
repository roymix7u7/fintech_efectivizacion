"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  supabaseCliente,
  subirImagen,
  borrarImagenes,
  generarCodigo,
  plazoDeposito,
  mensajeError,
  marcarAlertasVistas,
} from "@/lib/cliente";
import {
  cuentasDeDeposito,
  faltaParaRecibir,
  nombreBanco,
  BANCOS_PRINCIPALES,
} from "@/lib/bancos";
import { Marco, Boton, Aviso, Cargando } from "@/components/cliente/piezas";
import {
  useClienteActivo,
  PantallaCuenta,
  FotoUnica,
} from "@/components/cliente/sesion";

/**
 * Nueva solicitud, igual que la app (app/app/nueva-solicitud.js):
 *   1. Elegir una tarjeta verificada que tenga dónde recibir el depósito.
 *   2. Pagar con ella siguiendo la guía del banco.
 *   3. Adjuntar el comprobante (y una nota, si hace falta).
 * Antes de enviar se avisa de cualquier alerta crítica en curso, por si
 * justo ese banco está con problemas.
 */
const BUCKET = "comprobantes";
const MAX_NOTA = 300;
const soles = (n) =>
  `S/ ${Number(n).toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const porcentaje = (v) =>
  Number(v)
    .toFixed(2)
    .replace(/\.?0+$/, "");

export default function SolicitudNuevaPage() {
  const sesion = useClienteActivo();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [tarjeta, setTarjeta] = useState(null);
  const [guia, setGuia] = useState(undefined); // undefined: cargando; null: no hay
  const [comprobante, setComprobante] = useState(null);
  const [nota, setNota] = useState("");
  const [urgentes, setUrgentes] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [enviada, setEnviada] = useState(null);
  // Candado contra el doble clic: el estado tarda un render en llegar.
  const enCurso = useRef(false);

  useEffect(() => {
    if (!sesion) return;
    const sb = supabaseCliente();
    (async () => {
      try {
        const [t, c, com] = await Promise.all([
          sb
            .from("tarjetas")
            .select("id, banco, ultimos_4")
            .eq("cliente_id", sesion.perfil.id)
            .eq("activa", true)
            .eq("estado", "aprobado")
            .order("created_at", { ascending: false }),
          sb
            .from("cuentas_bancarias")
            .select("id, banco, tipo, numero_cuenta")
            .eq("cliente_id", sesion.perfil.id)
            .eq("activa", true),
          sb.rpc("mis_comisiones"),
        ]);
        if (t.error || c.error) throw t.error || c.error;
        const tarjetas = t.data || [];
        setDatos({
          tarjetas,
          cuentas: c.data || [],
          comisiones: com.data?.bancos || [],
        });
        // Con una sola tarjeta no hay nada que decidir.
        if (tarjetas.length === 1) setTarjeta(tarjetas[0]);
      } catch (e) {
        setError(mensajeError(e));
      }
    })();
  }, [sesion]);

  // La guía de pago del banco de la tarjeta elegida.
  const bancoTarjeta = tarjeta?.banco || null;
  useEffect(() => {
    if (!bancoTarjeta) return;
    setGuia(undefined);
    supabaseCliente()
      .from("guias_banco")
      .select("pasos")
      .eq("banco", bancoTarjeta)
      .eq("activa", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) =>
        setGuia(
          data
            ? [...(data.pasos || [])].sort((a, b) => a.orden - b.orden)
            : null,
        ),
      );
  }, [bancoTarjeta]);

  // Si se sale con el comprobante cargado, el navegador pregunta antes.
  useEffect(() => {
    if (!comprobante || enviada) return;
    const avisar = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [comprobante, enviada]);

  if (!sesion || (!datos && !error)) return <Cargando />;

  if (enviada) return <Enviada codigo={enviada} sesion={sesion} />;

  const { tarjetas = [], cuentas = [], comisiones = [] } = datos || {};
  const destinos = cuentasDeDeposito(bancoTarjeta, cuentas);
  const falta = faltaParaRecibir(bancoTarjeta, cuentas);
  const tarifa = comisiones.find((c) => c.banco === bancoTarjeta);
  const comision = tarifa?.porcentaje;
  const destinoTexto = !destinos.length
    ? null
    : BANCOS_PRINCIPALES.includes(bancoTarjeta)
      ? `tu cuenta de ahorros ${bancoTarjeta}`
      : destinos.length === 1
        ? `tu cuenta de ahorros ${destinos[0].banco}`
        : "una de tus cuentas de ahorros";
  const listo = Boolean(tarjeta && destinos.length && comprobante);

  async function alEnviar() {
    if (enCurso.current || !listo) return;
    enCurso.current = true;
    setAviso(null);
    const { data } = await supabaseCliente()
      .from("alertas_sistema")
      .select("id, titulo, mensaje")
      .eq("categoria", "alerta")
      .eq("tipo", "critico")
      .order("fecha_inicio", { ascending: false });
    if (data?.length) {
      enCurso.current = false;
      return setUrgentes(data);
    }
    await enviar();
    enCurso.current = false;
  }

  async function enviar() {
    setUrgentes(null);
    setEnviando(true);
    let path = null;
    try {
      const { usuario, perfil } = sesion;
      const codigo = generarCodigo();
      path = await subirImagen(
        BUCKET,
        `${usuario.id}/${codigo}.jpg`,
        comprobante.blob,
      );
      const sb = supabaseCliente();
      const { error: e1 } = await sb.from("solicitudes").insert({
        codigo,
        cliente_id: perfil.id,
        tarjeta_id: tarjeta.id,
        banco: tarjeta.banco,
        comprobante_url: path,
        nota_cliente: nota.trim() || null,
        estado: "pendiente",
      });
      if (e1) throw e1;
      // La auditoría no tumba la solicitud si falla.
      await sb
        .from("auditoria_logs")
        .insert({
          usuario_id: usuario.id,
          accion: "CREAR_SOLICITUD",
          entidad: "solicitudes",
          datos_despues: { codigo, banco: tarjeta.banco, origen: "web" },
        })
        .then(
          () => {},
          () => {},
        );
      setEnviada(codigo);
    } catch (err) {
      await borrarImagenes(BUCKET, [path]);
      setAviso({
        tono: "error",
        texto: /fetch|network/i.test(err?.message || "")
          ? "Se cortó la conexión. Tu comprobante sigue aquí: revisa tu internet y vuelve a enviar."
          : mensajeError(err),
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaCuenta activa="nueva" sesion={sesion}>
      <Marco
        titulo="Nueva solicitud"
        subtitulo="Paga con tu tarjeta, adjunta el comprobante y te depositamos en tu cuenta."
        ancho="max-w-2xl"
      >
        {error && <Aviso>{error}</Aviso>}
        {aviso && (
          <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>
            {aviso.texto}
          </Aviso>
        )}

        {tarjetas.length === 0 ? (
          <div className="rounded-2xl bg-[#F6F8FC] p-6 text-center">
            <p className="font-semibold">Necesitas una tarjeta verificada.</p>
            <p className="mt-1 text-sm text-[#4F5B74]">
              Regístrala y, cuando el equipo la verifique, podrás operar con
              ella.
            </p>
            <Link
              href="/cuenta/tarjeta-nueva"
              className="mt-5 inline-flex h-11 items-center rounded-full bg-marca-900 px-6 font-semibold text-white hover:bg-marca-700"
            >
              Agregar tarjeta
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <Paso
              n={1}
              titulo="Elige tu tarjeta"
              hecho={Boolean(tarjeta && destinos.length)}
            >
              <div
                className="grid gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Tarjeta"
              >
                {tarjetas.map((t) => {
                  const activo = tarjeta?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      disabled={enviando}
                      onClick={() => setTarjeta(t)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition",
                        activo
                          ? "border-marca-900 bg-marca-900 text-white"
                          : "border-[#DCE3EE] hover:bg-[#F6F8FC]",
                      )}
                    >
                      <span className="font-semibold">
                        {nombreBanco(t.banco)}
                      </span>
                      <span
                        className={cn(
                          "cifras text-sm",
                          activo ? "text-white/70" : "text-[#8A93A6]",
                        )}
                      >
                        •••• {t.ultimos_4}
                      </span>
                    </button>
                  );
                })}
              </div>
              {falta && (
                <div className="mt-3 rounded-xl border border-oro-300 bg-oro-50 px-4 py-3 text-sm text-[#6E5300]">
                  <p className="font-semibold">{falta.titulo}</p>
                  <p className="mt-0.5">{falta.detalle}</p>
                  <Link
                    href={`/cuenta/cuenta-nueva?tipo=ahorros${falta.banco ? `&banco=${falta.banco}` : ""}`}
                    className="mt-2 inline-block font-semibold underline underline-offset-4"
                  >
                    Agregar cuenta de ahorros
                  </Link>
                </div>
              )}
              {tarjeta && destinos.length > 0 && (
                <p className="mt-3 text-sm text-[#4F5B74]">
                  Te depositamos en{" "}
                  <strong className="text-marca-900">{destinoTexto}</strong>
                  {comision != null && (
                    <>
                      {" "}
                      · comisión{" "}
                      <strong className="cifras text-marca-900">
                        {porcentaje(comision)}%
                      </strong>
                      {tarifa?.minimo && tarifa?.limite && (
                        <>
                          {" "}
                          (mínimo{" "}
                          <strong className="cifras text-marca-900">
                            {soles(tarifa.minimo)}
                          </strong>{" "}
                          si operas menos de{" "}
                          <span className="cifras">{soles(tarifa.limite)}</span>
                          )
                        </>
                      )}
                    </>
                  )}
                  .
                </p>
              )}
            </Paso>

            {tarjeta && destinos.length > 0 && (
              <Paso
                n={2}
                titulo={`Paga con tu tarjeta ${nombreBanco(bancoTarjeta)}`}
              >
                {guia === undefined ? (
                  <p className="text-sm text-[#8A93A6]">Cargando la guía...</p>
                ) : guia?.length ? (
                  <ol className="space-y-4">
                    {guia.map((p) => (
                      <li key={p.orden} className="flex gap-3">
                        <span className="cifras flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EFF3F9] text-sm font-bold">
                          {p.orden}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">{p.titulo}</p>
                          {p.descripcion && (
                            <p className="text-sm text-[#4F5B74]">
                              {p.descripcion}
                            </p>
                          )}
                          {p.imagen_url && (
                            <a
                              href={p.imagen_url}
                              target="_blank"
                              rel="noopener"
                              className="mt-2 block w-fit"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.imagen_url}
                                alt={`Captura del paso ${p.orden}`}
                                className="max-h-56 rounded-lg border border-[#E3E9F2]"
                              />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-[#4F5B74]">
                    Aún no publicamos la guía de este banco. Escríbenos por
                    WhatsApp y te indicamos cómo pagar.
                  </p>
                )}
              </Paso>
            )}

            {tarjeta && destinos.length > 0 && (
              <Paso
                n={3}
                titulo="Adjunta el comprobante"
                hecho={Boolean(comprobante)}
              >
                <FotoUnica
                  id="comprobante"
                  titulo="Comprobante del pago"
                  ayuda="Que se lean el monto y el número de operación."
                  consejos={[
                    "Que se lean el monto, la fecha y el número de operación.",
                    "Puede ser una captura de la app de tu banco o una foto del voucher.",
                    "Completo, sin recortes.",
                  ]}
                  foto={comprobante}
                  onCambio={setComprobante}
                  deshabilitado={enviando}
                />
                <label
                  htmlFor="nota"
                  className="mb-1.5 mt-5 flex items-baseline justify-between text-sm font-semibold"
                >
                  Nota para el equipo{" "}
                  <span className="text-chico font-normal text-[#8A93A6]">
                    Opcional · {nota.length}/{MAX_NOTA}
                  </span>
                </label>
                <textarea
                  id="nota"
                  rows={3}
                  maxLength={MAX_NOTA}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Algo que debamos saber de esta operación"
                  className="w-full rounded-xl border border-[#DCE3EE] bg-white px-3.5 py-3 text-md outline-none focus:border-marca-600 focus:ring-4 focus:ring-marca-600/10"
                />
              </Paso>
            )}

            <div className="border-t border-[#EEF2F7] pt-6">
              <Boton
                tono="oro"
                className="w-full"
                disabled={!listo}
                cargando={enviando}
                onClick={alEnviar}
              >
                {enviando ? "Enviando..." : "Enviar solicitud"}
              </Boton>
              {!listo && (
                <p className="mt-2 text-center text-chico text-[#8A93A6]">
                  {!tarjeta
                    ? "Elige la tarjeta de la operación."
                    : !destinos.length
                      ? "Agrega la cuenta donde te depositamos."
                      : "Adjunta el comprobante."}
                </p>
              )}
            </div>
          </div>
        )}
      </Marco>

      {urgentes && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1426]/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alerta-titulo"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6">
            <h2 id="alerta-titulo" className="font-heading text-xl">
              Antes de enviar
            </h2>
            <ul className="mt-4 space-y-3">
              {urgentes.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  <p className="font-semibold">{a.titulo}</p>
                  {a.mensaje && <p className="mt-0.5">{a.mensaje}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <Boton
                tono="neutro"
                className="flex-1"
                onClick={() => setUrgentes(null)}
              >
                Esperar
              </Boton>
              <Boton
                className="flex-1"
                onClick={() => {
                  // Ya la leyó aquí: la app y Mi cuenta no la vuelven a resaltar.
                  marcarAlertasVistas(
                    sesion.usuario.id,
                    urgentes.map((a) => a.id),
                  );
                  enviar();
                }}
              >
                Enviar de todas formas
              </Boton>
            </div>
          </div>
        </div>
      )}
    </PantallaCuenta>
  );
}

function Paso({ n, titulo, hecho, children }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2.5 font-semibold">
        <span
          className={cn(
            "cifras flex h-7 w-7 items-center justify-center rounded-full text-sm",
            hecho ? "bg-emerald-600 text-white" : "bg-marca-900 text-white",
          )}
        >
          {hecho ? "✓" : n}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Enviada({ codigo, sesion }) {
  return (
    <PantallaCuenta activa="nueva" sesion={sesion}>
      <main className="mx-auto max-w-lg px-4 py-14">
        <div className="rounded-3xl bg-[#0B1426] p-8 text-center text-white">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-oro-500 text-2xl text-marca-900">
            ✓
          </span>
          <h1 className="mt-5 font-heading text-2xl">Solicitud enviada</h1>
          <p className="cifras mt-2 text-sm text-white/60">{codigo}</p>
          <p className="mx-auto mt-4 max-w-sm text-white/75">
            {plazoDeposito()} Verás cada cambio de estado en Mi cuenta y en la
            app.
          </p>
          <Link
            href="/cuenta"
            className="mt-7 inline-flex h-12 items-center rounded-full bg-oro-500 px-6 font-bold text-marca-900 hover:bg-oro-300"
          >
            Ver mis solicitudes
          </Link>
        </div>
      </main>
    </PantallaCuenta>
  );
}
