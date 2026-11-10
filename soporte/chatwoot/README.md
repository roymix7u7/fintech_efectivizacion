# Chatwoot (atención al cliente)

La bandeja donde los asesores atienden los chats del app y de la web.
Corre en Docker; en la PC se entra por http://localhost:3200.

## Primera vez

```bash
cp .env.example .env          # y cambia los valores "cambia_esto"
docker compose pull
docker compose up -d postgres redis
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
```

Luego abre http://localhost:3200 y crea la cuenta del administrador.

## Configurar

`configurar.rb` deja listas las bandejas (colores, bienvenida, logo,
horario), las respuestas rápidas, las etiquetas, las reglas automáticas
y la pestaña "Ficha del cliente". Se puede repetir sin duplicar nada:

```bash
docker compose cp configurar.rb rails:/tmp/configurar.rb
docker compose cp ../../admin/src/app/icon.png rails:/tmp/altoque-avatar.png
MSYS_NO_PATHCONV=1 docker compose exec -T rails rm -rf /tmp/correos
docker compose cp correos rails:/tmp/correos
MSYS_NO_PATHCONV=1 docker compose exec -T rails bundle exec rails runner /tmp/configurar.rb
```

## Correos

- `correos/`: el diseño de todos los correos (`base.liquid`) y los avisos
  a los asesores en español. Los carga `configurar.rb`.
- `plantillas/`: la invitación, el cambio de contraseña y sus asuntos en
  español. `docker-compose.yml` los monta encima de los de Chatwoot, así
  que basta con reiniciar (`docker compose up -d --force-recreate rails sidekiq`).
  Son copias de la v4.19.1: al subir de versión, compáralas con las nuevas.
- Los asuntos de los avisos a los asesores ("A new conversation…") están
  escritos en el código de Chatwoot y siguen en inglés.

En el servidor, pasa la dirección real de la ficha con
`-e FICHA_URL=https://<panel>/soporte/ficha` después de `exec`.

## Chat de visitantes y protección contra saturación

La landing tiene un chat para quien aún no tiene cuenta (bandeja
"Visitantes web", etiqueta `prospecto`). Ahí solo se da información
general: para datos de una cuenta, `/ingresa`. Capas de protección:

1. El chat no se carga con la página: solo al tocar "Chatear aquí".
2. Cloudflare Turnstile ("soy humano"), confirmado en el servidor
   (`admin/src/app/api/turnstile`).
3. Formulario previo: nombre y celular.
4. Límite por IP en Chatwoot (`RATE_LIMIT_WIDGET_*` en `.env`): 10 chats
   y 30 mensajes por minuto. Pasado eso responde 429.
5. `allowed_domains`: el chat solo se muestra dentro de nuestras páginas
   (variable `DOMINIOS` de `configurar.rb`).
6. Macro "Marcar como spam" y Bloquear contacto, para los asesores.
7. Si atacan esa bandeja, la de clientes verificados sigue igual; el
   chat de visitantes se puede apagar sin tocar lo demás.

En producción falta: claves reales de Turnstile (Cloudflare → Turnstile;
en local se usan las de prueba, que siempre aprueban), `DOMINIOS` con las
direcciones reales, y poner `chat.<dominio>` detrás del proxy de
Cloudflare (DDoS, modo anti-bots y una regla de límite de velocidad).

## Fotos del chat

Los adjuntos se guardan en Cloudflare R2 (ver `.env.example`) y **nunca se
borran**: son prueba. `tareas/compactar_adjuntos.rb` reduce las fotos con
más de 7 días a 1600 px y calidad 70 (~3 MB → ~150 KB, se siguen leyendo)
y les quita los datos ocultos (GPS). En el servidor se programa cada día:

```bash
# crontab -e   (4:00 a. m.)
0 4 * * * cd /ruta/a/soporte/chatwoot && docker compose exec -T rails bundle exec rails runner /altoque/tareas/compactar_adjuntos.rb >> /var/log/altoque-compactar.log 2>&1
```

## Día a día

```bash
docker compose up -d      # prender
docker compose stop       # apagar (los datos se quedan)
docker compose logs -f rails sidekiq
```

`docker compose down -v` **borra** las conversaciones: solo para empezar
de cero.

## Actualizar

Cambia la versión de `image:` en `docker-compose.yml` y:

```bash
docker compose pull
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
```

## En el servidor (producción)

https://chat.panel-admin-atk-mobil.com — VPS de Hostinger (Ubuntu 24.04),
carpeta `/opt/altoque/chatwoot`. Se entra con `ssh root@<IP>` (solo con
llave; respaldo: la consola web de Hostinger).

- Preparación del servidor: `soporte/servidor/preparar-servidor.sh`
  (firewall, fail2ban, SSH solo con llave, swap, Docker).
- Caddy da el https (`Caddyfile`, `docker-compose.servidor.yml`).
- Tareas diarias (`soporte/servidor/instalar-tareas.sh`): 03:00 backup de
  la base a R2 (`backups/` del bucket, 14 días) y 04:00 fotos del chat.

```bash
cd /opt/altoque/chatwoot
C="docker compose -f docker-compose.yml -f docker-compose.servidor.yml"
$C ps                    # estado
$C logs -f rails         # registros
$C up -d                 # prender / aplicar cambios
```

Configurar en producción (después de copiar `configurar.rb` y `correos`):

```bash
$C exec -T -e DOMINIOS="https://panel-admin-atk-mobil.com,https://www.panel-admin-atk-mobil.com" \
  -e FICHA_URL="https://panel-admin-atk-mobil.com/soporte/ficha" \
  rails bundle exec rails runner /tmp/configurar.rb
```

Restaurar un backup (servidor nuevo o desastre): bajar el `.dump` de R2,
levantar `postgres`, crear la base y
`$C exec -T postgres pg_restore -U postgres -d chatwoot_production --no-owner --clean --if-exists < archivo.dump`.

## Mudar a un servidor

Se copia esta carpeta y el `.env`, se cambia `FRONTEND_URL` por la URL
pública con https y `FORCE_SSL=true`, y se repiten los pasos de
"Primera vez". Las conversaciones se llevan con un `pg_dump` de la base.
