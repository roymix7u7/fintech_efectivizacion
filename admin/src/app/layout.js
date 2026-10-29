import localFont from "next/font/local";
import "./globals.css";

// Las mismas fuentes que la app móvil: Manrope para leer y operar,
// Sora para títulos y cifras grandes.
//
// Van dentro del proyecto (src/app/fonts) y no se descargan de Google
// Fonts al compilar: si esa descarga fallaba, la página se quedaba sin
// fuente y el navegador mostraba Times New Roman. Son variables, así que
// un solo archivo trae todos los grosores. Licencia OFL 1.1.
//
// Las variables van en <html> y no en <body>: Tailwind aplica la fuente
// en <html>.
const manrope = localFont({
  src: "./fonts/Manrope-variable.woff2",
  variable: "--font-texto",
  weight: "200 800",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});
const sora = localFont({
  src: "./fonts/Sora-variable.woff2",
  variable: "--font-titulo",
  weight: "100 800",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
  fallback: ["ui-monospace", "Consolas", "monospace"],
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
