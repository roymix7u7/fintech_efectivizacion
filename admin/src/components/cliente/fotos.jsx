"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Boton } from "./piezas";

/**
 * Fotos del cliente, igual que en la app (SubidaDocumentos, HojaFoto y
 * PorQueFoto):
 *   - Documento (y tarjeta, comprobante): "Tomar foto" o "Elegir de la
 *     galería". En el celular, tomar foto abre la cámara trasera; en la
 *     computadora, la cámara web.
 *   - Selfie: solo con la cámara. Una foto de galería no prueba que la
 *     persona esté presente.
 * Antes de elegir se muestra cómo debe verse la foto, y siempre a mano
 * por qué se pide y cómo se cuida.
 *
 * Cada foto se convierte a JPEG y se reduce antes de subirla: el bucket
 * guarda "<usuario>/<foto>.jpg" y el límite es de 5 MB.
 */
export const DOCUMENTOS = [
  {
    key: "dni_frontal",
    titulo: (d) => `${d} · frente`,
    ayuda: "Que se lean tu foto y tus datos.",
    forma: "documento",
    consejos: [
      "El documento completo, con sus 4 esquinas.",
      "Que se lean tu nombre, tu número y tu foto.",
      "Sin reflejos del flash ni dedos encima.",
      "Sobre una superficie lisa y con buena luz.",
    ],
  },
  {
    key: "dni_posterior",
    titulo: (d) => `${d} · reverso`,
    ayuda: "Sin reflejos ni partes borrosas.",
    forma: "documento",
    consejos: [
      "El reverso completo, con sus 4 esquinas.",
      "Que se lea la dirección y el código de barras.",
      "Sin reflejos ni partes borrosas.",
    ],
  },
  {
    key: "selfie",
    titulo: () => "Selfie con tu documento",
    ayuda: "Sostén tu documento junto a tu rostro.",
    forma: "selfie",
    soloCamara: true,
    consejos: [
      "Tu rostro completo dentro del óvalo, sin lentes oscuros ni gorra.",
      "Sostén tu documento junto a tu cara, con los datos hacia la cámara.",
      "Con buena luz de frente, no a contraluz.",
    ],
  },
];

export const MAX_BYTES = 5 * 1024 * 1024;
const ANCHO_MAX = 1600;

export const fotosCompletas = (fotos) =>
  DOCUMENTOS.every((d) => Boolean(fotos?.[d.key]));

/** En un celular o tablet, "tomar foto" abre la cámara nativa. */
const esTactil = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches;

/** Dibuja la imagen en un lienzo, la reduce y la devuelve como JPEG. */
export async function prepararFoto(fuente) {
  let ancho, alto, dibujar;
  if (fuente instanceof HTMLCanvasElement) {
    ancho = fuente.width;
    alto = fuente.height;
    dibujar = (ctx, w, h) => ctx.drawImage(fuente, 0, 0, w, h);
  } else {
    if (!/^image\//.test(fuente.type))
      throw new Error(
        "Ese archivo no es una imagen. Elige una foto JPG o PNG.",
      );
    let bitmap;
    try {
      bitmap = await createImageBitmap(fuente);
    } catch {
      throw new Error(
        "No pudimos abrir esa imagen. Si es HEIC, tómala de nuevo o elige una en JPG.",
      );
    }
    ancho = bitmap.width;
    alto = bitmap.height;
    dibujar = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  }
  if (Math.min(ancho, alto) < 480)
    throw new Error(
      "La foto es muy pequeña: los datos no se leerían. Toma una más nítida.",
    );
  const escala = Math.min(1, ANCHO_MAX / Math.max(ancho, alto));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  dibujar(lienzo.getContext("2d"), lienzo.width, lienzo.height);
  const blob = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.85));
  if (!blob || blob.size === 0)
    throw new Error("La foto llegó vacía. Inténtalo de nuevo.");
  if (blob.size > MAX_BYTES)
    throw new Error("La foto pesa más de 5 MB. Toma una más liviana.");
  return { blob, vista: URL.createObjectURL(blob) };
}

/* ───────── Íconos ───────── */

const Icono = ({ d, className = "h-5 w-5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {[].concat(d).map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);
const I = {
  camara: [
    "M4 8h3l2-3h6l2 3h3v11H4z",
    "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  ],
  galeria: ["M4 5h16v14H4z", "m4 16 5-5 4 4 2-2 5 5", "M15.5 9.5h.01"],
  candado: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  ojo: [
    "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ],
  escudo: ["M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z", "m9 12 2 2 4-4"],
  persona: [
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
  ],
  billetera: ["M3 7h18v12H3z", "M3 7V5h14v2", "M16 13h2"],
  reloj: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
  mano: [
    "M18 11V6a2 2 0 0 0-4 0v5",
    "M14 10V4a2 2 0 0 0-4 0v6",
    "M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0",
  ],
  check: "M20 6 9 17l-5-5",
  info: ["M12 16v-4", "M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
  cerrar: "M18 6 6 18M6 6l12 12",
  flecha: "m9 18 6-6-6-6",
};

/* ───────── Ventana ───────── */

/** Ventana centrada (hoja inferior en el celular). Escape y el fondo la cierran. */
export function Ventana({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho = "max-w-md",
}) {
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", cerrar);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", cerrar);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0B1426]/70 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "scroll-fino max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white text-marca-900 shadow-2xl sm:rounded-3xl",
          ancho,
        )}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#EEF2F7] bg-white px-5 py-4">
          <h2 className="flex-1 font-heading text-lg">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6B7690] hover:bg-[#EFF3F9]"
          >
            <Icono d={I.cerrar} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Fila({ icono, titulo, texto, tono = "noche" }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tono === "oro"
            ? "bg-oro-50 text-[#8A6A00]"
            : "bg-[#0B1426] text-oro-500",
        )}
      >
        <Icono d={icono} />
      </span>
      <span className="min-w-0">
        {titulo && <span className="block font-semibold">{titulo}</span>}
        <span className="block text-sm leading-relaxed text-[#4F5B74]">
          {texto}
        </span>
      </span>
    </li>
  );
}

/* ───────── Por qué pedimos las fotos ───────── */

const POR_QUE = {
  identidad: {
    titulo: "¿Por qué te pedimos estas fotos?",
    intro:
      "Tu seguridad es lo primero. Una persona de nuestro equipo confirma que eres tú antes de que puedas operar, y estas fotos son lo que le permite hacerlo.",
    paraQue: [
      {
        icono: I.persona,
        titulo: "Confirmar que eres tú",
        texto:
          "Comparamos la selfie con la foto de tu documento. Nadie puede abrir una cuenta a tu nombre.",
      },
      {
        icono: I.escudo,
        titulo: "Proteger tu cuenta del fraude",
        texto: "Así nadie usa tu identidad ni tus tarjetas en otra cuenta.",
      },
      {
        icono: I.billetera,
        titulo: "Que el dinero llegue solo a ti",
        texto: "Depositamos únicamente en cuentas a tu nombre.",
      },
    ],
    cuidado: [
      {
        icono: I.candado,
        texto:
          "Se guardan en un archivo privado y cifrado. No son públicas ni aparecen en ningún buscador.",
      },
      {
        icono: I.ojo,
        texto:
          "Solo las ve la persona del equipo que verifica tu identidad, con un enlace temporal que caduca.",
      },
      {
        icono: I.reloj,
        texto:
          "Las usamos solo para verificar tu identidad, como explica nuestra Política de privacidad.",
      },
    ],
    nunca:
      "tu clave, tu PIN, el código de seguridad (CVV) ni el número completo de tu tarjeta. Si alguien te los pide en nombre de ALTOQUE PERU WK, no los compartas.",
  },
  tarjeta: {
    titulo: "¿Por qué te pedimos la foto?",
    intro:
      "Tu seguridad es lo primero. Una persona de nuestro equipo revisa cada tarjeta antes de que puedas operar con ella, y la foto es lo que le permite hacerlo.",
    paraQue: [
      {
        icono: I.persona,
        titulo: "Confirmar que la tarjeta es tuya",
        texto:
          "Comparamos el nombre impreso con el de tu documento. Solo operamos con tarjetas a tu nombre.",
      },
      {
        icono: I.escudo,
        titulo: "Proteger tu cuenta del fraude",
        texto:
          "Así nadie puede registrar una tarjeta ajena con tus datos, ni usar la tuya en otra cuenta.",
      },
      {
        icono: I.billetera,
        titulo: "Que el dinero llegue solo a ti",
        texto:
          "Depositamos únicamente en tu cuenta. Verificar la tarjeta es lo que lo garantiza.",
      },
    ],
    cuidado: [
      {
        icono: I.candado,
        texto:
          "Se guarda en un archivo privado y cifrado. No es pública ni aparece en ningún buscador.",
      },
      {
        icono: I.ojo,
        texto:
          "Solo la ve la persona de nuestro equipo que verifica tu tarjeta, con un enlace que caduca.",
      },
      {
        icono: I.mano,
        texto:
          "Basta con tu nombre y los últimos 4 dígitos: tapa los demás números.",
      },
    ],
    nunca:
      "el número completo de tu tarjeta, el código de seguridad (CVV), tu clave ni tu PIN. Si envías el reverso, tapa el código. Si alguien te los pide en nombre de ALTOQUE PERU WK, no los compartas.",
  },
};

export function PorQueFotos({ tipo = "identidad", abierto, onCerrar }) {
  const c = POR_QUE[tipo];
  return (
    <Ventana abierto={abierto} onCerrar={onCerrar} titulo={c.titulo}>
      <div className="space-y-6">
        <p className="leading-relaxed">{c.intro}</p>
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
            Para qué las usamos
          </h3>
          <ul className="space-y-4">
            {c.paraQue.map((f) => (
              <Fila key={f.titulo} {...f} />
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-[#F4F7FB] p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A93A6]">
            Cómo las cuidamos
          </h3>
          <ul className="space-y-3">
            {c.cuidado.map((f) => (
              <Fila key={f.texto} {...f} tono="oro" />
            ))}
          </ul>
        </section>
        <p className="flex gap-3 rounded-2xl bg-[#FDE4E4] p-4 text-sm leading-relaxed text-[#5B1414]">
          <Icono d={I.mano} className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <span>
            <strong>Nunca te pediremos </strong>
            {c.nunca}
          </span>
        </p>
        <Boton className="w-full" onClick={onCerrar}>
          Entendido
        </Boton>
      </div>
    </Ventana>
  );
}

/** Franja de confianza sobre las fotos, con el enlace a "¿Por qué?". */
export function SeguridadFotos({ tipo = "identidad" }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className="flex items-start gap-3 rounded-2xl bg-[#0B1426] p-4 text-white">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-oro-500">
          <Icono d={I.candado} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {tipo === "identidad"
              ? "Tus fotos están protegidas"
              : "Tu foto está protegida"}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-white/70">
            {tipo === "identidad"
              ? "Se guardan cifradas y solo las ve la persona del equipo que verifica."
              : "Se guarda cifrada y solo la ve la persona del equipo que verifica."}{" "}
            Nunca te pediremos tu clave ni el CVV.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-oro-500 hover:text-oro-300"
          >
            {tipo === "identidad"
              ? "¿Por qué te las pedimos?"
              : "¿Por qué te la pedimos?"}{" "}
            <Icono d={I.flecha} className="h-4 w-4" />
          </button>
        </div>
      </div>
      <PorQueFotos
        tipo={tipo}
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
      />
    </>
  );
}

/* ───────── Guía de cómo debe verse la foto ───────── */

/** Dibujo de referencia: documento o tarjeta apaisado, o rostro con documento. */
function Ilustracion({ forma }) {
  if (forma === "selfie") {
    return (
      <svg viewBox="0 0 200 130" className="h-32 w-full" aria-hidden>
        <rect width="200" height="130" rx="16" fill="#0B1426" />
        <ellipse
          cx="80"
          cy="66"
          rx="34"
          ry="44"
          fill="none"
          stroke="#E8B800"
          strokeWidth="2.5"
          strokeDasharray="6 5"
        />
        <circle cx="80" cy="56" r="17" fill="#C3D3F7" />
        <path d="M54 104c3-16 14-24 26-24s23 8 26 24" fill="#C3D3F7" />
        <rect
          x="118"
          y="62"
          width="56"
          height="36"
          rx="5"
          fill="#F4F7FB"
          stroke="#E8B800"
          strokeWidth="2"
        />
        <rect x="124" y="69" width="13" height="16" rx="2" fill="#AFBCD0" />
        <rect x="142" y="70" width="26" height="4" rx="2" fill="#AFBCD0" />
        <rect x="142" y="78" width="20" height="4" rx="2" fill="#AFBCD0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 130" className="h-32 w-full" aria-hidden>
      <rect width="200" height="130" rx="16" fill="#0B1426" />
      <rect x="34" y="22" width="132" height="86" rx="9" fill="#F4F7FB" />
      <rect x="46" y="38" width="30" height="38" rx="4" fill="#AFBCD0" />
      <rect x="86" y="40" width="64" height="6" rx="3" fill="#AFBCD0" />
      <rect x="86" y="54" width="50" height="6" rx="3" fill="#AFBCD0" />
      <rect x="86" y="68" width="58" height="6" rx="3" fill="#AFBCD0" />
      <rect x="46" y="88" width="104" height="6" rx="3" fill="#DCE3EE" />
      {["M26 34V14h20", "M154 14h20v20", "M174 96v20h-20", "M46 116H26V96"].map(
        (d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#E8B800"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  );
}

/**
 * Antes de tomar o elegir la foto: cómo debe verse y las dos opciones,
 * como la hoja de la app. La selfie solo ofrece la cámara.
 */
export function ElegirFoto({
  abierto,
  onCerrar,
  titulo,
  forma = "documento",
  consejos = [],
  soloCamara,
  onFoto,
}) {
  const camara = useRef(null);
  const galeria = useRef(null);
  const [camaraWeb, setCamaraWeb] = useState(false);

  function tomar() {
    // En el celular, la cámara nativa (trasera para documentos). En la
    // computadora no hay "capture": se abre la cámara web aquí mismo.
    if (forma !== "selfie" && esTactil()) camara.current?.click();
    else setCamaraWeb(true);
  }
  const alElegir = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) {
      onCerrar();
      onFoto(f);
    }
  };

  return (
    <>
      <Ventana
        abierto={abierto && !camaraWeb}
        onCerrar={onCerrar}
        titulo={titulo}
      >
        <div className="space-y-5">
          <Ilustracion forma={forma} />
          <ul className="space-y-2">
            {consejos.map((c) => (
              <li key={c} className="flex gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Icono d={I.check} className="h-3 w-3" />
                </span>
                {c}
              </li>
            ))}
          </ul>
          <div className="grid gap-2">
            <OpcionFoto
              icono={I.camara}
              texto="Tomar foto"
              detalle={
                forma === "selfie"
                  ? "Con la cámara frontal"
                  : "Con buena luz y sin reflejos"
              }
              onClick={tomar}
              principal
            />
            {!soloCamara && (
              <OpcionFoto
                icono={I.galeria}
                texto="Elegir de la galería"
                detalle="Una foto o captura que ya tengas"
                onClick={() => galeria.current?.click()}
              />
            )}
          </div>
          {soloCamara && (
            <p className="text-center text-chico text-[#8A93A6]">
              La selfie se toma en el momento: así confirmamos que eres tú.
            </p>
          )}
        </div>
      </Ventana>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={alElegir}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        onChange={alElegir}
      />
      {camaraWeb && (
        <CamaraFoto
          forma={forma}
          onCerrar={() => setCamaraWeb(false)}
          onFoto={(lienzo) => {
            setCamaraWeb(false);
            onCerrar();
            onFoto(lienzo);
          }}
        />
      )}
    </>
  );
}

function OpcionFoto({ icono, texto, detalle, onClick, principal }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition",
        principal
          ? "bg-[#0B1426] text-white ring-[#0B1426] hover:bg-marca-700"
          : "bg-white ring-[#DCE3EE] hover:bg-[#F6F8FC]",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          principal
            ? "bg-white/10 text-oro-500"
            : "bg-[#EFF3F9] text-marca-900",
        )}
      >
        <Icono d={icono} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{texto}</span>
        <span
          className={cn(
            "block text-chico",
            principal ? "text-white/65" : "text-[#6B7690]",
          )}
        >
          {detalle}
        </span>
      </span>
      <Icono
        d={I.flecha}
        className={cn(
          "h-4 w-4",
          principal ? "text-white/50" : "text-[#AFBCD0]",
        )}
      />
    </button>
  );
}

/**
 * Cámara en el navegador. Selfie: cámara frontal, óvalo y vista en
 * espejo. Documento: cámara trasera si existe y un marco apaisado.
 */
function CamaraFoto({ forma, onCerrar, onFoto }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [lista, setLista] = useState(false);
  const selfie = forma === "selfie";

  useEffect(() => {
    let flujo;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("sin-camara");
        flujo = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: selfie ? "user" : { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play();
          setLista(true);
        }
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Necesitamos permiso para usar tu cámara. Actívalo en la barra del navegador y vuelve a intentarlo."
            : selfie
              ? "No encontramos una cámara en este equipo. Termina el registro desde tu celular o desde la app."
              : "No encontramos una cámara en este equipo. Usa “Elegir de la galería” o entra desde tu celular.",
        );
      }
    })();
    return () => flujo?.getTracks().forEach((t) => t.stop());
  }, [selfie]);

  function capturar() {
    const v = video.current;
    const lienzo = document.createElement("canvas");
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
    // Se guarda sin efecto espejo: así el documento se lee al derecho.
    lienzo.getContext("2d").drawImage(v, 0, 0);
    onFoto(lienzo);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B1426]/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={selfie ? "Tomar selfie" : "Tomar foto del documento"}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white">
        <div
          className={cn(
            "relative bg-black",
            selfie ? "aspect-[3/4]" : "aspect-[4/3]",
          )}
        >
          <video
            ref={video}
            playsInline
            muted
            className={cn(
              "h-full w-full object-cover",
              selfie && "-scale-x-100",
            )}
          />
          {lista &&
            (selfie ? (
              <div className="pointer-events-none absolute inset-[12%] rounded-[45%] border-2 border-dashed border-white/70" />
            ) : (
              <div className="pointer-events-none absolute inset-x-[10%] inset-y-[18%] rounded-xl border-2 border-dashed border-oro-500/90" />
            ))}
          {error && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
              {error}
            </p>
          )}
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-[#4F5B74]">
            {selfie
              ? "Ubica tu rostro en el óvalo y sostén tu documento junto a él, con los datos hacia la cámara."
              : "Encaja el documento dentro del marco, sin reflejos y con todos los datos legibles."}
          </p>
          <div className="flex gap-2">
            <Boton
              type="button"
              tono="neutro"
              className="flex-1"
              onClick={onCerrar}
            >
              Cancelar
            </Boton>
            <Boton
              type="button"
              tono="oro"
              className="flex-1"
              disabled={!lista}
              onClick={capturar}
            >
              Tomar foto
            </Boton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────── Las tres fotos de identidad ───────── */

export default function SubidaFotos({
  fotos,
  onCambio,
  tipoDocumento = "dni",
  deshabilitado,
}) {
  const nombreDoc = tipoDocumento === "ce" ? "Carnet" : "DNI";
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(null); // key del documento
  const hechas = DOCUMENTOS.filter((d) => fotos[d.key]).length;
  const doc = DOCUMENTOS.find((d) => d.key === eligiendo);

  async function guardar(key, fuente) {
    setError("");
    try {
      const foto = await prepararFoto(fuente);
      onCambio({ ...fotos, [key]: foto });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <SeguridadFotos tipo="identidad" />
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-marca-900">3 fotos</span>
        <span
          className={cn(
            "cifras font-semibold",
            hechas === 3 ? "text-emerald-700" : "text-[#8A93A6]",
          )}
        >
          {hechas} de 3 listas
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {DOCUMENTOS.map((d) => {
          const foto = fotos[d.key];
          return (
            <li key={d.key}>
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => setEligiendo(d.key)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition disabled:opacity-50",
                  foto
                    ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                    : "border-[#E3E9F2] hover:border-marca-600 hover:bg-[#F6F8FC]",
                )}
              >
                <span className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFF3F9] text-[#8A93A6]">
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={foto.vista}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icono
                      d={d.soloCamara ? I.persona : I.camara}
                      className="h-6 w-6"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-marca-900">
                    {d.titulo(nombreDoc)}
                  </span>
                  <span className="block text-chico text-[#6B7690]">
                    {foto ? "Lista · toca para cambiarla" : d.ayuda}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#EFF3F9] px-2 py-0.5 text-[0.7rem] font-semibold text-[#3D4A63]">
                    <Icono
                      d={d.soloCamara ? I.camara : I.galeria}
                      className="h-3 w-3"
                    />
                    {d.soloCamara ? "Solo con la cámara" : "Cámara o galería"}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold",
                    foto
                      ? "bg-white text-marca-900 ring-1 ring-[#DCE3EE]"
                      : "bg-marca-900 text-white",
                  )}
                >
                  {foto ? (
                    <Icono d={I.check} className="h-4 w-4 text-emerald-600" />
                  ) : (
                    "Subir"
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {doc && (
        <ElegirFoto
          abierto
          onCerrar={() => setEligiendo(null)}
          titulo={doc.titulo(nombreDoc)}
          forma={doc.forma}
          consejos={doc.consejos}
          soloCamara={doc.soloCamara}
          onFoto={(f) => guardar(doc.key, f)}
        />
      )}
    </div>
  );
}
