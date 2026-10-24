@AGENTS.md

## Diseño

- El diseño visual está en `design/DESIGN.md`. Síguelo en cada cambio de UI.
- Usa siempre `src/theme/tokens.js`; no escribas colores, tamaños ni radios
  sueltos. `src/theme/colors.js` y `src/theme/tipografia.js` ya derivan de ahí,
  y existen solo para que las pantallas antiguas sigan funcionando.
- Reutiliza los componentes de `src/components/brand` y `src/components/ui`.
- Las pantallas de referencia están en `design/reference/pantallas/*.html`:
  léelas para sacar medidas y orden de elementos.
- El movimiento sale de `src/lib/movimiento.js` (curva, duraciones y
  `useReducirMovimiento`). No escribas duraciones ni easings a mano.
- En React Native el peso tipográfico lo trae la familia: usa
  `fontFamily: fonts.strong` y **no** pongas `fontWeight` al lado.
- El rediseño es solo visual: no cambies lógica, reglas de negocio, llamadas
  al servidor ni nombres de datos.
