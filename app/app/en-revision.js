import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import COLORS from "../src/theme/colors";
import TIPO from "../src/theme/tipografia";
import { confirmar, mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { subirImagen, borrarImagenes } from "../src/lib/storage";
import {
  cerrarSesion as cerrarSesionCompleta,
  motivoDelBloqueo,
} from "../src/lib/sesion";
import CuentaBloqueada from "../src/components/CuentaBloqueada";
import SubidaDocumentos, {
  DOCUMENTOS,
  documentosCompletos,
} from "../src/components/SubidaDocumentos";

const BUCKET_KYC = "kyc-documentos";

export default function EnRevisionScreen() {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [fotos, setFotos] = useState({
    dni_frontal: null,
    dni_posterior: null,
    selfie: null,
  });
  const [enviando, setEnviando] = useState(false);
  const [bloqueo, setBloqueo] = useState(null);
  const router = useRouter();
  const { mostrar } = useAviso();

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, []),
  );

  async function cargar(avisar = false) {
    setCargando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("estado")
        .eq("id", user.id)
        .maybeSingle();

      const { data: perfilData } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, motivo_observacion")
        .eq("user_id", user.id)
        .maybeSingle();

      setEstado(userData?.estado || "pendiente");
      setPerfil(perfilData);

      if (userData?.estado === "activo") {
        router.replace("/(tabs)/inicio");
        return;
      }
      if (userData?.estado === "bloqueado") {
        // Igual que en login: el motivo se lee con la sesión abierta,
        // porque después RLS ya no deja ver el perfil. Se sale al
        // login recién cuando la persona cierra el aviso.
        const motivo = await motivoDelBloqueo(user.id);
        await supabase.auth.signOut();
        setBloqueo({ motivo });
        return;
      }
      if (avisar) {
        mostrar("Sigue en revisión. Te avisaremos apenas esté lista.", "info");
      }
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
    // El botón está deshabilitado hasta tener las tres fotos, y cada
    // una muestra su marca de verificación al subirse.

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
        ? await supabase
            .from("perfiles_cliente")
            .update(campos)
            .eq("user_id", user.id)
        : await supabase
            .from("perfiles_cliente")
            .insert({ ...campos, user_id: user.id });
      if (perfilError) throw perfilError;

      const { error: estadoError } = await supabase
        .from("users")
        .update({ estado: "pendiente" })
        .eq("id", user.id);
      if (estadoError) {
        // Las fotos si se guardaron, asi que no se borra nada. El gestor
        // las vera igual; solo no se reinicio el estado automaticamente.
        mostrar(
          "Guardamos tus documentos, pero no pudimos reabrir la revisión. Escríbenos para activarla.",
          "atencion",
        );
      } else {
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
    if (!(await confirmar("Seguro que quieres cerrar sesion?"))) return;
    await cerrarSesionCompleta();
    router.replace("/login");
  }

  if (bloqueo) {
    return (
      <View style={[s.container, s.centrado]}>
        <CuentaBloqueada
          visible
          motivo={bloqueo.motivo}
          onCerrar={() => router.replace("/login")}
        />
      </View>
    );
  }

  if (cargando) {
    return (
      <View style={[s.container, s.centrado]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const observado = estado === "observado";
  const faltanDocumentos = !perfil || observado;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.iconoBg}>
        <Ionicons
          name={observado ? "alert-circle-outline" : "time-outline"}
          size={44}
          color={observado ? COLORS.warning : COLORS.primary}
        />
      </View>

      <Text style={s.titulo}>
        {observado ? "Necesitamos corregir algo" : "Cuenta en revision"}
      </Text>

      {observado ? (
        <>
          <Text style={s.mensaje}>
            Un revisor encontro un problema con tus documentos. Corrigelo y
            vuelve a enviarlos.
          </Text>
          {perfil?.motivo_observacion ? (
            <View style={s.motivoBox}>
              <Text style={s.motivoLabel}>Motivo</Text>
              <Text style={s.motivoTexto}>{perfil.motivo_observacion}</Text>
            </View>
          ) : null}
        </>
      ) : !perfil ? (
        <Text style={s.mensaje}>
          Tu registro quedo a medias. Sube tus documentos para que podamos
          verificar tu identidad.
        </Text>
      ) : (
        <>
          <Text style={s.mensaje}>
            Estamos revisando tus documentos. Te avisaremos cuando tu cuenta
            este aprobada.
          </Text>
          <Text style={s.sub}>Este proceso puede tomar unas horas.</Text>
        </>
      )}

      {faltanDocumentos ? (
        <View style={s.formulario}>
          <SubidaDocumentos
            fotos={fotos}
            onChange={setFotos}
            deshabilitado={enviando}
          />
          <TouchableOpacity
            style={[
              s.btnPrimario,
              (enviando || !documentosCompletos(fotos)) && s.btnDeshabilitado,
            ]}
            onPress={reenviarDocumentos}
            disabled={enviando || !documentosCompletos(fotos)}
          >
            <Text style={s.btnPrimarioTexto}>
              {enviando ? "Enviando..." : "Enviar documentos"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.btnPrimario} onPress={() => cargar(true)}>
          <Ionicons name="refresh" size={18} color={COLORS.primaryDark} />
          <Text style={s.btnPrimarioTexto}>Verificar estado</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.btnSalir} onPress={cerrarSesion}>
        <Text style={s.btnSalirTexto}>Cerrar sesion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centrado: { justifyContent: "center", alignItems: "center" },
  content: { padding: 28, paddingTop: 80, paddingBottom: 48 },
  iconoBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  titulo: { ...TIPO.titulo, fontSize: 22, textAlign: "center" },
  mensaje: {
    ...TIPO.cuerpo,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 10,
  },
  sub: { ...TIPO.micro, textAlign: "center", marginTop: 6 },
  motivoBox: {
    backgroundColor: COLORS.warningLight,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    borderRadius: 10,
    padding: 14,
    marginTop: 18,
  },
  motivoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.warning,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  motivoTexto: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  formulario: { gap: 14, marginTop: 24 },
  btnPrimario: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
  },
  btnDeshabilitado: { opacity: 0.5 },
  btnPrimarioTexto: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: "700",
  },
  btnSalir: { padding: 16, alignItems: "center", marginTop: 8 },
  btnSalirTexto: { color: COLORS.textSecondary, fontSize: 15 },
});
