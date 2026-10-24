# Cómo aplicar el rediseño con Claude Code

## 1. Copia el paquete a tu proyecto

```
tu-proyecto/
├─ design/                 ← crea esta carpeta
│  ├─ DESIGN.md
│  └─ reference/           ← pantallas HTML de referencia (solo lectura)
└─ src/
   ├─ theme/               ← tokens.ts, fonts.ts
   └─ components/          ← brand/ y ui/
```

- `DESIGN.md` y `reference/` van dentro de `design/`.
- `src/theme` y `src/components` se fusionan con tu `src` (o ajusta la ruta si tu proyecto usa otra estructura; Claude Code puede moverlos).

## 2. Instala las dependencias

```bash
npx expo install expo-blur react-native-svg expo-font @expo-google-fonts/sora @expo-google-fonts/manrope
```

## 3. Agrega esto a tu `CLAUDE.md` (en la raíz del proyecto)

```md
## Diseño
- El diseño visual está en design/DESIGN.md. Síguelo en cada cambio de UI.
- Usa siempre src/theme/tokens.ts; no escribas colores, tamaños ni radios sueltos.
- Reutiliza los componentes de src/components/brand y src/components/ui.
- Las pantallas de referencia están en design/reference/pantallas/*.html: léelas para sacar medidas y orden de elementos.
- El rediseño es solo visual: no cambies lógica, reglas de negocio, llamadas al servidor ni nombres de datos.
```

## 4. Pídelo por fases (un cambio revisable a la vez)

Usa el **modo Plan** de Claude Code (Shift+Tab) para que te muestre el plan antes de tocar código. Prompts listos para copiar:

**Fase 1 — base**
> Lee design/DESIGN.md. Integra src/theme/tokens.ts y src/theme/fonts.ts: carga las fuentes en app/_layout.tsx manteniendo el SplashScreen hasta que carguen. Reemplaza los colores antiguos del tema por los tokens. No cambies ninguna pantalla todavía. Muéstrame el plan primero.

**Fase 2 — navegación y elementos transversales**
> Aplica DESIGN.md §4 y §7 a la navegación: barra de pestañas flotante con GlassPanel (3 destinos), menú lateral en cristal, transiciones de expo-router (lateral al avanzar, fundido entre pestañas, modal desde abajo para Nueva solicitud, Registrar tarjeta y Agregar cuenta), avisos flotantes y burbuja de alerta. Toma medidas de design/reference/pantallas/Menu.html.

**Fase 3 — pantalla por pantalla** (repite con cada una)
> Rediseña la pantalla de Inicio según DESIGN.md §6 y design/reference/pantallas/Inicio.html. Respeta el orden exacto de bloques. Conecta cada bloque a los datos que ya existen; no inventes campos. Si falta un dato para algo del diseño, dímelo en vez de inventarlo.

Orden sugerido: Inicio → Tarjetas y cuentas → Nueva solicitud → Solicitudes y Detalle → Noticias y alertas → Registro, Revisión y Recuperar → Mi cuenta, Avisos, Sobre la empresa y Guía.

**Fase 4 — revisión**
> Revisa todas las pantallas contra DESIGN.md: el dorado solo en acciones de dinero, el cristal solo en los 4 lugares permitidos, textos pequeños no más claros que #626D82, toques de al menos 44×44, y que "Reducir movimiento" desactive las animaciones. Lista lo que no cumpla.

## 5. Referencia visual interactiva

El prototipo navegable está en el artefacto de Claude (compártelo con tu equipo desde el botón Compartir). Claude Code no puede abrirlo porque requiere sesión de claude.ai; por eso el paquete incluye el HTML de cada pantalla en `design/reference/`.

## 6. Pendientes antes de cerrar

Revisa DESIGN.md §9: hay reglas de negocio que el diseño muestra pero que tu backend debe confirmar.
