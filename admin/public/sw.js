/*
 * Avisos del navegador de AlToque (lib/avisosNavegador.js).
 *
 * Solo muestra las notificaciones que manda la función chatwoot-avisos de
 * Supabase cuando un asesor responde, y al tocarlas abre Mi cuenta con el
 * chat. No guarda páginas ni datos: la web funciona igual sin él.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let datos = {};
  try {
    datos = e.data ? e.data.json() : {};
  } catch {
    datos = { cuerpo: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    (async () => {
      // Si el cliente está mirando la web en este momento, el chat ya le
      // muestra el mensaje: no hace falta otra notificación.
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (ventanas.some((v) => v.visibilityState === "visible" && v.focused)) return;

      await self.registration.showNotification(datos.titulo || "AlToque Perú WK", {
        body: datos.cuerpo || "Tienes un mensaje nuevo.",
        icon: "/icon.png",
        badge: "/icon.png",
        tag: datos.etiqueta || "chat",
        renotify: true,
        data: { url: datos.url || "/cuenta?chat=1" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/cuenta?chat=1", self.location.origin);
  // Solo se abren páginas de este mismo sitio.
  if (destino.origin !== self.location.origin) return;
  e.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === destino.origin);
      if (abierta) {
        await abierta.focus();
        return abierta.navigate(destino.href).catch(() => {});
      }
      return self.clients.openWindow(destino.href);
    })(),
  );
});
