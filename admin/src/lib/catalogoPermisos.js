/**
 * Catálogo de permisos detallados del personal.
 *
 * Lo mantiene el programador. Las pantallas salen del MENU de
 * components/shell.jsx (ruta, título y roles); aquí se listan, por
 * pantalla, las partes que se pueden quitar a una persona:
 *
 *   · tipo "vista":  una sección o pestaña que deja de verse.
 *   · tipo "accion": un botón que deja de aparecer.
 *
 * Cada parte tiene la clave "pantalla.parte" (ej. "clientes.bloquear"),
 * que es lo que se guarda en permisos_personal (migraciones 077 y 078)
 * y lo que pregunta la página con puede(session, "clientes.bloquear")
 * (lib/permisos.js).
 *
 * `roles` es a quién le sirve la parte: si el rol no la trae (por su
 * propio trabajo), no se muestra al configurar.
 *
 * Para sumar una parte nueva:
 *   1. Agrégala aquí, en la pantalla que le toca.
 *   2. En la página, envuelve el botón o la sección con
 *      puede(session, "pantalla.parte").
 *   3. Si la acción pasa por una función o tabla de la base, agrega la
 *      fila en permisos_api (ver migración 078) para que la base también
 *      la frene, aunque alguien la llame a mano.
 */
export const PARTES = {
  dashboard: [
    { clave: "graficos", titulo: "Gráficos de operación", detalle: "Tendencias, bancos y sedes", tipo: "vista", roles: ["admin", "supervisor"] },
  ],
  kyc: [
    { clave: "aprobar", titulo: "Aprobar identidades", tipo: "accion", roles: ["admin", "gestor"] },
    { clave: "observar", titulo: "Observar documentos", detalle: "Pedir al cliente que los reenvíe", tipo: "accion", roles: ["admin", "gestor"] },
    { clave: "nombre-dni", titulo: "Corregir el nombre con el del DNI", detalle: "Cuando el cliente se equivocó al escribirlo. También desde Clientes", tipo: "accion", roles: ["admin", "supervisor", "gestor"] },
  ],
  tarjetas: [
    { clave: "aprobar", titulo: "Aprobar tarjetas", tipo: "accion", roles: ["admin", "gestor"] },
    { clave: "rechazar", titulo: "Rechazar tarjetas", tipo: "accion", roles: ["admin", "gestor"] },
    { clave: "baja", titulo: "Dar de baja tarjetas", tipo: "accion", roles: ["admin", "supervisor", "gestor"] },
  ],
  solicitudes: [
    { clave: "aprobar", titulo: "Aprobar solicitudes", tipo: "accion", roles: ["admin", "gestor"] },
    { clave: "rechazar", titulo: "Rechazar solicitudes", tipo: "accion", roles: ["admin", "gestor"] },
  ],
  pagos: [
    { clave: "confirmar", titulo: "Armar lotes y confirmar transferencias", tipo: "accion", roles: ["admin", "pagos"] },
    { clave: "cancelar", titulo: "Cancelar envíos", tipo: "accion", roles: ["admin", "pagos"] },
    { clave: "historial", titulo: "Lotes enviados", detalle: "Historial de lo pagado", tipo: "vista", roles: ["admin", "pagos"] },
  ],
  clientes: [
    { clave: "fotos", titulo: "Ver fotos del DNI y de las tarjetas", tipo: "vista", roles: ["admin", "supervisor", "pagos", "gestor"] },
    { clave: "editar", titulo: "Corregir datos del cliente", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "bloquear", titulo: "Bloquear o desbloquear cuentas", detalle: "También desde Verificación", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "cupon", titulo: "Asignar o quitar cupón", tipo: "accion", roles: ["admin"] },
    { clave: "especial", titulo: "Comisión especial por cliente", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "seguimiento", titulo: "Seguimiento posventa", detalle: "Recordatorios y contactos", tipo: "vista", roles: ["admin", "supervisor", "pagos"] },
    { clave: "lista-bloqueo", titulo: "Lista de bloqueo", detalle: "DNI, celulares y cuentas de casos de fraude", tipo: "vista", roles: ["admin", "supervisor"] },
  ],
  equipo: [
    { clave: "rendimiento", titulo: "Rendimiento del personal", detalle: "Casos resueltos de los últimos 7 días", tipo: "vista", roles: ["admin", "supervisor"] },
    { clave: "crear", titulo: "Crear cuentas", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "bloquear", titulo: "Bloquear o desbloquear personal", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "rol", titulo: "Cambiar rol y sede", tipo: "accion", roles: ["admin"] },
    { clave: "bancos", titulo: "Asignar bancos a Pagos", tipo: "accion", roles: ["admin"] },
    { clave: "chat", titulo: "Invitar o sacar del chat", tipo: "accion", roles: ["admin", "supervisor"] },
    { clave: "eliminar", titulo: "Eliminar cuentas", tipo: "accion", roles: ["admin"] },
  ],
  sedes: [
    { clave: "crear", titulo: "Crear sedes", tipo: "accion", roles: ["admin"] },
    { clave: "editar", titulo: "Editar o desactivar sedes", tipo: "accion", roles: ["admin"] },
  ],
  comisiones: [
    { clave: "estandar", titulo: "Cambiar la tarifa estándar", tipo: "accion", roles: ["admin"] },
    { clave: "cupones", titulo: "Crear y editar cupones", tipo: "accion", roles: ["admin"] },
    { clave: "especiales", titulo: "Comisiones especiales", detalle: "La lista de clientes con comisión propia", tipo: "vista", roles: ["admin", "supervisor"] },
  ],
  alertas: [
    { clave: "alertas", titulo: "Alertas", detalle: "Avisos urgentes en la app", tipo: "vista", roles: ["admin"] },
    { clave: "noticias", titulo: "Noticias", tipo: "vista", roles: ["admin"] },
    { clave: "notificar", titulo: "Enviar notificación al celular", tipo: "accion", roles: ["admin"] },
  ],
  reclamaciones: [
    { clave: "responder", titulo: "Responder reclamos", tipo: "accion", roles: ["admin", "supervisor"] },
  ],
  "pedidos-datos": [
    { clave: "atender", titulo: "Tomar y rechazar pedidos", tipo: "accion", roles: ["admin"] },
    { clave: "eliminar", titulo: "Eliminar cuentas definitivamente", tipo: "accion", roles: ["admin"] },
  ],
  legal: [
    { clave: "publicar", titulo: "Publicar versiones nuevas", tipo: "accion", roles: ["admin"] },
  ],
  chat: [
    { clave: "fotos", titulo: "Ver la foto de los clientes", detalle: "Su rostro, recortado de la selfie de verificación", tipo: "vista", roles: ["admin", "supervisor", "gestor", "pagos"] },
  ],
};

/** Las partes de una pantalla que le sirven a un rol. */
export const partesDe = (pantalla, rol) => (PARTES[pantalla] || []).filter((p) => !rol || p.roles.includes(rol));
