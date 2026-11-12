# Chat propio (AlToque Chat)

El reemplazo de Chatwoot: la bandeja donde los asesores atienden los chats
de la web. El código vive en su propio repositorio
(`github.com/roymix7u7/altoque-chat`); aquí está lo necesario para
instalarlo en el servidor y dejarlo configurado como estaba Chatwoot.

El panel y la web funcionan con cualquiera de los dos. **Cuál se usa lo
deciden las variables de entorno**: con `NEXT_PUBLIC_CHAT_URL` (web) y
`CHAT_URL` + `CHAT_API_TOKEN` (servidor del panel), el chat propio; sin
ellas, Chatwoot como siempre. Para volver atrás basta quitarlas y desplegar.

## Qué cambia para cada quien

| | Con Chatwoot | Con el chat propio |
|---|---|---|
| Cliente en Mi cuenta | Chat con identidad firmada | Igual. Ve su historial en cualquier dispositivo |
| Visitante en la landing | Turnstile + nombre y celular | Igual |
| Asesor | "Abrir chat de atención" abre Chatwoot | El mismo botón abre el chat propio, sin otra contraseña |
| Equipo → Sincronizar chat | Alta, rol, reparto y sede en Chatwoot | Lo mismo en el chat propio |
| Disponibilidad | Chatwoot desconecta a quien cierra su pestaña | Manda solo el interruptor del panel |
| Atención al cliente (reporte) | Datos de Chatwoot | Los mismos números, del chat propio |
| "Tu asesor te respondió" | Webhook de Chatwoot | Webhook del chat propio, misma función de Supabase |
| Ficha del cliente | Pestaña en Chatwoot | Pestaña junto a "Mensajes" |

Las conversaciones que ya están en Chatwoot no se pasan: el chat propio empieza vacío.

## 1. Instalar en el servidor

Corre en Docker al lado de Chatwoot y usa el mismo Caddy para el https.

```bash
cd soporte/altoque-chat
git clone https://github.com/roymix7u7/altoque-chat.git codigo
cp .env.example .env                 # completa POSTGRES_PASSWORD, PUBLIC_URL, JWT_SECRET, ADMIN_PASSWORD
docker compose up -d --build
docker compose logs chat             # la primera vez muestra el token de API: guárdalo
```

Apunta el subdominio (por ejemplo `chat2.panel-admin-atk-mobil.com`) al servidor y
agrega este bloque a `soporte/chatwoot/Caddyfile`:

```
chat2.panel-admin-atk-mobil.com {
	encode zstd gzip
	reverse_proxy altoque-chat:4000
	header {
		Strict-Transport-Security "max-age=63072000"
		-Server
	}
}
```

y recarga Caddy: `docker compose -f docker-compose.yml -f docker-compose.servidor.yml exec caddy caddy reload --config /etc/caddy/Caddyfile` (desde `soporte/chatwoot`).

Comprueba: `https://chat2…/health` responde `{"ok":true}` y en `https://chat2…/app/` → Ajustes → Estado del sistema no queda ningún aviso.

Este `docker-compose.yml` no se pudo probar en desarrollo (Docker estaba apagado): si algo falla al construir, la guía general está en `codigo/DEPLOY.md`.

## 2. Configurar

`configurar.mjs` deja las bandejas (Web AlToque, App AlToque, Visitantes web),
el horario, las 24 respuestas rápidas, las etiquetas, las reglas, el equipo,
las macros, el motivo de contacto, la ficha y el aviso al cliente. Es el
equivalente de `soporte/chatwoot/configurar.rb` y se puede repetir sin duplicar nada:

```bash
CHAT_URL=https://chat2.panel-admin-atk-mobil.com \
CHAT_API_TOKEN=atk_... \
FICHA_URL=https://www.panel-admin-atk-mobil.com/soporte/ficha \
DOMINIOS=www.panel-admin-atk-mobil.com,panel-admin-atk-mobil.com \
AVISOS_URL=https://<proyecto>.supabase.co/functions/v1/chatwoot-avisos \
AVISOS_SECRETO=<el mismo CHATWOOT_AVISOS_SECRETO de Supabase> \
node configurar.mjs
```

Al terminar imprime las variables para el panel. Con `MOSTRAR_CLAVES=1`
imprime además las claves para firmar la identidad.

## 3. Supabase

Las dos funciones sirven a los dos chats; hay que volver a desplegarlas y
dar las claves del chat propio:

```bash
npx supabase secrets set CHAT_HMAC_WEB=... CHAT_HMAC_APP=...
npx supabase functions deploy chatwoot-identidad
npx supabase functions deploy chatwoot-avisos --no-verify-jwt
```

`CHATWOOT_AVISOS_SECRETO` no cambia: es el mismo secreto que se le pasó a `configurar.mjs`.

## 4. Panel (Vercel)

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_CHAT_URL` | `https://chat2.panel-admin-atk-mobil.com` |
| `NEXT_PUBLIC_CHAT_WEB_TOKEN` | Token público de "Web AlToque" |
| `NEXT_PUBLIC_CHAT_VISITANTES_TOKEN` | Token público de "Visitantes web" |
| `CHAT_API_TOKEN` | Token de administrador del chat (solo servidor) |

Las de Chatwoot se dejan como están: son el camino de vuelta. Despliega, entra
a **Equipo → Sincronizar chat** (da de alta a quienes atienden) y prueba:

1. Landing → "Chatear aquí": verificación, nombre y celular, mensaje.
2. Mi cuenta → burbuja "Chatea con nosotros": mensaje con sesión iniciada.
3. Panel → "Abrir chat de atención": entra sin contraseña y ve las dos conversaciones.
4. Responde: al cliente le llega "Tu asesor te respondió".
5. Pestaña "Ficha del cliente" de la conversación del cliente.
6. Panel → Atención al cliente: aparecen los chats de hoy.

## Volver a Chatwoot

Quita `NEXT_PUBLIC_CHAT_URL` y `CHAT_API_TOKEN` en Vercel y despliega. Lo
demás (funciones de Supabase, Chatwoot en el servidor) no se toca.

## Cuando ya no haga falta Chatwoot

Caddy vive en el compose de Chatwoot: antes de apagarlo, mueve el servicio
`caddy` y el `Caddyfile` a esta carpeta (o a una propia) para que el chat
siga teniendo https.

## Qué queda igual que antes y qué no

- Los textos de Equipo y Atención todavía dicen "Chatwoot" en algunos avisos.
- El app móvil no usa el chat todavía; la bandeja "App AlToque" queda lista para cuando lo haga.
- Chatwoot ponía "desconectado" a quien no tenía su pestaña abierta. El chat propio no: si un asesor queda "en línea" y cierra el panel sin salir, le siguen llegando chats hasta que cierre sesión, cambie su estado o alguien toque "Sincronizar chat". Cada asesor puede activar en el chat (menú de usuario) "Marcarme como desconectado al cerrar el panel".
