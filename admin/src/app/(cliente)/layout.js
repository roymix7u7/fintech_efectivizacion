/**
 * Área de clientes en la web: registro, ingreso, recuperar contraseña y
 * Mi cuenta. Usa la misma base que la app, así que una cuenta creada aquí
 * entra en la app y al revés.
 */
export const metadata = {
  title: "Mi cuenta | ALTOQUE PERU WK",
  description: "Crea tu cuenta o ingresa a ALTOQUE PERU WK.",
};

export default function LayoutCliente({ children }) {
  return (
    <div className="area-cliente isolate min-h-screen bg-[#E7EAF1] font-sans text-marca-900">
      {/* Fondo con tarjetas y líneas suaves. Va en una capa fija y no con
          background-attachment: fixed, que el celular no respeta. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[url('/sitio/fondo-cliente.webp')] bg-cover bg-center"
      />
      {children}
    </div>
  );
}
