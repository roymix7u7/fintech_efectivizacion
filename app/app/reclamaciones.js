import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TextInput, Share } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import { EMPRESA, SERVICIO, misReclamos, registrarReclamo, textoConstancia } from "../src/lib/reclamos";
import { invalidar } from "../src/lib/cache";
import { fechaLegal } from "../src/lib/legal";
import { mensajeError } from "../src/lib/ui";
import { useAlturaTeclado } from "../src/lib/teclado";
import { useAviso } from "../src/components/Avisos";
import { Aparece } from "../src/components/Cargando";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { BotonIcono, Tarjeta } from "../src/components/ui/Piezas";
import { Boton } from "../src/components/ui/Boton";
import { Campo, EtiquetaCampo } from "../src/components/ui/Campos";
import { Casilla } from "../src/components/ui/Casilla";
import { Segmentado } from "../src/components/ui/Segmentado";
import { Toque } from "../src/components/ui/Toque";
import { colors, fonts } from "../src/theme/tokens";
import { ScrollConTeclado } from "../src/components/ui/ScrollConTeclado";

const LUCES = [
  { color: colors.glowGold, opacity: 0.32, size: 240, top: -60, right: -100 },
  { color: colors.glowBlue, opacity: 0.7, size: 280, bottom: -160, left: -110 },
];

const TIPOS = [
  { clave: "reclamo", titulo: "Reclamo", detalle: "Con el servicio", accesible: "Reclamo: disconformidad con el servicio" },
  { clave: "queja", titulo: "Queja", detalle: "Con la atención", accesible: "Queja: malestar con la atención" },
];

const HOJA_VACIA = {
  tipo: "reclamo",
  nombres: "",
  tipo_documento: "dni",
  numero_documento: "",
  domicilio: "",
  telefono: "",
  correo: "",
  menor_edad: false,
  apoderado: "",
  descripcion_bien: SERVICIO,
  monto: "",
  detalle: "",
  pedido: "",
};

/** Texto de varias líneas. El borde va en la caja (foco en Android). */
function AreaTexto({ etiqueta, value, onChangeText, placeholder, error, maximo }) {
  return (
    <View style={{ gap: 6 }}>
      <EtiquetaCampo texto={etiqueta} />
      <View style={[s.areaCaja, error && { borderColor: colors.error }]}>
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(v.slice(0, maximo))}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          multiline
          style={s.area}
          accessibilityLabel={etiqueta}
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * Libro de Reclamaciones virtual (Indecopi). Reclamo: disconformidad
 * con el servicio. Queja: malestar con la atención. Cada hoja tiene su
 * número y la respuesta llega a Mis avisos.
 */
export default function ReclamacionesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const [lista, setLista] = useState([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [hoja, setHoja] = useState(HOJA_VACIA);
  const [intentos, setIntentos] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [constancia, setConstancia] = useState(null);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await misReclamos());
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // La hoja nueva viene con los datos que ya tenemos; se pueden corregir.
  async function nueva() {
    setConstancia(null);
    setIntentos(0);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data: p } = await supabase
      .from("perfiles_cliente")
      .select("nombres, apellidos, tipo_documento, dni, telefono, direccion")
      .maybeSingle();
    setHoja({
      ...HOJA_VACIA,
      nombres: p ? `${p.nombres} ${p.apellidos}`.trim() : "",
      tipo_documento: p?.tipo_documento || "dni",
      numero_documento: p?.dni || "",
      domicilio: p?.direccion || "",
      telefono: (p?.telefono || "").replace(/^\+51/, ""),
      correo: session?.user?.email || "",
    });
    setEscribiendo(true);
  }

  const poner = (k, v) => setHoja((h) => ({ ...h, [k]: v }));
  const errores = {
    nombres: hoja.nombres.trim().length < 3 ? "Escribe tu nombre completo" : null,
    numero_documento: !/^[A-Za-z0-9]{6,15}$/.test(hoja.numero_documento) ? "Revisa el número de documento" : null,
    domicilio: hoja.domicilio.trim().length < 5 ? "Escribe tu domicilio" : null,
    correo: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(hoja.correo.trim()) ? "Revisa tu correo" : null,
    apoderado: hoja.menor_edad && hoja.apoderado.trim().length < 3 ? "Escribe el nombre del padre, madre o apoderado" : null,
    detalle: hoja.detalle.trim().length < 20 ? "Cuéntanos qué pasó (al menos 20 letras)" : null,
    pedido: hoja.pedido.trim().length < 5 ? "Dinos qué solución esperas" : null,
  };
  const ver = (k) => (intentos > 0 ? errores[k] : null);
  const hayErrores = Object.values(errores).some(Boolean);

  async function enviar() {
    if (hayErrores) {
      setIntentos((n) => n + 1);
      return mostrar("Revisa los campos marcados.", "atencion");
    }
    setEnviando(true);
    try {
      const datos = {
        ...hoja,
        telefono: hoja.telefono.trim() ? `+51${hoja.telefono.replace(/\D/g, "")}` : "",
        monto: hoja.monto.replace(",", ".").trim(),
      };
      const r = await registrarReclamo(datos);
      setConstancia({ hoja: datos, r });
      setEscribiendo(false);
      invalidar("avisos");
      cargar();
    } catch (e) {
      mostrar(mensajeError(e), "error");
    } finally {
      setEnviando(false);
    }
  }

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inicio"));

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollConTeclado
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <View style={{ gap: 6 }}>
            <Text style={s.titulo} accessibilityRole="header">
              Libro de Reclamaciones
            </Text>
            <Text style={s.subtitulo}>
              {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
            </Text>
            <Text style={s.subtituloChico}>{EMPRESA.domicilio}</Text>
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {constancia ? (
            <Aparece>
              <Tarjeta style={s.bloque}>
                <View style={s.listo}>
                  <Ionicons name="checkmark" size={22} color={colors.white} />
                </View>
                <Text style={s.bloqueTitulo}>
                  Registramos tu {constancia.hoja.tipo} N.° {constancia.r.codigo}
                </Text>
                <Text style={s.texto}>
                  Te responderemos a más tardar el {fechaLegal(constancia.r.vence_en)}. La respuesta te llegará a Mis
                  avisos. Guarda esta constancia.
                </Text>
                <Boton
                  titulo="Guardar constancia"
                  iconoIzq="share-outline"
                  onPress={() =>
                    Share.share({
                      title: `Hoja N.° ${constancia.r.codigo}`,
                      message: textoConstancia(constancia.hoja, constancia.r),
                    })
                  }
                  style={{ height: 52 }}
                />
              </Tarjeta>
            </Aparece>
          ) : null}

          {!escribiendo ? (
            <>
              <Tarjeta style={s.bloque}>
                <Text style={s.texto}>
                  Si algo del servicio no te gustó (reclamo) o la atención no fue la que esperabas (queja), déjalo aquí.
                  Cada hoja tiene un número y una respuesta con plazo.
                </Text>
                <Boton titulo="Nueva hoja de reclamación" iconoIzq="create-outline" onPress={nueva} style={{ height: 52 }} />
              </Tarjeta>

              {lista.length ? <Text style={s.seccion}>Tus hojas</Text> : null}
              {lista.map((r) => (
                <Toque
                  key={r.id}
                  onPress={() => setAbierto(abierto === r.id ? null : r.id)}
                  escala={0.99}
                  accessibilityLabel={`Hoja ${r.codigo}, ${r.estado === "respondido" ? "respondida" : "pendiente"}`}
                >
                  <Tarjeta style={s.hojaFila}>
                    <View style={s.hojaCabeza}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.hojaCodigo}>
                          {r.tipo === "queja" ? "Queja" : "Reclamo"} N.° {r.codigo}
                        </Text>
                        <Text style={s.hojaFecha}>
                          {fechaLegal(r.creado_en)}
                          {r.estado === "pendiente" ? ` · respuesta hasta el ${fechaLegal(r.vence_en)}` : ""}
                        </Text>
                      </View>
                      <View style={[s.estado, { backgroundColor: r.estado === "respondido" ? colors.successBg : colors.goldCream }]}>
                        <Text style={[s.estadoTexto, { color: r.estado === "respondido" ? colors.successText : colors.goldText }]}>
                          {r.estado === "respondido" ? "Respondido" : "En revisión"}
                        </Text>
                      </View>
                    </View>
                    {abierto === r.id ? (
                      <View style={{ gap: 8, paddingTop: 6 }}>
                        <Text style={s.etiqueta}>Lo que contaste</Text>
                        <Text style={s.texto}>{r.detalle}</Text>
                        <Text style={s.etiqueta}>Lo que pediste</Text>
                        <Text style={s.texto}>{r.pedido}</Text>
                        {r.respuesta ? (
                          <>
                            <Text style={s.etiqueta}>Nuestra respuesta · {fechaLegal(r.respondido_en)}</Text>
                            <Text style={[s.texto, { color: colors.text }]}>{r.respuesta}</Text>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </Tarjeta>
                </Toque>
              ))}
            </>
          ) : (
            <Aparece>
              <Tarjeta style={s.bloque}>
                <View style={{ gap: 6 }}>
                  <EtiquetaCampo texto="Tipo" />
                  <Segmentado opciones={TIPOS} valor={hoja.tipo} onCambio={(v) => poner("tipo", v)} accessibilityLabel="Tipo de hoja" />
                </View>

                <Text style={s.seccionHoja}>Tus datos</Text>
                <Campo etiqueta="Nombre completo" value={hoja.nombres} onChangeText={(v) => poner("nombres", v)} error={ver("nombres")} />
                <Campo
                  etiqueta={hoja.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI"}
                  value={hoja.numero_documento}
                  onChangeText={(v) => poner("numero_documento", v.replace(/\s/g, "").slice(0, 15))}
                  keyboardType="number-pad"
                  error={ver("numero_documento")}
                />
                <Campo etiqueta="Domicilio" value={hoja.domicilio} onChangeText={(v) => poner("domicilio", v)} error={ver("domicilio")} />
                <Campo
                  etiqueta="Celular (opcional)"
                  prefijo="+51"
                  value={hoja.telefono}
                  onChangeText={(v) => poner("telefono", v.replace(/\D/g, "").slice(0, 9))}
                  keyboardType="phone-pad"
                />
                <Campo
                  etiqueta="Correo"
                  value={hoja.correo}
                  onChangeText={(v) => poner("correo", v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={ver("correo")}
                />
                <Casilla marcada={hoja.menor_edad} onCambio={(v) => poner("menor_edad", v)} accessibilityLabel="Soy menor de edad">
                  Soy menor de edad
                </Casilla>
                {hoja.menor_edad ? (
                  <Campo
                    etiqueta="Nombre del padre, madre o apoderado"
                    value={hoja.apoderado}
                    onChangeText={(v) => poner("apoderado", v)}
                    error={ver("apoderado")}
                  />
                ) : null}

                <Text style={s.seccionHoja}>El servicio</Text>
                <Campo etiqueta="Servicio" value={hoja.descripcion_bien} onChangeText={(v) => poner("descripcion_bien", v)} />
                <Campo
                  etiqueta="Monto reclamado en S/ (opcional)"
                  value={hoja.monto}
                  onChangeText={(v) => poner("monto", v.replace(/[^0-9.,]/g, "").slice(0, 12))}
                  keyboardType="decimal-pad"
                />

                <Text style={s.seccionHoja}>{hoja.tipo === "queja" ? "Tu queja" : "Tu reclamo"}</Text>
                <AreaTexto
                  etiqueta="¿Qué pasó?"
                  value={hoja.detalle}
                  onChangeText={(v) => poner("detalle", v)}
                  placeholder="Cuéntanos con detalle, con fechas si las tienes"
                  error={ver("detalle")}
                  maximo={3000}
                />
                <AreaTexto
                  etiqueta="¿Qué solución esperas?"
                  value={hoja.pedido}
                  onChangeText={(v) => poner("pedido", v)}
                  placeholder="Ej: que me devuelvan la comisión"
                  error={ver("pedido")}
                  maximo={1000}
                />

                <Boton
                  titulo={enviando ? "Enviando..." : "Enviar hoja"}
                  icono="arrow-forward"
                  onPress={enviar}
                  cargando={enviando}
                  style={{ height: 54 }}
                />
                <Toque onPress={() => setEscribiendo(false)} style={{ alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
                  <Text style={s.cancelar}>Cancelar</Text>
                </Toque>
              </Tarjeta>
            </Aparece>
          )}
        </View>
      </ScrollConTeclado>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 26, gap: 18 },
  titulo: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.white },
  subtitulo: { fontFamily: fonts.strong, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  subtituloChico: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  cuerpo: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  bloque: { borderRadius: 24, padding: 18, gap: 14 },
  bloqueTitulo: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.text },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text2 },
  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 8 },
  seccionHoja: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.1, color: colors.text3, textTransform: "uppercase", paddingTop: 4 },
  etiqueta: { fontFamily: fonts.heavy, fontSize: 12, color: colors.text3 },
  listo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  hojaFila: { borderRadius: 20, padding: 14, gap: 4 },
  hojaCabeza: { flexDirection: "row", alignItems: "center", gap: 10 },
  hojaCodigo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  hojaFecha: { fontFamily: fonts.label, fontSize: 12, color: colors.text3 },
  estado: { height: 26, paddingHorizontal: 10, borderRadius: 999, justifyContent: "center" },
  estadoTexto: { fontFamily: fonts.heavy, fontSize: 12 },
  areaCaja: { borderRadius: 14, borderWidth: 1.5, borderColor: colors.fieldBorder, backgroundColor: colors.field },
  area: { minHeight: 96, maxHeight: 200, padding: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text, textAlignVertical: "top" },
  error: { fontFamily: fonts.strong, fontSize: 12, color: colors.errorText },
  cancelar: { fontFamily: fonts.strong, fontSize: 14, color: colors.text3 },
});
