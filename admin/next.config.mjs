/**
 * Encabezados de seguridad para todas las páginas (landing, área del
 * cliente y panel).
 *
 *   · frame-ancestors 'self': nadie puede meter estas páginas dentro de
 *     otra web (evita que engañen a alguien para tocar botones ocultos).
 *     La única excepción es la ficha del cliente, que Chatwoot muestra
 *     como pestaña: a ella la puede incrustar Chatwoot y nadie más.
 *   · nosniff: el navegador no "adivina" el tipo de un archivo.
 *   · Referrer-Policy: a otros sitios no les llega la dirección completa
 *     de la página (que podría llevar datos en la URL).
 *   · Permissions-Policy: la cámara solo para esta web (fotos del DNI y
 *     la tarjeta); ubicación, para nadie. El micrófono solo se le presta
 *     al chat propio, que va incrustado en el panel, para que el asesor
 *     grabe notas de voz; sin chat propio, para nadie.
 *   · HSTS: el navegador solo entra por https (en local no aplica).
 */
const origenDe = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};
// Los que pueden incrustar la ficha: Chatwoot y el chat propio (el que esté configurado).
const CHATWOOT = [origenDe(process.env.NEXT_PUBLIC_CHATWOOT_URL), origenDe(process.env.NEXT_PUBLIC_CHAT_URL)].filter(Boolean).join(" ") || null;

// A quién se le presta el micrófono: al chat propio (y, en desarrollo, al que corre en esta computadora).
const MICROFONO = [origenDe(process.env.NEXT_PUBLIC_CHAT_URL), process.env.NODE_ENV !== "production" && origenDe(process.env.NEXT_PUBLIC_CHAT_PANEL_LOCAL)]
  .filter(Boolean)
  .map((o) => `"${o}"`)
  .join(" ");
// Para prestárselo a un marco, el navegador exige que la página que lo contiene también lo
// tenga permitido ("self"). Ninguna pantalla del panel lo usa; solo sirve para delegarlo.
const PERMISO_MICROFONO = MICROFONO ? `self ${MICROFONO}` : "";

const comunes = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: `camera=(self), microphone=(${PERMISO_MICROFONO}), geolocation=(), payment=()` },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: comunes },
      // Va después: para esta ruta reemplaza el frame-ancestors de arriba.
      {
        source: "/soporte/ficha",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self'${CHATWOOT ? ` ${CHATWOOT}` : ""}`,
          },
        ],
      },
      // Avisos del navegador: que siempre se baje la versión nueva.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
