// Copia solo los archivos públicos de la tiendita a www/ para empaquetar
// con Capacitor. El panel admin/ y supabase/schema.sql NUNCA se incluyen
// en la app instalable: no tienen por qué viajar dentro del APK/IPA que
// descargan los clientes.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

const ITEMS = ['index.html', 'css', 'js', 'manifest.json', 'sw.js', 'icons'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const item of ITEMS) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  copyRecursive(src, path.join(OUT, item));
}

// Del directorio brand/ sólo viaja el logo que la página realmente usa: el
// original de edición y los masters del ícono pesan más de 1 MB y no tienen
// nada que hacer dentro del paquete que se descarga.
const logo = path.join(ROOT, 'brand', 'logo.png');
if (fs.existsSync(logo)) {
  fs.mkdirSync(path.join(OUT, 'brand'), { recursive: true });
  fs.copyFileSync(logo, path.join(OUT, 'brand', 'logo.png'));
}

console.log('www/ generado con:', ITEMS.join(', '), '+ brand/logo.png');
