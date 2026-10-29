import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/sitio/menu";
import Calculadora from "@/components/sitio/calculadora";
import { Animaciones, Contador } from "@/components/sitio/efectos";
import {
  EMPRESA,
  BANCOS,
  HORARIO,
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
  title: "AlToque Perú WK · Efectivo desde tu tarjeta, con confianza",
  description:
    "Empresa peruana que convierte la línea de tu tarjeta de crédito en dinero en tu cuenta. Comisión desde 1 %, depósito el mismo día y oficinas en Lima.",
  openGraph: {
    title: "AlToque Perú WK",
    description: "Efectivo desde tu tarjeta, con la confianza de una empresa formal.",
    locale: "es_PE",
    type: "website",
  },
};

/**
 * Web pública de AlToque Perú WK.
 *
 * Sobria y centrada en la empresa: quiénes somos, cuánto cuesta, cómo
 * cuidamos el dinero y los datos de cada cliente. La app es un canal más,
 * no el centro. Lo que dice aquí tiene que coincidir con la app y con los
 * textos legales: plazos, horario, locales, comisiones y la aclaración de
 * que no estamos afiliados a ningún banco.
 */
export default function Inicio() {
  return (
    <div className="sitio-publico overflow-x-clip bg-[#EFF3F9] font-sans text-marca-900">
      <Menu />
      <Animaciones />

      {/* ═════════════ Portada (azul noche) ═════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0B1426] pb-40 pt-40 text-white sm:pt-48">
        <Brillos />
        <div className="mx-auto max-w-4xl px-5 text-center">
          <h1 className="text-balance font-heading text-[2.6rem] font-normal leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[4.75rem]">
            El efectivo que necesitas, con la <span className="text-oro-500">confianza</span> que mereces.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/65">
            Convertimos la línea de tu tarjeta de crédito en dinero en tu cuenta. Comisión clara, depósito el mismo día y oficinas en Lima.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <a href="#empieza" className="rounded-full bg-oro-500 px-7 py-3.5 text-md font-bold text-marca-900 shadow-[0_12px_32px_-8px_rgba(232,184,0,0.6)] transition hover:bg-oro-300">
              Empieza ahora
            </a>
            <a href="#comisiones" className="group inline-flex items-center gap-1.5 text-md font-medium text-white/80 transition hover:text-white">
              Ver comisiones
              <Flecha className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Ejemplo de operación, montado sobre el borde de la portada */}
      <div className="relative z-10 mx-auto -mt-28 max-w-4xl px-5" data-revelar>
        <Operacion />
      </div>

      {/* ═════════════ Tarjetas y servicio (azul hielo) ═════════════ */}
      <section className="pb-28 pt-16" aria-labelledby="titulo-tarjetas">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <p id="titulo-tarjetas" className="text-sm font-medium text-[#626D82]">
            Aceptamos tarjetas de
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
            {BANCOS.map((b) => (
              <li key={b.nombre} className="inline-flex items-center gap-2 font-heading text-2xl font-medium tracking-tight text-marca-700/70">
                <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                {b.nombre}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-7 max-w-xl text-xs text-[#8A93A6]">
            No estamos afiliados a ningún banco ni emisor. Los nombres solo indican qué tarjetas aceptamos.
          </p>
        </div>

        <div id="servicio" className="mx-auto mt-28 max-w-6xl scroll-mt-28 px-5">
          <div className="max-w-3xl" data-revelar>
            <Etiqueta>Servicio</Etiqueta>
            <h2 className="mt-4 text-balance font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-[3.25rem]">
              Simple, transparente y atendido por personas.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { i: <Porcentaje />, t: "Comisión clara", d: "Desde 1 %, según tu tarjeta. Sabes cuánto recibes antes de confirmar." },
              { i: <Reloj />, t: "Depósito el mismo día", d: "Normalmente en menos de 1 hora, en horario de atención." },
              { i: <Persona />, t: "Revisión humana", d: "Nuestro equipo revisa cada operación y te atiende en persona o por WhatsApp." },
            ].map((x, i) => (
              <div
                key={x.t}
                className="rounded-2xl bg-white p-8 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)]"
                data-revelar
                style={{ "--retraso": `${i * 90}ms` }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-marca-900 text-oro-500">{x.i}</span>
                <h3 className="mt-6 font-heading text-xl font-normal">{x.t}</h3>
                <p className="mt-2 leading-relaxed text-[#4F5B74]">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Comisiones (azul noche) ═════════════ */}
      <section id="comisiones" className="relative isolate overflow-hidden bg-[#0F1B33] py-28 text-white">
        <div aria-hidden className="pointer-events-none absolute -left-40 top-0 -z-10 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.12),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-start gap-14 px-5 lg:grid-cols-[1fr_440px]">
          <div data-revelar>
            <Etiqueta oscura>Comisiones</Etiqueta>
            <h2 className="mt-4 font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-[3.25rem]">
              Desde <span className="text-oro-500">1 %</span>.
              <br />
              <span className="text-white/45">Sin cargos escondidos.</span>
            </h2>

            <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
              {GRUPOS_TARIFA.map((g) => (
                <div key={g.bancos.join()} className="grid grid-cols-[88px_1fr_auto] items-center gap-4 py-5">
                  <span className="font-heading text-3xl font-normal tracking-tight">
                    {g.pct.toLocaleString("es-PE")}
                    <span className="text-oro-500">%</span>
                  </span>
                  <span className="font-medium text-white/90">{g.bancos.join(" · ")}</span>
                  <span className="text-right text-chico leading-tight text-white/45">
                    Mín. S/ {g.minimo}
                    <span className="block">bajo S/ {g.limite.toLocaleString("es-PE")}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-white/55">
              ¿Operas seguido?{" "}
              <a
                href={enlaceWhatsapp("Hola, quiero consultar la tasa preferencial.")}
                target="_blank"
                rel="noopener"
                className="font-medium text-oro-500 underline underline-offset-4 hover:text-oro-300"
              >
                Pide tu tasa preferencial
              </a>
              .
            </p>
          </div>
          <div data-revelar style={{ "--retraso": "120ms" }} className="lg:sticky lg:top-28">
            <Calculadora />
          </div>
        </div>
      </section>

      {/* ═════════════ Cómo funciona (azul hielo) ═════════════ */}
      <section className="py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-3xl" data-revelar>
            <Etiqueta>Cómo funciona</Etiqueta>
            <h2 className="mt-4 font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-[3.25rem]">Cuatro pasos. Una sola vez el registro.</h2>
            <p className="mt-5 text-lg text-[#4F5B74]">En nuestros locales, por WhatsApp o desde la app de AlToque.</p>
          </div>
          <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Regístrate", d: "Con tu DNI y una selfie. Verificamos tu identidad." },
              { t: "Registra tu tarjeta", d: "Y la cuenta de ahorros a tu nombre donde recibirás el dinero." },
              { t: "Envía tu comprobante", d: "De la operación con tu tarjeta. Ves la comisión antes." },
              { t: "Recibe tu depósito", d: "El mismo día, en tu cuenta. Te avisamos al instante." },
            ].map((p, i) => (
              <li
                key={p.t}
                className="rounded-2xl bg-white p-7 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)]"
                data-revelar
                style={{ "--retraso": `${i * 90}ms` }}
              >
                <span className="cifras flex h-10 w-10 items-center justify-center rounded-full bg-oro-500 font-heading text-sm font-semibold text-marca-900">
                  0{i + 1}
                </span>
                <h3 className="mt-6 font-heading text-xl font-normal">{p.t}</h3>
                <p className="mt-2 leading-relaxed text-[#4F5B74]">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═════════════ Seguridad (azul noche) ═════════════ */}
      <section id="seguridad" className="relative isolate overflow-hidden bg-[#0B1426] py-28 text-white">
        <div aria-hidden className="pointer-events-none absolute right-[-10%] top-[-20%] -z-10 h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.16),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute bottom-[-30%] left-[-10%] -z-10 h-[600px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(47,86,176,0.35),transparent)]" />
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-end gap-10 lg:grid-cols-2" data-revelar>
            <div>
              <Etiqueta oscura>Seguridad</Etiqueta>
              <h2 className="mt-4 font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-[3.25rem]">
                Tu dinero y tus datos, <span className="text-oro-500">protegidos</span>.
              </h2>
            </div>
            <p className="max-w-lg text-lg leading-relaxed text-white/60">
              Cada operación pasa por controles para que solo tú puedas usar tu tarjeta y recibir tu dinero.
            </p>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { i: <Persona />, t: "Identidad verificada", d: "Validamos tu documento y tu rostro antes de tu primera operación." },
              { i: <Banco />, t: "Solo a tu nombre", d: "Depositamos únicamente en cuentas tuyas. Nunca a terceros ni por interbancaria." },
              { i: <Candado />, t: "Documentos cifrados", d: "Tus fotos se guardan privadas y cifradas, y solo las ve el equipo de verificación." },
              { i: <Lista />, t: "Todo queda registrado", d: "Cada revisión y cada pago quedan registrados con responsable, fecha y hora." },
              { i: <Escudo />, t: "Datos protegidos", d: "Tratamos tu información según la Ley N.° 29733 de Protección de Datos Personales." },
              { i: <Libro />, t: "Reglas claras", d: "Términos, privacidad y Libro de Reclamaciones a tu alcance, siempre." },
            ].map((x, i) => (
              <div
                key={x.t}
                className="rounded-2xl bg-white/[0.04] p-8 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.07]"
                data-revelar
                style={{ "--retraso": `${(i % 3) * 90}ms` }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-oro-500/15 text-oro-500 ring-1 ring-oro-500/30">{x.i}</span>
                <h3 className="mt-6 font-heading text-lg font-normal">{x.t}</h3>
                <p className="mt-2 leading-relaxed text-white/55">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Nosotros (azul hielo) ═════════════ */}
      <section id="nosotros" className="py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr]">
            <div data-revelar>
              <Etiqueta>Nosotros</Etiqueta>
              <h2 className="mt-4 font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-[3.25rem]">Una empresa peruana, con oficinas de verdad.</h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#4F5B74]">
                Atendemos en persona en tres locales de Lima y por WhatsApp, de {HORARIO.dias.toLowerCase()}.
              </p>

              <div className="mt-10 grid grid-cols-2 gap-4">
                {[
                  { n: 20000, t: "operaciones realizadas" },
                  { n: 8000, t: "clientes registrados" },
                ].map((x) => (
                  <div key={x.t} className="min-w-0 rounded-2xl bg-marca-900 p-5 text-white sm:p-6">
                    <p className="font-heading text-[1.7rem] font-normal tracking-tight text-oro-500 sm:text-5xl">
                      <Contador hasta={x.n} prefijo="+" />
                    </p>
                    <p className="mt-1 text-white/65">{x.t}</p>
                  </div>
                ))}
              </div>

              <dl className="mt-10 grid gap-x-8 gap-y-5 border-t border-[#DCE3EE] pt-8 text-sm sm:grid-cols-2">
                <Fila t="Razón social" v={EMPRESA.razonSocial} />
                <Fila t="RUC" v={EMPRESA.ruc} />
                <Fila t="Domicilio legal" v={EMPRESA.domicilio} />
                <Fila t="Horario" v={`${HORARIO.dias}, ${HORARIO.horas}`} />
              </dl>
            </div>

            <div className="space-y-4" data-revelar style={{ "--retraso": "120ms" }}>
              {LOCALES.map((l) => (
                <a
                  key={l.distrito}
                  href={enlaceMapa(l)}
                  target="_blank"
                  rel="noopener"
                  className="group flex items-center gap-5 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,27,51,0.04),0_20px_40px_-24px_rgba(15,27,51,0.2)] transition hover:-translate-y-0.5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-oro-100 text-oro-700">
                    <Ubicacion />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-xl font-normal">{l.distrito}</span>
                    <span className="block text-[#4F5B74]">{l.direccion}</span>
                    <span className="block text-sm text-[#8A93A6]">{l.referencia}</span>
                  </span>
                  <Flecha className="h-5 w-5 shrink-0 text-[#8A93A6] transition group-hover:translate-x-0.5 group-hover:text-marca-900" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════ Opiniones (azul noche) ═════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0F1B33] py-28 text-white">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,rgba(232,184,0,0.14),transparent)]" />
        <div className="mx-auto max-w-6xl px-5">
          <figure className="mx-auto max-w-4xl text-center" data-revelar>
            <span aria-hidden className="font-heading text-7xl leading-none text-oro-500">“</span>
            <blockquote className="mt-2 text-balance font-heading text-3xl font-normal leading-snug tracking-[-0.01em] sm:text-4xl">
              {OPINIONES[0].texto}
            </blockquote>
            <figcaption className="mt-8 text-white/55">{OPINIONES[0].nombre}</figcaption>
          </figure>
          <div className="mt-20 grid gap-5 md:grid-cols-3">
            {OPINIONES.slice(1).map((o, i) => (
              <figure key={o.nombre} className="rounded-2xl bg-white/[0.04] p-7 ring-1 ring-white/10" data-revelar style={{ "--retraso": `${i * 90}ms` }}>
                <blockquote className="leading-relaxed text-white/80">“{o.texto}”</blockquote>
                <figcaption className="mt-5 text-sm text-oro-500">{o.nombre}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Preguntas (azul hielo) ═════════════ */}
      <section id="preguntas" className="py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-revelar className="lg:sticky lg:top-28 lg:self-start">
            <Etiqueta>Ayuda</Etiqueta>
            <h2 className="mt-4 font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em]">Preguntas frecuentes</h2>
            <p className="mt-4 text-[#4F5B74]">
              ¿Otra duda?{" "}
              <a href={enlaceWhatsapp()} target="_blank" rel="noopener" className="font-medium text-marca-900 underline underline-offset-4">
                Escríbenos
              </a>
              .
            </p>
          </div>
          <div className="space-y-3" data-revelar>
            {PREGUNTAS.map((q) => (
              <details key={q.p} className="group rounded-2xl bg-white px-6 shadow-[0_1px_2px_rgba(15,27,51,0.04)] transition open:shadow-[0_20px_40px_-24px_rgba(15,27,51,0.25)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-heading text-lg font-normal [&::-webkit-details-marker]:hidden">
                  {q.p}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFF3F9] text-marca-700 transition group-open:rotate-45 group-open:bg-oro-500 group-open:text-marca-900">
                    <Mas className="h-4 w-4" />
                  </span>
                </summary>
                <p className="-mt-1 pb-6 pr-10 leading-relaxed text-[#4F5B74]">{q.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ Llamado final (dorado) ═════════════ */}
      <section id="empieza" className="scroll-mt-28 px-5 pb-28">
        <div
          className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#F5D976] via-[#E8B800] to-[#C49B00] px-8 py-20 text-center text-marca-900 sm:px-16"
          data-revelar
        >
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-white/30 blur-3xl" />
          <h2 className="mx-auto max-w-2xl text-balance font-heading text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-5xl">
            Empieza hoy. Te acompañamos desde el primer paso.
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <a
              href={enlaceWhatsapp("Hola, quiero empezar con AlToque Perú WK.")}
              target="_blank"
              rel="noopener"
              className="rounded-full bg-marca-900 px-7 py-3.5 font-semibold text-white shadow-[0_12px_30px_-8px_rgba(15,27,51,0.5)] transition hover:bg-marca-700"
            >
              Escríbenos por WhatsApp
            </a>
            <a href="#nosotros" className="group inline-flex items-center gap-1.5 font-semibold text-marca-900/80 hover:text-marca-900">
              Visítanos en un local
              <Flecha className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
          </div>
          <p className="mt-8 text-sm text-marca-900/60">La app de AlToque llega pronto a Google Play.</p>
        </div>
      </section>

      {/* ═════════════ Pie (azul noche) ═════════════ */}
      <footer className="bg-[#0B1426] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0F1B33] ring-1 ring-white/10">
                <Image src="/logo.png" alt="" width={26} height={26} className="object-contain" />
              </span>
              <span className="font-heading font-semibold">AlToque Perú WK</span>
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
                <a href={enlaceWhatsapp()} target="_blank" rel="noopener" className="hover:text-oro-500">
                  WhatsApp {WHATSAPP_TEXTO}
                </a>
              </li>
              <li>
                <a href={`tel:+51${LLAMADAS_TEXTO.replace(/\s/g, "")}`} className="hover:text-oro-500">
                  Llamadas {LLAMADAS_TEXTO}
                </a>
              </li>
              <li>
                <a href={`mailto:${EMPRESA.correo}`} className="hover:text-oro-500">
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
            AlToque Perú WK es una empresa independiente y no es un banco. No está afiliada ni es patrocinada por BCP, BBVA, Interbank, Scotiabank,
            BanBif, CMR, iO ni ningún otro banco o emisor de tarjetas; sus marcas pertenecen a sus dueños. La operación queda cargada en tu tarjeta de
            crédito y tu banco puede cobrarte intereses u otros cargos según sus condiciones. Las comisiones mostradas son las estándar y pueden variar
            con tasas preferenciales acordadas.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p>© {new Date().getFullYear()} {EMPRESA.razonSocial} Todos los derechos reservados.</p>
            <Link href="/login" className="hover:text-white/70">
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
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_rgba(37,211,102,0.4)] transition hover:scale-105"
      >
        <Whatsapp className="h-7 w-7" />
      </a>
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

/* ── Piezas ── */

/** Ejemplo de operación: lo que pasa con el dinero del cliente, paso a paso. */
function Operacion() {
  const tarifa = TARIFAS.find((t) => t.nombre === "BCP");
  const monto = 1500;
  const comision = (monto * tarifa.pct) / 100;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E3E9F2] bg-white shadow-[0_2px_4px_rgba(15,27,51,0.04),0_40px_80px_-30px_rgba(15,27,51,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E9F2] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#8A93A6]">Ejemplo de operación</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Depósito enviado
        </span>
      </div>
      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1.2fr_1fr]">
        <ol className="space-y-5">
          {[
            { h: "10:02", t: "Comprobante recibido", d: "Tarjeta BCP ···· 4821" },
            { h: "10:15", t: "Verificado por nuestro equipo", d: "Identidad y tarjeta del titular" },
            { h: "10:41", t: "Depósito enviado", d: "Cuenta de ahorros a nombre del titular" },
          ].map((p, i) => (
            <li key={p.t} className="flex gap-4">
              <span className="relative flex flex-col items-center">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca-900 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {i < 2 && <span className="mt-1 w-px flex-1 bg-[#DCE3EE]" />}
              </span>
              <span className="pb-1">
                <span className="block font-medium">{p.t}</span>
                <span className="block text-sm text-[#8A93A6]">
                  <span className="cifras">{p.h}</span> · {p.d}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <dl className="space-y-3 rounded-xl bg-[#F6F8FC] p-6">
          <div className="flex justify-between text-[#626D82]">
            <dt>Monto</dt>
            <dd className="cifras">S/ {monto.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</dd>
          </div>
          <div className="flex justify-between text-[#626D82]">
            <dt>Comisión {tarifa.pct} %</dt>
            <dd className="cifras">− S/ {comision.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-[#DCE3EE] pt-3">
            <dt className="font-medium">Recibes</dt>
            <dd className="cifras font-heading text-3xl font-normal tracking-tight">
              S/ {(monto - comision).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Etiqueta({ children, oscura = false }) {
  return (
    <p className={`inline-flex items-center gap-2 text-sm font-medium ${oscura ? "text-white/55" : "text-[#626D82]"}`}>
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
            <Link href={e.href} className="text-sm text-white/60 transition hover:text-oro-500">
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
const Check = (p) => (
  <svg {...trazo({ strokeWidth: 2.4, ...p })}>
    <path d="M20 6 9 17l-5-5" />
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
const Ubicacion = (p) => (
  <svg {...trazo({ className: "h-6 w-6", ...p })}>
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
const Whatsapp = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
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
