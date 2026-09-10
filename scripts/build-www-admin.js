// Copia el panel admin/ a admin-app/www/ para empaquetarlo con
// Capacitor como una app separada de la tiendita. Reescribe la única
// ruta relativa que apunta fuera de admin/ (../js/supabaseClient.js)
// para que quede autocontenida.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'admin-app', 'www');

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

copyRecursive(path.join(ROOT, 'admin', 'css'), path.join(OUT, 'css'));
copyRecursive(path.join(ROOT, 'admin', 'js'), path.join(OUT, 'js'));
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'js', 'supabaseClient.js'), path.join(OUT, 'js', 'supabaseClient.js'));

const brand = path.join(ROOT, 'brand');
if (fs.existsSync(brand)) copyRecursive(brand, path.join(OUT, 'brand'));

let html = fs.readFileSync(path.join(ROOT, 'admin', 'index.html'), 'utf8');
// En admin/ los recursos compartidos viven un nivel arriba; dentro del
// paquete quedan en la raíz.
html = html.replace('../js/supabaseClient.js', 'js/supabaseClient.js');
html = html.replace(/\.\.\/brand\//g, 'brand/');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log('admin-app/www/ generado desde admin/');
