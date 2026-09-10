/* ==========================================================
   GIANNEXPRESS · tiendita
   ========================================================== */

const TELEFONO_DELIVERY = "51972898388";

const FRASES = [
    "¿Estresado por ese pendiente? El dulce cura el alma.",
    "Tu jefe no está mirando... date un gustito rápido. 😉",
    "El snack de las 4 PM no es un capricho, es supervivencia.",
    "Está comprobado* que el chocolate mejora los reportes en Excel.",
    "No dejes para mañana el antojo que te puedes comer HOY.",
    "¿Aprobaste un Control de Cambio? Te mereces un premio."
];

const EMOJI_MAP = [
    [/agua|san luis|cielo/i, '💧'],
    [/coca|inka|gaseosa|sprite|fanta|pepsi/i, '🥤'],
    [/jugo|frugos|citrus|naranja/i, '🧃'],
    [/caf|nescaf/i, '☕'],
    [/leche|yogur|milk/i, '🥛'],
    [/chocolate|sublime|princesa|chocman|chocobum|morocha|triangulo/i, '🍫'],
    [/galleta|casino|oreo|soda|margarita|vainilla/i, '🍪'],
    [/chicle|caramelo|halls|mentita|menta|sparky|chomp/i, '🍬'],
    [/papa|chizito|piqueo|chifle|snack|doritos|lays/i, '🍿'],
    [/pan|sandwich|empanada|keke|torta/i, '🥪'],
    [/helado|fondy|milcky/i, '🍦'],
    [/energ|red bull|volt/i, '⚡']
];

let productos = [];
let cart = {};
let currentCategoria = 'Todos';
let searchTerm = '';
let tintCache = {};

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const money = n => 'S/ ' + Number(n || 0).toFixed(2);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

function emojiFor(nombre) {
    const hit = EMOJI_MAP.find(([re]) => re.test(nombre));
    return hit ? hit[1] : '🍬';
}

/* ---------- color dominante de cada PNG ---------- */
try { tintCache = JSON.parse(localStorage.getItem('gx_tints') || '{}'); } catch (e) { tintCache = {}; }

function saveTints() {
    try { localStorage.setItem('gx_tints', JSON.stringify(tintCache)); } catch (e) { /* cuota llena, no pasa nada */ }
}

function hueFromText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = text.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}

function tintFromHSL(h, s) {
    const sat = Math.min(62, Math.max(30, s));
    return { tint: `hsl(${h} ${sat}% 93%)`, deep: `hsl(${h} ${Math.min(70, sat + 8)}% 74%)` };
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
}

function extractTint(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onerror = () => reject(new Error('no-cors'));
        img.onload = () => {
            try {
                const S = 40;
                const canvas = document.createElement('canvas');
                canvas.width = S; canvas.height = S;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, S, S);
                const { data } = ctx.getImageData(0, 0, S, S);

                // Media circular del tono, ponderada por saturación: así un PNG
                // recortado devuelve el color de la marca del envase y no el gris
                // promedio de mezclar todos los píxeles.
                let sinSum = 0, cosSum = 0, satSum = 0, weight = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha < 180) continue;
                    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                    if (l > 0.94 || l < 0.08 || s < 0.12) continue;
                    const w = s * (alpha / 255);
                    const rad = h * Math.PI / 180;
                    sinSum += Math.sin(rad) * w;
                    cosSum += Math.cos(rad) * w;
                    satSum += s * w;
                    weight += w;
                }
                if (weight < 0.8) return reject(new Error('sin-color'));
                let hue = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
                if (hue < 0) hue += 360;
                resolve(tintFromHSL(Math.round(hue), Math.round((satSum / weight) * 100)));
            } catch (err) {
                reject(err);
            }
        };
        img.src = url;
    });
}

async function tintForProduct(prod) {
    const key = prod.imagen || ('n:' + prod.nombre);
    if (tintCache[key]) return tintCache[key];

    let result = null;
    if (prod.imagen) {
        try { result = await extractTint(prod.imagen); } catch (e) { result = null; }
    }
    if (!result) result = tintFromHSL(hueFromText(prod.nombre), 44);

    tintCache[key] = result;
    saveTints();
    return result;
}

function paintTint(el, tint) {
    if (!el || !tint) return;
    el.style.setProperty('--tint', tint.tint);
    el.style.setProperty('--tint-deep', tint.deep);
}

async function applyTints(scope) {
    const nodes = (scope || document).querySelectorAll('[data-tint-id]');
    for (const node of nodes) {
        const prod = productos.find(p => p.id === node.dataset.tintId);
        if (!prod) continue;
        const tint = await tintForProduct(prod);
        paintTint(node, tint);
    }
}

/* ---------- carrito ---------- */
try { cart = JSON.parse(localStorage.getItem('gx_cart') || '{}'); } catch (e) { cart = {}; }

function saveCart() {
    try { localStorage.setItem('gx_cart', JSON.stringify(cart)); } catch (e) { /* noop */ }
}

const cartEntries = () => Object.entries(cart)
    .map(([id, qty]) => ({ prod: productos.find(p => p.id === id), qty }))
    .filter(x => x.prod && x.qty > 0);

const cartCount = () => cartEntries().reduce((n, x) => n + x.qty, 0);
const cartTotal = () => cartEntries().reduce((n, x) => n + x.prod.precio * x.qty, 0);

function addToCart(id, silent) {
    const prod = productos.find(p => p.id === id);
    if (!prod) return;
    const actual = cart[id] || 0;
    if (actual >= prod.stock) { toast('Ya llevas todo el stock disponible'); return; }
    cart[id] = actual + 1;
    saveCart();
    syncCartUI();
    if (!silent) toast(`${prod.nombre} agregado`);
}

function removeFromCart(id) {
    if (!cart[id]) return;
    cart[id] -= 1;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    syncCartUI();
}

function clearCart() {
    cart = {};
    saveCart();
    syncCartUI();
    closeSheet('sheet-cart');
    toast('Pedido vaciado');
}

/** Repinta los controles del carrito sin re-renderizar toda la grilla. */
function syncCartUI() {
    const count = cartCount();

    $('cart-dot').hidden = count === 0;
    $('cart-dot').textContent = count;

    const bar = $('cart-bar');
    bar.hidden = count === 0;
    $('cart-bar-count').textContent = count;
    $('cart-bar-total').textContent = money(cartTotal());

    document.querySelectorAll('.p-card').forEach(card => {
        const id = card.dataset.id;
        const prod = productos.find(p => p.id === id);
        if (!prod || prod.stock <= 0) return;
        const slot = card.querySelector('.p-action');
        if (slot) slot.innerHTML = actionMarkup(id, cart[id] || 0);
    });

    if (!$('sheet-cart').hidden) renderCartSheet();
}

function actionMarkup(id, qty) {
    if (qty > 0) {
        return `
            <div class="p-step">
                <button type="button" data-dec="${id}" aria-label="Quitar uno">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>
                </button>
                <span class="qty">${qty}</span>
                <button type="button" data-inc="${id}" aria-label="Agregar uno">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
            </div>`;
    }
    return `
        <button type="button" class="p-add" data-inc="${id}" aria-label="Agregar al pedido">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>`;
}

function renderCartSheet() {
    const items = cartEntries();
    const box = $('cart-items');

    if (items.length === 0) {
        box.innerHTML = `<div class="empty-state"><span class="emoji">🛒</span><strong>Tu pedido está vacío</strong>Toca el + de cualquier antojo.</div>`;
    } else {
        box.innerHTML = items.map(({ prod, qty }) => `
            <div class="cart-item">
                <div class="cart-thumb" data-tint-id="${esc(prod.id)}">
                    ${prod.imagen ? `<img src="${esc(prod.imagen)}" alt="">` : `<span>${emojiFor(prod.nombre)}</span>`}
                </div>
                <div class="cart-info">
                    <div class="cart-name">${esc(prod.nombre)}</div>
                    <div class="cart-unit">${money(prod.precio)} c/u</div>
                </div>
                ${actionMarkup(prod.id, qty)}
                <div class="cart-line-total">${money(prod.precio * qty)}</div>
            </div>`).join('');
        applyTints(box);
    }

    $('cart-total').textContent = money(cartTotal());
    $('btn-checkout').disabled = items.length === 0;
}

function checkout() {
    const items = cartEntries();
    if (items.length === 0) return;

    let msg = '¡Hola GIANNEXPRESS! 🛒 Quiero pedir:\n\n';
    items.forEach(({ prod, qty }) => {
        msg += `• ${qty} × ${prod.nombre} — ${money(prod.precio * qty)}\n`;
    });
    msg += `\n*Total: ${money(cartTotal())}*`;

    window.open(`https://wa.me/${TELEFONO_DELIVERY}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ---------- datos ---------- */
async function cargarStock() {
    try {
        const { data, error } = await supabaseClient
            .from('productos')
            .select('id, nombre, precio, stock, imagen_url, categoria')
            .order('nombre');
        if (error) throw error;

        productos = (data || []).map(p => ({
            id: String(p.id),
            nombre: p.nombre,
            precio: Number(p.precio) || 0,
            stock: p.stock || 0,
            imagen: p.imagen_url || null,
            categoria: (p.categoria || 'General').trim()
        }));

        // Si algo se agotó o desapareció, el carrito se ajusta solo.
        let ajustado = false;
        Object.keys(cart).forEach(id => {
            const prod = productos.find(p => p.id === id);
            if (!prod || prod.stock <= 0) { delete cart[id]; ajustado = true; }
            else if (cart[id] > prod.stock) { cart[id] = prod.stock; ajustado = true; }
        });
        if (ajustado) saveCart();

        render();
        renderCategorias();
        renderPromo();
        syncCartUI();
        $('ultimo-update').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
        console.error('Error al cargar el stock:', err);
        if (productos.length === 0) {
            $('tienda-container').innerHTML = `<div class="empty-state"><span class="emoji">📡</span><strong>No pudimos leer el stock</strong>Revisa tu conexión.<button class="btn-retry" onclick="cargarStock()">Reintentar</button></div>`;
        }
    }
}

/* ---------- render ---------- */
const ordenCategorias = (a, b) => (a === 'General') - (b === 'General') || a.localeCompare(b);

function categoriasDisponibles() {
    return [...new Set(productos.map(p => p.categoria))].sort(ordenCategorias);
}

function productosVisibles() {
    const term = searchTerm.trim().toLowerCase();
    return productos.filter(p => {
        const okCat = currentCategoria === 'Todos' || p.categoria === currentCategoria;
        const okTerm = !term || p.nombre.toLowerCase().includes(term);
        return okCat && okTerm;
    });
}

function cardMarkup(prod) {
    const agotado = prod.stock <= 0;
    const pocas = !agotado && prod.stock <= 3;

    const media = prod.imagen
        ? `<img src="${esc(prod.imagen)}" alt="${esc(prod.nombre)}" loading="lazy">`
        : `<span class="p-emoji" aria-hidden="true">${emojiFor(prod.nombre)}</span>`;

    const flag = agotado
        ? ''
        : pocas ? `<span class="p-flag is-low">Últimas ${prod.stock}</span>` : '';

    const action = agotado
        ? `<span class="p-out-tag">Agotado</span>`
        : actionMarkup(prod.id, cart[prod.id] || 0);

    return `
        <article class="p-card${agotado ? ' is-out' : ''}" data-id="${esc(prod.id)}" data-tint-id="${esc(prod.id)}">
            <div class="p-media">${flag}${media}</div>
            <div class="p-body">
                <h3 class="p-name">${esc(prod.nombre)}</h3>
                <div class="p-foot">
                    <span class="p-price"><small>S/</small>${prod.precio.toFixed(2)}</span>
                    <span class="p-action">${action}</span>
                </div>
                ${agotado ? '' : `<span class="p-stock${pocas ? ' is-low' : ''}">${pocas ? '¡Vuela! ' : ''}${prod.stock} disponibles</span>`}
            </div>
        </article>`;
}

function render() {
    const box = $('tienda-container');
    const visibles = productosVisibles();

    if (productos.length === 0) {
        box.innerHTML = `<div class="empty-state"><span class="emoji">📦</span><strong>Aún no hay productos</strong>Cárgalos desde el panel de inventario.</div>`;
        return;
    }

    if (visibles.length === 0) {
        box.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span><strong>No encontramos ese antojo</strong>Prueba con otro nombre o categoría.</div>`;
        return;
    }

    const filtrando = searchTerm.trim() !== '' || currentCategoria !== 'Todos';

    if (filtrando) {
        const titulo = searchTerm.trim() ? `Resultados para "${esc(searchTerm.trim())}"` : esc(currentCategoria);
        box.innerHTML = `
            <section class="cat-section">
                <div class="cat-head">
                    <h2>${titulo}</h2>
                    <span class="see-all" style="color:var(--ink-3)">${visibles.length} producto${visibles.length === 1 ? '' : 's'}</span>
                </div>
                <div class="grid">${visibles.map(cardMarkup).join('')}</div>
            </section>`;
    } else {
        const cats = [...new Set(visibles.map(p => p.categoria))].sort(ordenCategorias);
        box.innerHTML = cats.map(cat => {
            const items = visibles.filter(p => p.categoria === cat);
            const rail = items.length > 2;
            return `
                <section class="cat-section">
                    <div class="cat-head">
                        <h2>${esc(cat)}</h2>
                        <button class="see-all" data-cat="${esc(cat)}">
                            Ver más
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
                        </button>
                    </div>
                    <div class="${rail ? 'rail' : 'grid'}">${items.map(cardMarkup).join('')}</div>
                </section>`;
        }).join('');
    }

    applyTints(box);
}

function renderCategorias() {
    const cats = categoriasDisponibles();
    const rail = $('cat-rail');

    if (cats.length <= 1) { rail.innerHTML = ''; return; }

    rail.innerHTML = ['Todos', ...cats].map(cat => `
        <button class="cat-chip${cat === currentCategoria ? ' is-active' : ''}" data-cat="${esc(cat)}">${esc(cat)}</button>
    `).join('');

    $('menu-list').innerHTML = ['Todos', ...cats].map(cat => {
        const n = cat === 'Todos' ? productos.length : productos.filter(p => p.categoria === cat).length;
        return `<button class="menu-row" data-cat="${esc(cat)}"><span class="dot"></span><span class="label">${esc(cat)}</span><span class="count">${n}</span></button>`;
    }).join('');
}

function setCategoria(cat) {
    currentCategoria = cat;
    searchTerm = '';
    $('buscador').value = '';
    $('buscador').closest('.search-field').classList.remove('has-text');
    renderCategorias();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPromo() {
    const disponibles = productos.filter(p => p.stock > 0);
    const promo = $('promo');
    if (disponibles.length === 0) { promo.hidden = true; return; }

    const dia = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const elegido = disponibles[dia % disponibles.length];

    promo.hidden = false;
    promo.dataset.id = elegido.id;
    $('promo-name').textContent = elegido.nombre;
    $('promo-price').textContent = money(elegido.precio);
}

/* ---------- ruleta ---------- */
function ruleta() {
    const disponibles = productos.filter(p => p.stock > 0);
    if (disponibles.length === 0) { toast('No hay stock para sortear'); return; }

    if (currentCategoria !== 'Todos' || searchTerm) setCategoria('Todos');

    const cards = [...document.querySelectorAll('.p-card:not(.is-out)')];
    const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];

    let vueltas = 0;
    const total = 12;
    const girar = setInterval(() => {
        cards.forEach(c => c.classList.remove('is-flash'));
        if (cards.length) cards[Math.floor(Math.random() * cards.length)].classList.add('is-flash');
        if (++vueltas >= total) {
            clearInterval(girar);
            cards.forEach(c => c.classList.remove('is-flash'));
            mostrarTicket(elegido);
        }
    }, 95);
}

async function mostrarTicket(prod) {
    const media = $('ticket-media');
    media.innerHTML = prod.imagen
        ? `<img src="${esc(prod.imagen)}" alt="">`
        : `<span class="p-emoji">${emojiFor(prod.nombre)}</span>`;
    paintTint(media, await tintForProduct(prod));

    $('ticket-nombre').textContent = prod.nombre;
    $('ticket-precio').textContent = money(prod.precio);
    $('ticket-cta').dataset.id = prod.id;
    openSheet('ticket-overlay');
}

/* ---------- sheets ---------- */
function openSheet(id) {
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('sheet-open');
    if (id === 'sheet-cart') renderCartSheet();
}

function closeSheet(id) {
    $(id).hidden = true;
    if (!document.querySelector('.sheet-overlay:not([hidden])')) {
        document.body.style.overflow = '';
        document.body.classList.remove('sheet-open');
    }
}

function closeAllSheets() {
    document.querySelectorAll('.sheet-overlay').forEach(el => { el.hidden = true; });
    document.body.style.overflow = '';
    document.body.classList.remove('sheet-open');
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
    const inc = e.target.closest('[data-inc]');
    if (inc) { addToCart(inc.dataset.inc, true); return; }

    const dec = e.target.closest('[data-dec]');
    if (dec) { removeFromCart(dec.dataset.dec); return; }

    const chip = e.target.closest('.cat-chip, .see-all[data-cat], .menu-row[data-cat]');
    if (chip) {
        setCategoria(chip.dataset.cat);
        closeSheet('sheet-menu');
        return;
    }

    if (e.target.closest('[data-close]')) { closeAllSheets(); return; }

    const overlay = e.target.classList && e.target.classList.contains('sheet-overlay') ? e.target : null;
    if (overlay) closeSheet(overlay.id);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllSheets(); });

$('btn-cart').addEventListener('click', () => openSheet('sheet-cart'));
$('cart-bar-btn').addEventListener('click', () => openSheet('sheet-cart'));
$('btn-menu').addEventListener('click', () => openSheet('sheet-menu'));
$('btn-place').addEventListener('click', () => openSheet('sheet-place'));
$('btn-ruleta').addEventListener('click', ruleta);
$('btn-checkout').addEventListener('click', checkout);
$('btn-clear-cart').addEventListener('click', clearCart);

$('ticket-cta').addEventListener('click', e => {
    addToCart(e.currentTarget.dataset.id, true);
    closeSheet('ticket-overlay');
    toast('Agregado a tu pedido 🎉');
});

$('promo-cta').addEventListener('click', () => {
    const id = $('promo').dataset.id;
    addToCart(id);
    const card = document.querySelector(`.p-card[data-id="${id}"]`);
    if (card) {
        card.classList.add('is-flash');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => card.classList.remove('is-flash'), 1600);
    }
});

$('btn-search').addEventListener('click', () => {
    const wrap = $('search-wrap');
    wrap.hidden = !wrap.hidden;
    if (!wrap.hidden) $('buscador').focus();
    else if (searchTerm) { searchTerm = ''; render(); }
});

$('buscador').addEventListener('input', e => {
    searchTerm = e.target.value;
    e.target.closest('.search-field').classList.toggle('has-text', searchTerm !== '');
    render();
});

$('search-clear').addEventListener('click', () => {
    searchTerm = '';
    $('buscador').value = '';
    $('buscador').closest('.search-field').classList.remove('has-text');
    $('buscador').focus();
    render();
});

/* Si aún no se subió brand/logo.png, se muestra el wordmark tipográfico. */
function activarRespaldoDeLogo() {
    document.querySelectorAll('.brand-img').forEach(img => {
        const usarTexto = () => {
            img.hidden = true;
            const texto = img.parentElement.querySelector('.brand-text');
            if (texto) texto.hidden = false;
        };
        img.addEventListener('error', usarTexto);
        if (img.complete && img.naturalWidth === 0) usarTexto();
    });
}
activarRespaldoDeLogo();

/* ---------- arranque ---------- */
$('random-quote').textContent = FRASES[Math.floor(Math.random() * FRASES.length)];

setInterval(() => {
    $('live-count').textContent = Math.floor(Math.random() * 5) + 2;
}, 6000);

cargarStock();

// Realtime ya avisa de cada cambio, así que este sondeo es sólo una red de
// seguridad por si el websocket se cae. Antes corría cada minuto incluso con
// la pestaña o la app en segundo plano: cada dispositivo abierto le mandaba
// ~1440 consultas diarias a la base sin que nadie estuviera mirando.
setInterval(() => { if (!document.hidden) cargarStock(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarStock(); });

supabaseClient
    .channel('tienda-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => cargarStock())
    .subscribe();

if ('serviceWorker' in navigator) {
    // Si ya había un service worker controlando la página y llega uno nuevo,
    // se recarga sola: así un despliegue se ve al instante sin que nadie
    // tenga que limpiar la caché a mano.
    const yaHabiaControlador = !!navigator.serviceWorker.controller;
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!yaHabiaControlador || recargando) return;
        recargando = true;
        location.reload();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error:', err));
    });
}
