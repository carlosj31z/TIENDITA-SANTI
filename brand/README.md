# Imágenes de marca

## `logo.png` — el logo GIANNEXPRESS

- **`logo-source.png`** es el archivo original tal como lo exportaste.
- **`logo.png`** es la versión que consume la web: la genera
  `scripts/optimize-logo.py` recortando el margen transparente y bajando el
  peso (de 800 KB a ~78 KB).

Si cambias el logo, reemplaza `logo-source.png` y corre:

```bash
pip install pillow
python3 scripts/optimize-logo.py
```

El recorte usa un umbral de alpha porque los exports suelen dejar píxeles
fantasma casi invisibles en las esquinas; sin ese umbral el recorte no
haría nada.

Aparece en el header de la tiendita, en el pie de página y en el panel
admin. Si el archivo faltara, la web dibuja un wordmark tipográfico de
respaldo en vez de mostrar una imagen rota.

## `app-icon-source.jpg` — el ícono de la app "Mañana Te Pago"

- Imagen cuadrada, mínimo 1024×1024 px idealmente (sirve cualquier tamaño).
- En cada push a `main`, el workflow *Build "Mañana Te Pago" APK* la detecta
  y genera todas las densidades de Android antes de compilar.
- El script recorta el aire sobrante alrededor del sujeto y toma el color
  del marco de la foto como fondo del ícono adaptativo, para que el recorte
  circular del launcher no deje bordes que desentonen.

Para regenerarlo a mano:

```bash
python3 scripts/make-app-icons.py brand/app-icon-source.jpg
```

Sin ese archivo, el script dibuja un perrito empresario ilustrado como
respaldo.
