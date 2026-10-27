import Link from "next/link";
import Image from "next/image";
import { EMPRESA } from "@/lib/supabasePublico";
import { WHATSAPP_TEXTO, enlaceWhatsapp } from "@/components/sitio/datos";

/**
 * Páginas abiertas a cualquiera, sin iniciar sesión: términos,
 * privacidad, autorización de fotos, eliminar cuenta y Libro de
 * Reclamaciones. Google Play exige que la política de privacidad y la
 * forma de pedir la eliminación estén en una URL pública, e Indecopi
 * que el Libro de Reclamaciones esté en la web.
 *
 * Eliminar cuenta no va en los menús: se llega desde la app (Mis datos)
 * o con el enlace que se declara en Google Play.
 */
export const metadata = {
  title: "AlToque Perú WK",
  description: "Términos, privacidad y atención al cliente de AlToque Perú WK.",
};

const ENLACES = [
  { href: "/terminos", texto: "Términos y condiciones" },
  { href: "/privacidad", texto: "Política de privacidad" },
  { href: "/autorizacion-fotos", texto: "Autorización de fotos" },
  { href: "/libro-reclamaciones", texto: "Libro de Reclamaciones" },
];

export default function LayoutPublico({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#EFF3F9] text-marca-700">
      <header className="sticky top-0 z-40 bg-[#0B1426]/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-4xl items-center gap-3 px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AlToque Perú WK, ir al inicio">
            <Image src="/logo.png" alt="" width={38} height={38} className="object-contain" />
            <span className="hidden font-heading text-[0.95rem] font-bold tracking-[0.12em] text-oro-500 sm:block">ALTOQUE PERÚ WK</span>
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">{children}</main>

      <footer className="bg-[#080F1E] text-white">
        <div className="mx-auto max-w-4xl space-y-5 px-5 py-10 text-sm">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
            <Link href="/" className="font-semibold text-oro-500 hover:underline">
              Inicio
            </Link>
            {ENLACES.map((e) => (
              <Link key={e.href} href={e.href} className="text-white/70 hover:text-oro-500">
                {e.texto}
              </Link>
            ))}
          </nav>
          <div className="space-y-1 text-white/55">
            <p className="font-semibold text-white/80">
              {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
            </p>
            <p>{EMPRESA.domicilio}</p>
            <p>
              {EMPRESA.correo} ·{" "}
              <a href={enlaceWhatsapp()} target="_blank" rel="noopener" className="hover:text-oro-500">
                WhatsApp {WHATSAPP_TEXTO}
              </a>
            </p>
          </div>
          <p className="text-xs text-white/40">
            AlToque no está afiliado ni es patrocinado por BCP, BBVA, Interbank, Scotiabank, BanBif, CMR ni ningún otro banco o emisor. Sus
            marcas pertenecen a sus dueños.
          </p>
        </div>
      </footer>
    </div>
  );
}
