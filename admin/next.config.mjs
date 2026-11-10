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
 *     la tarjeta); micrófono y ubicación, para nadie.
 *   · HSTS: el navegador solo entra por https (en local no aplica).
 */
const CHATWOOT = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CHATWOOT_URL).origin;
  } catch {
    return null;
  }
})();

const comunes = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
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
    ];
  },
};

export default nextConfig;
