import { ProveedorCuenta } from "@/components/cliente/contexto";

/**
 * Mi cuenta y sus pantallas comparten este layout: el encabezado, la
 * barra lateral y la sesión no se vuelven a cargar al moverse entre
 * vistas; solo cambia el contenido.
 */
export default function LayoutCuenta({ children }) {
  return <ProveedorCuenta>{children}</ProveedorCuenta>;
}
