import { DocumentoLegal, leerVigente } from "../documento-legal";

// Se vuelve a leer de la base cada minuto.
export const revalidate = 60;

export const metadata = { title: "Política de privacidad | AlToque Perú WK" };

export default async function Pagina() {
  return <DocumentoLegal documento={await leerVigente("privacidad")} nombre="Política de privacidad" tipo="privacidad" />;
}
