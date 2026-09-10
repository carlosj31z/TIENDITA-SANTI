# Migrar GIANNEXPRESS a un proyecto nuevo de Supabase

Orden de los pasos. Los dos `.sql` de esta carpeta se probaron contra un
Postgres real: se migró una base con acentos, apóstrofes, comillas, campos
vacíos y JSON, y la copia quedó idéntica celda por celda.

## 1. Crear la estructura en el proyecto nuevo

Proyecto **NUEVO** → SQL Editor → New query → pegar `migrar-01-proyecto-nuevo.sql` → Run.

Crea las 6 tablas, los índices, las políticas de acceso, los buckets de
imágenes y activa el tiempo real. No trae productos de ejemplo.

## 2. Sacar los datos del proyecto viejo

Proyecto **VIEJO** → SQL Editor → New query → pegar `migrar-02-exportar-datos.sql` → Run.

Sólo lee: devuelve **una celda de texto** con todos los `insert` ya escritos.
Ábrela y copia el contenido completo.

Si el proyecto viejo responde "connection timeout", pulsa **Restart project**
y espera un par de minutos. Sólo necesita contestar esta vez.

## 3. Meter los datos en el proyecto nuevo

Proyecto **NUEVO** → SQL Editor → New query → pegar lo que copiaste → Run.

Va todo dentro de `begin/commit`: si algo falla a la mitad, no queda nada a
medias. Al final reajusta los contadores de `id` para que el próximo producto
que crees no choque con uno existente.

## 4. Apuntar la web y las apps al proyecto nuevo

En el proyecto nuevo: **Settings → API**. Copia *Project URL* y la clave
*anon public*, y reemplázalas en `js/supabaseClient.js`:

```js
const SUPABASE_URL = "https://TU-PROYECTO-NUEVO.supabase.co";
const SUPABASE_ANON_KEY = "...";
```

Sólo la clave **anon**. La `service_role` nunca va en código del navegador.

Al subir ese cambio, Vercel republica la web y GitHub Actions reconstruye
los dos APK apuntando ya al proyecto nuevo. Quien tenga la app instalada
tiene que actualizarla para que deje de hablarle a la base vieja.

## 5. Las fotos (esto el SQL no lo mueve)

Las imágenes viven en Storage, no en las tablas. Lo que se copia es la
**dirección** de cada foto, y esa dirección sigue apuntando al proyecto
viejo. Dos salidas:

- **No borres el proyecto viejo.** El plan gratuito permite dos proyectos, y
  aunque su base esté saturada, Storage sigue sirviendo las imágenes. Es lo
  más rápido y no hay que tocar nada.
- **Volver a subir las fotos** desde el panel (Inventario → producto →
  Cambiar foto). Sólo entonces el proyecto viejo se puede borrar.

El QR de cobro está en el mismo caso.

## Después de migrar

La base se saturó una vez; conviene no repetirlo. Ya se redujo el sondeo de
la tienda (antes consultaba cada minuto incluso con la app en segundo plano).
Si el proyecto nuevo se vuelve a saturar en pocos días, el sospechoso es el
tiempo real: se puede desactivar quitando las tablas de la publicación
`supabase_realtime` y dejando sólo el sondeo.
