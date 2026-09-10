#!/usr/bin/env python3
"""
Genera el juego completo de íconos Android para la app "Mañana Te Pago".

Uso:
    python3 scripts/make-app-icons.py                 # dibuja el perrito ilustrado
    python3 scripts/make-app-icons.py foto.png        # usa una foto real como ícono

Escribe ic_launcher / ic_launcher_round / ic_launcher_foreground en todas las
densidades de admin-app/android/app/src/main/res/mipmap-*, y deja el master en
brand/app-icon.png.

Requiere Pillow:  pip install pillow
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "admin-app", "android", "app", "src", "main", "res")
BRAND = os.path.join(ROOT, "brand")

BG = (243, 238, 230, 255)          # crema cálido, también en ic_launcher_background.xml

FUR = (224, 181, 127, 255)
EAR = (191, 140, 79, 255)
EAR_IN = (168, 118, 62, 255)
WHITE_FUR = (250, 247, 242, 255)
NOSE = (43, 35, 32, 255)
EYE = (30, 26, 24, 255)
SUIT = (20, 20, 26, 255)
SHIRT = (255, 255, 255, 255)
TIE = (26, 26, 34, 255)
SHADOW = (150, 120, 90, 60)

MASTER = 1024
SS = 4                              # supersampling

# densidad -> (tamaño legacy, tamaño foreground adaptativo)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def _s(v, canvas):
    """Escala una coordenada pensada sobre 1024 al canvas real."""
    return int(round(v * canvas / 1024))


def draw_dog(canvas=MASTER * SS):
    """El perrito empresario, sobre fondo transparente."""
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

    def ellipse(d, cx, cy, rx, ry, fill):
        d.ellipse([_s(cx - rx, canvas), _s(cy - ry, canvas),
                   _s(cx + rx, canvas), _s(cy + ry, canvas)], fill=fill)

    def poly(d, pts, fill):
        d.polygon([(_s(x, canvas), _s(y, canvas)) for x, y in pts], fill=fill)

    d = ImageDraw.Draw(img)

    # ── TRAJE ─────────────────────────────────────────────────────────
    d.rounded_rectangle(
        [_s(112, canvas), _s(676, canvas), _s(912, canvas), _s(1120, canvas)],
        radius=_s(170, canvas), fill=SUIT,
    )
    poly(d, [(512, 628), (398, 1024), (626, 1024)], SHIRT)              # camisa en V
    poly(d, [(512, 636), (352, 1024), (268, 1024), (300, 742)], SUIT)   # solapa izq
    poly(d, [(512, 636), (672, 1024), (756, 1024), (724, 742)], SUIT)   # solapa der
    poly(d, [(512, 632), (446, 742), (496, 692)], SHIRT)                # cuello izq
    poly(d, [(512, 632), (578, 742), (528, 692)], SHIRT)                # cuello der
    poly(d, [(512, 660), (558, 704), (512, 748), (466, 704)], TIE)      # nudo
    poly(d, [(499, 744), (525, 744), (552, 986), (512, 1030), (472, 986)], TIE)

    # ── OREJAS (caídas, por detrás de la cabeza) ──────────────────────
    for side in (-1, 1):
        layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        dl = ImageDraw.Draw(layer)
        cx = 512 + side * 214
        dl.ellipse([_s(cx - 96, canvas), _s(330, canvas),
                    _s(cx + 96, canvas), _s(668, canvas)], fill=EAR)
        dl.ellipse([_s(cx - 52, canvas), _s(392, canvas),
                    _s(cx + 52, canvas), _s(604, canvas)], fill=EAR_IN)
        layer = layer.rotate(-side * 12, resample=Image.BICUBIC,
                             center=(_s(cx, canvas), _s(360, canvas)))
        img.alpha_composite(layer)

    d = ImageDraw.Draw(img)

    # ── CABEZA ────────────────────────────────────────────────────────
    ellipse(d, 512, 622, 190, 44, SHADOW)                # sombra sobre el traje
    ellipse(d, 512, 428, 232, 244, FUR)
    poly(d, [(512, 200), (570, 306), (558, 452), (466, 452), (454, 306)], WHITE_FUR)
    ellipse(d, 512, 534, 152, 130, WHITE_FUR)            # hocico
    ellipse(d, 512, 490, 122, 96, WHITE_FUR)

    # ── OJOS ──────────────────────────────────────────────────────────
    ellipse(d, 422, 430, 31, 34, EYE)
    ellipse(d, 602, 430, 31, 34, EYE)
    ellipse(d, 432, 418, 11, 11, (255, 255, 255, 235))
    ellipse(d, 612, 418, 11, 11, (255, 255, 255, 235))

    # ── NARIZ Y BOCA ──────────────────────────────────────────────────
    ellipse(d, 512, 506, 41, 31, NOSE)
    d.line([_s(512, canvas), _s(530, canvas), _s(512, canvas), _s(566, canvas)],
           fill=NOSE, width=_s(8, canvas))
    d.arc([_s(452, canvas), _s(526, canvas), _s(514, canvas), _s(594, canvas)],
          start=0, end=120, fill=NOSE, width=_s(9, canvas))
    d.arc([_s(510, canvas), _s(526, canvas), _s(572, canvas), _s(594, canvas)],
          start=60, end=180, fill=NOSE, width=_s(9, canvas))

    return img.resize((MASTER, MASTER), Image.LANCZOS)


def load_photo(path):
    """Recorta una foto al cuadrado central y la deja lista como ícono."""
    img = Image.open(path).convert("RGBA")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    return img.crop((left, top, left + side, top + side)).resize((MASTER, MASTER), Image.LANCZOS)


def compose(subject, size, shape, scale, bg=BG):
    """shape: 'square' (esquinas redondeadas), 'circle' o 'adaptive' (transparente)."""
    big = size * SS
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    if shape != "adaptive":
        bg_layer = Image.new("RGBA", (big, big), bg)
        mask = Image.new("L", (big, big), 0)
        md = ImageDraw.Draw(mask)
        if shape == "circle":
            md.ellipse([0, 0, big - 1, big - 1], fill=255)
        else:
            md.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
        out.paste(bg_layer, (0, 0), mask)

    inner = int(big * scale)
    art = subject.resize((inner, inner), Image.LANCZOS)
    offset = (big - inner) // 2
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    layer.alpha_composite(art, (offset, offset))

    if shape != "adaptive":
        mask = Image.new("L", (big, big), 0)
        md = ImageDraw.Draw(mask)
        if shape == "circle":
            md.ellipse([0, 0, big - 1, big - 1], fill=255)
        else:
            md.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
        layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (big, big), 0), mask))

    out.alpha_composite(layer)
    return out.resize((size, size), Image.LANCZOS)


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else None
    if source:
        subject = load_photo(source)
        # Una foto ya trae su propio fondo: se deja llenar el marco completo.
        scale_legacy, scale_fg = 1.0, 1.0
        print(f"Usando la foto {source} como ícono.")
    else:
        subject = draw_dog()
        scale_legacy, scale_fg = 0.94, 0.78
        print("Usando el perrito ilustrado (pasa una ruta de imagen para usar una foto).")

    os.makedirs(BRAND, exist_ok=True)
    subject.save(os.path.join(BRAND, "app-icon.png"))

    for density, (legacy, fg) in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(folder, exist_ok=True)
        compose(subject, legacy, "square", scale_legacy).save(os.path.join(folder, "ic_launcher.png"))
        compose(subject, legacy, "circle", scale_legacy).save(os.path.join(folder, "ic_launcher_round.png"))
        compose(subject, fg, "adaptive", scale_fg).save(os.path.join(folder, "ic_launcher_foreground.png"))
        print(f"  mipmap-{density}: {legacy}px + foreground {fg}px")

    # El fondo del ícono adaptativo tiene que combinar con el arte.
    bg_hex = "#%02X%02X%02X" % BG[:3]
    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                f'    <color name="ic_launcher_background">{bg_hex}</color>\n</resources>\n')

    print(f"Listo. Fondo adaptativo: {bg_hex}")


if __name__ == "__main__":
    main()
