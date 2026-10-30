/**
 * Escenas del panel lateral de ingresar, registro y recuperar: qué objetos
 * 3D flotan, dónde y qué mensaje los acompaña. Las posiciones son en %
 * del recuadro, igual que en la landing (Objetos3D).
 */

const objeto = (src, ancho, alto, estilo) => ({
  img: { src, ancho, alto },
  estilo: {
    "--rx": "0deg",
    "--ry": "0deg",
    "--rz": "0deg",
    "--prof": 16,
    "--ritmo": "7s",
    "--fase": "0s",
    ...estilo,
  },
});

const VERDE = ["/sitio/tarjeta-verde.webp", 900, 589];
const MORADA = ["/sitio/tarjeta-morada.webp", 900, 589];
const ROJA = ["/sitio/tarjeta-roja.webp", 900, 654];
const NARANJA = ["/sitio/tarjeta-naranja.webp", 900, 588];
const ESCUDO = ["/sitio/escudo.webp", 565, 737];
const CANDADO = ["/sitio/candado.webp", 514, 729];
const IDENTIDAD = ["/sitio/identidad.webp", 800, 638];
const BURBUJA = ["/sitio/burbuja.webp", 700, 661];
const MONEDAS = ["/sitio/monedas.webp", 800, 728];

const CHISPAS = [
  { x: "4%", y: "8%", t: 14 },
  { x: "88%", y: "4%", t: 18, retraso: 0.9 },
  { x: "94%", y: "78%", t: 12, retraso: 1.7 },
  { x: "10%", y: "86%", t: 16, retraso: 2.4 },
];

// Tres tarjetas en abanico.
const ABANICO = (a, b, c) => [
  objeto(...a, {
    "--w": "56%",
    left: "0%",
    top: "26%",
    "--rx": "10deg",
    "--ry": "16deg",
    "--rz": "-14deg",
    "--prof": 12,
    "--fase": "-1s",
  }),
  objeto(...b, {
    "--w": "56%",
    left: "22%",
    top: "6%",
    zIndex: 1,
    "--rx": "8deg",
    "--rz": "-3deg",
    "--prof": 20,
    "--ritmo": "6.5s",
    "--fase": "-2.5s",
  }),
  objeto(...c, {
    "--w": "56%",
    left: "44%",
    top: "28%",
    zIndex: 2,
    "--rx": "10deg",
    "--ry": "-16deg",
    "--rz": "12deg",
    "--prof": 26,
    "--ritmo": "7.5s",
    "--fase": "-4s",
  }),
];

export const ESCENA_INGRESAR = {
  titulo: "Tu efectivo, a un paso.",
  texto:
    "Ingresa para registrar tus tarjetas, pedir una operación y seguir tus depósitos.",
  objetos: ABANICO(VERDE, MORADA, ROJA),
  chispas: CHISPAS,
  puntos: [
    "La misma cuenta que usas en la app.",
    "Por seguridad, la sesión se cierra sola a las 2 horas.",
    "Te atiende una persona, en local o por WhatsApp.",
  ],
};

export const ESCENA_REGISTRO_DATOS = {
  titulo: "Crea tu cuenta en 3 pasos.",
  texto: "Tus datos, tu correo y tu identidad. Lo revisa una persona de nuestro equipo.",
  objetos: ABANICO(NARANJA, VERDE, MORADA),
  chispas: CHISPAS,
  puntos: [
    "Con la misma cuenta entras aquí y en la app.",
    "Si sales a medias, puedes retomar tu registro.",
    "Tus datos se tratan según la Ley N.° 29733.",
  ],
};

export const ESCENA_REGISTRO_CORREO = {
  titulo: "Revisa tu correo.",
  texto:
    "El código confirma que el correo es tuyo. Por ahí te avisaremos de tus operaciones.",
  objetos: [
    objeto(...BURBUJA, {
      "--w": "50%",
      left: "25%",
      top: "6%",
      "--rz": "-6deg",
      "--prof": 22,
      "--ritmo": "5.5s",
    }),
  ],
  chispas: CHISPAS,
  puntos: [
    "Suele llegar en segundos. Si no lo ves, revisa spam.",
    "¿Te equivocaste de correo? Puedes corregirlo.",
    "No compartas este código con nadie.",
  ],
};

export const ESCENA_REGISTRO_IDENTIDAD = {
  titulo: "Tu identidad, protegida.",
  texto:
    "Pedimos tu documento y una selfie para que nadie pueda abrir una cuenta a tu nombre.",
  objetos: [
    objeto(...IDENTIDAD, {
      "--w": "54%",
      left: "0%",
      top: "22%",
      "--rx": "6deg",
      "--ry": "14deg",
      "--rz": "-6deg",
      "--prof": 14,
      "--ritmo": "7.5s",
      "--fase": "-1s",
    }),
    objeto(...ESCUDO, {
      "--w": "40%",
      left: "32%",
      top: "0%",
      zIndex: 2,
      "--ry": "-6deg",
      "--prof": 28,
      "--ritmo": "6.5s",
    }),
    objeto(...CANDADO, {
      "--w": "27%",
      left: "72%",
      top: "36%",
      zIndex: 1,
      "--ry": "-14deg",
      "--rz": "8deg",
      "--prof": 20,
      "--fase": "-3s",
    }),
  ],
  chispas: CHISPAS,
  razonesTitulo: "¿Por qué te pedimos tu documento y una selfie?",
  razones: [
    {
      icono: "documento",
      titulo: "Tu documento, frente y reverso",
      texto:
        "Confirmamos que tus datos coinciden con tu documento y que este es válido.",
    },
    {
      icono: "persona",
      titulo: "Una selfie con tu documento",
      texto:
        "Comprobamos que eres tú quien lo tiene. Así nadie abre una cuenta con un documento ajeno.",
    },
    {
      icono: "billetera",
      titulo: "Tu dinero, solo para ti",
      texto:
        "Con tu identidad verificada, solo depositamos en cuentas a tu nombre.",
    },
  ],
  puntos: [
    "Se guardan cifradas, en un archivo privado.",
    "Solo las ve la persona del equipo que verifica.",
    "Nunca te pediremos tu clave, tu PIN ni el CVV.",
  ],
};

export const ESCENA_RECUPERAR = {
  titulo: "Recupera tu acceso de forma segura.",
  texto:
    "Solo quien tiene acceso a tu correo puede cambiar tu contraseña.",
  objetos: [
    objeto(...CANDADO, {
      "--w": "34%",
      left: "18%",
      top: "6%",
      zIndex: 1,
      "--ry": "12deg",
      "--rz": "-8deg",
      "--prof": 24,
      "--ritmo": "6.5s",
    }),
    objeto(...ESCUDO, {
      "--w": "34%",
      left: "50%",
      top: "14%",
      "--ry": "-10deg",
      "--rz": "6deg",
      "--prof": 14,
      "--fase": "-2s",
    }),
  ],
  chispas: CHISPAS,
  puntos: [
    "Te enviamos un código de 6 dígitos a tu correo.",
    "Con él creas una contraseña nueva.",
    "No compartas tu contraseña con nadie, ni con nuestro equipo.",
  ],
};

export const ESCENA_RECUPERADA = {
  ...ESCENA_RECUPERAR,
  titulo: "Listo, tu cuenta sigue protegida.",
  texto: "Usa tu contraseña nueva aquí y en la app.",
  objetos: [
    objeto(...MONEDAS, {
      "--w": "46%",
      left: "27%",
      top: "4%",
      "--rz": "-4deg",
      "--prof": 20,
      "--ritmo": "6s",
    }),
  ],
};
