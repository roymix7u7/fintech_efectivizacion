import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../src/lib/supabase";
import { invalidar } from "../src/lib/cache";
import { bancoDe, colors, fonts } from "../src/theme/tokens";
import { mensajeError } from "../src/lib/ui";
import { useAviso } from "../src/components/Avisos";
import { useAlturaTeclado } from "../src/lib/teclado";
import { validarCuenta } from "../src/lib/validaciones";
import { BANCOS_PRINCIPALES } from "../src/lib/deposito";
import { Aparece } from "../src/components/Cargando";
import { BankIcon } from "../src/components/brand/BankIcon";
import { CabeceraNoche } from "../src/components/ui/CabeceraNoche";
import { GlassPanel } from "../src/components/ui/GlassPanel";
import { BankBadge } from "../src/components/ui/BankBadge";
import { BotonIcono, MiniTarjeta } from "../src/components/ui/Piezas";
import { Boton } from "../src/components/ui/Boton";
import { Toque } from "../src/components/ui/Toque";
import { BarraFija, ALTO_BARRA_FIJA } from "../src/components/ui/BarraFija";
import { Consejo } from "../src/components/ui/Consejo";
import { GrillaBancos } from "../src/components/ui/GrillaBancos";
import { Segmentado } from "../src/components/ui/Segmentado";

const LUCES = [
  { color: colors.glowGold, opacity: 0.38, size: 260, top: -40, right: -110 },
  { color: colors.glowBlue, opacity: 0.75, size: 300, bottom: -170, left: -110 },
];

const REGLAS = [
  { tono: "si", texto: "Cuenta a tu nombre" },
  { tono: "no", texto: "No depositamos a terceros" },
  { tono: "banco", texto: "1 de ahorros y 1 CCI por banco" },
  { tono: "editar", texto: "Puedes editarla cuando quieras" },
];

/**
 * Agregar o editar una cuenta.
 *
 * Por banco se admite una de ahorros y una CCI (la base lo hace
 * cumplir). Editar solo cambia el número: banco y tipo quedan fijos,
 * porque cambiarlos sería otra cuenta.
 *
 *   ?banco=BBVA&tipo=ahorros   abre con eso elegido
 *   ?editar=<id>               edita esa cuenta
 */
export default function CuentaNuevaScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const altoTeclado = useAlturaTeclado();
  const { mostrar } = useAviso();
  const editarId = params.editar ? String(params.editar) : null;

  const [perfil, setPerfil] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [banco, setBanco] = useState(BANCOS_PRINCIPALES.includes(params.banco) ? params.banco : "BCP");
  const [tipo, setTipo] = useState(params.tipo === "interbancaria" ? "interbancaria" : "ahorros");
  const [numero, setNumero] = useState("");
  const [foco, setFoco] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await supabase.from("perfiles_cliente").select("id").eq("user_id", user.id).maybeSingle();
      setPerfil(p);
      if (!p) return;
      const { data: c } = await supabase
        .from("cuentas_bancarias")
        .select("id, banco, tipo, numero_cuenta")
        .eq("cliente_id", p.id)
        .eq("activa", true);
      const lista = c || [];
      setCuentas(lista);

      if (editarId) {
        const actual = lista.find((x) => x.id === editarId);
        if (actual) {
          setBanco(actual.banco);
          setTipo(actual.tipo);
          setNumero(actual.numero_cuenta.replace(/\D/g, ""));
        }
      } else {
        // Si el tipo pedido ya existe en ese banco, se abre en el otro.
        const pedido = BANCOS_PRINCIPALES.includes(params.banco) ? params.banco : "BCP";
        const tiene = (t) => lista.some((x) => x.banco === pedido && x.tipo === t);
        if (tiene(tipo) && !tiene(tipo === "ahorros" ? "interbancaria" : "ahorros")) {
          setTipo(tipo === "ahorros" ? "interbancaria" : "ahorros");
        }
      }
      setListo(true);
    })();
  }, []);

  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/tarjetas"));

  const tomado = (b, t) => cuentas.some((c) => c.banco === b && c.tipo === t && c.id !== editarId);
  const lleno = (b) => tomado(b, "ahorros") && tomado(b, "interbancaria");

  function elegirBanco(b) {
    if (lleno(b)) return mostrar(`Ya tienes cuenta de ahorros y CCI en ${bancoDe(b).name}`, "info");
    setBanco(b);
    setNumero("");
    if (tomado(b, tipo)) setTipo(tipo === "ahorros" ? "interbancaria" : "ahorros");
  }

  function elegirTipo(t) {
    if (tomado(banco, t)) {
      return mostrar(
        `Ya tienes una cuenta ${t === "ahorros" ? "de ahorros" : "CCI"} en ${bancoDe(banco).name}`,
        "info",
      );
    }
    setTipo(t);
  }

  const cci = tipo === "interbancaria";
  const error = numero ? validarCuenta(numero, tipo, banco) : "vacio";
  const valido = !error && !tomado(banco, tipo);
  const repetido = cuentas.some((c) => c.numero_cuenta.replace(/\D/g, "") === numero && c.id !== editarId);
  const falta = !listo
    ? "Cargando..."
    : tomado(banco, tipo)
      ? "Ya tienes esa cuenta"
      : error === "vacio"
        ? cci
          ? "El CCI tiene 20 dígitos"
          : "Ingresa el número de cuenta"
        : error
          ? cci
            ? "El CCI tiene 20 dígitos"
            : "Revisa el número de cuenta"
          : null;

  async function guardar() {
    if (!valido || !perfil) return;
    if (repetido) return mostrar("Ese número de cuenta ya está registrado", "atencion");

    // Sin este estado un doble toque creaba la cuenta por duplicado.
    setGuardando(true);
    try {
      const { error: errorGuardar } = editarId
        ? await supabase.from("cuentas_bancarias").update({ numero_cuenta: numero }).eq("id", editarId)
        : await supabase.from("cuentas_bancarias").insert({
            cliente_id: perfil.id,
            banco,
            numero_cuenta: numero,
            tipo,
            activa: true,
          });
      if (errorGuardar) {
        // La base es la que decide "una por tipo y banco": si otra
        // sesión ya la agregó, se dice así y no con el error crudo.
        if (errorGuardar.code === "23505") return mostrar("Ya tienes esa cuenta registrada", "atencion");
        throw errorGuardar;
      }
      invalidar("cuentas");
      mostrar(editarId ? "Cuenta actualizada" : `Cuenta ${bancoDe(banco).name} agregada`, "exito");
      volver();
    } catch (err) {
      mostrar(mensajeError(err), "error");
    } finally {
      setGuardando(false);
    }
  }

  const b = bancoDe(banco);
  const conBarra = altoTeclado === 0;
  const ayuda = numero && error && error !== "vacio" ? error : cci ? "El CCI tiene 20 dígitos" : "Solo números, sin guiones";

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
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={s.titulo} accessibilityRole="header">
                {editarId ? "Editar cuenta" : "Agregar cuenta"}
              </Text>
              <Text style={s.subtitulo}>Donde recibirás tus depósitos</Text>
            </View>
          </Aparece>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          <Consejo titulo="Importante antes de agregarla" reglas={REGLAS} />

          {editarId ? (
            <GlassPanel variant="light" radius={24} style={[s.bloque, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
              <BankBadge bank={banco} size={42} />
              <View style={{ gap: 2 }}>
                <Text style={s.bancoNombre}>{b.name}</Text>
                <Text style={s.bancoTipo}>{cci ? "Interbancaria (CCI)" : "Ahorros"}</Text>
              </View>
            </GlassPanel>
          ) : (
            <>
              <GlassPanel variant="light" radius={24} style={s.bloque}>
                <Text style={s.bloqueTitulo}>¿De qué banco es?</Text>
                <GrillaBancos
                  bancos={BANCOS_PRINCIPALES}
                  valor={lleno(banco) ? null : banco}
                  onElegir={elegirBanco}
                  columnas={5}
                  conNombre={false}
                  lleno={lleno}
                />
                <Text style={s.bancoElegido}>{b.name}</Text>
              </GlassPanel>

              <GlassPanel variant="light" radius={24} style={s.bloque}>
                <Text style={s.bloqueTitulo}>Tipo de cuenta</Text>
                <Segmentado
                  accessibilityLabel="Tipo de cuenta"
                  valor={tipo}
                  onCambio={elegirTipo}
                  opciones={[
                    {
                      clave: "ahorros",
                      titulo: "Ahorros",
                      detalle: tomado(banco, "ahorros") ? "✓ Ya la tienes" : "Recibe tus depósitos",
                      apagado: tomado(banco, "ahorros"),
                      accesible: tomado(banco, "ahorros") ? "Ahorros, ya la tienes" : "Ahorros",
                    },
                    {
                      clave: "interbancaria",
                      titulo: "CCI",
                      detalle: tomado(banco, "interbancaria") ? "✓ Ya la tienes" : "Interbancaria · opcional",
                      apagado: tomado(banco, "interbancaria"),
                      accesible: tomado(banco, "interbancaria") ? "CCI, ya la tienes" : "Interbancaria, CCI",
                    },
                  ]}
                />
                {cci ? (
                  <Text style={s.notaCci}>
                    La CCI es opcional: los depósitos llegan a tu cuenta de ahorros.
                  </Text>
                ) : null}
              </GlassPanel>
            </>
          )}

          <GlassPanel variant="light" radius={24} style={s.bloque}>
            <Text style={s.bloqueTitulo}>Número de cuenta</Text>
            <View
              style={[
                s.numeroCaja,
                valido ? { borderColor: colors.success } : foco || numero ? { borderColor: colors.navy } : null,
              ]}
            >
              <TextInput
                value={numero}
                onChangeText={(v) => setNumero(v.replace(/\D/g, "").slice(0, 20))}
                onFocus={() => setFoco(true)}
                onBlur={() => setFoco(false)}
                keyboardType="number-pad"
                maxLength={20}
                accessibilityLabel="Número de cuenta"
                placeholderTextColor={colors.textFaint}
                style={s.numero}
              />
              {valido ? <Ionicons name="checkmark" size={18} color={colors.success} style={{ paddingRight: 14 }} /> : null}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={[s.ayuda, { flex: 1 }]}>{ayuda}</Text>
              <Text style={[s.contador, valido && { color: colors.successText }]}>
                {cci ? `${numero.length} / 20` : `${numero.length} dígitos`}
              </Text>
            </View>
          </GlassPanel>

          <View style={s.destino}>
            <MiniTarjeta />
            <Ionicons name="arrow-forward" size={16} color={colors.gold} />
            <BankIcon size={20} color={b.color} />
            <Text style={s.destinoTexto}>
              {cci ? `CCI de ${b.name}: dato adicional para tus depósitos` : `Recibirá el dinero de tus tarjetas ${b.name}`}
            </Text>
          </View>
        </View>
      </ScrollView>

      {conBarra ? (
        <BarraFija>
          <Boton
            titulo={guardando ? "Guardando..." : "Guardar cuenta"}
            icono="arrow-forward"
            onPress={guardar}
            cargando={guardando}
            deshabilitado={Boolean(falta)}
            motivo={falta}
            style={{ height: 58 }}
          />
        </BarraFija>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 20, paddingBottom: 86, gap: 16 },
  titulo: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.white, textAlign: "center" },
  subtitulo: { fontFamily: fonts.body, fontSize: 14, color: "rgba(255,255,255,0.75)" },
  cuerpo: { marginTop: -60, paddingHorizontal: 16, gap: 12 },
  bloque: { padding: 16, gap: 12 },
  bloqueTitulo: { fontFamily: fonts.heavy, fontSize: 15, color: colors.text },
  bancoElegido: { fontFamily: fonts.strong, fontSize: 14, color: colors.text, textAlign: "center" },
  bancoNombre: { fontFamily: fonts.heavy, fontSize: 16, color: colors.text },
  bancoTipo: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },

  notaCci: { fontFamily: fonts.label, fontSize: 12, color: colors.text2 },

  numeroCaja: {
    height: 56,
    borderRadius: 14,
    // Grosor fijo: solo cambia el color. Si cambiara el grosor, el
    // número se correría un píxel al enfocar.
    borderWidth: 2,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.field,
    flexDirection: "row",
    alignItems: "center",
  },
  numero: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 14,
    fontFamily: fonts.strong,
    fontSize: 18,
    letterSpacing: 1.4,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  ayuda: { fontFamily: fonts.label, fontSize: 13, color: colors.text2 },
  contador: { fontFamily: fonts.heavy, fontSize: 12, color: colors.text3 },
  destino: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  destinoTexto: { flex: 1, fontFamily: fonts.strong, fontSize: 13, color: colors.text },
});
