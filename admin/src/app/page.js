import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/sitio/menu";
import Calculadora from "@/components/sitio/calculadora";
import { Animaciones, Contador } from "@/components/sitio/efectos";
import {
  TarjetasLados,
  TarjetasAbanico,
  Inclinable,
  Objetos3D,
} from "@/components/sitio/tarjetas3d";
import MapaLocales from "@/components/sitio/locales3d";
import ContactoFlotante from "@/components/sitio/contacto";
import {
  EMPRESA,
  BANCOS,
  HORARIO,
  OPINIONES,
  PREGUNTAS,
  REDES,
  GRUPOS_TARIFA,
  WHATSAPP_TEXTO,
  LLAMADAS_TEXTO,
  enlaceWhatsapp,
} from "@/components/sitio/datos";

export const metadata = {
  title: "AlToque Perú WK · Efectivo desde tu tarjeta, con confianza",
  description:
    "Empresa peruana que convierte la línea de tu tarjeta de crédito en dinero en tu cuenta. Comisión desde 1 %, depósito el mismo día y oficinas en Lima.",
  openGraph: {
    title: "AlToque Perú WK",
    description:
      "Efectivo desde tu tarjeta, con la confianza de una empresa formal.",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * Web pública de AlToque Perú WK.
 *
 * Pensada primero para el celular: frases cortas, cifras grandes, botones
 * anchos y la calculadora arriba, que es lo que la gente viene a ver. Lo
 * que dice aquí tiene que coincidir con la app y con los textos legales:
 * plazos, horario, locales, comisiones y la aclaración de que no estamos
 * afiliados a ningún banco.
 */
export default function Inicio() {
  return (
    <div className="sitio-publico overflow-x-clip bg-[#EFF3F9] font-sans text-marca-900">
      <Menu />
      <Animaciones />

      {/* ═════════════ Portada (azul noche) ═════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0B1426] pb-28 pt-32 text-white sm:pb-32 sm:pt-44 xl:pb-44">
        <Brillos />
        <TarjetasLados />
        <div className="relative z-10 mx-auto max-w-4xl px-5 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-medium text-white/80 ring-1 ring-white/15 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-oro-500" />
            Empresa peruana · 3 locales en Lima
          </p>
          <h1 className="mt-6 text-balance font-heading text-[2.9rem] font-normal leading-[1.02] tracking-[-0.035em] sm:text-7xl lg:text-[5.5rem]">
            Tu tarjeta de crédito, en{" "}
            <span className="text-oro-500">efectivo hoy</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-sm text-lg leading-relaxed text-white/65 sm:max-w-xl sm:text-xl">
            Comisión desde 1 %. Depósito en tu cuenta el mismo día.
          </p>
          <div className="mx-auto mt-9 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <Link
              href="/registro"
              className="flex min-h-[54px] items-center justify-center rounded-full bg-oro-500 px-9 text-lg font-bold text-marca-900 shadow-[0_14px_36px_-8px_rgba(232,184,0,0.65)] transition hover:bg-oro-300 active:scale-[0.98]"
            >
              Empieza ahora
            </Link>
            <Link
              href="/ingresar"
              className="flex min-h-[54px] items-center justify-center rounded-full px-9 text-lg font-medium text-white ring-1 ring-white/25 transition hover:bg-white/10 active:scale-[0.98]"
            >
              Ya tengo cuenta
            </Link>
          </div>
          <TarjetasAbanico />
        </div>
      </section>

      {/* Tres cifras que resumen el servicio, a caballo entre la portada y lo que sigue. */}
      <div className="relative z-20 mx-auto -mt-14 max-w-3xl px-5">
        <dl className="grid grid-cols-3 divide-x divide-[#E3E9F2] rounded-3xl bg-white py-6 text-center shadow-[0_2px_4px_rgba(15,27,51,0.05),0_30px_60px_-28px_rgba(15,27,51,0.45)] sm:py-8">
          {[
            { n: "1 %", t: "Comisión desde" },
            { n: "1 h", t: "Depósito habitual" },
            { n: <Contador hasta={20000} prefijo="+" />, t: "Operaciones" },
          ].map((x) => (
            <div key={x.t} className="flex flex-col-reverse justify-end gap-1.5 px-2">
              <dt className="text-chico text-[#626D82] sm:text-sm">{x.t}</dt>
              <dd className="cifras font-heading text-[1.6rem] font-normal leading-none tracking-tight sm:text-5xl">
                {x.n}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ═════════════ Tarjetas que aceptamos ═════════════ */}
      <section className="pb-20 pt-12 sm:pb-24" aria-labelledby="titulo-tarjetas">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <p id="titulo-tarjetas" className="text-sm font-medium text-[#626D82]">
            Aceptamos tarjetas de
          </p>
          <ul className="sin-barra -mx-5 mt-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-3 sm:px-0">
            {BANCOS.map((b) => (
              <li
                key={b.nombre}
                className="inline-flex shrink-0 snap-start items-center gap-2 rounded-full bg-white px-5 py-2.5 font-heading text-lg font-medium tracking-tight text-marca-700 ring-1 ring-[#E3E9F2]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: b.color }}
                />
                {b.nombre}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-5 max-w-xl text-xs text-[#8A93A6]">
            No estamos afiliados a ningún banco ni emisor. Los nombres solo
            indican qué tarjetas aceptamos.
          </p>
        </div>
      </section>

      {/* ═════════════ Comisiones (azul noche) ═════════════ */}
      <section
        id="comisiones"
        className="relative isolate overflow-hidden bg-[#0F1B33] py-20 text-white sm:py-28"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-0 -z-10 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.12),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-5">
          <div className="relative pr-24 sm:pr-0" data-revelar>
            <Objetos3D
              className="absolute -top-4 right-0 h-24 w-24 sm:-top-10 sm:right-4 sm:h-40 sm:w-44"
              objetos={[MONEDAS]}
              chispas={[
                { x: "0%", y: "20%", t: 14 },
                { x: "88%", y: "70%", t: 18, retraso: 1.2 },
              ]}
            />
            <Etiqueta oscura>Comisiones</Etiqueta>
            <h2 className="mt-4 font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-6xl">
              ¿Cuánto <span className="text-oro-500">recibes</span>?
            </h2>
            <p className="mt-3 text-lg text-white/55">Sin cargos escondidos.</p>
          </div>

          <div className="mt-10 grid items-start gap-10 lg:mt-14 lg:grid-cols-[1fr_440px] lg:gap-14">
            <div
              data-revelar
              className="order-first lg:sticky lg:top-28 lg:order-last"
            >
              <Calculadora />
            </div>

            <div data-revelar style={{ "--retraso": "120ms" }}>
              <div className="divide-y divide-white/10 border-y border-white/10">
                {GRUPOS_TARIFA.map((g) => (
                  <div
                    key={g.bancos.join()}
                    className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-4 sm:grid-cols-[88px_1fr_auto] sm:gap-4 sm:py-5"
                  >
                    <span className="cifras font-heading text-3xl font-normal tracking-tight">
                      {g.pct.toLocaleString("es-PE")}
                      <span className="text-oro-500">%</span>
                    </span>
                    <span className="font-medium text-white/90">
                      {g.bancos.join(" · ")}
                      {g.pctHoy && (
                        <span className="mt-0.5 block text-chico font-normal leading-snug text-oro-300">
                          {g.pctHoy.toLocaleString("es-PE")} % si lo quieres
                          hoy
                        </span>
                      )}
                    </span>
                    <span className="cifras text-right text-chico leading-tight text-white/45">
                      Mín. S/ {g.minimo}
                      <span className="block">
                        bajo S/ {g.limite.toLocaleString("es-PE")}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <a
                href={enlaceWhatsapp(
                  "Hola, quiero consultar la tasa preferencial.",
                )}
                target="_blank"
                rel="noopener"
                className="group mt-6 inline-flex min-h-[48px] items-center gap-2 font-medium text-oro-500 hover:text-oro-300"
              >
                ¿Operas seguido? Pide tu tasa preferencial
                <Flecha className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Servicio y pasos (azul hielo) ═════════════ */}
      <section id="servicio" className="scroll-mt-28 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
            <div data-revelar>
              <Etiqueta>Servicio</Etiqueta>
              <h2 className="mt-4 text-balance font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-6xl">
                Simple, claro y con personas reales.
              </h2>
            </div>
            <div data-revelar style={{ "--retraso": "120ms" }}>
              <Foto
                src="/sitio/atencion-asesora.webp"
                ancho={1800}
                alto={1344}
                alt="Asesora de AlToque revisando documentos con un cliente en uno de nuestros locales"
                proporcion="aspect-[4/3] sm:aspect-[16/10]"
              >
                <Sello icono={<Persona />}>
                  Revisamos cada operación antes de depositar
                </Sello>
              </Foto>
            </div>
          </div>

          <ul className="mt-8 grid gap-3 md:grid-cols-3 md:gap-5 lg:mt-14">
            {[
              { i: <Porcentaje />, t: "Comisión clara", d: "La ves antes de confirmar" },
              { i: <Reloj />, t: "El mismo día", d: "Normalmente en menos de 1 hora" },
              { i: <Persona />, t: "Revisión humana", d: "En persona o por WhatsApp" },
            ].map((x, i) => (
              <li
                key={x.t}
                className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)] md:p-6"
                data-revelar
                style={{ "--retraso": `${i * 90}ms` }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-marca-900 text-oro-500">
                  {x.i}
                </span>
                <span className="min-w-0">
                  <span className="block font-heading text-lg font-normal leading-tight">
                    {x.t}
                  </span>
                  <span className="mt-0.5 block text-sm text-[#626D82]">
                    {x.d}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-20 sm:mt-28" data-revelar>
            <Etiqueta>Cómo funciona</Etiqueta>
            <h2 className="mt-4 font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-6xl">
              Cuatro pasos.
            </h2>
          </div>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-5 lg:mt-12 lg:grid-cols-4">
            {[
              { t: "Regístrate", d: "Con tu DNI y una selfie." },
              { t: "Registra tu tarjeta", d: "Y una cuenta a tu nombre." },
              { t: "Envía tu comprobante", d: "Ves la comisión antes." },
              { t: "Recibe tu depósito", d: "El mismo día, en tu cuenta." },
            ].map((p, i) => (
              <li
                key={p.t}
                className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)] lg:block lg:p-7"
                data-revelar
                style={{ "--retraso": `${i * 90}ms` }}
              >
                <span className="cifras flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-oro-500 font-heading text-lg font-semibold text-marca-900">
                  {i + 1}
                </span>
                <span className="block min-w-0 lg:mt-6">
                  <span className="block font-heading text-lg font-normal leading-tight lg:text-xl">
                    {p.t}
                  </span>
                  <span className="mt-0.5 block text-sm text-[#626D82] lg:mt-2 lg:text-base">
                    {p.d}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
            data-revelar
          >
            <Link
              href="/registro"
              className="flex min-h-[54px] items-center justify-center rounded-full bg-marca-900 px-9 text-lg font-semibold text-white transition hover:bg-marca-700 active:scale-[0.98]"
            >
              Crear mi cuenta
            </Link>
            <p className="text-center text-sm text-[#626D82] sm:text-left">
              La misma cuenta sirve en la web, en la app y en nuestros locales.
            </p>
          </div>
        </div>
      </section>

      {/* ═════════════ Seguridad (azul noche) ═════════════ */}
      <section
        id="seguridad"
        className="relative isolate overflow-hidden bg-[#0B1426] py-20 text-white sm:py-28"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-[-20%] -z-10 h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.16),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[-30%] left-[-10%] -z-10 h-[600px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(47,86,176,0.35),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
            <div data-revelar>
              <Etiqueta oscura>Seguridad</Etiqueta>
              <h2 className="mt-4 font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-6xl">
                Tu dinero y tus datos,{" "}
                <span className="text-oro-500">protegidos</span>.
              </h2>
            </div>
            <div
              className="relative"
              data-revelar
              style={{ "--retraso": "120ms" }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.22),transparent)]"
              />
              <Objetos3D
                className="relative mx-auto h-[230px] w-full max-w-[520px] sm:h-[340px]"
                objetos={SEGURIDAD_3D}
                chispas={[
                  { x: "6%", y: "6%", t: 16 },
                  { x: "62%", y: "0%", t: 12, retraso: 0.8 },
                  { x: "92%", y: "22%", t: 18, retraso: 1.6 },
                  { x: "30%", y: "88%", t: 14, retraso: 2.2 },
                ]}
              />
            </div>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:mt-16 lg:grid-cols-3">
            {[
              { i: <Persona />, t: "Identidad verificada" },
              { i: <Banco />, t: "Solo a cuentas a tu nombre" },
              { i: <Candado />, t: "Documentos cifrados" },
              { i: <Lista />, t: "Cada paso queda registrado" },
              { i: <Escudo />, t: "Datos según la Ley N.° 29733" },
              { i: <Libro />, t: "Libro de Reclamaciones" },
            ].map((x, i) => (
              <li
                key={x.t}
                className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10 backdrop-blur sm:flex sm:items-center sm:gap-4 sm:p-6"
                data-revelar
                style={{ "--retraso": `${(i % 3) * 90}ms` }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-oro-500/15 text-oro-500 ring-1 ring-oro-500/30 [&_svg]:h-6 [&_svg]:w-6">
                  {x.i}
                </span>
                <span className="mt-4 block font-heading text-base font-normal leading-snug sm:mt-0 sm:text-lg">
                  {x.t}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═════════════ Nosotros (azul hielo) ═════════════ */}
      <section id="nosotros" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
            <div data-revelar>
              <Etiqueta>Nosotros</Etiqueta>
              <h2 className="mt-4 font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-6xl">
                Oficinas de verdad, en Lima.
              </h2>
              <p className="mt-4 text-lg text-[#4F5B74]">
                {HORARIO.dias}, {HORARIO.horas}
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  { n: 20000, t: "operaciones" },
                  { n: 8000, t: "clientes" },
                ].map((x) => (
                  <div
                    key={x.t}
                    className="min-w-0 rounded-2xl bg-marca-900 p-5 text-white sm:p-6"
                  >
                    <p className="font-heading text-[1.9rem] font-normal leading-none tracking-tight text-oro-500 sm:text-5xl">
                      <Contador hasta={x.n} prefijo="+" />
                    </p>
                    <p className="mt-2 text-white/65">{x.t}</p>
                  </div>
                ))}
              </div>

              <details className="group mt-6 rounded-2xl bg-white px-5 shadow-[0_1px_2px_rgba(15,27,51,0.04)]">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  Datos de la empresa
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFF3F9] text-marca-700 transition group-open:rotate-45 group-open:bg-oro-500 group-open:text-marca-900">
                    <Mas className="h-4 w-4" />
                  </span>
                </summary>
                <dl className="grid gap-x-8 gap-y-4 pb-5 text-sm sm:grid-cols-2">
                  <Fila t="Razón social" v={EMPRESA.razonSocial} />
                  <Fila t="RUC" v={EMPRESA.ruc} />
                  <Fila t="Domicilio legal" v={EMPRESA.domicilio} />
                  <Fila t="Horario" v={`${HORARIO.dias}, ${HORARIO.horas}`} />
                </dl>
              </details>
            </div>

            <div data-revelar style={{ "--retraso": "120ms" }}>
              <MapaLocales />
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Opiniones (azul noche) ═════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0F1B33] py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.14),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-5">
          <figure className="mx-auto max-w-4xl text-center" data-revelar>
            <Objetos3D
              className="relative mx-auto h-28 w-32 sm:h-32 sm:w-36"
              objetos={[BURBUJA]}
              chispas={[
                { x: "-12%", y: "10%", t: 14 },
                { x: "100%", y: "55%", t: 16, retraso: 1.1 },
              ]}
            />
            <blockquote className="mt-10 text-balance font-heading text-2xl font-normal leading-snug tracking-[-0.01em] sm:text-4xl">
              {OPINIONES[0].texto}
            </blockquote>
            <figcaption className="mt-6 text-white/55">
              {OPINIONES[0].nombre}
            </figcaption>
          </figure>
          {/* En celular se deslizan de lado; en pantallas grandes van en fila. */}
          <div className="sin-barra -mx-5 mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:mt-20 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0">
            {OPINIONES.slice(1).map((o) => (
              <figure
                key={o.nombre}
                className="w-[82%] shrink-0 snap-center rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 md:w-auto md:p-7"
              >
                <blockquote className="leading-relaxed text-white/80">
                  “{o.texto}”
                </blockquote>
                <figcaption className="mt-5 text-sm text-oro-500">
                  {o.nombre}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Preguntas (azul hielo) ═════════════ */}
      <section id="preguntas" className="py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div
            data-revelar
            className="relative pr-24 lg:sticky lg:top-28 lg:flex lg:flex-col lg:items-start lg:self-start lg:pr-0"
          >
            <Objetos3D
              className="objetos-claros absolute -top-4 right-0 h-32 w-20 lg:relative lg:right-auto lg:top-auto lg:order-last lg:mt-12 lg:h-72 lg:w-56"
              objetos={[PREGUNTA]}
              chispas={[
                { x: "-10%", y: "30%", t: 14 },
                { x: "85%", y: "5%", t: 18, retraso: 0.9 },
                { x: "80%", y: "80%", t: 12, retraso: 1.8 },
              ]}
            />
            <Etiqueta>Ayuda</Etiqueta>
            <h2 className="mt-4 font-heading text-[2.4rem] font-normal leading-[1.05] tracking-[-0.025em] sm:text-5xl">
              Preguntas frecuentes
            </h2>
            <a
              href={enlaceWhatsapp()}
              target="_blank"
              rel="noopener"
              className="group mt-3 inline-flex min-h-[48px] items-center gap-2 font-medium text-marca-900 underline underline-offset-4"
            >
              ¿Otra duda? Escríbenos
              <Flecha className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
          </div>
          <div className="space-y-3" data-revelar>
            {PREGUNTAS.map((q) => (
              <details
                key={q.p}
                className="group rounded-2xl bg-white px-5 shadow-[0_1px_2px_rgba(15,27,51,0.04)] transition open:shadow-[0_20px_40px_-24px_rgba(15,27,51,0.25)] sm:px-6"
              >
                <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-5 py-4 font-heading text-lg font-normal leading-snug [&::-webkit-details-marker]:hidden">
                  {q.p}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFF3F9] text-marca-700 transition group-open:rotate-45 group-open:bg-oro-500 group-open:text-marca-900">
                    <Mas className="h-4 w-4" />
                  </span>
                </summary>
                <p className="-mt-1 pb-6 pr-8 leading-relaxed text-[#4F5B74]">
                  {q.r}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Llamado final (dorado) ═════════════ */}
      <section id="empieza" className="scroll-mt-28 px-5 pb-20 sm:pb-28">
        <div
          className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#F5D976] via-[#E8B800] to-[#C49B00] px-6 py-16 text-center text-marca-900 sm:px-16 sm:py-24"
          data-revelar
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-white/30 blur-3xl"
          />
          <h2 className="mx-auto max-w-2xl text-balance font-heading text-[2.6rem] font-normal leading-[1.02] tracking-[-0.03em] sm:text-7xl">
            Empieza hoy.
          </h2>
          <p className="mt-3 text-lg text-marca-900/70">
            Te acompañamos desde el primer paso.
          </p>
          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <Link
              href="/registro"
              className="flex min-h-[54px] items-center justify-center rounded-full bg-marca-900 px-9 text-lg font-semibold text-white shadow-[0_12px_30px_-8px_rgba(15,27,51,0.5)] transition hover:bg-marca-700 active:scale-[0.98]"
            >
              Crear mi cuenta
            </Link>
            <Link
              href="/ingresar"
              className="flex min-h-[54px] items-center justify-center rounded-full px-9 text-lg font-semibold text-marca-900 ring-1 ring-marca-900/30 transition hover:bg-marca-900/10 active:scale-[0.98]"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* ═════════════ Pie (azul noche) ═════════════ */}
      <footer className="bg-[#0B1426] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0F1B33] ring-1 ring-white/10">
                <Image
                  src="/logo.png"
                  alt=""
                  width={26}
                  height={26}
                  className="object-contain"
                />
              </span>
              <span className="font-heading font-bold tracking-[0.06em]">
                ALTOQUE PERU <span className="text-oro-500">WK</span>
              </span>
            </div>
            <div className="mt-6 flex gap-2">
              {REDES.map((r) => (
                <a
                  key={r.nombre}
                  href={r.url}
                  target="_blank"
                  rel="noopener"
                  aria-label={r.nombre}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 ring-1 ring-white/15 transition hover:text-oro-500 hover:ring-oro-500"
                >
                  <IconoRed nombre={r.nombre} />
                </a>
              ))}
            </div>
          </div>

          <PieColumna
            titulo="Empresa"
            enlaces={[
              { href: "#servicio", t: "Servicio" },
              { href: "#comisiones", t: "Comisiones" },
              { href: "#seguridad", t: "Seguridad" },
              { href: "#nosotros", t: "Locales" },
            ]}
          />
          <PieColumna
            titulo="Legal"
            enlaces={[
              { href: "/terminos", t: "Términos y condiciones" },
              { href: "/privacidad", t: "Política de privacidad" },
              { href: "/autorizacion-fotos", t: "Autorización de fotos" },
              { href: "/libro-reclamaciones", t: "Libro de Reclamaciones" },
            ]}
          />
          <div>
            <p className="text-sm font-semibold">Contacto</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/60">
              <li>
                <a
                  href={enlaceWhatsapp()}
                  target="_blank"
                  rel="noopener"
                  className="hover:text-oro-500"
                >
                  WhatsApp {WHATSAPP_TEXTO}
                </a>
              </li>
              <li>
                <a
                  href={`tel:+51${LLAMADAS_TEXTO.replace(/\s/g, "")}`}
                  className="hover:text-oro-500"
                >
                  Llamadas {LLAMADAS_TEXTO}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${EMPRESA.correo}`}
                  className="hover:text-oro-500"
                >
                  {EMPRESA.correo}
                </a>
              </li>
              <li>
                {HORARIO.dias}, {HORARIO.horas}
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto max-w-6xl space-y-3 border-t border-white/10 px-5 py-8 text-xs leading-relaxed text-white/40">
          <p>
            {EMPRESA.razonSocial} · RUC {EMPRESA.ruc} · {EMPRESA.domicilio}.
          </p>
          <p>
            AlToque Perú WK es una empresa independiente y no es un banco. No
            está afiliada ni es patrocinada por BCP, BBVA, Interbank,
            Scotiabank, BanBif, CMR, iO ni ningún otro banco o emisor de
            tarjetas; sus marcas pertenecen a sus dueños. La operación queda
            cargada en tu tarjeta de crédito y tu banco puede cobrarte intereses
            u otros cargos según sus condiciones. Las comisiones mostradas son
            las estándar y pueden variar con tasas preferenciales acordadas.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p>
              © {new Date().getFullYear()} {EMPRESA.razonSocial} Todos los
              derechos reservados.
            </p>
            <Link href="/login" className="hover:text-white/70">
              Acceso del equipo
            </Link>
          </div>
        </div>
      </footer>

      {/* Contacto flotante: chat con un asesor (visitantes) o WhatsApp. */}
      <ContactoFlotante whatsapp={enlaceWhatsapp()} whatsappTexto={WHATSAPP_TEXTO} />
    </div>
  );
}

/** Luces de fondo de la portada. */
function Brillos() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-1/2 top-[-30%] h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.22),transparent)]" />
      <div className="absolute bottom-[-35%] left-[-10%] h-[620px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(47,86,176,0.45),transparent)]" />
      <div className="absolute bottom-[-30%] right-[-15%] h-[560px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(44,66,112,0.6),transparent)]" />
    </div>
  );
}

/* ── Objetos 3D de las secciones (posición y profundidad) ── */

const objeto = (src, ancho, alto, estilo) => ({
  img: { src, ancho, alto },
  estilo: {
    "--rx": "0deg",
    "--ry": "0deg",
    "--rz": "0deg",
    "--prof": 16,
    "--ritmo": "7s",
    "--fase": "0s",
    ...estilo,
  },
});

const MONEDAS = objeto("/sitio/monedas.webp", 800, 728, {
  "--w": "100%",
  left: 0,
  top: 0,
  "--rz": "-4deg",
  "--prof": 18,
  "--ritmo": "6s",
});

const SEGURIDAD_3D = [
  objeto("/sitio/identidad.webp", 800, 638, {
    "--w": "50%",
    left: "0%",
    top: "18%",
    "--rx": "6deg",
    "--ry": "14deg",
    "--rz": "-6deg",
    "--prof": 14,
    "--ritmo": "7.5s",
    "--fase": "-1s",
  }),
  objeto("/sitio/escudo.webp", 565, 737, {
    "--w": "38%",
    left: "31%",
    top: "2%",
    zIndex: 2,
    "--rx": "4deg",
    "--ry": "-6deg",
    "--prof": 28,
    "--ritmo": "6.5s",
  }),
  objeto("/sitio/candado.webp", 514, 729, {
    "--w": "25%",
    left: "72%",
    top: "34%",
    zIndex: 1,
    "--ry": "-14deg",
    "--rz": "8deg",
    "--prof": 20,
    "--ritmo": "7s",
    "--fase": "-3s",
  }),
];

const BURBUJA = objeto("/sitio/burbuja.webp", 700, 661, {
  "--w": "100%",
  left: 0,
  top: 0,
  "--rz": "-6deg",
  "--ritmo": "5.5s",
});

const PREGUNTA = objeto("/sitio/pregunta.webp", 476, 745, {
  "--w": "72%",
  left: "14%",
  top: 0,
  "--rz": "8deg",
  "--ry": "-10deg",
  "--prof": 22,
  "--ritmo": "6s",
  "--fase": "-2s",
});

/* ── Piezas ── */

/** Foto de la empresa: se inclina con el puntero y se acerca un poco. */
function Foto({ src, ancho, alto, alt, proporcion, children }) {
  return (
    <Inclinable max={5}>
      <figure
        className={`group relative overflow-hidden rounded-3xl bg-marca-900 shadow-[0_2px_4px_rgba(15,27,51,0.06),0_40px_70px_-30px_rgba(15,27,51,0.45)] ${proporcion}`}
      >
        <Image
          src={src}
          alt={alt}
          width={ancho}
          height={alto}
          sizes="(min-width: 1024px) 600px, 100vw"
          quality={90}
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1426]/70 via-transparent to-transparent"
        />
        <figcaption className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
          {children}
        </figcaption>
      </figure>
    </Inclinable>
  );
}

/** Etiqueta de vidrio sobre una foto. */
function Sello({ icono, children }) {
  return (
    <span className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-white/90 py-2.5 pl-2.5 pr-4 text-sm font-semibold text-marca-900 shadow-lg backdrop-blur">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca-900 text-oro-500 [&_svg]:h-5 [&_svg]:w-5">
        {icono}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function Etiqueta({ children, oscura = false }) {
  return (
    <p
      className={`inline-flex items-center gap-2 text-sm font-medium ${oscura ? "text-white/55" : "text-[#626D82]"}`}
    >
      <span className="h-px w-6 bg-oro-500" />
      {children}
    </p>
  );
}

function Fila({ t, v }) {
  return (
    <div>
      <dt className="text-[#8A93A6]">{t}</dt>
      <dd className="mt-1 font-medium text-marca-900">{v}</dd>
    </div>
  );
}

function PieColumna({ titulo, enlaces }) {
  return (
    <div>
      <p className="text-sm font-semibold">{titulo}</p>
      <ul className="mt-4 space-y-2.5">
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="text-sm text-white/60 transition hover:text-oro-500"
            >
              {e.t}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Íconos ── */

const trazo = (p) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-7 w-7",
  "aria-hidden": true,
  ...p,
});

const Flecha = (p) => (
  <svg {...trazo({ strokeWidth: 1.8, ...p })}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Mas = (p) => (
  <svg {...trazo({ strokeWidth: 1.6, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Candado = (p) => (
  <svg {...trazo(p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Persona = (p) => (
  <svg {...trazo(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
);
const Porcentaje = (p) => (
  <svg {...trazo(p)}>
    <path d="M19 5 5 19" />
    <circle cx="7.5" cy="7.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
  </svg>
);
const Escudo = (p) => (
  <svg {...trazo(p)}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const Reloj = (p) => (
  <svg {...trazo(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
const Banco = (p) => (
  <svg {...trazo(p)}>
    <path d="M3 10 12 4l9 6" />
    <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
  </svg>
);
const Lista = (p) => (
  <svg {...trazo(p)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
  </svg>
);
const Libro = (p) => (
  <svg {...trazo(p)}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </svg>
);
function IconoRed({ nombre }) {
  if (nombre === "Instagram")
    return (
      <svg {...trazo({ className: "h-[18px] w-[18px]", strokeWidth: 1.8 })}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    );
  if (nombre === "Facebook")
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="h-[18px] w-[18px]"
      >
        <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" />
      </svg>
    );
  if (nombre === "YouTube")
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="h-[18px] w-[18px]"
      >
        <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="h-[18px] w-[18px]"
    >
      <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    </svg>
  );
}
