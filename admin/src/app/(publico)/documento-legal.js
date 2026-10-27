import Link from "next/link";
import { clientePublico } from "@/lib/supabasePublico";

/**
 * La versión vigente de un documento legal, tal como la ve el cliente
 * en la app (mismo texto, misma base). Se renueva cada 5 minutos: al
 * publicar una versión nueva desde el panel, aparece sola.
 */
export async function leerVigente(tipo) {
  const { data } = await clientePublico()
    .from("documentos_legales")
    .select("tipo, version, titulo, resumen, contenido, borrador, publicado_en")
    .eq("tipo", tipo)
    .order("publicado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function bloques(contenido) {
  const salida = [];
  let parrafo = [];
  const cerrar = () => {
    if (parrafo.length) salida.push({ t: "p", x: parrafo.join(" ") });
    parrafo = [];
  };
  for (const l of String(contenido || "").replace(/\r\n/g, "\n").split("\n").map((x) => x.trim())) {
    if (!l) cerrar();
    else if (l.startsWith("## ")) {
      cerrar();
      salida.push({ t: "h", x: l.slice(3) });
    } else if (l.startsWith("- ")) {
      cerrar();
      salida.push({ t: "li", x: l.slice(2) });
    } else parrafo.push(l);
  }
  cerrar();
  return salida;
}

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "";

const DOCUMENTOS = [
  { href: "/terminos", texto: "Términos y condiciones", tipo: "terminos" },
  { href: "/privacidad", texto: "Política de privacidad", tipo: "privacidad" },
  { href: "/autorizacion-fotos", texto: "Autorización de fotos", tipo: "biometria" },
];

/** Al final de cada documento: los otros documentos y volver al inicio. */
function Siguiente({ tipo }) {
  return (
    <nav className="mt-6 flex flex-wrap items-center gap-2" aria-label="Otros documentos">
      <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-marca-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-marca-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Volver al inicio
      </Link>
      {DOCUMENTOS.filter((d) => d.tipo !== tipo).map((d) => (
        <Link key={d.href} href={d.href} className="rounded-full border border-[#DCE3EE] bg-white px-4 py-2.5 text-sm font-semibold text-marca-700 transition hover:border-marca-300">
          {d.texto}
        </Link>
      ))}
    </nav>
  );
}

export function DocumentoLegal({ documento, nombre, tipo }) {
  if (!documento) {
    return (
      <>
        <article className="rounded-3xl bg-white p-6 shadow-sm sm:p-10">
          <h1 className="font-heading text-2xl font-semibold">{nombre}</h1>
          <p className="mt-3 text-[#4F5B74]">Este documento no está disponible en este momento. Vuelve a intentarlo en unos minutos.</p>
        </article>
        <Siguiente tipo={tipo} />
      </>
    );
  }
  return (
    <>
      <article className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <header className="border-b border-[#E3E9F2] px-6 pb-6 pt-8 sm:px-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-oro-700">Documento legal</p>
          <h1 className="mt-2 text-balance font-heading text-3xl font-bold leading-tight sm:text-4xl">{documento.titulo}</h1>
          {documento.resumen && <p className="mt-3 max-w-[60ch] text-lg text-[#4F5B74]">{documento.resumen}</p>}
          <p className="mt-4 inline-flex rounded-full bg-[#EFF3F9] px-3 py-1 text-chico font-semibold text-[#4F5B74]">
            Versión {documento.version} · vigente desde el {fecha(documento.publicado_en)}
          </p>
          {documento.borrador && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Versión preliminar, en revisión legal.</p>
          )}
        </header>
        <div className="max-w-[68ch] space-y-3.5 px-6 py-8 text-md leading-relaxed text-[#2E3A52] sm:px-10">
          {bloques(documento.contenido).map((b, i) =>
            b.t === "h" ? (
              <h2 key={i} className="pt-4 font-heading text-lg font-semibold text-marca-700 first:pt-0">
                {b.x}
              </h2>
            ) : b.t === "li" ? (
              <p key={i} className="flex gap-3 pl-1">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-oro-500" />
                <span>{b.x}</span>
              </p>
            ) : (
              <p key={i}>{b.x}</p>
            ),
          )}
        </div>
      </article>
      <Siguiente tipo={tipo} />
    </>
  );
}
