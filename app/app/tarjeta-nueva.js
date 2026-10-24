import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import { invalidar } from "../src/lib/cache";
import { colors, fonts } from "../src/theme/tokens";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { useAlturaTeclado } from "../src/lib/teclado";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { validarUltimos4 } from "../src/lib/validaciones";
import { ORDEN_BANCOS } from "../src/lib/deposito";
import { Aparece } from "../src/components/Cargando";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { BotonIcono } from "../src/components/ui/Piezas";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { BarraFija, ALTO_BARRA_FIJA } from "../src/components/ui/BarraFija";
import { Campo } from "../src/components/ui/Campos";
import { Consejo } from "../src/components/ui/Consejo";
import { GrillaBancos } from "../src/components/ui/GrillaBancos";
import { HojaFoto } from "../src/components/ui/HojaFoto";
import { PorQueFoto } from "../src/components/PorQueFoto";

const BUCKET_TARJETAS = "tarjetas-fotos";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -40, right: -110 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -170, left: -110 },
];

const REGLAS = [
  { tono: "si", texto: "Tarjeta de crédito a tu nombre" },
  { tono: "no", texto: "No aceptamos tarjetas de terceros" },
  { tono: "candado", texto: "No se edita ni se elimina; puedes agregar otras" },
  { tono: "info", texto: "Para darla de baja, habla con un asesor" },
];

/** Tarjeta dibujada: lo que tiene que verse (verde) y lo que se tapa. */
function Ejemplo() {
  return (
    <View style={s.ejemplo}>
      <View style={s.ejemploTarjeta}>
        <View style={s.ejemploChip} />
        <View style={{ flexDirection: "row", gap: 4 }}>
          <View style={s.ejemploTapado} />
          <View style={s.ejemploDigitos}>
            <Text style={s.ejemploDigitosTexto}>4821</Text>
          </View>
        </View>
        <View style={s.ejemploNombre} />
      </View>
      <View style={{ gap: 6, flex: 1 }}>
        <View style={s.leyenda}>
          <View style={[s.leyendaMuestra, { borderWidth: 1.5, borderColor: colors.success }]} />
          <Text style={s.leyendaTexto}>Nombre y últimos 4</Text>
        </View>
        <View style={s.leyenda}>
          <View style={[s.leyendaMuestra, { backgroundColor: "#4A5A7C" }]} />
          <Text style={s.leyendaTexto}>Tapa el resto</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Una foto de la tarjeta. La imagen se ve entera y centrada (contain)
 * sobre fondo noche: una captura vertical de la app del banco no se
 * estira ni se corta, y una foto apaisada llena el marco.
 */
function Cara({ titulo, opcional, foto, preparando, onPress, deshabilitado }) {
  return (
    <Toque
      onPress={onPress}
      disabled={deshabilitado || preparando}
      accessibilityLabel={foto ? `${titulo}, lista. Cambiar foto` : `Subir ${titulo}${opcional ? ", opcional" : ""}`}
      style={[s.cara, foto ? s.caraLista : opcional ? s.caraOpcional : s.caraVacia]}
    >
      {preparando ? (
        <ActivityIndicator color={colors.navy} />
      ) : foto ? (
        <>
          <Image source={{ uri: foto.uri }} style={s.caraImagen} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={s.caraCheck}>
            <Ionicons name="checkmark" size={14} color={colors.white} />
          </View>
          <View style={s.caraPie}>
            <Text style={s.caraPieTexto}>Cambiar</Text>
          </View>
        </>
      ) : (
        <>
          <View style={[s.caraCamara, opcional && { backgroundColor: colors.muted }]}>
            <Ionicons name={opcional ? "add" : "camera-outline"} size={18} color={opcional ? colors.text2 : colors.gold} />
          </View>
          <View style={{ alignItems: "center", gap: 1 }}>
            <Text style={s.caraTitulo}>{titulo}</Text>
            <Text style={s.caraDetalle}>{opcional ? "Opcional" : "Obligatoria"}</Text>
          </View>
        </>
      )}
    </Toque>
  );
}

/**
 * Registrar una tarjeta. Pide una foto donde se lean el nombre y los
 * últimos 4: puede ser del plástico o una captura de la app del banco.
 * Una segunda foto (el reverso, otra captura) es opcional y ayuda al
 * gestor cuando la primera no basta. El nombre impreso se guarda aparte
 * para que el gestor lo compare con el titular sin leerlo de la foto.
 */
export default function TarjetaNuevaScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();

  const [perfil, setPerfil] = useState(null);
  const [userId, setUserId] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [banco, setBanco] = useState(ORDEN_BANCOS.includes(params.banco) ? params.banco : null);
  const [ultimos4, setUltimos4] = useState("");
  const [nombre, setNombre] = useState("");
  const [frente, setFrente] = useState(null);
  const [reverso, setReverso] = useState(null);
  const [eligiendo, setEligiendo] = useState(null); // "frente" | "reverso"
  const [preparando, setPreparando] = useState(null);
  const [porQue, setPorQue] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      setUserId(user.id);
      const { data: p } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, apellidos")
        .eq("user_id", user.id)
        .maybeSingle();
      setPerfil(p);
      // Se sugiere el nombre del titular: casi siempre es el que viene
      // impreso, y la persona solo corrige si su tarjeta lo abrevia.
      if (p) setNombre((n) => n || `${p.nombres} ${p.apellidos}`.toUpperCase());
      if (p) {
        const { data: t } = await supabase
          .from("tarjetas")
          .select("banco, ultimos_4, estado")
          .eq("cliente_id", p.id)
          .eq("activa", true);
        setTarjetas(t || []);
      }
    })();
  }, []);

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/tarjetas"));

  const errorUltimos = ultimos4.length === 4 ? validarUltimos4(ultimos4) : null;
  const nombreOk = nombre.trim().length >= 3;
  const falta = !banco
    ? "Elige el banco"
    : ultimos4.length !== 4
      ? "Escribe los últimos 4 dígitos"
      : !nombreOk
        ? "Escribe el nombre impreso"
        : !frente
          ? "Agrega la foto de la tarjeta"
          : null;

  async function enviar() {
    if (falta || !perfil || !userId) return;

    // Evita que el mismo plástico se registre dos veces.
    const repetida = tarjetas.find((t) => t.banco === banco && t.ultimos_4 === ultimos4 && t.estado !== "rechazado");
    if (repetida) return mostrar(`Ya registraste una tarjeta ${banco} terminada en ${ultimos4}`, "atencion");

    setGuardando(true);
    const subidos = [];
    try {
      const sello = Date.now();
      const pathFrente = `${userId}/${sello}-frente.jpg`;
      await subirImagen(BUCKET_TARJETAS, pathFrente, frente);
      subidos.push(pathFrente);
      let pathReverso = null;
      if (reverso) {
        pathReverso = `${userId}/${sello}-reverso.jpg`;
        await subirImagen(BUCKET_TARJETAS, pathReverso, reverso);
        subidos.push(pathReverso);
      }

      // Se guarda el path, no una URL firmada que caduca.
      const { error } = await supabase.from("tarjetas").insert({
        cliente_id: perfil.id,
        banco,
        ultimos_4: ultimos4,
        nombre_impreso: nombre.trim().toUpperCase(),
        foto_tarjeta: pathFrente,
        foto_reverso: pathReverso,
        estado: "pendiente",
        activa: true,
      });
      if (error) throw error;

      invalidar("tarjetas");
      mostrar("Tarjeta enviada a verificación", "exito");
      volver();
    } catch (err) {
      // Si algo falla se limpia lo subido: una tarjeta a medias no sirve
      // y dejaría archivos sueltos en el servidor.
      await borrarImagenes(BUCKET_TARJETAS, subidos);
      mostrar(mensajeError(err), "error");
    } finally {
      setGuardando(false);
    }
  }

  const conBarra = altoTeclado === 0;

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: (conBarra ? ALTO_BARRA_FIJA : 0) + insets.bottom + 30 + altoTeclado }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <Aparece>
            <Text style={s.titulo} accessibilityRole="header">
              Agregar tarjeta
            </Text>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <Consejo titulo="Importante antes de registrarla" reglas={REGLAS} />

          <GlassPanel variant="light" radius={24} style={s.bloque}>
            <Text style={s.bloqueTitulo}>¿De qué banco es?</Text>
            <GrillaBancos bancos={ORDEN_BANCOS} valor={banco} onElegir={setBanco} columnas={4} />
          </GlassPanel>

          <GlassPanel variant="light" radius={24} style={s.bloque}>
            <Text style={s.bloqueTitulo}>Datos de la tarjeta</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 112 }}>
                <Campo
                  etiqueta="Últimos 4"
                  value={ultimos4}
                  onChangeText={(v) => setUltimos4(v.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="0000"
                  style={{ letterSpacing: 4 }}
                  ok={ultimos4.length === 4 && !errorUltimos}
                  error={errorUltimos}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Campo
                  etiqueta="Nombre impreso"
                  value={nombre}
                  onChangeText={(v) => setNombre(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={60}
                  ok={nombreOk}
                />
              </View>
            </View>
          </GlassPanel>

          <GlassPanel variant="light" radius={24} style={s.bloque}>
            <View style={{ gap: 3 }}>
              <View style={s.tituloFila}>
                <Text style={[s.bloqueTitulo, { flex: 1 }]}>Fotos de la tarjeta</Text>
                <Toque
                  onPress={() => setPorQue(true)}
                  hitSlop={8}
                  accessibilityLabel="¿Por qué te pedimos la foto?"
                  style={s.info}
                >
                  <Ionicons name="shield-checkmark-outline" size={15} color={colors.navy} />
                  <Text style={s.infoTexto}>¿Por qué?</Text>
                </Toque>
              </View>
              <Text style={s.bloqueAyuda}>Una foto del plástico o una captura de la app de tu banco.</Text>
            </View>
            <Ejemplo />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Cara
                titulo="Tarjeta"
                foto={frente}
                preparando={preparando === "frente"}
                onPress={() => setEligiendo("frente")}
                deshabilitado={guardando}
              />
              <Cara
                titulo="Otra foto"
                opcional
                foto={reverso}
                preparando={preparando === "reverso"}
                onPress={() => setEligiendo("reverso")}
                deshabilitado={guardando}
              />
            </View>
            {reverso ? (
              <Toque
                onPress={() => setReverso(null)}
                hitSlop={8}
                style={{ alignSelf: "flex-end" }}
                accessibilityLabel="Quitar la otra foto"
              >
                <Text style={s.quitar}>Quitar la otra foto</Text>
              </Toque>
            ) : null}
            <View style={s.cifrado}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.goldText} />
              <Text style={s.cifradoTexto}>Tus fotos se guardan cifradas</Text>
            </View>
          </GlassPanel>
        </View>
      </ScrollView>

      {conBarra ? (
        <BarraFija>
          <Boton
            titulo={guardando ? "Enviando..." : "Enviar a verificación"}
            icono="arrow-forward"
            onPress={enviar}
            cargando={guardando}
            deshabilitado={Boolean(falta)}
            motivo={falta}
            style={{ height: 58 }}
          />
        </BarraFija>
      ) : null}

      <PorQueFoto visible={porQue} onCerrar={() => setPorQue(false)} />

      <HojaFoto
        visible={Boolean(eligiendo)}
        titulo={eligiendo === "reverso" ? "Otra foto (opcional)" : "Foto de la tarjeta"}
        ayuda={
          eligiendo === "reverso"
            ? "El reverso o una segunda captura. Ayuda si la primera no se lee bien."
            : "Que se lean tu nombre y los últimos 4 dígitos. Tapa los demás números."
        }
        aspecto={[8, 5]}
        onCerrar={() => setEligiendo(null)}
        onPreparando={(v) => setPreparando(v ? eligiendo : null)}
        onFoto={(f) => (eligiendo === "reverso" ? setReverso(f) : setFrente(f))}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 86, gap: 16 },
  titulo: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.white, textAlign: "center" },
  cuerpo: { marginTop: -60, paddingHorizontal: 16, gap: 12 },
  bloque: { padding: 16, gap: 12 },
  bloqueTitulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },

  ejemplo: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 16, backgroundColor: colors.ground },
  ejemploTarjeta: { width: 108, height: 68, borderRadius: 10, backgroundColor: colors.navyLight, padding: 8, justifyContent: "flex-end", gap: 5 },
  ejemploChip: { position: "absolute", top: 8, left: 8, width: 16, height: 12, borderRadius: 3, backgroundColor: colors.gold },
  ejemploTapado: { flex: 1, height: 12, borderRadius: 3, backgroundColor: "#4A5A7C" },
  ejemploDigitos: { height: 12, paddingHorizontal: 4, borderRadius: 3, borderWidth: 1.5, borderColor: "#9BE3C6", justifyContent: "center" },
  ejemploDigitosTexto: { fontFamily: fonts.heavy, fontSize: 8, color: colors.white },
  ejemploNombre: { alignSelf: "flex-start", height: 10, width: 54, borderRadius: 3, borderWidth: 1.5, borderColor: "#9BE3C6" },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaMuestra: { width: 12, height: 9, borderRadius: 2 },
  leyendaTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.text },

  tituloFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Ícono con texto: un ícono solo de "i" casi no se toca.
  info: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.infoBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  infoTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.navy },
  bloqueAyuda: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  // Mismo alto para las dos caras y proporción de tarjeta (8:5).
  cara: {
    flex: 1,
    aspectRatio: 8 / 5,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surface,
  },
  caraVacia: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.navyLight },
  caraOpcional: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashed },
  caraLista: { borderWidth: 2, borderColor: colors.success, backgroundColor: colors.night },
  caraImagen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
  caraCamara: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
  caraCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  caraPie: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 26,
    backgroundColor: "rgba(15,27,51,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  caraPieTexto: { fontFamily: fonts.heavy, fontSize: 12, color: colors.white },
  caraTitulo: { fontFamily: fonts.heavy, fontSize: 14, color: colors.text },
  caraDetalle: { fontFamily: fonts.label, fontSize: 11, color: colors.text3 },
  quitar: { fontFamily: fonts.strong, fontSize: 12, color: colors.errorText },
  cifrado: { flexDirection: "row", alignItems: "center", gap: 8 },
  cifradoTexto: { fontFamily: fonts.strong, fontSize: 12, color: colors.text2 },
});
