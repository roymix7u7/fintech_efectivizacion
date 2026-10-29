// Aviso de no afiliación con los bancos.
//
// La app usa el nombre y el color de cada banco para que el cliente
// reconozca su tarjeta o su cuenta. Sin este aviso puede parecer que
// AlToque es del banco o habla en su nombre: es lo que la Play Store
// trata como suplantación de marca.
import { Text, View } from "react-native";
import { colors, fonts } from "../theme/tokens";

export function AvisoMarcas({ conEmpresa }) {
  return (
    <View style={{ gap: 6, paddingHorizontal: 8, paddingTop: 8 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.text3, textAlign: "center" }}>
        AlToque no está afiliado ni es patrocinado por BCP, BBVA, Interbank, Scotiabank, BanBif, CMR, iO ni ningún otro
        banco o emisor. Sus nombres y marcas pertenecen a sus dueños y se usan solo para identificar el banco de tu
        tarjeta o cuenta.
      </Text>
      {conEmpresa ? (
        <Text style={{ fontFamily: fonts.strong, fontSize: 12, color: colors.text3, textAlign: "center" }}>
          ALTOQUE PERU WK S.A.C. · RUC 20611531410
        </Text>
      ) : null}
    </View>
  );
}

export default AvisoMarcas;
