import { DocumentoLegal, leerVigente } from "../documento-legal";

// Se vuelve a leer de la base cada 5 minutos.
export const revalidate = 300;

export const metadata = { title: "Política de privacidad | AlToque Perú WK" };

export default async function Pagina() {
  return <DocumentoLegal documento={await leerVigente("privacidad")} nombre="Política de privacidad" />;
}
