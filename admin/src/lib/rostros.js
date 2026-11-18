import { supabase } from "./supabase";
import { urlsFirmadas, extraerPath } from "./storage";

/**
 * Rostro del cliente para el chat del personal (migración 080).
 *
 * Una miniatura de 192 × 192 (~10 KB) recortada de la selfie de la
 * verificación, en el bucket privado "rostros" como <user_id>.jpg.
 *
 *   · Se recorta aquí, en el navegador del personal: un detector de
 *     rostros (MediaPipe) busca la cara y se guarda solo ese cuadro, sin
 *     el DNI que el cliente sostiene. La selfie original no se toca.
 *   · Se genera sola la primera vez que el chat pide la foto de un cliente
 *     verificado que todavía no la tiene, y de nuevo al aprobar su
 *     identidad (por si cambió la selfie).
 *   · El chat nunca toca la base: le pide las fotos al panel
 *     (components/chatIncrustado.jsx), que las firma con la sesión del
 *     asesor. El enlace vence en una hora; el cliente no la ve nunca.
 *
 * El detector (~3 MB comprimido) se baja una sola vez por navegador, y
 * solo cuando hay una miniatura que crear: mostrar las que ya existen no
 * lo necesita.
 */

const BUCKET = "rostros";
const BUCKET_KYC = "kyc-documentos";
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MODELO = "/modelos/rostros.tflite";
const LADO = 192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIRMA_SEG = 3600;
const REUSAR_MS = 50 * 60 * 1000; // el enlace firmado se reusa hasta 10 min antes de vencer
const SIN_FOTO_MS = 10 * 60 * 1000; // sin miniatura: no se vuelve a preguntar en 10 min
// Selfies donde no se encontró la cara: no se vuelven a bajar en un día.
// (v2: las marcadas antes de probar la foto girada se reintentan.)
const NO_SALIO = "atk-rostro-no-salio-v2";
const REINTENTAR_MS = 24 * 60 * 60 * 1000;

const memoria = new Map(); // user_id → { url: string | null, hasta: ms }
const enCola = new Set();
let cola = Promise.resolve();
let detector = null;

const esId = (id) => UUID.test(String(id || ""));
const rutaDe = (id) => `${id}.jpg`;

function leerNoSalio() {
  try {
    return JSON.parse(window.localStorage.getItem(NO_SALIO) || "{}");
  } catch {
    return {};
  }
}
function marcarNoSalio(id) {
  try {
    const m = leerNoSalio();
    m[id] = Date.now();
    window.localStorage.setItem(NO_SALIO, JSON.stringify(m));
  } catch {}
}
const noSalioHace = (m, id) => m[id] && Date.now() - m[id] < REINTENTAR_MS;

/** El detector de rostros, cargado una sola vez. */
function cargarDetector() {
  if (!detector) {
    detector = (async () => {
      const vision = await import(/* webpackIgnore: true */ `${CDN}/vision_bundle.mjs`);
      const archivos = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      return vision.FaceDetector.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: MODELO, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })().catch((e) => {
      detector = null;
      throw e;
    });
  }
  return detector;
}

/**
 * Recorta el rostro de una selfie (URL firmada). Devuelve un JPEG de
 * 192 × 192 o null si no encontró una cara clara.
 */
export async function recortarRostro(urlSelfie) {
  const det = await cargarDetector();
  const r = await fetch(urlSelfie);
  if (!r.ok) throw new Error("No se pudo leer la selfie.");
  const img = await createImageBitmap(await r.blob(), { imageOrientation: "from-image" });

  // Las fotos del celular a veces llegan de costado. Se busca la cara tal
  // cual y, si no aparece, girada; con los ojos y la boca se sabe hacia
  // dónde mira y se endereza antes de recortar.
  let foto = null;
  let cara = null;
  for (const grados of [0, 90, 270, 180]) {
    foto = girar(img, grados);
    cara = caraPrincipal(det, foto);
    if (cara) break;
  }
  img.close?.();
  if (!cara) return null;
  if (cara.enderezar) {
    const derecha = girar(foto, cara.enderezar);
    const otra = caraPrincipal(det, derecha);
    if (otra) {
      foto = derecha;
      cara = otra;
    }
  }
  return recortar(foto, cara);
}

/** La imagen girada (0, 90, 180 o 270 grados), en un lienzo. */
function girar(img, grados) {
  const lienzo = document.createElement("canvas");
  const deCostado = grados === 90 || grados === 270;
  lienzo.width = deCostado ? img.height : img.width;
  lienzo.height = deCostado ? img.width : img.height;
  const ctx = lienzo.getContext("2d");
  ctx.translate(lienzo.width / 2, lienzo.height / 2);
  ctx.rotate((grados * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return lienzo;
}

/**
 * La cara del cliente en coordenadas de la foto, o null. La selfie trae
 * dos caras: la suya y la foto chiquita del DNI que sostiene; se queda la
 * más grande, y debe tener un tamaño razonable.
 */
function caraPrincipal(det, foto) {
  // Para buscar la cara basta una versión reducida: es más rápido.
  const escala = Math.min(1, 640 / Math.max(foto.width, foto.height));
  const chica = document.createElement("canvas");
  chica.width = Math.round(foto.width * escala);
  chica.height = Math.round(foto.height * escala);
  chica.getContext("2d").drawImage(foto, 0, 0, chica.width, chica.height);
  const { detections = [] } = det.detect(chica);
  const mayor = detections
    .filter((d) => d.boundingBox)
    .sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0];
  const caja = mayor?.boundingBox;
  if (!caja || caja.width < chica.width * 0.08) return null;
  return {
    x: caja.originX / escala,
    y: caja.originY / escala,
    ancho: caja.width / escala,
    alto: caja.height / escala,
    enderezar: giroParaEnderezar(mayor.keypoints, chica.width, chica.height),
  };
}

/**
 * Cuánto girar (en el sentido del reloj) para que la cara quede derecha:
 * de los ojos a la boca debe ir hacia abajo. Puntos del detector: 0 y 1
 * los ojos, 3 la boca (de 0 a 1 sobre la imagen).
 */
function giroParaEnderezar(puntos, ancho, alto) {
  if (!puntos || puntos.length < 4) return 0;
  const dx = ((puntos[3].x - (puntos[0].x + puntos[1].x) / 2) * ancho) || 0;
  const dy = ((puntos[3].y - (puntos[0].y + puntos[1].y) / 2) * alto) || 0;
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 0 : 180;
  return dx > 0 ? 90 : 270;
}

/** Un cuadro algo mayor que la cara (pelo y mentón), sin llegar al documento. */
function recortar(foto, caja) {
  const cx = caja.x + caja.ancho / 2;
  const cy = caja.y + caja.alto / 2;
  const lado = Math.min(Math.max(caja.ancho, caja.alto) * 1.45, foto.width, foto.height);
  const x = Math.max(0, Math.min(cx - lado / 2, foto.width - lado));
  const y = Math.max(0, Math.min(cy - lado * 0.55, foto.height - lado));
  const salida = document.createElement("canvas");
  salida.width = LADO;
  salida.height = LADO;
  const ctx = salida.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto, x, y, lado, lado, 0, 0, LADO, LADO);
  return new Promise((listo) => salida.toBlob(listo, "image/jpeg", 0.82));
}

/** Recorta y guarda la miniatura de un cliente. true si quedó guardada. */
async function crearMiniatura(userId, urlSelfie) {
  const blob = await recortarRostro(urlSelfie);
  if (!blob) {
    marcarNoSalio(userId);
    return false;
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(rutaDe(userId), blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw error;
  memoria.delete(userId);
  return true;
}

/** Firma la miniatura recién creada y la deja en memoria. */
async function firmarUna(userId) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(rutaDe(userId), FIRMA_SEG);
  const url = data?.signedUrl || null;
  memoria.set(userId, { url, hasta: Date.now() + (url ? REUSAR_MS : SIN_FOTO_MS) });
  return url;
}

/**
 * Crea, de a una, las miniaturas que faltan (solo de clientes con la
 * identidad aprobada) y avisa cada una con alListo({ [user_id]: url }).
 */
function completar(ids, alListo) {
  const noSalio = leerNoSalio();
  const nuevos = ids.filter((id) => !enCola.has(id) && !noSalioHace(noSalio, id));
  if (!nuevos.length) return;
  nuevos.forEach((id) => enCola.add(id));

  cola = cola.then(async () => {
    try {
      const { data: perfiles } = await supabase
        .from("perfiles_cliente")
        .select("user_id, foto_selfie")
        .in("user_id", nuevos)
        .not("fecha_validacion", "is", null)
        .not("foto_selfie", "is", null);
      if (!perfiles?.length) return;
      const { urls } = await urlsFirmadas(BUCKET_KYC, perfiles.map((p) => p.foto_selfie));
      for (const p of perfiles) {
        const selfie = urls[extraerPath(BUCKET_KYC, p.foto_selfie)];
        if (!selfie) continue;
        try {
          if (await crearMiniatura(p.user_id, selfie)) {
            const url = await firmarUna(p.user_id);
            if (url) alListo?.({ [p.user_id]: url });
          } else {
            console.info(`[rostros] No se encontró una cara clara en la selfie de ${p.user_id}; quedan sus iniciales.`);
          }
        } catch (e) {
          // Sin red, sin permiso o sin detector: se intentará la próxima vez.
          console.warn(`[rostros] No se pudo crear la foto de ${p.user_id}:`, e?.message || e);
        }
      }
    } catch (e) {
      console.warn("[rostros] No se pudieron preparar las fotos:", e?.message || e);
    } finally {
      nuevos.forEach((id) => enCola.delete(id));
    }
  });
}

/**
 * Fotos de varios clientes: { [user_id]: url firmada }. Los que no tienen
 * miniatura no aparecen; si están verificados, se les crea en segundo
 * plano y llegan después por alListo.
 */
export async function fotosDeClientes(ids, alListo) {
  const validos = [...new Set((ids || []).filter(esId))].slice(0, 100);
  const ahora = Date.now();
  const fotos = {};
  const pedir = [];
  for (const id of validos) {
    const m = memoria.get(id);
    if (m && m.hasta > ahora) {
      if (m.url) fotos[id] = m.url;
    } else pedir.push(id);
  }
  if (!pedir.length) return fotos;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(pedir.map(rutaDe), FIRMA_SEG);
  if (error || !data) {
    // Sin la migración 080 o sin permiso: nada que mostrar por un rato.
    pedir.forEach((id) => memoria.set(id, { url: null, hasta: ahora + SIN_FOTO_MS }));
    return fotos;
  }
  const faltan = [];
  pedir.forEach((id, i) => {
    const url = data[i]?.signedUrl || null;
    memoria.set(id, { url, hasta: ahora + (url ? REUSAR_MS : SIN_FOTO_MS) });
    if (url) fotos[id] = url;
    else faltan.push(id);
  });
  if (faltan.length) completar(faltan, alListo);
  return fotos;
}

/**
 * Al aprobar una identidad: rehace la miniatura con la selfie de ahora.
 * No frena la aprobación: si tarda más de unos segundos o falla, se deja
 * para cuando el chat la pida.
 */
export async function rehacerRostro(userId, urlSelfie, esperaMs = 6000) {
  if (!esId(userId) || !urlSelfie) return;
  try {
    await Promise.race([crearMiniatura(userId, urlSelfie), new Promise((listo) => setTimeout(listo, esperaMs))]);
  } catch {}
}
