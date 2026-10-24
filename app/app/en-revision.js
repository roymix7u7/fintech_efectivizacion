import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Animated, AppState } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import { invalidar } from "../src/lib/cache";
import { colors, fonts } from "../src/theme/tokens";
import { useReducirMovimiento } from "../src/lib/movimiento";
import { nombreCanal } from "../src/lib/alertas";
import { Aparece } from "../src/components/Cargando";
import { Logo } from "../src/components/brand/Logo";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { Etiqueta, Tarjeta } from "../src/components/ui/Piezas";
import { confirmar, mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import { cerrarSesion as cerrarSesionCompleta, motivoDelBloqueo, entrarA } from "../src/lib/sesion";
import CuentaBloqueada from "../src/components/CuentaBloqueada";
import AceptarCondiciones from "../src/components/AceptarCondiciones";
import SubidaDocumentos, {
  DOCUMENTOS,
  documentosCompletos,
  fotosFaltantes,
} from "../src/components/SubidaDocumentos";

const BUCKET_KYC = "kyc-documentos";

// Por si el aviso en vivo no llega (red que corta los websockets): se
// vuelve a preguntar cada medio minuto mientras la pantalla está abierta.
const CADA_MS = 30 * 1000;

export default function EnRevisionScreen() {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [fotos, setFotos] = useState({ dni_frontal: null, dni_posterior: null, selfie: null });
  const [enviando, setEnviando] = useState(false);
  const [bloqueo, setBloqueo] = useState(null);
  const [uid, setUid] = useState(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mostrar } = useAviso();
  const saliendo = useRef(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, []),
  );

  /**
   * Lo que decida el gestor desde el panel se ve aquí al instante: la
   * fila del usuario está publicada en tiempo real, y cada cambio
   * vuelve a cargar la pantalla. Aprobado, entra; observado, ve el
   * motivo; bloqueado, ve la ventana del bloqueo.
   */
  useEffect(() => {
    if (!uid) return;
    const canal = supabase
      .channel(nombreCanal("mi-revision"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${uid}` }, () =>
        cargar(false, true),
      )
      .subscribe();
    const reloj = setInterval(() => cargar(false, true), CADA_MS);
    const sub = AppState.addEventListener("change", (e) => {
      if (e === "active") cargar(false, true);
    });
    return () => {
      supabase.removeChannel(canal);
      clearInterval(reloj);
      sub.remove();
    };
  }, [uid]);

  async function cargar(avisar = false, enSilencio = false) {
    if (saliendo.current) return;
    if (!enSilencio) setCargando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.id);

      const { data: userData } = await supabase.from("users").select("estado").eq("id", user.id).maybeSingle();

      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, motivo_observacion, tipo_documento")
        .eq("user_id", user.id)
        .maybeSingle();

      setEstado(userData?.estado || "pendiente");
      setPerfil(perfilData);

      if (userData?.estado === "activo") {
        saliendo.current = true;
        mostrar("¡Tu cuenta fue aprobada!", "exito", 4000);
        entrarA(router, "/(tabs)/inicio");
        return;
      }
      if (userData?.estado === "bloqueado") {
        // Igual que en login: el motivo se lee con la sesión abierta,
        // porque después RLS ya no deja ver el perfil. Se sale al
        // login recién cuando la persona cierra el aviso.
        saliendo.current = true;
        const motivo = await motivoDelBloqueo(user.id);
        await supabase.auth.signOut();
        setBloqueo({ motivo });
        return;
      }
      if (avisar) mostrar("Sigue en revisión. Te avisaremos apenas esté lista.", "info");
    } finally {
      setCargando(false);
    }
  }

  /**
   * Sube los documentos y vuelve a poner la cuenta en cola de revision.
   * Sirve tanto para un registro que quedo sin perfil como para un
   * cliente observado que necesita corregir sus fotos.
   */
  async function reenviarDocumentos() {
    setEnviando(true);
    const subidos = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const paths = {};
      for (const doc of DOCUMENTOS) {
        // El sufijo de tiempo evita que la foto vieja quede cacheada.
        const path = `${user.id}/${doc.key}-${Date.now()}.jpg`;
        await subirImagen(BUCKET_KYC, path, fotos[doc.key]);
        subidos.push(path);
        paths[doc.key] = path;
      }

      const campos = {
        foto_dni_frontal: paths.dni_frontal,
        foto_dni_posterior: paths.dni_posterior,
        foto_selfie: paths.selfie,
        motivo_observacion: null,
      };

      const { error: perfilError } = perfil
        ? await supabase.from("perfiles_cliente").update(campos).eq("user_id", user.id)
        : await supabase.from("perfiles_cliente").insert({ ...campos, user_id: user.id });
      if (perfilError) throw perfilError;

      const { error: estadoError } = await supabase.from("users").update({ estado: "pendiente" }).eq("id", user.id);
      if (estadoError) {
        // Las fotos si se guardaron, asi que no se borra nada. El gestor
        // las vera igual; solo no se reinicio el estado automaticamente.
        mostrar("Guardamos tus documentos, pero no pudimos reabrir la revisión. Escríbenos para activarla.", "atencion");
      } else {
        invalidar("perfil");
        mostrar("Documentos enviados. Los revisamos en unas horas.", "exito");
      }

      setFotos({ dni_frontal: null, dni_posterior: null, selfie: null });
      await cargar();
    } catch (err) {
      await borrarImagenes(BUCKET_KYC, subidos);
      mostrar(mensajeError(err), "error");
    } finally {
      setEnviando(false);
    }
  }

  async function cerrarSesion() {
    if (!(await confirmar("¿Seguro que quieres cerrar sesión?"))) return;
    saliendo.current = true;
    await cerrarSesionCompleta();
    router.replace("/login");
  }

  if (bloqueo) {
    return (
      <View style={[s.pantalla, s.centrado]}>
        <CuentaBloqueada visible motivo={bloqueo.motivo} onCerrar={() => router.replace("/login")} />
      </View>
    );
  }

  if (cargando && !estado) {
    return (
      <View style={[s.pantalla, s.centrado, { backgroundColor: colors.night }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  const observado = estado === "observado";
  // Registro que quedó a medias: hay cuenta pero no perfil ni fotos.
  const sinPerfil = !perfil;
  const corregir = observado || sinPerfil;
  const faltan = fotosFaltantes(fotos);

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <AceptarCondiciones />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <CabeceraNoche style={s.cabecera} radio={36}>
          <View style={s.arriba}>
            <Logo width={56} />
            <Toque onPress={cerrarSesion} accessibilityLabel="Cerrar sesión">
              <GlassPanel variant="onNight" radius={12} style={s.salir}>
                <Text style={s.salirTexto}>Cerrar sesión</Text>
              </GlassPanel>
            </Toque>
          </View>

          <Aparece key={corregir ? "corregir" : "revisando"}>
            <Text style={s.titulo} accessibilityRole="header">
              {observado
                ? "Hay algo por corregir"
                : sinPerfil
                  ? "Te falta subir tus fotos"
                  : "Estamos revisando tus documentos"}
            </Text>
          </Aparece>

          <View>
            <Hito tipo="hecho" texto="Cuenta creada y correo verificado" />
            <Hito
              tipo={corregir ? "observado" : "actual"}
              texto={observado ? "Documentos observados" : sinPerfil ? "Faltan tus documentos" : "Revisión humana en curso"}
            />
            <Hito tipo="pendiente" texto="Cuenta activa" ultimo />
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {!corregir ? (
            <Aparece>
              <Tarjeta style={s.aviso}>
                <View style={s.avisoIcono}>
                  <Ionicons name="notifications-outline" size={22} color={colors.goldText} />
                </View>
                <Text style={s.avisoTexto}>Te avisaremos apenas termine. Nada se aprueba automáticamente.</Text>
              </Tarjeta>
              <Toque
                onPress={() => cargar(true)}
                accessibilityLabel="Verificar estado"
                style={s.verificar}
              >
                <Ionicons name="refresh" size={15} color={colors.text2} />
                <Text style={s.verificarTexto}>Verificar estado</Text>
              </Toque>
            </Aparece>
          ) : (
            <Aparece>
              <View style={{ gap: 12 }}>
                {observado && perfil?.motivo_observacion ? (
                  <Tarjeta style={s.motivo}>
                    <Etiqueta>Motivo</Etiqueta>
                    <Text style={s.motivoTexto}>“{perfil.motivo_observacion}”</Text>
                  </Tarjeta>
                ) : null}
                <Etiqueta style={{ paddingHorizontal: 6, paddingTop: 8 }}>
                  {observado ? "Vuelve a subir tus 3 fotos" : "Sube tus 3 fotos"}
                </Etiqueta>
                <SubidaDocumentos
                  fotos={fotos}
                  onChange={setFotos}
                  deshabilitado={enviando}
                  tipoDocumento={perfil?.tipo_documento}
                  variante="filas"
                />
                <Boton
                  titulo={enviando ? "Enviando..." : observado ? "Enviar de nuevo" : "Enviar a revisión"}
                  onPress={reenviarDocumentos}
                  cargando={enviando}
                  deshabilitado={!documentosCompletos(fotos)}
                  motivo={`Faltan ${faltan} foto${faltan === 1 ? "" : "s"}`}
                  style={{ height: 58, marginTop: 6 }}
                />
              </View>
            </Aparece>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Un hito de la línea de tiempo. El estado se lee por el ícono y la
 * palabra, no solo por el color: check, reloj que late, signo de
 * exclamación o círculo vacío.
 */
function Hito({ tipo, texto, ultimo }) {
  const reducir = useReducirMovimiento();
  const pulso = useRef(new Animated.Value(0)).current;
  const late = tipo === "actual" && !reducir;

  useEffect(() => {
    if (!late) return;
    const ciclo = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [late]);

  const circulo = {
    hecho: { bg: colors.white, borde: colors.white, icono: "checkmark", color: colors.night },
    actual: { bg: colors.gold, borde: colors.gold, icono: "time-outline", color: colors.night },
    observado: { bg: colors.errorStrong, borde: colors.errorStrong, icono: null, color: colors.white },
    pendiente: { bg: "transparent", borde: "rgba(255,255,255,0.3)", icono: null, color: colors.white },
  }[tipo];
  const colorTexto = {
    hecho: "rgba(255,255,255,0.85)",
    actual: "#F4DC8A",
    observado: "#FFB4AC",
    pendiente: "rgba(255,255,255,0.55)",
  }[tipo];

  return (
    <View style={s.hito} accessible accessibilityLabel={texto}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
          {late ? (
            <Animated.View
              style={[
                s.halo,
                {
                  opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
                },
              ]}
            />
          ) : null}
          <View style={[s.circulo, { backgroundColor: circulo.bg, borderColor: circulo.borde }]}>
            {circulo.icono ? <Ionicons name={circulo.icono} size={13} color={circulo.color} /> : null}
            {tipo === "observado" ? <Text style={s.exclamacion}>!</Text> : null}
          </View>
        </View>
        {!ultimo ? (
          <View style={[s.linea, { backgroundColor: tipo === "hecho" ? colors.white : "rgba(255,255,255,0.22)" }]} />
        ) : null}
      </View>
      <Text style={[s.hitoTexto, { color: colorTexto }, (tipo === "actual" || tipo === "observado") && { fontFamily: fonts.heavy }]}>
        {texto}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  centrado: { justifyContent: "center", alignItems: "center" },
  cabecera: { paddingHorizontal: 20, paddingBottom: 30, gap: 22 },
  arriba: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  salir: { height: 44, paddingHorizontal: 14, justifyContent: "center" },
  salirTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.white },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: colors.white,
    textAlign: "center",
  },

  hito: { flexDirection: "row", gap: 14 },
  halo: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gold },
  circulo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  exclamacion: { fontFamily: fonts.heavy, fontSize: 14, lineHeight: 16, color: colors.white },
  linea: { width: 2, height: 18 },
  hitoTexto: { flex: 1, fontFamily: fonts.body, fontSize: 14, paddingTop: 3 },

  cuerpo: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  aviso: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  avisoIcono: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.goldCream,
    alignItems: "center",
    justifyContent: "center",
  },
  avisoTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 14, lineHeight: 20, color: colors.text },
  verificar: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  verificarTexto: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2 },
  motivo: { borderRadius: 22, padding: 18, gap: 8 },
  motivoTexto: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text },
});
