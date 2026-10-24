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

export function DocumentoLegal({ documento, nombre }) {
  if (!documento) {
    return (
      <article className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{nombre}</h1>
        <p className="mt-3 text-slate-600">Este documento no está disponible en este momento.</p>
      </article>
    );
  }
  return (
    <article className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight">{documento.titulo}</h1>
      {documento.resumen && <p className="mt-2 text-slate-600">{documento.resumen}</p>}
      <p className="mt-3 text-[13px] text-slate-500">
        Versión {documento.version} · vigente desde el {fecha(documento.publicado_en)}
      </p>
      {documento.borrador && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Versión preliminar, en revisión legal.
        </p>
      )}
      <div className="mt-6 max-w-[65ch] space-y-3 text-[15px] leading-relaxed text-slate-700">
        {bloques(documento.contenido).map((b, i) =>
          b.t === "h" ? (
            <h2 key={i} className="pt-3 text-[17px] font-semibold text-slate-900">
              {b.x}
            </h2>
          ) : b.t === "li" ? (
            <p key={i} className="flex gap-3 pl-1">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E8B800]" />
              <span>{b.x}</span>
            </p>
          ) : (
            <p key={i}>{b.x}</p>
          ),
        )}
      </div>
    </article>
  );
}
