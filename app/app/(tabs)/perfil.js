import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Switch } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { useDatos } from "../../src/lib/cache";
import { misAceptaciones, fechaLegal, TIPOS_LEGALES } from "../../src/lib/legal";
import { Toque } from "../../src/components/ui/Toque";
import MenuLateral from "../../src/components/MenuLateral";
import { Esqueleto, Aparece } from "../../src/components/Cargando";
import { confirmar, mensajeError } from "../../src/lib/ui";
import { hayConexion } from "../../src/lib/conexion";
import { useAviso } from "../../src/components/Avisos";
import OfertaBiometria, { ocultarDuranteLector } from "../../src/components/OfertaBiometria";
import {
  capacidad,
  estadoBiometria,
  activarBiometria,
  desactivarBiometria,
  verificarClave,
  esClaveIncorrecta,
  mensajeBiometria,
  correoOculto,
} from "../../src/lib/biometria";
import { cerrarSesion as cerrarSesionCompleta } from "../../src/lib/sesion";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../../src/components/ui/GlassPanel";
import { BankBadge } from "../../src/components/ui/BankBadge";
import { Boton } from "../../src/components/ui/Boton";
import { BotonIcono, Tarjeta } from "../../src/components/ui/Piezas";
import { bancoDe, colors, fonts } from "../../src/theme/tokens";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -60, right: -100 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -160, left: -110 },
];

const fechaLarga = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

/** "2.50" -> "2.5", "3.00" -> "3". */
const porcentaje = (v) => Number(v).toFixed(2).replace(/\.?0+$/, "");

/** "+51987654321" -> "+51 987 654 321". */
function telefonoLegible(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("51")) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return t || "";
}

/** Fila de dato con su ícono en un cuadro claro. */
function Dato({ icono, etiqueta, valor, ultima }) {
  return (
    <View style={[s.dato, !ultima && s.datoSeparado]} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <View style={s.datoIcono}>
        <Ionicons name={icono} size={19} color={colors.navy} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.datoEtiqueta}>{etiqueta}</Text>
        <Text style={s.datoValor} numberOfLines={1}>
          {valor}
        </Text>
      </View>
    </View>
  );
}

export default function PerfilScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Datos personales y comisiones guardados en el teléfono: solo se
  // vuelven a descargar si el gestor cambió algo (huellas "perfil" y
  // "comisiones"). Entrar a Mi cuenta ya no muestra "cargando".
  const { datos: guardado, cargando, refrescando, recargar } = useDatos(
    "perfil",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      // Las dos consultas en paralelo: no dependen una de otra.
      const [{ data: perfilData, error: e1 }, { data: com, error: e2 }] = await Promise.all([
        supabase
          .from("perfiles_cliente")
          .select(
            "nombres, apellidos, tipo_documento, dni, telefono, direccion, validado_por, fecha_validacion, created_at, acepta_promociones",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        // La tarifa la calcula el servidor: manda la especial si la
        // hay, si no la del bloque al que pertenece el cliente.
        // Calcularla aqui a partir de las tarifas generales mostraria
        // un numero que no es el que se le aplica.
        supabase.rpc("mis_comisiones"),
      ]);
      if (e1 || e2) throw e1 || e2;
      return { email: user.email, perfil: perfilData, comisiones: com || { bloque: null, bancos: [] } };
    },
    { grupos: ["perfil", "comisiones"] },
  );
  // Sin huella: cambian poco y la copia se renueva al entrar.
  const { datos: aceptaciones } = useDatos("aceptaciones", misAceptaciones);
  const usuario = guardado ? { email: guardado.email } : null;
  // Promociones: se muestra el cambio al instante; si falla, vuelve.
  const [promos, setPromos] = useState(null);
  const aceptaPromos = promos ?? Boolean(guardado?.perfil?.acepta_promociones);
  async function cambiarPromos(v) {
    setPromos(v);
    const { error } = await supabase.rpc("fijar_promociones", { p_acepta: v });
    if (error) {
      setPromos(!v);
      return;
    }
    recargar();
  }
  const perfil = guardado?.perfil || null;
  const comisiones = guardado?.comisiones || null;

  // ── Entrar con huella o rostro ──
  // Se vuelve a mirar cada vez que se entra a Mi cuenta: el cliente pudo
  // agregar o quitar huellas en los ajustes del teléfono.
  const { mostrar } = useAviso();
  const [bioCap, setBioCap] = useState(null);
  const [bioEstado, setBioEstado] = useState(null);
  const [bioModal, setBioModal] = useState(false);
  const [bioOculta, setBioOculta] = useState(false);
  const revisarBio = useCallback(async () => {
    const [c, e] = await Promise.all([capacidad(), estadoBiometria()]);
    setBioCap(c);
    setBioEstado(e);
  }, []);
  useFocusEffect(
    useCallback(() => {
      revisarBio();
    }, [revisarBio]),
  );
  const correo = (usuario?.email || "").toLowerCase();
  const bioActiva = Boolean(bioEstado && correo && bioEstado.email === correo && bioCap?.disponible);
  const bioOtraCuenta = Boolean(bioEstado && correo && bioEstado.email !== correo);
  const mostrarBio =
    Boolean(bioCap) && (bioCap.disponible || bioCap.motivo === "sin_inscribir" || bioCap.motivo === "debil");
  const textoBio = bioActiva
    ? "Entras sin escribir tu contraseña"
    : bioCap?.motivo === "sin_inscribir"
      ? "Primero agrega una huella o tu rostro en los ajustes del teléfono"
      : bioCap?.motivo === "debil"
        ? "El desbloqueo de este teléfono no es compatible. Usa una huella"
        : bioOtraCuenta
          ? "Está activa para otra cuenta en este teléfono"
          : "Entra sin escribir tu contraseña";

  async function cambiarBio(v) {
    if (v) return setBioModal(true);
    if (!(await confirmar(`¿Dejar de entrar con ${bioCap?.nombre || "tu huella"} en este teléfono?`, "Apagar"))) return;
    await desactivarBiometria();
    await revisarBio();
    mostrar("Listo. La próxima vez ingresa con tu contraseña.", "exito");
  }

  // Devuelve el texto del error para la ventana, o null.
  async function activarBio(clave) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return "Tu sesión venció. Vuelve a ingresar.";
    if (!(await hayConexion())) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";

    // Primero se confirma que es su contraseña: guardar una equivocada
    // dejaría una huella que nunca sirve.
    const prueba = await verificarClave(user.email, clave);
    if (!prueba.ok) {
      return esClaveIncorrecta(prueba.error)
        ? "Esa no es tu contraseña. Revísala e inténtalo de nuevo."
        : mensajeError(prueba.error);
    }

    if (ocultarDuranteLector) setBioOculta(true);
    const nombre = (perfil?.nombres || "").trim().split(/\s+/)[0] || null;
    const r = await activarBiometria({ email: user.email, clave, nombre });
    setBioOculta(false);
    if (!r.ok) return r.motivo === "cancelado" ? null : mensajeBiometria(r.motivo, bioCap?.nombre);

    setBioModal(false);
    await revisarBio();
    mostrar(
      bioCap?.tipo === "rostro" ? "Listo. La próxima vez entra con tu rostro." : "Listo. La próxima vez entra con tu huella.",
      "exito",
      4000,
    );
    return null;
  }

  // window.confirm no existe en React Native: sin esto el boton de
  // cerrar sesion no hacia nada en el telefono.
  async function cerrarSesion() {
    if (!(await confirmar("¿Seguro que quieres cerrar sesión?"))) return;
    // Borra la sesion, la marca de tiempo y los datos guardados, para
    // que nada del usuario anterior quede en el telefono.
    await cerrarSesionCompleta();
    // "quedarse": quien cerró sesión a propósito ve la bienvenida, no
    // la huella pidiéndose sola.
    router.replace("/?quedarse=1");
  }

  // Con nombres vacio, perfil.nombres[0] lanzaba una excepcion.
  const iniciales =
    ((perfil?.nombres || "").trim()[0] || "") + ((perfil?.apellidos || "").trim()[0] || "") || "?";
  const verificado = Boolean(perfil?.validado_por);
  const nombre = perfil ? `${perfil.nombres || ""} ${perfil.apellidos || ""}`.trim() : "Mi cuenta";
  const vacio = cargando && !perfil ? "…" : "—";

  const datos = [
    {
      icono: "id-card-outline",
      etiqueta: perfil?.tipo_documento === "ce" ? "Carnet de extranjería" : "DNI",
      valor: perfil?.dni || vacio,
    },
    { icono: "mail-outline", etiqueta: "Correo", valor: usuario?.email || vacio },
    { icono: "phone-portrait-outline", etiqueta: "Celular", valor: telefonoLegible(perfil?.telefono) || vacio },
    { icono: "location-outline", etiqueta: "Dirección", valor: perfil?.direccion || vacio },
  ];

  // Primero los bancos con los que ya opera: es la tarifa que le toca.
  const bancos = [...(comisiones?.bancos || [])].sort(
    (a, b) => Number(Boolean(b.con_tarjeta)) - Number(Boolean(a.con_tarjeta)),
  );
  const hayEspecial = bancos.some((b) => b.especial);

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={recargar}
            tintColor={colors.white}
            colors={[colors.navy]}
          />
        }
      >
        {/* ── Identidad, en azul noche ── */}
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={s.barra}>
            <BotonIcono variante="noche" icono="menu" onPress={() => setMenuVisible(true)} accessibilityLabel="Abrir menú" />
            <Text style={s.barraTitulo} accessibilityRole="header">
              Mi cuenta
            </Text>
            <View style={{ width: 44 }} />
          </View>
          <Aparece>
            <View style={s.identidad}>
              <GlassPanel variant="onNight" radius={36} style={s.avatar}>
                <Text style={s.avatarTexto}>{iniciales.toUpperCase()}</Text>
              </GlassPanel>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                {cargando && !perfil ? (
                  <View style={s.nombreEsqueleto} />
                ) : (
                  <Text style={s.nombre} numberOfLines={2}>
                    {nombre}
                  </Text>
                )}
                <View style={s.sellos}>
                  <View style={s.sello}>
                    <Ionicons name={verificado ? "shield-checkmark-outline" : "time-outline"} size={13} color="#F4DC8A" />
                    <Text style={s.selloTexto}>{verificado ? "Verificada" : "En revisión"}</Text>
                  </View>
                  {perfil?.created_at ? (
                    <Text style={s.desde}>Cliente desde {fechaLarga(perfil.created_at)}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {/* ── Datos ── */}
          <Aparece retraso={80}>
            <Text style={s.seccion}>Datos personales</Text>
            <Tarjeta style={s.datos}>
              {datos.map((d, i) => (
                <Dato key={d.etiqueta} {...d} ultima={i === datos.length - 1} />
              ))}
            </Tarjeta>
          </Aparece>

          {/* ── Comisiones ── */}
          <Aparece retraso={160}>
            <Text style={s.seccion}>Tus comisiones</Text>
            {cargando && !comisiones ? (
              <View style={s.grilla}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={s.celda}>
                    <Esqueleto alto={84} radio={18} />
                  </View>
                ))}
              </View>
            ) : bancos.length === 0 ? (
              <Tarjeta style={s.vacio}>
                <Text style={s.vacioTexto}>Cuando verifiquemos tu tarjeta verás aquí tu porcentaje.</Text>
              </Tarjeta>
            ) : (
              <View style={s.grilla}>
                {bancos.map((b) => (
                  <View key={b.banco} style={s.celda}>
                    <View
                      style={[s.comision, b.especial && s.comisionEspecial]}
                      accessibilityLabel={`${bancoDe(b.banco).name}: ${porcentaje(b.porcentaje)} por ciento${
                        b.porcentaje_hoy != null
                          ? ` al día siguiente, ${porcentaje(b.porcentaje_hoy)} por ciento para hoy`
                          : ""
                      }${b.especial ? ", condición especial" : ""}`}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <BankBadge bank={b.banco} size={26} />
                        <Text style={s.comisionBanco} numberOfLines={1}>
                          {bancoDe(b.banco).name}
                        </Text>
                      </View>
                      <Text style={s.comisionValor}>{porcentaje(b.porcentaje)}%</Text>
                      {b.porcentaje_hoy != null ? (
                        <Text style={s.comisionHoy}>
                          Día siguiente · {porcentaje(b.porcentaje_hoy)}% hoy
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={s.leyenda}>
              {hayEspecial ? <View style={s.leyendaMuestra} /> : null}
              <Text style={s.nota}>
                {hayEspecial ? "Condición especial · se descuenta del depósito" : "Se descuenta del depósito"}
              </Text>
            </View>
          </Aparece>

          {/* Entrar con la huella o el rostro. No aparece en teléfonos sin
              lector; si lo tiene pero sin huella registrada, se dice qué
              falta en vez de esconderlo. */}
          {mostrarBio ? (
            <Aparece retraso={200}>
              <Text style={s.seccion}>Seguridad</Text>
              <Tarjeta style={[s.datos, s.misDatos]}>
                <View style={[s.datoIcono, { backgroundColor: colors.goldCream }]}>
                  <Ionicons name={bioCap.icono} size={20} color={colors.goldText} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={s.datoValor}>Entrar con {bioCap.tipo === "rostro" ? "tu rostro" : "tu huella"}</Text>
                  <Text style={s.datoEtiqueta}>{textoBio}</Text>
                </View>
                <Switch
                  value={bioActiva}
                  onValueChange={cambiarBio}
                  disabled={!bioCap.disponible && !bioActiva}
                  trackColor={{ false: colors.track, true: colors.gold }}
                  thumbColor={colors.white}
                  accessibilityLabel={`Entrar con ${bioCap.nombre}`}
                />
              </Tarjeta>
            </Aparece>
          ) : null}

          {/* Lo que aceptó, con versión y fecha: la misma constancia que
              tiene la empresa, a la vista del cliente. */}
          <Aparece retraso={220}>
            <Text style={s.seccion}>Privacidad y términos</Text>
            <Tarjeta style={s.datos}>
              {["terminos", "privacidad", "biometria"].map((tipo, i, todos) => {
                const a = (aceptaciones || []).find((x) => x.tipo === tipo);
                return (
                  <Toque
                    key={tipo}
                    onPress={() =>
                      router.push({ pathname: "/legal/[tipo]", params: a ? { tipo, id: a.documento_id } : { tipo } })
                    }
                    accessibilityLabel={`${TIPOS_LEGALES[tipo].corto}${
                      a ? `, versión ${a.version}, aceptada el ${fechaLegal(a.aceptado_en)}` : ""
                    }`}
                    escala={0.99}
                    style={[s.dato, i < todos.length - 1 && s.datoSeparado]}
                  >
                    <View style={s.datoIcono}>
                      <Ionicons name={TIPOS_LEGALES[tipo].icono} size={19} color={colors.navy} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={s.datoValor} numberOfLines={1}>
                        {TIPOS_LEGALES[tipo].corto}
                      </Text>
                      <Text style={s.datoEtiqueta}>
                        {a ? `Versión ${a.version} · aceptada el ${fechaLegal(a.aceptado_en)}` : "Toca para leer"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Toque>
                );
              })}
            </Tarjeta>
            <Tarjeta style={[s.datos, s.misDatos]}>
              <View style={[s.datoIcono, { backgroundColor: colors.infoBg }]}>
                <Ionicons name="megaphone-outline" size={19} color={colors.navy} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.datoValor}>Recibir promociones</Text>
                <Text style={s.datoEtiqueta}>
                  {aceptaPromos ? "Te avisaremos de promociones y novedades" : "No te enviaremos promociones"}
                </Text>
              </View>
              <Switch
                value={aceptaPromos}
                onValueChange={cambiarPromos}
                trackColor={{ false: colors.track, true: colors.gold }}
                thumbColor={colors.white}
                accessibilityLabel="Recibir promociones"
              />
            </Tarjeta>
            <Toque
              onPress={() => router.push("/mis-datos")}
              accessibilityLabel="Mis datos: descargarlos o eliminar mi cuenta"
              escala={0.99}
            >
              <Tarjeta style={[s.datos, s.misDatos]}>
                <View style={[s.datoIcono, { backgroundColor: colors.goldCream }]}>
                  <Ionicons name="folder-open-outline" size={19} color={colors.goldText} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={s.datoValor}>Mis datos</Text>
                  <Text style={s.datoEtiqueta}>Descárgalos o pide eliminar tu cuenta</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Tarjeta>
            </Toque>
          </Aparece>

          <Aparece retraso={240}>
            <Boton
              variante="peligro"
              titulo="Cerrar sesión"
              iconoIzq="log-out-outline"
              onPress={cerrarSesion}
              style={{ marginTop: 18, height: 54 }}
            />
          </Aparece>
        </View>
      </ScrollView>

      <MenuLateral visible={menuVisible} onClose={() => setMenuVisible(false)} perfil={perfil} />
      <OfertaBiometria
        visible={bioModal}
        oculta={bioOculta}
        modo="clave"
        cap={bioCap}
        reemplaza={bioOtraCuenta ? correoOculto(bioEstado.email) : null}
        onActivar={activarBio}
        onCerrar={() => setBioModal(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 30, gap: 22 },
  barra: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barraTitulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.white },
  identidad: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontFamily: fonts.display, fontSize: 26, color: "#F4DC8A" },
  nombre: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.4, color: colors.white },
  nombreEsqueleto: { width: 170, height: 28, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  sellos: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  sello: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(232,184,0,0.18)",
  },
  selloTexto: { fontFamily: fonts.heavy, fontSize: 12, color: "#F4DC8A" },
  desde: { fontFamily: fonts.label, fontSize: 12, color: "rgba(255,255,255,0.75)" },

  cuerpo: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  misDatos: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 10 },
  datos: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 2 },
  dato: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  datoSeparado: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  datoIcono: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  datoEtiqueta: { fontFamily: fonts.strong, fontSize: 13, color: colors.text2 },
  datoValor: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },

  grilla: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  celda: { width: "33.333%", padding: 4 },
  comision: {
    borderRadius: 18,
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  comisionEspecial: { backgroundColor: colors.goldCream, borderColor: "#F3DE92" },
  comisionBanco: { flex: 1, fontFamily: fonts.strong, fontSize: 12, color: colors.text2 },
  comisionValor: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.text, fontVariant: ["tabular-nums"] },
  comisionHoy: { marginTop: -6, fontFamily: fonts.label, fontSize: 10, lineHeight: 13, color: colors.text3 },
  vacio: { borderRadius: 18, padding: 16 },
  vacioTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.text2 },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, paddingTop: 8 },
  leyendaMuestra: { width: 12, height: 12, borderRadius: 4, backgroundColor: colors.goldCream, borderWidth: 1, borderColor: "#F3DE92" },
  nota: { fontFamily: fonts.label, fontSize: 12, color: colors.text2 },
});
