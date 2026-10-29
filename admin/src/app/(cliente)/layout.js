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
    <div className="area-cliente min-h-screen bg-[#E6ECF4] font-sans text-marca-900">
      {children}
    </div>
  );
}
