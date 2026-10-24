// Chip de estado de una SOLICITUD. No sirve para el estado de una
// tarjeta: ahí la forma de la tarjeta ya lo dice (ver CardShape).
//
// Ícono + texto + color, los tres juntos. El color solo no alcanza:
// hay gente que no lo distingue, y el estado de su dinero no puede
// depender de eso.
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { fonts, requestStatus } from "../../theme/tokens";

/** status: "pendiente" | "aprobado" | "pagado" | "rechazado" */
export function StatusChip({ status }) {
  const s = requestStatus[status] || requestStatus.pendiente;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: s.bg,
      }}
    >
      <Ionicons name={s.icon} size={13} color={s.fg} />
      <Text style={{ color: s.fg, fontFamily: fonts.heavy, fontSize: 12 }}>{s.label}</Text>
    </View>
  );
}

export default StatusChip;
