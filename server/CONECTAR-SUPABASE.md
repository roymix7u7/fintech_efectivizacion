# Conectar el proyecto a Supabase

Hoy cada cambio de base de datos pasa por copiar un archivo y pegarlo en
el editor SQL. Eso es lento y ya nos costó un error: las tablas de
comisiones y sedes se crearon sin permisos porque el editor no aplica
los mismos valores por defecto que el panel de Supabase.

Con la CLI conectada, yo ejecuto las migraciones y las verifico. Tú
apruebas cada comando, como con cualquier otro.

## Qué necesito, y qué no

**No me des la clave `service_role` ni la contraseña de la base.** No
hacen falta y no deberías compartirlas con nadie.

Lo que hace falta es vincular el proyecto una sola vez desde tu máquina.
El acceso queda guardado en tu equipo, a tu nombre, y lo puedes revocar
cuando quieras desde Supabase, en Account, Access Tokens.

## Vinculación, una sola vez

Ejecuta esto tú, en la raíz del proyecto. El primero abre el navegador
para que inicies sesión con tu cuenta.

```bash
npx supabase login
npx supabase link --project-ref zsrjctabxqrgunlzvzru
```

Te pedirá la contraseña de la base de datos. Es la que pusiste al crear
el proyecto; si no la recuerdas, la reinicias en Settings, Database.
Esa contraseña no se guarda en el repositorio.

## Qué cambia después

A partir de ahí puedo hacer esto sin que tengas que copiar nada:

| Comando | Para qué |
| --- | --- |
| `npx supabase db push` | Aplica las migraciones pendientes |
| `npx supabase migration list` | Muestra qué se aplicó y qué falta |
| `npx supabase gen types typescript --linked` | Genera los tipos del esquema |
| `npx supabase functions deploy crear-staff` | Despliega la función de alta de personal |

Y lo más importante: las migraciones quedan versionadas en
`supabase/migrations/`, con su orden y su historial. Hoy los archivos
de `server/` son solo texto suelto, y no hay forma de saber cuáles
corriste ni en qué orden.

## Alternativa: el servidor MCP de Supabase

Existe un conector oficial que me deja consultar el esquema
directamente durante la conversación, sin comandos. Se configura en
Claude Code con un token personal tuyo y se puede dejar en modo de solo
lectura.

Es cómodo para inspeccionar, pero para aplicar cambios prefiero la CLI:
deja rastro en el repositorio y se puede revertir. Si quieres los dos,
funcionan juntos.

## Migrar lo que ya existe

Los archivos de `server/` ya los ejecutaste. Cuando vinculemos el
proyecto conviene convertirlos en migraciones formales para que el
historial quede completo. Es un paso que puedo hacer yo; solo hay que
tener cuidado de marcarlas como ya aplicadas en vez de volver a
ejecutarlas.
