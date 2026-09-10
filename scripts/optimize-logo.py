#!/usr/bin/env python3
"""
Prepara brand/logo.png para la web a partir de brand/logo-source.png.

El archivo que exporta un diseñador suele traer mucho margen transparente
alrededor del wordmark: si se usa tal cual, el logo se ve diminuto dentro
de su caja y pesa de más. Este script recorta ese margen y lo deja al
ancho justo para pantalla.

Uso:
    python3 scripts/optimize-logo.py [origen.png]
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, "brand")
DEFAULT_SOURCE = os.path.join(BRAND, "logo-source.png")
OUTPUT = os.path.join(BRAND, "logo.png")

MAX_WIDTH = 720
MARGIN = 8  # unos píxeles de aire para que las diagonales no queden al ras


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not os.path.exists(source):
        sys.exit(f"No encontré {source}")

    img = Image.open(source).convert("RGBA")

    # Los exports suelen dejar píxeles fantasma con alpha 1 o 2 en las
    # esquinas; sin umbral, getbbox() devuelve el lienzo entero y el
    # recorte no sirve de nada.
    solid = img.getchannel("A").point(lambda a: 255 if a > 10 else 0)
    bbox = solid.getbbox()
    if bbox:
        img = img.crop(bbox)

    if MARGIN:
        padded = Image.new("RGBA", (img.width + MARGIN * 2, img.height + MARGIN * 2), (0, 0, 0, 0))
        padded.alpha_composite(img, (MARGIN, MARGIN))
        img = padded

    if img.width > MAX_WIDTH:
        height = round(img.height * MAX_WIDTH / img.width)
        img = img.resize((MAX_WIDTH, height), Image.LANCZOS)

    img.save(OUTPUT, optimize=True)
    kb = os.path.getsize(OUTPUT) / 1024
    print(f"brand/logo.png · {img.width}×{img.height} px · {kb:.0f} KB")


if __name__ == "__main__":
    main()
