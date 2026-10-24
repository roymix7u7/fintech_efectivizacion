import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Animated } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../src/lib/supabase";
import { useDatos, invalidar } from "../../src/lib/cache";
import MenuLateral from "../../src/components/MenuLateral";
import { mensajeError } from "../../src/lib/ui";
import { useAviso } from "../../src/components/Avisos";
import { nombreCanal } from "../../src/lib/alertas";
import { EsqueletoLista, Aparece } from "../../src/components/Cargando";
import {
  bancosDelCliente,
  cuentasDeDeposito,
  esBancoPrincipal,
  esCuentaNormal,
  estadoBanco,
} from "../../src/lib/deposito";
import { CURVA, useReducirMovimiento } from "../../src/lib/movimiento";
import { BankIcon } from "../../src/components/brand/BankIcon";
import { BankBadge, matiz } from "../../src/components/ui/BankBadge";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../../src/components/ui/GlassPanel";
import { Toque } from "../../src/components/ui/Toque";
import { Boton } from "../../src/components/ui/Boton";
import { Hoja } from "../../src/components/ui/Hoja";
import { useEspacioPestanas } from "../../src/components/ui/BarraPestanas";
import { BotonIcono, Etiqueta, MiniTarjeta, Tarjeta } from "../../src/components/ui/Piezas";
import { bancoDe, colors, fonts } from "../../src/theme/tokens";

// Las tarjetas rechazadas que la persona ya leyó y ocultó. Es solo
// para no repetirle el aviso: sigue en "Mis avisos" y en el panel.
const CLAVE_OCULTAS = "atk:rechazadas-ocultas";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -60, right: -100 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -160, left: -110 },
];

const ESTADOS = {
  listo: { texto: "Listo", bg: colors.successBg, fg: colors.successText },
  falta_cuenta: { texto: "Falta cuenta", bg: colors.goldCream, fg: colors.goldCreamText },
  verificando: { texto: "Verificando", bg: colors.infoBg, fg: colors.navyLight },
  falta_tarjeta: { texto: "Falta tarjeta", bg: "#EEF1F5", fg: colors.text2 },
};

const ultimos = (numero) => String(numero || "").replace(/\D/g, "").slice(-4);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Ícono de la fila: la tarjeta en el color de su banco (punteada si
 * todavía se revisa), o el edificio del banco sobre su color suave.
 */
function IconoFila({ tipo, banco, pendiente }) {
  const color = bancoDe(banco).color;
  return (
    <View style={[s.iconoFila, { backgroundColor: matiz(color, 0.9) }]}>
      {tipo === "tarjeta" ? (
        pendiente ? (
          <View style={s.tarjetaPendiente}>
            <View style={s.tarjetaPendienteChip} />
          </View>
        ) : (
          <MiniTarjeta ancho={34} alto={23} color={color} />
        )
      ) : (
        <BankIcon size={22} color={color} />
      )}
    </View>
  );
}

/** Fila "Agregar ..." de lo que le falta a un banco. */
function FilaAgregar({ texto, onPress }) {
  return (
    <Toque onPress={onPress} accessibilityLabel={`Agregar ${texto}`} style={[s.fila, s.filaSeparada]}>
      <View style={[s.iconoFila, { backgroundColor: "#FFF8E1" }]}>
        <Ionicons name="add" size={20} color="#B39B52" />
      </View>
      <Text style={[s.filaTitulo, { flex: 1, color: colors.goldCreamText }]}>{texto}</Text>
      <View style={s.agregarChip}>
        <Text style={s.agregarChipTexto}>Agregar</Text>
      </View>
    </Toque>
  );
}

/** Un banco de "Mis bancos": cabecera tocable y su detalle desplegable. */
function FilaBanco({ banco, tarjetas, cuentas, todasLasCuentas, abierto, onAlternar, router }) {
  const reducir = useReducirMovimiento();
  const giro = useRef(new Animated.Value(abierto ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(giro, { toValue: abierto ? 1 : 0, duration: reducir ? 0 : 300, easing: CURVA, useNativeDriver: true }).start();
  }, [abierto]);

  const b = bancoDe(banco);
  const estado = estadoBanco(banco, tarjetas, todasLasCuentas);
  const e = ESTADOS[estado];
  const vivas = tarjetas.filter((t) => t.banco === banco && t.estado !== "rechazado");
  const propias = cuentas.filter((c) => c.banco === banco);
  const destino = cuentasDeDeposito(banco, todasLasCuentas);
  const tieneAhorros = propias.some(esCuentaNormal);

  const resumen = [
    vivas.length ? plural(vivas.length, "tarjeta", "tarjetas") : esBancoPrincipal(banco) ? "sin tarjeta" : null,
    propias.length
      ? plural(propias.length, "cuenta", "cuentas")
      : esBancoPrincipal(banco)
        ? "sin cuenta"
        : destino.length
          ? `deposita en ${bancoDe(destino[0].banco).name}`
          : "sin cuenta de ahorros",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[s.banco, abierto && { borderColor: matiz(b.color, 0.6) }]}>
      <Toque
        onPress={onAlternar}
        escala={0.99}
        accessibilityLabel={`${b.name}. ${resumen}. ${e?.texto || ""}`}
        accessibilityState={{ expanded: abierto }}
        style={s.bancoCabeza}
      >
        <BankBadge bank={banco} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.bancoNombre}>{b.name}</Text>
          <Text style={s.bancoResumen} numberOfLines={1}>
            {resumen}
          </Text>
        </View>
        {e ? (
          <View style={[s.estado, { backgroundColor: e.bg }]}>
            <Text style={[s.estadoTexto, { color: e.fg }]}>{e.texto}</Text>
          </View>
        ) : null}
        <Animated.View
          style={{ transform: [{ rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Animated.View>
      </Toque>

      {abierto ? (
        <Aparece>
          <View style={{ paddingBottom: 6 }}>
            {vivas.map((t) => (
              <View key={t.id} style={[s.fila, s.filaSeparada]}>
                <IconoFila tipo="tarjeta" banco={banco} pendiente={t.estado !== "aprobado"} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={s.filaTitulo}>Tarjeta ···· {t.ultimos_4}</Text>
                  <Text style={s.filaDetalle}>
                    {t.estado === "aprobado" ? "Verificada" : "Una persona la está revisando"}
                  </Text>
                </View>
                <View
                  style={[
                    s.marca,
                    { backgroundColor: t.estado === "aprobado" ? colors.successBg : colors.infoBg },
                  ]}
                  accessibilityLabel={t.estado === "aprobado" ? "Verificada" : "En revisión"}
                >
                  <Ionicons
                    name={t.estado === "aprobado" ? "checkmark" : "time-outline"}
                    size={14}
                    color={t.estado === "aprobado" ? colors.success : colors.navyLight}
                  />
                </View>
              </View>
            ))}

            {propias.map((c) => {
              const recibe = destino.some((d) => d.id === c.id) && vivas.length > 0;
              return (
                <View key={c.id} style={[s.fila, s.filaSeparada]}>
                  <IconoFila tipo="cuenta" banco={banco} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.filaTitulo}>Cuenta ···· {ultimos(c.numero_cuenta)}</Text>
                    <Text style={s.filaDetalle}>
                      {esCuentaNormal(c) ? (recibe ? "Ahorros · recibe tus depósitos" : "Ahorros") : "Interbancaria (CCI)"}
                    </Text>
                  </View>
                  <Toque
                    onPress={() => router.push({ pathname: "/cuenta-nueva", params: { editar: c.id } })}
                    accessibilityLabel={`Editar cuenta ···· ${ultimos(c.numero_cuenta)}`}
                    style={s.editar}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.text} />
                  </Toque>
                </View>
              );
            })}

            {/* Lo que le falta a este banco para operar. */}
            {esBancoPrincipal(banco) && vivas.length > 0 && !tieneAhorros ? (
              <FilaAgregar
                texto={`Cuenta ${b.name}`}
                onPress={() => router.push({ pathname: "/cuenta-nueva", params: { banco, tipo: "ahorros" } })}
              />
            ) : null}
            {!esBancoPrincipal(banco) && vivas.length > 0 && !destino.length ? (
              <FilaAgregar
                texto="Cuenta de ahorros (cualquier banco)"
                onPress={() => router.push({ pathname: "/cuenta-nueva", params: { tipo: "ahorros" } })}
              />
            ) : null}
            {vivas.length === 0 ? (
              <FilaAgregar
                texto={`Tarjeta ${b.name}`}
                onPress={() => router.push({ pathname: "/tarjeta-nueva", params: { banco } })}
              />
            ) : null}
          </View>
        </Aparece>
      ) : null}
    </View>
  );
}

export default function TarjetasScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [agregar, setAgregar] = useState(false);
  const [ocultas, setOcultas] = useState([]);
  const router = useRouter();
  const espacioPestanas = useEspacioPestanas();
  const { mostrar } = useAviso();

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_OCULTAS)
      .then((v) => setOcultas(JSON.parse(v || "[]")))
      .catch(() => {});
  }, []);

  // Tarjetas y cuentas guardadas en el teléfono: solo se vuelven a
  // descargar si cambió alguna (huellas "tarjetas" y "cuentas").
  const {
    datos,
    cargando: loading,
    refrescando: refreshing,
    error,
    recargar,
  } = useDatos(
    "tarjetas",
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { perfil: null, tarjetas: [], cuentas: [] };

      const { data: perfilData, error: e1 } = await supabase
        .from("perfiles_cliente")
        .select("id, nombres, apellidos, validado_por")
        .eq("user_id", user.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!perfilData) return { perfil: null, tarjetas: [], cuentas: [] };

      const [{ data: tarjetasData, error: errorTarjetas }, { data: cuentasData, error: errorCuentas }] = await Promise.all([
        supabase
          .from("tarjetas")
          .select("id, banco, ultimos_4, estado, motivo_rechazo, created_at")
          .eq("cliente_id", perfilData.id)
          .eq("activa", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("cuentas_bancarias")
          .select("id, banco, tipo, numero_cuenta")
          .eq("cliente_id", perfilData.id)
          .eq("activa", true)
          .order("banco", { ascending: true }),
      ]);
      if (errorTarjetas || errorCuentas) throw errorTarjetas || errorCuentas;
      return { perfil: perfilData, tarjetas: tarjetasData || [], cuentas: cuentasData || [] };
    },
    { grupos: ["tarjetas", "cuentas", "perfil"] },
  );
  const perfil = datos?.perfil || null;
  const tarjetas = datos?.tarjetas || [];
  const cuentas = datos?.cuentas || [];

  useEffect(() => {
    if (error) mostrar(mensajeError(error), "error");
  }, [error]);

  // Lo que el gestor decida en el panel (aprobar o rechazar una
  // tarjeta, dar de baja) se ve aquí sin tener que recargar.
  useEffect(() => {
    if (!perfil?.id) return;
    const canal = supabase
      .channel(nombreCanal("mis-tarjetas"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tarjetas", filter: `cliente_id=eq.${perfil.id}` }, () =>
        invalidar("tarjetas", "comisiones", "avisos"),
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [perfil?.id]);

  function ocultar(id) {
    const nuevas = [...ocultas, id];
    setOcultas(nuevas);
    AsyncStorage.setItem(CLAVE_OCULTAS, JSON.stringify(nuevas)).catch(() => {});
    mostrar("Aviso ocultado. Sigue en Mis avisos", "info");
  }

  const bancos = bancosDelCliente(tarjetas, cuentas);
  // Una rechazada deja de pedir atención si la persona la ocultó o si
  // ya registró otra de ese banco después ("al registrarla otra vez,
  // este aviso desaparece").
  const rechazadas = tarjetas.filter(
    (t) =>
      t.estado === "rechazado" &&
      !ocultas.includes(t.id) &&
      !tarjetas.some((o) => o.banco === t.banco && o.estado !== "rechazado" && o.created_at > t.created_at),
  );
  const vacio = !bancos.length && !rechazadas.length;

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: espacioPestanas }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={recargar}
            tintColor={colors.white}
          />
        }
      >
        <CabeceraNoche luces={LUCES} style={s.cabecera}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <BotonIcono variante="noche" icono="menu" onPress={() => setMenuVisible(true)} accessibilityLabel="Abrir menú" />
            <View style={{ width: 44 }} />
          </View>
          <View style={{ alignItems: "center", gap: 10 }}>
            <Text style={s.titulo} accessibilityRole="header">
              Tarjetas y cuentas
            </Text>
            <GlassPanel variant="onNight" radius={16} style={s.regla}>
              <MiniTarjeta ancho={34} alto={23} />
              <Ionicons name="arrow-forward" size={16} color={colors.gold} />
              <BankIcon size={18} color={colors.white} />
              <Text style={s.reglaTexto}>
                El dinero llega a tu cuenta de ahorros del mismo banco de la tarjeta. CMR y otras: a cualquier banco.
              </Text>
            </GlassPanel>
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <View style={s.cabeceraLista}>
            <Etiqueta style={{ textTransform: "none", letterSpacing: 0, fontSize: 13, color: colors.text2 }}>
              Mis bancos
            </Etiqueta>
            <Toque onPress={() => setAgregar(true)} accessibilityLabel="Agregar tarjeta o cuenta" style={s.agregar}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={s.agregarTexto}>Agregar</Text>
            </Toque>
          </View>

          {loading ? (
            <EsqueletoLista filas={3} alto={68} />
          ) : vacio ? (
            <Aparece>
              <Tarjeta style={s.vacio}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <MiniTarjeta ancho={40} alto={27} />
                  <Ionicons name="arrow-forward" size={18} color={colors.gold} />
                  <BankIcon size={26} color={colors.navy} />
                </View>
                <Text style={s.vacioTitulo}>Registra tu tarjeta y tu cuenta</Text>
                <Text style={s.vacioTexto}>
                  Con una tarjeta verificada y una cuenta de ahorros a tu nombre ya puedes enviar solicitudes.
                </Text>
                <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
                  <Boton titulo="Tarjeta" iconoIzq="add" onPress={() => router.push("/tarjeta-nueva")} style={{ flex: 1, height: 50 }} />
                  <Boton
                    variante="contorno"
                    titulo="Cuenta"
                    iconoIzq="add"
                    onPress={() => router.push("/cuenta-nueva")}
                    style={{ flex: 1, height: 50 }}
                  />
                </View>
              </Tarjeta>
            </Aparece>
          ) : (
            <View style={{ gap: 8 }}>
              {bancos.map((banco, i) => (
                <Aparece key={banco} retraso={Math.min(i, 6) * 50}>
                  <FilaBanco
                    banco={banco}
                    tarjetas={tarjetas}
                    cuentas={cuentas}
                    todasLasCuentas={cuentas}
                    abierto={abierto === banco}
                    onAlternar={() => setAbierto(abierto === banco ? null : banco)}
                    router={router}
                  />
                </Aparece>
              ))}
            </View>
          )}

          {rechazadas.length ? (
            <Aparece>
              <View style={{ gap: 12 }}>
                <Text style={s.seccion}>Requiere tu atención</Text>
                {rechazadas.map((t) => (
                  <View key={t.id} style={s.rechazada}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={[s.iconoFila, { backgroundColor: colors.errorBg }]}>
                        <View style={s.tarjetaGris}>
                          <View style={s.tarjetaGrisChip} />
                        </View>
                        <View style={s.cruz}>
                          <Ionicons name="close" size={10} color={colors.white} />
                        </View>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.filaTitulo}>
                          {bancoDe(t.banco).name} ···· {t.ultimos_4}
                        </Text>
                        <Text style={[s.filaDetalle, { color: colors.errorText, fontFamily: fonts.strong }]}>
                          Tarjeta rechazada
                        </Text>
                      </View>
                      <Toque onPress={() => ocultar(t.id)} accessibilityLabel="Ocultar aviso" style={s.ocultar}>
                        <Ionicons name="close" size={17} color={colors.text3} />
                      </Toque>
                    </View>
                    <Text style={s.motivo}>Motivo: {t.motivo_rechazo || "Escríbenos para conocer el detalle."}</Text>
                    <Boton
                      variante="contorno"
                      titulo="Registrar de nuevo"
                      onPress={() => router.push({ pathname: "/tarjeta-nueva", params: { banco: t.banco } })}
                      style={{ height: 46 }}
                    />
                    <Text style={s.motivoNota}>Al registrarla otra vez, este aviso desaparece</Text>
                  </View>
                ))}
              </View>
            </Aparece>
          ) : null}
        </View>
      </ScrollView>

      <Hoja visible={agregar} onCerrar={() => setAgregar(false)} titulo="¿Qué quieres agregar?">
        <View style={{ gap: 10 }}>
          <Toque
            onPress={() => {
              setAgregar(false);
              router.push("/tarjeta-nueva");
            }}
            accessibilityLabel="Agregar tarjeta"
            style={s.opcion}
          >
            <View style={s.opcionIcono}>
              <MiniTarjeta ancho={34} alto={23} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.opcionTitulo}>Tarjeta</Text>
              <Text style={s.opcionTexto}>La registras con una foto</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Toque>
          <Toque
            onPress={() => {
              setAgregar(false);
              router.push("/cuenta-nueva");
            }}
            accessibilityLabel="Agregar cuenta bancaria"
            style={s.opcion}
          >
            <View style={s.opcionIcono}>
              <BankIcon size={24} color={colors.navy} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.opcionTitulo}>Cuenta bancaria</Text>
              <Text style={s.opcionTexto}>Donde recibirás tus depósitos</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Toque>
        </View>
      </Hoja>

      <MenuLateral visible={menuVisible} onClose={() => setMenuVisible(false)} perfil={perfil} />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
  titulo: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.white, textAlign: "center" },
  regla: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  reglaTexto: { flexShrink: 1, fontFamily: fonts.strong, fontSize: 13, lineHeight: 18, color: colors.white },

  cuerpo: { paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  cabeceraLista: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingLeft: 6, paddingTop: 6 },
  agregar: {
    height: 44,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 12,
    backgroundColor: colors.navy,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  agregarTexto: { fontFamily: fonts.heavy, fontSize: 14, color: colors.white },

  banco: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: 22, paddingHorizontal: 14 },
  bancoCabeza: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12 },
  bancoNombre: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  bancoResumen: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  estado: { height: 26, paddingHorizontal: 10, borderRadius: 999, justifyContent: "center" },
  estadoTexto: { fontFamily: fonts.heavy, fontSize: 12 },

  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  filaSeparada: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  iconoFila: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  filaTitulo: { fontFamily: fonts.strong, fontSize: 16, color: colors.text },
  filaDetalle: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  marca: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  editar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  agregarChip: { height: 36, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.gold, justifyContent: "center" },
  agregarChipTexto: { fontFamily: fonts.heavy, fontSize: 13, color: colors.night },
  tarjetaPendiente: {
    width: 34,
    height: 23,
    borderRadius: 5,
    backgroundColor: "#EEF1F7",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#9AA8C6",
  },
  tarjetaPendienteChip: { position: "absolute", top: 4, left: 4, width: 9, height: 7, borderRadius: 2, backgroundColor: "#C9D2E6" },

  seccion: { fontFamily: fonts.heavy, fontSize: 13, color: colors.text2, paddingHorizontal: 6, paddingTop: 10 },
  rechazada: {
    borderRadius: 20,
    padding: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "#F1C4BF",
    backgroundColor: colors.surface,
    gap: 10,
  },
  tarjetaGris: { width: 34, height: 23, borderRadius: 5, backgroundColor: "#D5D9E1" },
  tarjetaGrisChip: { position: "absolute", top: 5, left: 5, width: 9, height: 7, borderRadius: 2, backgroundColor: "#B7BDC9" },
  cruz: {
    position: "absolute",
    right: 1,
    bottom: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.errorBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ocultar: { width: 44, height: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  motivo: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2, paddingHorizontal: 2 },
  motivoNota: { fontFamily: fonts.label, fontSize: 12, color: colors.text3, textAlign: "center" },

  vacio: { borderRadius: 24, padding: 20, gap: 10, alignItems: "center" },
  vacioTitulo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: "center", marginTop: 6 },
  vacioTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2, textAlign: "center", marginBottom: 6 },

  opcion: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: colors.ground,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  opcionIcono: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  opcionTitulo: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  opcionTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
});
