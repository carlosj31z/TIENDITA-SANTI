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

// Del directorio brand/ sólo viaja el logo que la página realmente usa: el
// original de edición y los masters del ícono pesan más de 1 MB y no tienen
// nada que hacer dentro del paquete que se descarga.
const logo = path.join(ROOT, 'brand', 'logo.png');
if (fs.existsSync(logo)) {
  fs.mkdirSync(path.join(OUT, 'brand'), { recursive: true });
  fs.copyFileSync(logo, path.join(OUT, 'brand', 'logo.png'));
}

let html = fs.readFileSync(path.join(ROOT, 'admin', 'index.html'), 'utf8');
// En admin/ los recursos compartidos viven un nivel arriba; dentro del
// paquete quedan en la raíz.
html = html.replace('../js/supabaseClient.js', 'js/supabaseClient.js');
html = html.replace(/\.\.\/brand\//g, 'brand/');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log('admin-app/www/ generado desde admin/');
