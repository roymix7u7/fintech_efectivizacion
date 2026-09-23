import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import Header from "../../src/components/Header";
import MenuLateral from "../../src/components/MenuLateral";
import COLORS from "../../src/theme/colors";
import TIPO, { CIFRAS } from "../../src/theme/tipografia";
import { Esqueleto, Aparece } from "../../src/components/Cargando";
import { confirmar } from "../../src/lib/ui";
import { cerrarSesion as cerrarSesionCompleta } from "../../src/lib/sesion";

export default function PerfilScreen() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [comisiones, setComisiones] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  const cargar = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUsuario(user);

      // Las dos consultas en paralelo: no dependen una de otra.
      const [{ data: perfilData }, { data: com }] = await Promise.all([
        supabase
          .from("perfiles_cliente")
          .select("nombres, apellidos, dni, telefono, direccion, validado_por, fecha_validacion")
          .eq("user_id", user.id)
          .maybeSingle(),
        // La tarifa la calcula el servidor: manda la especial si la
        // hay, si no la del bloque al que pertenece el cliente.
        // Calcularla aqui a partir de las tarifas generales mostraria
        // un numero que no es el que se le aplica.
        supabase.rpc("mis_comisiones"),
      ]);

      setPerfil(perfilData);
      setComisiones(com || { bloque: null, bancos: [] });
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  // window.confirm no existe en React Native: sin esto el boton de
  // cerrar sesion no hacia nada en el telefono.
  async function cerrarSesion() {
    if (!(await confirmar("¿Seguro que quieres cerrar sesión?"))) return;
    // Borra la sesion, la marca de tiempo y los datos guardados, para
    // que nada del usuario anterior quede en el telefono.
    await cerrarSesionCompleta();
    router.replace("/");
  }

  // Con nombres vacio, perfil.nombres[0] lanzaba una excepcion.
  const iniciales =
    ((perfil?.nombres || "").trim()[0] || "") +
      ((perfil?.apellidos || "").trim()[0] || "") || "?";

  const verificado = Boolean(perfil?.validado_por);

  const datos = [
    { etiqueta: "Nombres", valor: perfil?.nombres, icono: "person-outline" },
    { etiqueta: "Apellidos", valor: perfil?.apellidos, icono: "people-outline" },
    { etiqueta: "DNI", valor: perfil?.dni, icono: "card-outline", cifras: true },
    { etiqueta: "Teléfono", valor: perfil?.telefono, icono: "call-outline", cifras: true },
    { etiqueta: "Correo", valor: usuario?.email, icono: "mail-outline" },
    { etiqueta: "Dirección", valor: perfil?.direccion, icono: "location-outline" },
  ];

  const bancos = comisiones?.bancos || [];
  const conTarjeta = bancos.filter((b) => b.con_tarjeta);
  const otros = bancos.filter((b) => !b.con_tarjeta);

  return (
    <View style={s.pantalla}>
      <Header onMenuPress={() => setMenuVisible(true)} titulo="Mi cuenta" />

      <ScrollView
        contentContainerStyle={s.contenido}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              setRefrescando(true);
              cargar();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Identidad ── */}
        <Aparece>
          <View style={s.cabecera}>
            <View style={s.avatar}>
              <Text style={s.avatarTexto}>{iniciales}</Text>
            </View>
            {cargando && !perfil ? (
              <>
                <Esqueleto alto={20} ancho={160} estilo={{ marginTop: 12 }} />
                <Esqueleto alto={13} ancho={200} estilo={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <Text style={s.nombre}>
                  {perfil ? `${perfil.nombres} ${perfil.apellidos}` : "Mi cuenta"}
                </Text>
                <Text style={s.correo}>{usuario?.email}</Text>
                <View
                  style={[
                    s.estado,
                    { backgroundColor: verificado ? COLORS.successLight : COLORS.warningLight },
                  ]}
                >
                  <Ionicons
                    name={verificado ? "shield-checkmark" : "time"}
                    size={13}
                    color={verificado ? COLORS.success : COLORS.warning}
                  />
                  <Text
                    style={[
                      s.estadoTexto,
                      { color: verificado ? COLORS.success : COLORS.warning },
                    ]}
                  >
                    {verificado ? "Identidad verificada" : "Identidad en revisión"}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Aparece>

        {/* ── Datos personales ── */}
        <Aparece retraso={80}>
          <Text style={s.seccion}>Datos personales</Text>
          <View style={s.tarjeta}>
            {datos.map((d, i) => (
              <View
                key={d.etiqueta}
                style={[s.fila, i < datos.length - 1 && s.filaBorde]}
              >
                <Ionicons
                  name={d.icono}
                  size={17}
                  color={COLORS.textLight}
                  style={{ width: 24 }}
                />
                <Text style={s.filaEtiqueta}>{d.etiqueta}</Text>
                <Text
                  style={[s.filaValor, d.cifras && CIFRAS]}
                  numberOfLines={2}
                >
                  {cargando && !perfil ? "…" : d.valor || "—"}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.pie}>
            ¿Algún dato está mal? Escríbenos y lo corregimos: tus datos deben
            coincidir con tu DNI.
          </Text>
        </Aparece>

        {/* ── Comisiones ── */}
        <Aparece retraso={160}>
          <Text style={s.seccion}>Mis comisiones</Text>
          <View style={s.tarjeta}>
            <View style={s.comisionCabecera}>
              <Text style={s.comisionIntro}>
                Es el porcentaje que se descuenta de tu operación, según el
                banco de la tarjeta que uses.
              </Text>
              {comisiones?.bloque ? (
                <View style={s.plan}>
                  <Ionicons name="pricetags-outline" size={13} color={COLORS.primary} />
                  <Text style={s.planTexto}>{comisiones.bloque}</Text>
                </View>
              ) : null}
            </View>

            {cargando && !comisiones ? (
              <View style={{ gap: 10, paddingTop: 12 }}>
                <Esqueleto alto={16} />
                <Esqueleto alto={16} />
              </View>
            ) : bancos.length === 0 ? (
              <Text style={s.vacio}>
                Cuando verifiquemos tu tarjeta verás aquí tu porcentaje.
              </Text>
            ) : (
              <>
                {conTarjeta.length > 0 && (
                  <>
                    <Text style={s.grupo}>Tus tarjetas</Text>
                    {conTarjeta.map((b) => (
                      <FilaComision key={b.banco} banco={b} destacada />
                    ))}
                  </>
                )}
                {otros.length > 0 && (
                  <>
                    <Text style={s.grupo}>Otros bancos</Text>
                    {otros.map((b) => (
                      <FilaComision key={b.banco} banco={b} />
                    ))}
                  </>
                )}
              </>
            )}
          </View>
          <Text style={s.pie}>
            El depósito llega a tu cuenta del mismo banco de la tarjeta.
          </Text>
        </Aparece>

        {/* ── Salir ── */}
        <Aparece retraso={240}>
          <TouchableOpacity
            style={s.salir}
            onPress={cerrarSesion}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={19} color={COLORS.error} />
            <Text style={s.salirTexto}>Cerrar sesión</Text>
          </TouchableOpacity>
        </Aparece>
      </ScrollView>

      <MenuLateral
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        perfil={perfil}
      />
    </View>
  );
}

/** Una tarifa. La especial se marca: es un acuerdo aparte. */
function FilaComision({ banco, destacada }) {
  return (
    <View style={[s.comision, destacada && s.comisionDestacada]}>
      <Text style={s.comisionBanco}>{banco.banco}</Text>
      {banco.especial ? (
        <View style={s.etiquetaEspecial}>
          <Text style={s.etiquetaEspecialTexto}>Especial</Text>
        </View>
      ) : null}
      <Text style={s.comisionValor}>
        {Number(banco.porcentaje).toFixed(2).replace(/\.00$/, "")} %
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  contenido: { padding: 20, paddingBottom: 40 },

  cabecera: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: { color: COLORS.secondary, fontSize: 24, fontWeight: "800" },
  nombre: { fontSize: 20, fontWeight: "700", color: COLORS.text, marginTop: 12 },
  correo: { ...TIPO.apoyo, marginTop: 2 },
  estado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginTop: 10,
  },
  estadoTexto: { fontSize: 12, fontWeight: "700" },

  seccion: {
    ...TIPO.etiqueta,
    marginBottom: 8,
    marginTop: 4,
  },
  tarjeta: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pie: { ...TIPO.micro, marginTop: 8, marginBottom: 20, lineHeight: 17 },

  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 11 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  filaEtiqueta: { ...TIPO.apoyo, width: 92 },
  filaValor: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "right",
  },

  comisionCabecera: { gap: 8, marginBottom: 6 },
  comisionIntro: { ...TIPO.apoyo },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  planTexto: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  grupo: {
    ...TIPO.micro,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 2,
  },
  comision: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  comisionDestacada: { backgroundColor: "transparent" },
  comisionBanco: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.text },
  comisionValor: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.primary,
    ...CIFRAS,
  },
  etiquetaEspecial: {
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  etiquetaEspecialTexto: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.secondaryDark,
    letterSpacing: 0.3,
  },
  vacio: { ...TIPO.apoyo, paddingTop: 10 },

  salir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: COLORS.errorLight,
  },
  salirTexto: { color: COLORS.error, fontSize: 15, fontWeight: "700" },
});
