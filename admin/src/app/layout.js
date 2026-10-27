import localFont from "next/font/local";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";

// Las mismas fuentes que la app móvil: Manrope para leer y operar,
// Sora para títulos y cifras grandes. Así el panel y la app se sienten
// de la misma casa.
//
// Las variables van en <html> y no en <body>: Tailwind aplica la fuente
// en <html>, y si la variable no existe ahí el navegador cae a su letra
// por defecto (Times New Roman), que es lo que se veía antes.
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-texto",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-titulo",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata = {
  title: "Panel Administrativo | AlToque Perú WK",
  description: "Gestión de clientes, tarjetas y solicitudes de operación",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${manrope.variable} ${sora.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
