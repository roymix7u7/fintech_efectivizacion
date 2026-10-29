"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Boton } from "./piezas";

/**
 * Las tres fotos de identidad, igual que en la app
 * (app/src/components/SubidaDocumentos.js): documento por ambos lados
 * (galería o cámara) y una selfie sosteniéndolo, solo con cámara.
 *
 * Cada foto se convierte a JPEG y se reduce antes de subirla: el bucket
 * guarda "<usuario>/<foto>.jpg" y el límite es de 5 MB.
 */
export const DOCUMENTOS = [
  {
    key: "dni_frontal",
    titulo: (d) => `${d} · frente`,
    ayuda: "Que se lean tu foto y tus datos.",
  },
  {
    key: "dni_posterior",
    titulo: (d) => `${d} · reverso`,
    ayuda: "Sin reflejos ni partes borrosas.",
  },
  {
    key: "selfie",
    titulo: () => "Selfie con tu documento",
    ayuda: "Sostén tu documento junto a tu rostro, con buena luz.",
    soloCamara: true,
  },
];

export const MAX_BYTES = 5 * 1024 * 1024;
const ANCHO_MAX = 1600;

export const fotosCompletas = (fotos) =>
  DOCUMENTOS.every((d) => Boolean(fotos?.[d.key]));

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
    const bitmap = await createImageBitmap(fuente);
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

export default function SubidaFotos({
  fotos,
  onCambio,
  tipoDocumento = "dni",
  deshabilitado,
}) {
  const nombreDoc = tipoDocumento === "ce" ? "Carnet" : "DNI";
  const [error, setError] = useState("");
  const [camara, setCamara] = useState(false);
  const hechas = DOCUMENTOS.filter((d) => fotos[d.key]).length;

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
    <div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="font-semibold text-marca-900">3 fotos</span>
        <span
          className={cn(
            "font-semibold",
            hechas === 3 ? "text-emerald-700" : "text-[#8A93A6]",
          )}
        >
          {hechas} de 3 listas
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {DOCUMENTOS.map((d) => {
          const foto = fotos[d.key];
          return (
            <li
              key={d.key}
              className={cn(
                "flex items-center gap-4 rounded-2xl border p-3",
                foto
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-[#E3E9F2]",
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    className="h-6 w-6"
                    aria-hidden
                  >
                    {d.soloCamara ? (
                      <>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <circle cx="9" cy="11" r="2" />
                        <path d="M14 10h4M14 14h4" />
                      </>
                    )}
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-marca-900">
                  {d.titulo(nombreDoc)}
                </span>
                <span className="block text-chico text-[#8A93A6]">
                  {foto ? "Lista" : d.ayuda}
                </span>
              </span>
              {d.soloCamara ? (
                <Boton
                  type="button"
                  tono={foto ? "neutro" : "primario"}
                  className="h-10 px-4 text-sm"
                  disabled={deshabilitado}
                  onClick={() => setCamara(true)}
                >
                  {foto ? "Repetir" : "Tomar"}
                </Boton>
              ) : (
                <label
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition",
                    foto
                      ? "border border-[#DCE3EE] bg-white text-marca-900"
                      : "bg-marca-900 text-white hover:bg-marca-700",
                    deshabilitado && "pointer-events-none opacity-50",
                  )}
                >
                  {foto ? "Cambiar" : "Subir"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) guardar(d.key, f);
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {camara && (
        <CamaraSelfie
          onCerrar={() => setCamara(false)}
          onFoto={(lienzo) => guardar("selfie", lienzo)}
        />
      )}
    </div>
  );
}

/**
 * Cámara para la selfie. Solo cámara a propósito: una foto elegida de
 * la galería no prueba que la persona esté presente.
 */
function CamaraSelfie({ onCerrar, onFoto }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let flujo;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("sin-camara");
        flujo = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
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
            : "No encontramos una cámara en este equipo. Termina el registro desde tu celular o desde la app.",
        );
      }
    })();
    return () => flujo?.getTracks().forEach((t) => t.stop());
  }, []);

  function capturar() {
    const v = video.current;
    const lienzo = document.createElement("canvas");
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
    const ctx = lienzo.getContext("2d");
    // Se guarda sin efecto espejo: así el documento se lee al derecho.
    ctx.drawImage(v, 0, 0);
    onFoto(lienzo);
    onCerrar();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0B1426]/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tomar selfie"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white">
        <div className="relative aspect-[3/4] bg-black">
          <video
            ref={video}
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />
          {lista && (
            <div className="pointer-events-none absolute inset-[12%] rounded-[45%] border-2 border-dashed border-white/70" />
          )}
          {error && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
              {error}
            </p>
          )}
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-[#4F5B74]">
            Ubica tu rostro en el óvalo y sostén tu documento junto a él, con
            los datos hacia la cámara.
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
    </div>
  );
}
