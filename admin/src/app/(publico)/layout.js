import Link from "next/link";
import Image from "next/image";
import { EMPRESA } from "@/lib/supabasePublico";

/**
 * Páginas abiertas a cualquiera, sin iniciar sesión: términos,
 * privacidad, autorización de fotos, eliminar cuenta y Libro de
 * Reclamaciones. Google Play exige que la política de privacidad y la
 * forma de pedir la eliminación estén en una URL pública, e Indecopi
 * que el Libro de Reclamaciones esté en la web.
 */
export const metadata = {
  title: "AlToque Perú WK",
  description: "Términos, privacidad y atención al cliente de AlToque Perú WK.",
};

const ENLACES = [
  { href: "/terminos", texto: "Términos y condiciones" },
  { href: "/privacidad", texto: "Política de privacidad" },
  { href: "/autorizacion-fotos", texto: "Autorización de fotos" },
  { href: "/eliminar-cuenta", texto: "Eliminar mi cuenta" },
];

export default function LayoutPublico({ children }) {
  return (
    <div className="min-h-screen bg-[#EFF3F9] text-slate-900">
      <header className="bg-[#0F1B33]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/terminos" className="flex items-center gap-3">
            <Image src="/logo.png" alt="AlToque Perú WK" width={36} height={36} className="object-contain" />
            <span className="text-[13px] font-bold tracking-[0.14em] text-[#E8B800]">ALTOQUE PERÚ</span>
          </Link>
          <Link
            href="/libro-reclamaciones"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/10"
          >
            Libro de Reclamaciones
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 text-[13px] text-slate-600">
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {ENLACES.map((e) => (
              <Link key={e.href} href={e.href} className="font-medium text-[#1B2A4A] hover:underline">
                {e.texto}
              </Link>
            ))}
            <Link href="/libro-reclamaciones" className="font-semibold text-[#1B2A4A] hover:underline">
              Libro de Reclamaciones
            </Link>
          </nav>
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">{EMPRESA.razonSocial} · RUC {EMPRESA.ruc}</p>
            <p>{EMPRESA.domicilio}</p>
            <p>
              {EMPRESA.correo} · WhatsApp {EMPRESA.whatsapp}
            </p>
          </div>
          <p className="text-[12px] text-slate-500">
            AlToque no está afiliado ni es patrocinado por BCP, BBVA, Interbank, Scotiabank, BanBif, CMR ni ningún otro
            banco o emisor. Sus marcas pertenecen a sus dueños.
          </p>
        </div>
      </footer>
    </div>
  );
}
