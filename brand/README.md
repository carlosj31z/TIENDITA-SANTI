# Imágenes de marca

Suelta aquí tus archivos y el sitio y la app los toman solos.

## `logo.png` — el logo GIANNEXPRESS

Ruta exacta: **`brand/logo.png`**

- PNG con fondo transparente, idealmente de unos 800×200 px.
- Aparece en el header de la tiendita, en el pie de página y en el panel admin.
- Mientras el archivo no exista, la web dibuja el wordmark tipográfico de
  respaldo, así que nunca se ve rota.

## `app-icon-source.png` — el ícono de la app Android

Ruta exacta: **`brand/app-icon-source.png`** (también sirve `.jpg`)

- Imagen cuadrada, mínimo 1024×1024 px. Se recorta al cuadrado central.
- En cada push a `main`, el workflow *Build "Mañana Te Pago" APK* la detecta,
  genera todas las densidades de Android y compila el APK con ese ícono.
- Si no existe, se usa el perrito ilustrado que ya está versionado.

Para regenerar los íconos a mano:

```bash
pip install pillow
python3 scripts/make-app-icons.py brand/app-icon-source.png
```
