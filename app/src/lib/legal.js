import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "./supabase";

/**
 * Términos, privacidad y la autorización para las fotos de identidad
 * (migración 51).
 *
 * Cada aceptación queda registrada en la base con la versión exacta,
 * la hora del servidor y el teléfono desde donde se aceptó: es la
 * constancia de que el cliente sabía para qué daba sus fotos.
 */

export const TIPOS_LEGALES = {
  terminos: { corto: "Términos y condiciones", icono: "document-text-outline" },
  privacidad: { corto: "Política de privacidad", icono: "shield-checkmark-outline" },
  biometria: { corto: "Autorización para fotos de identidad", icono: "finger-print-outline" },
};

/** La versión vigente de cada documento (se lee sin sesión). */
export async function documentosVigentes() {
  const { data, error } = await supabase
    .from("documentos_vigentes")
    .select("id, tipo, version, titulo, resumen, borrador, publicado_en");
  if (error) throw error;
  return data || [];
}

/** Un documento completo: el vigente de su tipo, o una versión exacta. */
export async function leerDocumento({ tipo, id }) {
  let q = supabase
    .from("documentos_legales")
    .select("id, tipo, version, titulo, resumen, contenido, borrador, publicado_en");
  q = id ? q.eq("id", id) : q.eq("tipo", tipo).order("publicado_en", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

/** Lo que le falta aceptar a quien tiene la sesión. */
export async function pendientes() {
  const { data, error } = await supabase.rpc("consentimientos_pendientes");
  if (error) throw error;
  return data || [];
}

/** Desde qué teléfono se aceptó. Nada que identifique más allá del equipo. */
export function datosDispositivo() {
  return {
    plataforma: Platform.OS,
    sistema: String(Platform.Version ?? ""),
    modelo: Device.modelName || null,
    app: Constants.expoConfig?.version || null,
  };
}

/** Registra la aceptación de esas versiones. */
export async function aceptar(ids) {
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!limpios.length) return { ok: true, registrados: 0 };
  const { data, error } = await supabase.rpc("aceptar_documentos", {
    p_documentos: limpios,
    p_dispositivo: datosDispositivo(),
  });
  if (error) throw error;
  return data;
}

/** Aceptaciones del propio cliente, para mostrarlas en Mi cuenta. */
export async function misAceptaciones() {
  const { data, error } = await supabase
    .from("consentimientos")
    .select("id, tipo, version, aceptado_en, documento_id")
    .order("aceptado_en", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** "12 de octubre de 2026". */
export const fechaLegal = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }) : "";
