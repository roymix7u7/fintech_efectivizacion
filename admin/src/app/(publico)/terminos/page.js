import { DocumentoLegal, leerVigente } from "../documento-legal";

// Se vuelve a leer de la base cada 5 minutos.
export const revalidate = 300;

export const metadata = { title: "Términos y condiciones | AlToque Perú WK" };

export default async function Pagina() {
  return <DocumentoLegal documento={await leerVigente("terminos")} nombre="Términos y condiciones" />;
}
