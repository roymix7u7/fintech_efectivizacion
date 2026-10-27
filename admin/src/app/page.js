import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/sitio/menu";
import Calculadora from "@/components/sitio/calculadora";
import Pasos from "@/components/sitio/pasos";
import Telefono, { PantallaPagado } from "@/components/sitio/telefono";
import { Animaciones, Contador } from "@/components/sitio/efectos";
import {
  EMPRESA,
  BANCOS,
  HORARIO,
  PLAZOS,
  LOCALES,
  OPINIONES,
  PREGUNTAS,
  REDES,
  TARIFAS,
  GRUPOS_TARIFA,
  WHATSAPP_TEXTO,
  LLAMADAS_TEXTO,
  enlaceWhatsapp,
  enlaceMapa,
} from "@/components/sitio/datos";

export const metadata = {
  title: "AlToque Perú WK · Efectiviza tu tarjeta rápido y seguro",
  description:
    "Convierte la línea de tu tarjeta de crédito en dinero en tu cuenta. Comisión clara antes de enviar, identidad verificada y depósito normalmente en 1 hora. Lima, Perú.",
  openGraph: {
    title: "AlToque Perú WK · Efectiviza tu tarjeta",
    description: "Comisión clara, identidad verificada y depósito normalmente en 1 hora.",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * Web pública de AlToque Perú WK.
 *
 * Reemplaza a la página anterior (Bootstrap, jQuery y cinco carruseles).
 * Lo que dice aquí tiene que coincidir con la app y con los textos
 * legales: plazos, horario, locales y la aclaración de que no estamos
 * afiliados a ningún banco.
 */
export default function Inicio() {
  return (
    <div className="sitio-publico overflow-x-clip bg-[#0B1426] font-sans text-white">
      <Menu />
      <Animaciones />

      {/* ═════════════ Portada ═════════════ */}
      <section className="relative isolate overflow-hidden pb-20 pt-32 sm:pt-40 lg:pb-28">
        <Fondo />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-chico font-semibold text-white/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-oro-500" style={{ animation: "pulso-oro 2.4s infinite" }} />
              Atendemos {HORARIO.dias.toLowerCase()}, de 9 a. m. a 6 p. m.
            </p>
            <h1 className="mt-6 font-heading text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.4rem]">
              Efectiviza tu tarjeta
              <span className="mt-1 block bg-gradient-to-r from-[#F5D976] via-[#E8B800] to-[#C49B00] bg-clip-text text-transparent">
                rápido y seguro.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Convierte la línea de tu tarjeta de crédito en dinero en tu cuenta. Ves la comisión antes de enviar, una persona revisa cada
              operación y te depositamos normalmente en <strong className="font-bold text-white">1 hora</strong>.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#empieza"
                className="group inline-flex items-center gap-2 rounded-full bg-oro-500 px-7 py-4 text-md font-extrabold text-marca-900 shadow-[0_12px_32px_rgba(232,184,0,0.35)] transition hover:-translate-y-0.5 hover:bg-oro-300"
              >
                Crear mi cuenta
                <Flecha className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </a>
              <a
                href="#calculadora"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-7 py-4 text-md font-bold text-white backdrop-blur transition hover:border-white/40 hover:bg-white/10"
              >
                Calcular cuánto recibo
              </a>
            </div>
            <ul className="mt-10 grid max-w-xl grid-cols-1 gap-3 text-sm text-white/70 sm:grid-cols-3">
              {[
                { i: <Candado />, t: "Documentos cifrados" },
                { i: <Ojo />, t: "Comisión antes de enviar" },
                { i: <Persona />, t: "Revisión humana" },
              ].map((x) => (
                <li key={x.t} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-oro-500">{x.i}</span>
                  {x.t}
                </li>
              ))}
            </ul>
          </div>

          {/* Teléfono con tarjetas flotantes */}
          <div className="relative mx-auto w-full max-w-[520px]">
            <div className="absolute inset-0 m-auto h-[380px] w-[380px] max-w-full rounded-full bg-oro-500/25 blur-[90px]" />
            <div className="flotar relative">
              <Telefono>
                <PantallaPagado />
              </Telefono>
            </div>
            <div
              className="flotar-lento absolute left-0 top-[58%] hidden rounded-2xl border border-white/10 bg-white/95 px-4 py-3 text-marca-700 shadow-2xl sm:block"
              style={{ "--giro": "-4deg", animationDelay: "-2s" }}
            >
              <p className="text-xs font-bold text-[#626D82]">Comisión BCP</p>
              <p className="font-heading text-2xl font-bold">1 %</p>
              <p className="text-xs text-[#626D82]">la ves antes de enviar</p>
            </div>
            <div
              className="flotar-lento absolute right-0 top-[8%] hidden items-center gap-3 rounded-2xl border border-white/10 bg-marca-900/90 px-4 py-3 shadow-2xl backdrop-blur sm:flex"
              style={{ "--giro": "3deg" }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">Identidad verificada</span>
                <span className="block text-xs text-white/60">por nuestro equipo</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Franja de confianza ═════════════ */}
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-5 py-8 lg:grid-cols-4">
          {[
            { t: "Empresa peruana", d: `RUC ${EMPRESA.ruc}` },
            { t: "3 locales en Lima", d: "Lince, SJM y Los Olivos" },
            { t: "Datos protegidos", d: "Ley N.° 29733" },
            { t: "Libro de Reclamaciones", d: "Virtual, a tu alcance" },
          ].map((x) => (
            <div key={x.t} className="flex flex-col items-center text-center lg:border-r lg:border-white/10 lg:last:border-r-0">
              <p className="font-heading text-md font-semibold text-white">{x.t}</p>
              <p className="mt-0.5 text-sm text-white/55">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════ Tarjetas que aceptamos ═════════════ */}
      <section className="py-16" aria-labelledby="titulo-tarjetas">
        <div className="mx-auto max-w-6xl px-5 text-center" data-revelar>
          <p id="titulo-tarjetas" className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-500">
            Tarjetas que aceptamos
          </p>
        </div>
        <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="marquesina flex w-max gap-4">
            {[...BANCOS, ...BANCOS].map((b, i) => (
              <span
                key={`${b.nombre}-${i}`}
                aria-hidden={i >= BANCOS.length}
                className="flex h-16 min-w-[170px] items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-6 font-heading text-lg font-semibold text-white/90"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: b.color }} />
                {b.nombre}
              </span>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl px-5 text-center text-chico text-white/45">
          AlToque Perú WK no está afiliado ni es patrocinado por ningún banco o emisor de tarjetas. Los nombres solo indican qué tarjetas
          aceptamos.
        </p>
      </section>

      {/* ═════════════ Calculadora ═════════════ */}
      <section id="calculadora" className="relative overflow-hidden bg-[#EFF3F9] py-24 text-marca-700">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-oro-500/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div data-revelar>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-700">Comisión clara</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Comisión desde <span className="text-oro-600">1 %</span>.
            </h2>
            <div className="mt-8 overflow-hidden rounded-3xl border border-[#E3E9F2] bg-white shadow-sm">
              {GRUPOS_TARIFA.map((g) => (
                <div key={g.bancos.join()} className="flex items-center gap-5 border-b border-[#E3E9F2] px-6 py-4 last:border-b-0">
                  <span className="w-[80px] shrink-0 font-heading text-3xl font-bold text-marca-700">
                    {g.pct.toLocaleString("es-PE")}
                    <span className="text-xl text-oro-600">%</span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {g.bancos.map((b) => {
                      const t = TARIFAS.find((x) => x.nombre === b);
                      return (
                        <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF3F9] px-3 py-1 text-sm font-bold text-marca-700">
                          <span className="h-2 w-2 rounded-full" style={{ background: t?.color }} />
                          {b}
                        </span>
                      );
                    })}
                  </div>
                  <span className="hidden shrink-0 text-right text-chico leading-tight text-[#626D82] sm:block">
                    Mín. <strong className="text-marca-700">S/ {g.minimo}</strong>
                    <span className="block">bajo S/ {g.limite.toLocaleString("es-PE")}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[#4F5B74]">
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" /> Depósito el mismo día
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" /> Solo a cuentas a tu nombre
              </span>
            </p>
          </div>
          <div data-revelar style={{ "--retraso": "120ms" }}>
            <Calculadora />
          </div>
        </div>
      </section>

      {/* ═════════════ Cómo funciona ═════════════ */}
      <section id="como-funciona" className="relative isolate overflow-hidden py-24">
        <Fondo suave />
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl" data-revelar>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-500">Cómo funciona</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">Cinco pasos, todo desde tu celular.</h2>
            <p className="mt-4 text-lg text-white/65">
              Los tres primeros se hacen una sola vez. Después, cada operación es subir tu comprobante y esperar el depósito.
            </p>
          </div>
          <div className="mt-14" data-revelar>
            <Pasos />
          </div>
        </div>
      </section>

      {/* ═════════════ Beneficios ═════════════ */}
      <section id="beneficios" className="bg-[#EFF3F9] py-24 text-marca-700">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center" data-revelar>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-700">Efectiviza con nosotros</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">Pensado para que operes tranquilo.</h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                i: <Rayo />,
                t: "Depósito rápido",
                d: "Normalmente en 1 hora desde que aprobamos tu comprobante. Si hay demora, te avisamos en la app.",
                destacado: true,
              },
              { i: <Porcentaje />, t: "Tasa preferencial", d: "Si operas con frecuencia, escríbenos por WhatsApp y te damos una comisión especial." },
              { i: <Escudo />, t: "Seguridad de verdad", d: "Verificamos tu identidad y guardamos tus documentos cifrados, para que nadie más pueda operar a tu nombre." },
              { i: <Persona />, t: "Personas, no robots", d: "Un equipo revisa cada operación y te atiende en nuestros locales o por WhatsApp." },
              { i: <Regalo />, t: "Promociones", d: "Descuentos y campañas para clientes. Solo te los enviamos si aceptas recibirlos." },
              { i: <Celular />, t: "Todo en la app", d: "Tus tarjetas, cuentas, solicitudes y avisos en un solo lugar, con alertas en tu celular." },
            ].map((b, i) => (
              <article
                key={b.t}
                data-revelar
                style={{ "--retraso": `${(i % 3) * 90}ms` }}
                className={
                  b.destacado
                    ? "group relative overflow-hidden rounded-3xl bg-marca-900 p-7 text-white shadow-xl transition hover:-translate-y-1"
                    : "group rounded-3xl border border-[#E3E9F2] bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                }
              >
                {b.destacado && <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-oro-500/25 blur-2xl" />}
                <span
                  className={
                    b.destacado
                      ? "relative flex h-12 w-12 items-center justify-center rounded-2xl bg-oro-500 text-marca-900"
                      : "flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF3CC] text-oro-700 transition group-hover:bg-oro-500 group-hover:text-marca-900"
                  }
                >
                  {b.i}
                </span>
                <h3 className="relative mt-5 font-heading text-xl font-semibold">{b.t}</h3>
                <p className={b.destacado ? "relative mt-2 leading-relaxed text-white/70" : "mt-2 leading-relaxed text-[#4F5B74]"}>{b.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Cifras y opiniones ═════════════ */}
      <section className="relative isolate overflow-hidden py-24">
        <Fondo suave />
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-6 sm:grid-cols-2" data-revelar>
            {[
              { n: 20000, t: "operaciones realizadas" },
              { n: 8000, t: "clientes registrados" },
            ].map((x) => (
              <div key={x.t} className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur">
                <p className="font-heading text-6xl font-bold text-oro-500">
                  <Contador hasta={x.n} prefijo="+" />
                </p>
                <p className="mt-2 text-lg text-white/70">{x.t}</p>
              </div>
            ))}
          </div>

          <div className="mt-20 text-center" data-revelar>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-500">Comunidad AlToque</p>
            <h2 className="mt-3 font-heading text-4xl font-bold">Lo que dicen nuestros clientes</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {OPINIONES.map((o, i) => (
              <figure
                key={o.nombre}
                data-revelar
                style={{ "--retraso": `${(i % 2) * 100}ms` }}
                className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.05] p-7"
              >
                <div className="flex gap-1 text-oro-500" aria-label={`${o.estrellas} de 5 estrellas`}>
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Estrella key={k} lleno={k < o.estrellas} />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-white/85">“{o.texto}”</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-oro-300 to-oro-600 font-heading text-sm font-bold text-marca-900">
                    {o.nombre
                      .split(" ")
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <span className="font-semibold">{o.nombre}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Horario, plazos y locales ═════════════ */}
      <section id="locales" className="bg-[#EFF3F9] py-24 text-marca-700">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl" data-revelar>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-700">Horario y locales</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">Estamos cerca, también en persona.</h2>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-3xl bg-marca-900 p-7 text-white" data-revelar>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-oro-500 text-marca-900">
                  <Reloj />
                </span>
                <div>
                  <p className="font-heading text-xl font-semibold">{HORARIO.dias}</p>
                  <p className="text-white/70">
                    {HORARIO.horas} · {HORARIO.refrigerio.toLowerCase()}
                  </p>
                </div>
              </div>
              <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.16em] text-oro-500">¿Cuándo te depositamos?</p>
              <ul className="mt-3 divide-y divide-white/10">
                {PLAZOS.map((p) => (
                  <li key={p.titulo} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="font-semibold">{p.titulo}</span>
                    <span className="text-right text-sm text-white/60">{p.detalle}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-white/55">Cualquier demora te la avisamos en la app.</p>
            </div>

            <div className="grid gap-4">
              {LOCALES.map((l, i) => (
                <a
                  key={l.distrito}
                  href={enlaceMapa(l)}
                  target="_blank"
                  rel="noopener"
                  data-revelar
                  style={{ "--retraso": `${i * 90}ms` }}
                  className="group flex items-center gap-4 rounded-3xl border border-[#E3E9F2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF3CC] text-oro-700">
                    <Ubicacion />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-lg font-semibold">{l.distrito}</span>
                    <span className="block text-[#4F5B74]">{l.direccion}</span>
                    <span className="block text-sm text-[#8A93A6]">{l.referencia}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-marca-600 sm:flex">
                    Ver mapa <Flecha className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Preguntas ═════════════ */}
      <section id="preguntas" className="py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-revelar className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-oro-500">Preguntas frecuentes</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight">Lo que suelen preguntarnos.</h2>
            <p className="mt-4 text-white/65">¿No encuentras tu respuesta? Te contestamos por WhatsApp en horario de atención.</p>
            <a
              href={enlaceWhatsapp()}
              target="_blank"
              rel="noopener"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 font-bold text-[#06371B] transition hover:-translate-y-0.5"
            >
              <Whatsapp className="h-5 w-5" />
              Escríbenos
            </a>
          </div>
          <div className="space-y-3" data-revelar>
            {PREGUNTAS.map((q) => (
              <details
                key={q.p}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] px-6 transition open:border-oro-500/40 open:bg-white/[0.07]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-heading text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {q.p}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-oro-500 transition group-open:rotate-45">
                    <Mas className="h-4 w-4" />
                  </span>
                </summary>
                <p className="pb-5 leading-relaxed text-white/70">{q.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Llamado final ═════════════ */}
      <section id="empieza" className="px-5 pb-24">
        <div
          data-revelar
          className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-gradient-to-br from-[#F5D976] via-[#E8B800] to-[#C49B00] px-7 py-14 text-marca-900 sm:px-14"
        >
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/25 blur-2xl" />
          <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-[#AF7F17]/30 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <h2 className="font-heading text-4xl font-bold leading-tight sm:text-5xl">Empieza hoy. Tu primera solicitud, en minutos.</h2>
              <p className="mt-4 max-w-lg text-lg text-marca-900/75">
                Crea tu cuenta en la app, valida tu identidad una sola vez y efectiviza cuando lo necesites.
              </p>
            </div>
            <div className="grid gap-3">
              <a
                href={enlaceWhatsapp("Hola, quiero crear mi cuenta en AlToque Perú WK.")}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-2 rounded-full bg-marca-900 px-7 py-4 text-md font-extrabold text-white shadow-xl transition hover:-translate-y-0.5"
              >
                Quiero mi cuenta
                <Flecha className="h-4 w-4" />
              </a>
              <p className="text-center text-sm font-semibold text-marca-900/70">
                La app llega pronto a Google Play. Mientras tanto, te ayudamos a empezar por WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Pie ═════════════ */}
      <footer className="border-t border-white/10 bg-[#080F1E]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="" width={44} height={44} className="object-contain" />
              <div className="leading-tight">
                <p className="font-heading font-bold tracking-[0.12em] text-oro-500">ALTOQUE PERÚ WK</p>
                <p className="text-sm text-white/50">Efectiviza rápido y seguro</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-white/55">
              {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
              <br />
              {EMPRESA.domicilio}
            </p>
            <div className="mt-5 flex gap-2">
              {REDES.map((r) => (
                <a
                  key={r.nombre}
                  href={r.url}
                  target="_blank"
                  rel="noopener"
                  aria-label={r.nombre}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-oro-500 hover:text-oro-500"
                >
                  <IconoRed nombre={r.nombre} />
                </a>
              ))}
            </div>
          </div>

          <PieColumna
            titulo="Servicio"
            enlaces={[
              { href: "#como-funciona", t: "Cómo funciona" },
              { href: "#calculadora", t: "Comisiones" },
              { href: "#beneficios", t: "Beneficios" },
              { href: "#locales", t: "Locales y horario" },
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
            <p className="font-heading font-semibold">Atención</p>
            <p className="mt-4 text-sm text-white/55">
              {HORARIO.dias}
              <br />
              {HORARIO.horas}
            </p>
            <a href={enlaceWhatsapp()} target="_blank" rel="noopener" className="mt-3 block text-sm font-semibold text-white/80 hover:text-oro-500">
              WhatsApp y llamadas: {WHATSAPP_TEXTO}
            </a>
            <a href={`tel:+51${LLAMADAS_TEXTO.replace(/\s/g, "")}`} className="mt-1 block text-sm text-white/60 hover:text-oro-500">
              Solo llamadas: {LLAMADAS_TEXTO}
            </a>
            <a href={`mailto:${EMPRESA.correo}`} className="mt-1 block text-sm text-white/60 hover:text-oro-500">
              {EMPRESA.correo}
            </a>
            <Link
              href="/libro-reclamaciones"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 px-3.5 py-2.5 text-sm font-bold text-white transition hover:border-oro-500"
            >
              <Libro className="h-5 w-5 text-oro-500" />
              Libro de Reclamaciones
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-white/40">
            <p className="max-w-3xl">
              AlToque Perú WK no está afiliado ni es patrocinado por BCP, BBVA, Interbank, Scotiabank, BanBif, CMR ni ningún otro banco o
              emisor. Sus marcas pertenecen a sus dueños. © {new Date().getFullYear()} {EMPRESA.razonSocial}.
            </p>
            <Link href="/login" className="text-white/35 hover:text-white/70">
              Acceso del equipo
            </Link>
          </div>
        </div>
      </footer>

      {/* WhatsApp flotante */}
      <a
        href={enlaceWhatsapp()}
        target="_blank"
        rel="noopener"
        aria-label="Escríbenos por WhatsApp"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_rgba(37,211,102,0.45)] transition hover:scale-105"
      >
        <Whatsapp className="h-7 w-7" />
      </a>
    </div>
  );
}

/* ── Piezas ── */

function Fondo({ suave = false }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#16243F_0%,#0B1426_60%)]" />
      <div className={`absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-oro-500 blur-[140px] ${suave ? "opacity-[0.08]" : "opacity-20"}`} />
      <div className={`absolute bottom-[-20%] left-[-10%] h-[520px] w-[520px] rounded-full bg-[#2F56B0] blur-[140px] ${suave ? "opacity-20" : "opacity-40"}`} />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, #000 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 20%, transparent 70%)",
        }}
      />
    </div>
  );
}

function PieColumna({ titulo, enlaces }) {
  return (
    <div>
      <p className="font-heading font-semibold">{titulo}</p>
      <ul className="mt-4 space-y-2.5">
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="text-sm text-white/55 transition hover:text-oro-500">
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
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-5 w-5",
  "aria-hidden": true,
  ...p,
});

const Flecha = (p) => (
  <svg {...trazo(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Check = (p) => (
  <svg {...trazo({ strokeWidth: 2.6, ...p })}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const Mas = (p) => (
  <svg {...trazo({ strokeWidth: 2.4, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Candado = (p) => (
  <svg {...trazo({ className: "h-4 w-4", ...p })}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Ojo = (p) => (
  <svg {...trazo({ className: "h-4 w-4", ...p })}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const Persona = (p) => (
  <svg {...trazo(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
);
const Rayo = (p) => (
  <svg {...trazo(p)}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
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
const Regalo = (p) => (
  <svg {...trazo(p)}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </svg>
);
const Celular = (p) => (
  <svg {...trazo(p)}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
);
const Reloj = (p) => (
  <svg {...trazo(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
const Ubicacion = (p) => (
  <svg {...trazo(p)}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
const Libro = (p) => (
  <svg {...trazo(p)}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </svg>
);
const Estrella = ({ lleno }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill={lleno ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
const Whatsapp = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
  </svg>
);

function IconoRed({ nombre }) {
  if (nombre === "Instagram")
    return (
      <svg {...trazo({ className: "h-[18px] w-[18px]" })}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    );
  if (nombre === "Facebook")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px]">
        <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" />
      </svg>
    );
  if (nombre === "YouTube")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px]">
        <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px]">
      <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    </svg>
  );
}
