import { DocumentoLegal, leerVigente } from "../documento-legal";

// Se vuelve a leer de la base cada minuto.
export const revalidate = 60;

export const metadata = { title: "Autorización para fotos de identidad | AlToque Perú WK" };

export default async function Pagina() {
  return <DocumentoLegal documento={await leerVigente("biometria")} nombre="Autorización para fotos de identidad" tipo="biometria" />;
}
