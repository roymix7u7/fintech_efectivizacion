"use client";

import { useRef, useState } from "react";
import { clientePublico, EMPRESA } from "@/lib/supabasePublico";
import Desplegable from "@/components/desplegable";

/**
 * Libro de Reclamaciones virtual (Indecopi), abierto a cualquiera, con
 * o sin cuenta en la app. Misma hoja que en la app: cae en la misma
 * bandeja del panel (Reclamaciones) y comparte la numeración.
 */
const VACIA = {
  tipo: "reclamo",
  nombres: "",
  tipo_documento: "dni",
  numero_documento: "",
  domicilio: "",
  telefono: "",
  correo: "",
  menor_edad: false,
  apoderado: "",
  descripcion_bien: "Gestión de operaciones con tarjeta de crédito",
  monto: "",
  detalle: "",
  pedido: "",
};

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-[#1B2A4A] focus:ring-4 focus:ring-[#1B2A4A]/10";

function Etiqueta({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-slate-700">
      {children}
    </label>
  );
}

export default function LibroPage() {
  const cliente = useRef(null);
  if (!cliente.current) cliente.current = clientePublico();

  const [h, setH] = useState(VACIA);
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(null);
  const poner = (k, v) => setH((x) => ({ ...x, [k]: v }));

  async function enviar(e) {
    e.preventDefault();
    setError("");
    if (h.detalle.trim().length < 20) return setError("Cuéntanos qué pasó con al menos 20 letras.");
    if (h.menor_edad && h.apoderado.trim().length < 3) return setError("Escribe el nombre del padre, madre o apoderado.");
    setEnviando(true);
    const datos = {
      ...h,
      telefono: h.telefono.trim() ? `+51${h.telefono.replace(/\D/g, "")}` : "",
      monto: h.monto.replace(",", ".").trim(),
      origen: "web",
    };
    const { data, error: eRpc } = await cliente.current.rpc("registrar_reclamo", { p: datos });
    setEnviando(false);
    if (eRpc) return setError(eRpc.message.includes("check constraint") ? "Revisa los datos ingresados." : eRpc.message);
    setHecho({ ...datos, ...data });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (hecho) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8 print:shadow-none">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-green-700">Hoja registrada</p>
          <h1 className="mt-1 text-[1.6rem] font-semibold tracking-tight">
            {hecho.tipo === "queja" ? "Queja" : "Reclamo"} N.° {hecho.codigo}
          </h1>
          <p className="mt-2 text-slate-600">
            Fecha: {fecha(hecho.creado_en)}. Te responderemos a más tardar el {fecha(hecho.vence_en)} al correo{" "}
            {hecho.correo}. Guarda o imprime esta constancia.
          </p>
          <dl className="mt-6 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Proveedor</dt>
              <dd>
                {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Consumidor</dt>
              <dd>
                {hecho.nombres} · {hecho.tipo_documento.toUpperCase()} {hecho.numero_documento}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Servicio</dt>
              <dd>
                {hecho.descripcion_bien}
                {hecho.monto ? ` · Monto reclamado: S/ ${hecho.monto}` : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Detalle</dt>
              <dd className="whitespace-pre-wrap">{hecho.detalle}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Pedido</dt>
              <dd className="whitespace-pre-wrap">{hecho.pedido}</dd>
            </div>
          </dl>
          <div className="mt-6 flex gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-[#1B2A4A] px-4 py-2.5 font-semibold text-white hover:bg-[#0F1B33]"
            >
              Imprimir o guardar en PDF
            </button>
            <button
              onClick={() => {
                setHecho(null);
                setH(VACIA);
                setAcepto(false);
              }}
              className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Registrar otra
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">Libro de Reclamaciones</h1>
        <p className="mt-2 text-slate-600">
          {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
          <br />
          {EMPRESA.domicilio}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { clave: "reclamo", titulo: "Reclamo", texto: "Disconformidad con el servicio." },
            { clave: "queja", titulo: "Queja", texto: "Malestar con la atención recibida." },
          ].map((t) => (
            <label
              key={t.clave}
              className={`cursor-pointer rounded-xl border-2 p-4 ${h.tipo === t.clave ? "border-[#1B2A4A] bg-[#1B2A4A]/5" : "border-slate-200"}`}
            >
              <input
                type="radio"
                name="tipo"
                id={`tipo-${t.clave}`}
                className="sr-only"
                checked={h.tipo === t.clave}
                onChange={() => poner("tipo", t.clave)}
              />
              <span className="block font-semibold">{t.titulo}</span>
              <span className="text-[13px] text-slate-600">{t.texto}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">1. Tus datos</h2>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="nombres">Nombre completo</Etiqueta>
          <input id="nombres" required minLength={3} className={campo} value={h.nombres} onChange={(e) => poner("nombres", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Etiqueta htmlFor="tipo_documento">Documento</Etiqueta>
            <Desplegable
              id="tipo_documento"
              claseBoton={campo}
              valor={h.tipo_documento}
              onCambio={(v) => poner("tipo_documento", v)}
              opciones={[
                { valor: "dni", texto: "DNI" },
                { valor: "ce", texto: "Carnet de extranjería" },
                { valor: "pasaporte", texto: "Pasaporte" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Etiqueta htmlFor="numero_documento">Número</Etiqueta>
            <input
              id="numero_documento"
              required
              pattern="[A-Za-z0-9]{6,15}"
              className={campo}
              value={h.numero_documento}
              onChange={(e) => poner("numero_documento", e.target.value.replace(/\s/g, ""))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="domicilio">Domicilio</Etiqueta>
          <input id="domicilio" required minLength={5} className={campo} value={h.domicilio} onChange={(e) => poner("domicilio", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Etiqueta htmlFor="telefono">Celular (opcional)</Etiqueta>
            <input
              id="telefono"
              inputMode="numeric"
              className={campo}
              value={h.telefono}
              onChange={(e) => poner("telefono", e.target.value.replace(/\D/g, "").slice(0, 9))}
            />
          </div>
          <div className="space-y-1.5">
            <Etiqueta htmlFor="correo">Correo</Etiqueta>
            <input id="correo" type="email" required className={campo} value={h.correo} onChange={(e) => poner("correo", e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input id="menor_edad" type="checkbox" checked={h.menor_edad} onChange={(e) => poner("menor_edad", e.target.checked)} />
          Soy menor de edad
        </label>
        {h.menor_edad && (
          <div className="space-y-1.5">
            <Etiqueta htmlFor="apoderado">Nombre del padre, madre o apoderado</Etiqueta>
            <input id="apoderado" required className={campo} value={h.apoderado} onChange={(e) => poner("apoderado", e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">2. El servicio</h2>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-1.5">
            <Etiqueta htmlFor="descripcion_bien">Servicio contratado</Etiqueta>
            <input
              id="descripcion_bien"
              required
              className={campo}
              value={h.descripcion_bien}
              onChange={(e) => poner("descripcion_bien", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Etiqueta htmlFor="monto">Monto reclamado S/ (opcional)</Etiqueta>
            <input
              id="monto"
              inputMode="decimal"
              className={campo}
              value={h.monto}
              onChange={(e) => poner("monto", e.target.value.replace(/[^0-9.,]/g, ""))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">3. {h.tipo === "queja" ? "Tu queja" : "Tu reclamo"}</h2>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="detalle">¿Qué pasó?</Etiqueta>
          <textarea
            id="detalle"
            required
            rows={5}
            maxLength={3000}
            className={campo}
            value={h.detalle}
            onChange={(e) => poner("detalle", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Etiqueta htmlFor="pedido">¿Qué solución esperas?</Etiqueta>
          <textarea
            id="pedido"
            required
            rows={3}
            maxLength={1000}
            className={campo}
            value={h.pedido}
            onChange={(e) => poner("pedido", e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-[14px] text-slate-700">
          <input id="acepto" type="checkbox" className="mt-1" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          Declaro que los datos son verdaderos y acepto que se usen para atender esta hoja, según la{" "}
          <a href="/privacidad" className="font-medium text-[#1B2A4A] underline">
            política de privacidad
          </a>
          .
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={!acepto || enviando}
          className="w-full rounded-xl bg-[#1B2A4A] px-4 py-3 font-semibold text-white hover:bg-[#0F1B33] disabled:opacity-40"
        >
          {enviando ? "Enviando..." : "Enviar hoja"}
        </button>
        <p className="text-[12px] text-slate-500">
          La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo
          para interponer una denuncia ante el Indecopi. El proveedor deberá dar respuesta en un plazo no mayor a 15
          días hábiles.
        </p>
      </div>
    </form>
  );
}
