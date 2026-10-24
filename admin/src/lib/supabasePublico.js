import { createClient } from "@supabase/supabase-js";

/**
 * Cliente para las páginas públicas (términos, privacidad, eliminar
 * cuenta, Libro de Reclamaciones).
 *
 * No guarda sesión ni la lee: en el mismo navegador puede estar abierto
 * el panel, y un cliente que entra a pedir la eliminación de su cuenta
 * no debe pisar la sesión del administrador (ni al revés).
 */
export function clientePublico() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "atk-publico" },
  });
}

export const EMPRESA = {
  razonSocial: "ALTOQUE PERU WK S.A.C.",
  ruc: "20611531410",
  domicilio: "Av. Abel B. Du Petit Thouars N.° 1775, Dpto. 403, Lince, Lima, Perú",
  correo: "contacto@altoqueperu.com",
  whatsapp: "+51 995 766 986",
};
