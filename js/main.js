const TELEFONO_DELIVERY = "51972898388";

let productos = [];
let currentCategoria = 'Todos';

const frasesOficina = [
    "¿Estresado por sacar adelante ese pendiente? ¿Reuniones sin fin? El dulce cura el alma.",
    "Tu jefe no está mirando... date un gustito rápido. 😉",
    "El snack de las 4 PM no es un capricho, es una necesidad de supervivencia.",
    "Está científicamente comprobado* que el chocolate mejora los reportes en Excel.",
    "No dejes para mañana el antojo que te puedes comer HOY.",
    "¿Aprobaste un Control de Cambio? Te mereces un premio."
];

document.getElementById('random-quote').textContent = frasesOficina[Math.floor(Math.random() * frasesOficina.length)];

setInterval(() => {
    const variacion = Math.floor(Math.random() * 5) + 2;
    document.getElementById('live-count').textContent = variacion;
}, 6000);

function generarCodigoSlot(index) {
    const fila = String.fromCharCode(65 + Math.floor(index / 6));
    const col = (index % 6) + 1;
    return fila + col;
}

function armarMensajeWhatsapp(producto) {
    const texto = `¡Hola! Me dio un antojo de oficina 🍫. Quiero comprar: *${producto.nombre}* (S/ ${producto.precio}). ¿Me lo traes?`;
    return `https://wa.me/${TELEFONO_DELIVERY}?text=${encodeURIComponent(texto)}`;
}

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
            precio: Number(p.precio).toFixed(2),
            stock: p.stock || 0,
            imagen: p.imagen_url || null,
            categoria: p.categoria || 'General'
        }));

        renderCategoriaPills();
        renderizarProductos(filtrarPorCategoriaYBusqueda());
        mostrarAntojoDelDia();
        const ahora = new Date();
        document.getElementById('ultimo-update').textContent = "Actualizado: " + ahora.toLocaleTimeString('es-PE');
    } catch (err) {
        console.error("Error al cargar inventario:", err);
        if (productos.length === 0) {
            document.getElementById('tienda-container').innerHTML =
                '<div class="msg-error"><p>No se pudo leer el inventario.</p><p>Reintentando en 1 minuto...</p></div>';
        }
    }
}

function filtrarPorCategoriaYBusqueda() {
    const term = (document.getElementById('buscador').value || '').toLowerCase();
    return productos.filter(p => {
        const coincideCategoria = currentCategoria === 'Todos' || p.categoria === currentCategoria;
        const coincideBusqueda = p.nombre.toLowerCase().includes(term);
        return coincideCategoria && coincideBusqueda;
    });
}

function renderCategoriaPills() {
    const wrap = document.getElementById('category-pills');
    const categorias = Array.from(new Set(productos.map(p => p.categoria))).sort((a, b) => {
        if (a === 'General') return 1;
        if (b === 'General') return -1;
        return a.localeCompare(b);
    });

    if (categorias.length <= 1) { wrap.innerHTML = ''; return; }

    const todas = ['Todos', ...categorias];
    wrap.innerHTML = todas.map(cat => {
        const activo = cat === currentCategoria ? ' active' : '';
        return `<button type="button" class="pill-cat${activo}" data-cat="${cat.replace(/"/g, '&quot;')}">${cat}</button>`;
    }).join('');

    wrap.querySelectorAll('.pill-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategoria = btn.getAttribute('data-cat');
            renderCategoriaPills();
            renderizarProductos(filtrarPorCategoriaYBusqueda());
        });
    });
}

function placeholderIconSVG() {
    return '<svg class="placeholder-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';
}

function crearTarjetaProducto(prod, indexGlobal) {
    const agotado = prod.stock <= 0;
    const pocoStock = prod.stock > 0 && prod.stock <= 3;

    const card = document.createElement(agotado ? 'div' : 'a');
    card.className = "card " + (agotado ? "card-agotado" : "card-disponible");
    card.setAttribute('data-id', prod.id);

    if (!agotado) {
        card.href = armarMensajeWhatsapp(prod);
        card.target = "_blank";
    }

    let barraClase = "";
    let anchoBarra = Math.min(100, Math.round((prod.stock / 10) * 100));
    if (prod.stock > 0 && prod.stock <= 3) barraClase = "low";
    else if (prod.stock > 3 && prod.stock <= 6) barraClase = "mid";

    let stockText = `Stock: <strong>${prod.stock}</strong> un.`;
    if (pocoStock) {
        stockText = `<span class="stock-urgente">¡VUELA! quedan ${prod.stock}</span>`;
    }

    const mediaContent = prod.imagen
        ? `<img src="${prod.imagen}" alt="${prod.nombre}" loading="lazy">`
        : placeholderIconSVG();

    card.innerHTML =
        '<div class="card-media">' +
            '<span class="slot-code">' + generarCodigoSlot(indexGlobal) + '</span>' +
            (agotado ? '<span class="stamp-agotado">AGOTADO</span>' : '') +
            mediaContent +
        '</div>' +
        '<div class="card-body">' +
            '<div class="card-name">' + prod.nombre + '</div>' +
            '<div class="card-price-row">' +
                '<span class="card-price">S/ ' + prod.precio + '</span>' +
                (agotado
                    ? '<span class="badge-agotado">Agotado</span>'
                    : '<span class="card-add-btn">+</span>') +
            '</div>' +
            (agotado ? '' :
                '<div class="stock-bar-wrap"><div class="stock-bar-fill ' + barraClase + '" style="width:' + anchoBarra + '%"></div></div>'
            ) +
            '<span class="card-stock">' + stockText + '</span>' +
        '</div>';
    return card;
}

function renderizarProductos(lista) {
    const container = document.getElementById('tienda-container');
    container.innerHTML = "";

    if (lista.length === 0) {
        container.innerHTML = '<div class="msg-empty">No encontramos ese antojo por ahora. 😢</div>';
        return;
    }

    const buscando = (document.getElementById('buscador').value || '').trim() !== '';

    if (buscando || currentCategoria !== 'Todos') {
        const grid = document.createElement('div');
        grid.className = 'product-grid';
        lista.forEach(prod => {
            grid.appendChild(crearTarjetaProducto(prod, productos.indexOf(prod)));
        });
        container.appendChild(grid);
        return;
    }

    const categorias = Array.from(new Set(lista.map(p => p.categoria))).sort((a, b) => {
        if (a === 'General') return 1;
        if (b === 'General') return -1;
        return a.localeCompare(b);
    });

    categorias.forEach(cat => {
        const section = document.createElement('div');
        section.className = 'category-section';
        section.innerHTML = `<div class="category-section-title">${cat}</div>`;
        const grid = document.createElement('div');
        grid.className = 'product-grid';
        lista.filter(p => p.categoria === cat).forEach(prod => {
            grid.appendChild(crearTarjetaProducto(prod, productos.indexOf(prod)));
        });
        section.appendChild(grid);
        container.appendChild(section);
    });
}

function mostrarAntojoDelDia() {
    const disponibles = productos.filter(p => p.stock > 0);
    const banner = document.getElementById('antojo-dia');
    if (disponibles.length === 0) { banner.style.display = "none"; return; }

    const diaDelAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const elegido = disponibles[diaDelAno % disponibles.length];

    banner.dataset.id = elegido.id;
    document.getElementById('antojo-dia-nombre').textContent = elegido.nombre;
    document.getElementById('antojo-dia-precio').textContent = "S/ " + elegido.precio;
    banner.style.display = "flex";
}

function irAlAntojoDelDia() {
    const id = document.getElementById('antojo-dia').dataset.id;
    currentCategoria = 'Todos';
    document.getElementById('buscador').value = '';
    renderCategoriaPills();
    renderizarProductos(filtrarPorCategoriaYBusqueda());
    const tarjeta = document.querySelector('.card[data-id="' + id + '"]');
    if (tarjeta) {
        tarjeta.classList.add('card-highlight');
        tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => tarjeta.classList.remove('card-highlight'), 1500);
    }
}

function elegirAlAzar() {
    const disponibles = productos.filter(p => p.stock > 0);
    if (disponibles.length === 0) return;

    document.getElementById('buscador').value = "";
    currentCategoria = 'Todos';
    renderCategoriaPills();
    renderizarProductos(filtrarPorCategoriaYBusqueda());

    let pasadas = 0;
    const totalPasadas = 14;
    const tarjetas = document.querySelectorAll('.card-disponible');

    const intervalo = setInterval(() => {
        tarjetas.forEach(t => t.classList.remove('card-highlight'));
        const indexRandom = Math.floor(Math.random() * tarjetas.length);
        tarjetas[indexRandom].classList.add('card-highlight');

        pasadas++;
        if (pasadas >= totalPasadas) {
            clearInterval(intervalo);
            const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
            tarjetas.forEach(t => t.classList.remove('card-highlight'));

            const tarjetaGanadora = Array.from(tarjetas).find(t => t.getAttribute('data-id') === elegido.id);
            if (tarjetaGanadora) {
                tarjetaGanadora.classList.add('card-highlight');
                tarjetaGanadora.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setTimeout(() => mostrarTicketGanador(elegido), 350);
        }
    }, 110);
}

function mostrarTicketGanador(producto) {
    const index = productos.findIndex(p => p.id === producto.id);
    document.getElementById('ticket-codigo').textContent = "SLOT " + generarCodigoSlot(index >= 0 ? index : 0);
    document.getElementById('ticket-nombre').textContent = producto.nombre;
    document.getElementById('ticket-precio').textContent = "S/ " + producto.precio;
    document.getElementById('ticket-cta').href = armarMensajeWhatsapp(producto);
    document.getElementById('ticket-overlay').classList.add('activo');
}

function cerrarTicket(e) {
    if (e.target.id === 'ticket-overlay' || e.target.classList.contains('ticket-cerrar')) {
        document.getElementById('ticket-overlay').classList.remove('activo');
    }
}

function celebrarDelivery(elemento) {
    elemento.style.animationPlayState = 'paused';
    setTimeout(() => elemento.style.animationPlayState = 'running', 2000);
    lanzarConfeti(elemento.getBoundingClientRect());
}

function lanzarConfeti(rect) {
    const colores = ['#2E1A3D', '#FF5A4E', '#FFB627', '#1FA98A'];
    for (let i = 0; i < 30; i++) {
        const confeti = document.createElement('div');
        confeti.className = 'confetti';
        confeti.style.left = `${rect.left + rect.width / 2}px`;
        confeti.style.top = `${rect.top}px`;
        confeti.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];

        const x = (Math.random() - 0.5) * 250;
        const y = -(Math.random() * 150 + 50);
        confeti.style.setProperty('--x', `${x}px`);
        confeti.style.setProperty('--y', `${y}px`);

        document.body.appendChild(confeti);
        setTimeout(() => confeti.remove(), 1500);
    }
}

document.getElementById('buscador').addEventListener('input', function() {
    renderizarProductos(filtrarPorCategoriaYBusqueda());
});

cargarStock();
setInterval(cargarStock, 60000);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error:', err));
    });
}
