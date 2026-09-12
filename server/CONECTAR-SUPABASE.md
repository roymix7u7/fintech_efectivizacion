# Supabase: conexión y migraciones

El proyecto ya está vinculado con la CLI de Supabase. A partir de aquí
los cambios de base de datos se aplican con un comando, versionados, en
vez de copiar y pegar en el editor SQL.

## Estado

| Cosa | Estado |
| --- | --- |
| Proyecto vinculado | `zsrjctabxqrgunlzvzru` |
| Migraciones versionadas | `supabase/migrations/` |
| Función de alta de personal | Desplegada |

## Cómo trabajamos ahora

Los archivos de `server/` numerados del 01 al 10 se ejecutaron a mano
en el editor SQL y quedan como documentación de lo que se hizo y por
qué. De ahí en adelante, cada cambio nuevo es una migración.

| Comando | Para qué |
| --- | --- |
| `npx supabase db push` | Aplica las migraciones pendientes |
| `npx supabase migration list` | Muestra qué se aplicó y qué falta |
| `npx supabase functions deploy crear-staff` | Redespliega la función de alta |
| `npx supabase gen types typescript --linked` | Genera los tipos del esquema |

## Qué acceso hay y cuál no

**La clave `service_role` y la contraseña de la base no están en el
repositorio y no hacen falta para trabajar.** La vinculación quedó
guardada en tu máquina, a tu nombre. La puedes revocar cuando quieras
desde Supabase, en Account, Access Tokens.

La única parte que usa la clave `service_role` es la función
`crear-staff`, y esa clave vive dentro de Supabase, nunca sale de ahí.

## Dos limitaciones de este entorno

**Docker no está instalado**, así que `supabase db dump` y el entorno
local no funcionan. No hace falta para aplicar migraciones ni para
desplegar funciones, que es lo que usamos.

**No se puede sondear con la clave anónima** para comprobar permisos: a
`anon` no se le dio acceso a propósito, así que responde denegado tanto
si el permiso existe como si no. Para verificar se usa una migración
que falla a propósito cuando falta algo, como
`20260912000011_verificar_permisos.sql`.

## Si algo falla al aplicar

`db push` se detiene en la primera migración que falle y no aplica las
siguientes. El historial queda en la tabla de migraciones de Supabase,
así que `migration list` siempre dice dónde se quedó.

Para marcar una migración como ya aplicada sin ejecutarla, por ejemplo
si la corriste a mano antes:

```bash
npx supabase migration repair --status applied <version>
```

## Alternativa: el servidor MCP de Supabase

Existe un conector oficial que permite consultar el esquema
directamente durante la conversación, sin comandos. Se configura en
Claude Code con un token personal y se puede dejar en modo de solo
lectura.

Es cómodo para inspeccionar. Para aplicar cambios es mejor la CLI,
porque deja rastro en el repositorio y se puede revertir.
