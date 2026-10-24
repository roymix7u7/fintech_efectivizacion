import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { useDatos } from "../../src/lib/cache";
import { Aparece, Esqueleto } from "../../src/components/Cargando";
import { CabeceraNoche } from "../../src/components/ui/CabeceraNoche";
import { BankBadge } from "../../src/components/ui/BankBadge";
import { Boton } from "../../src/components/ui/Boton";
import { BarraFija, ALTO_BARRA_FIJA } from "../../src/components/ui/BarraFija";
import { BotonIcono, Tarjeta } from "../../src/components/ui/Piezas";
import { Toque } from "../../src/components/ui/Toque";
import { VisorImagen } from "../../src/components/ui/VisorImagen";
import { AvisoMarcas } from "../../src/components/AvisoMarcas";
import { bancoDe, colors, fonts } from "../../src/theme/tokens";

/**
 * Guía de un banco: los pasos para hacer la operación en la app de esa
 * entidad. El contenido lo carga la empresa desde el panel.
 *
 * Termina con "Enviar comprobante" fija abajo: quien llega aquí está a
 * punto de operar, y lo siguiente que va a querer es mandar el voucher.
 */
export default function GuiaBancoScreen() {
  const { banco } = useLocalSearchParams();
  const router = useRouter();
  // Captura abierta a pantalla completa, o null.
  const [ampliada, setAmpliada] = useState(null);
  const insets = useSafeAreaInsets();
  const b = bancoDe(banco);

  // Cada guía guardada en el teléfono: solo se vuelve a descargar si el
  // panel la editó (huella "guias"). El filtro por activa evita que una
  // guia dada de baja siga visible con un enlace directo. maybeSingle no
  // revienta si hay mas de una fila del mismo banco.
  const { datos: guia, cargando: loading } = useDatos(
    `guia-${banco}`,
    async () => {
      const { data, error } = await supabase
        .from("guias_banco")
        .select("*")
        .eq("banco", banco)
        .eq("activa", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { grupos: ["guias"] },
  );

  const pasos = [...(guia?.pasos || [])].sort((a, c) => a.orden - c.orden);
  const volver = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/inicio"));

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: ALTO_BARRA_FIJA + insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* La luz de la cabecera es del color del banco. */}
        <CabeceraNoche
          radio={32}
          luces={[{ color: b.color, opacity: 0.6, size: 260, top: -70, right: -80 }]}
          style={s.cabecera}
        >
          <BotonIcono variante="noche" icono="chevron-back" onPress={volver} accessibilityLabel="Volver" />
          <View style={s.titulo}>
            <BankBadge bank={banco} size={48} />
            <Text style={s.tituloTexto}>Guía {b.name}</Text>
          </View>
        </CabeceraNoche>

        <View style={s.cuerpo}>
          {loading ? (
            <>
              <Esqueleto alto={160} radio={24} />
              <Esqueleto alto={70} radio={24} />
            </>
          ) : !guia ? (
            <Tarjeta style={s.vacio}>
              <Ionicons name="information-circle-outline" size={24} color={colors.text3} />
              <Text style={s.vacioTexto}>Esta guía todavía no está disponible.</Text>
            </Tarjeta>
          ) : (
            <>
              {/* Sin portada: la guía va directo a los pasos. */}
              {pasos.length === 0 ? (
                <Tarjeta style={s.vacio}>
                  <Text style={s.vacioTexto}>Aún no tiene pasos configurados.</Text>
                </Tarjeta>
              ) : (
                pasos.map((paso, i) => (
                  <Aparece key={paso.orden} retraso={Math.min(i, 8) * 70}>
                    <Tarjeta style={s.paso}>
                      <Text style={s.pasoNumero}>{paso.orden}</Text>
                      <View style={{ flex: 1, gap: 8 }}>
                        <Text style={s.pasoTitulo}>{paso.titulo}</Text>
                        {paso.descripcion ? <Text style={s.pasoTexto}>{paso.descripcion}</Text> : null}
                        {paso.imagen_url ? (
                          // La captura del celular es vertical: se ve
                          // entera y al tocarla se abre con zoom.
                          <Toque
                            onPress={() => setAmpliada({ url: paso.imagen_url, titulo: `Paso ${paso.orden}` })}
                            accessibilityLabel={`Ampliar la captura del paso ${paso.orden}`}
                            escala={0.99}
                          >
                            <Image source={{ uri: paso.imagen_url }} style={s.pasoImagen} resizeMode="contain" />
                            <View style={s.ampliar} pointerEvents="none">
                              <Ionicons name="expand-outline" size={14} color={colors.white} />
                            </View>
                          </Toque>
                        ) : null}
                      </View>
                    </Tarjeta>
                  </Aparece>
                ))
              )}
            </>
          )}
          <AvisoMarcas />
        </View>
      </ScrollView>

      <BarraFija>
        <Boton
          variante="dinero"
          titulo="Enviar comprobante"
          icono="arrow-forward"
          onPress={() => router.push("/nueva-solicitud")}
          style={{ height: 58 }}
        />
      </BarraFija>

      {ampliada ? (
        <VisorImagen url={ampliada.url} titulo={ampliada.titulo} subtitulo={`Guía ${b.name}`} onCerrar={() => setAmpliada(null)} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.ground },
  cabecera: { paddingHorizontal: 16, paddingBottom: 26, gap: 18 },
  titulo: { flexDirection: "row", alignItems: "center", gap: 14 },
  tituloTexto: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.white },

  cuerpo: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  paso: { borderRadius: 24, padding: 16, flexDirection: "row", gap: 14 },
  pasoNumero: { fontFamily: fonts.display, fontSize: 24, lineHeight: 24, color: colors.goldText, width: 24 },
  pasoTitulo: { fontFamily: fonts.strong, fontSize: 15, color: colors.text },
  pasoTexto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text2 },
  pasoImagen: { width: "100%", height: 380, borderRadius: 14, backgroundColor: colors.ground },
  ampliar: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(15,27,51,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  vacio: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  vacioTexto: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text2 },
});
