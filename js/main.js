const SPREADSHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLe8TRDdLCgjXBQf5jL3jN1e_CugqqcyFRxT9VO-uyKL05-avxObnclS809ZzMM6imAVWkN_rfkmTT/pub?output=csv";
const TELEFONO_DELIVERY = "51972898388";

let productos = [];

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
        const urlSinCache = SPREADSHEET_CSV_URL + "&t=" + new Date().getTime();
        const response = await fetch(urlSinCache);
        if (!response.ok) throw new Error("Respuesta no OK: " + response.status);

        const csv = await response.text();
        const filas = csv.split("\n").slice(1);

        productos = filas
            .map(fila => {
                const cols = fila.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (cols.length >= 3) {
                    return {
                        id: Math.random().toString(36).substring(2, 9),
                        nombre: cols[0].replace(/"/g, '').trim(),
                        precio: cols[1].replace(/"/g, '').trim(),
                        stock:  parseInt(cols[2].replace(/"/g, '').trim()) || 0
                    };
                }
            })
            .filter(p => p !== undefined && p.nombre !== "");

        renderizarProductos(productos);
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

function renderizarProductos(lista) {
    const container = document.getElementById('tienda-container');
    container.innerHTML = "";

    if (lista.length === 0) {
        container.innerHTML = '<div class="msg-empty">No encontramos ese antojo por ahora. 😢</div>';
        return;
    }

    lista.forEach((prod, index) => {
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

        card.innerHTML =
            '<span class="slot-code">' + generarCodigoSlot(index) + '</span>' +
            (agotado ? '<span class="stamp-agotado">AGOTADO</span>' : '') +
            '<div>' +
                '<div class="card-name">' + prod.nombre + '</div>' +
                '<div class="card-price">S/ ' + prod.precio + '</div>' +
            '</div>' +
            '<div class="card-footer">' +
                '<span class="badge ' + (agotado ? 'badge-no' : 'badge-si') + '">' +
                    (agotado ? 'Agotado' : '¡Pedir aquí!') +
                '</span>' +
                (agotado ? '' :
                    '<div class="stock-bar-wrap"><div class="stock-bar-fill ' + barraClase + '" style="width:' + anchoBarra + '%"></div></div>'
                ) +
                '<span class="card-stock">' + stockText + '</span>' +
            '</div>';
        container.appendChild(card);
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
    renderizarProductos(productos);

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

let contadorAntojos = 0;
const hitosCombo = [5, 10, 20, 30];

function registrarClickAntojo(e) {
    contadorAntojos++;
    const popup = document.createElement('div');
    popup.className = 'vela-flotante';
    const texto = contadorAntojos === 1 ? "+1 antojo" : `+${contadorAntojos} antojos`;
    popup.innerHTML = `🍬 ${texto}`;
    popup.style.left = `${e.clientX}px`;
    popup.style.top = `${e.clientY}px`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1600);

    const comboTag = document.getElementById('combo-tag');
    if (comboTag) {
        if (hitosCombo.includes(contadorAntojos)) {
            comboTag.textContent = "¡Racha de " + contadorAntojos + "! 🔥";
            lanzarConfeti(e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: e.clientX, top: e.clientY, width: 0 });
        } else {
            comboTag.textContent = contadorAntojos + " clics de antojo";
        }
    }
}

document.getElementById('zona-pizza').addEventListener('pointerdown', registrarClickAntojo);
document.getElementById('zona-velitas').addEventListener('pointerdown', registrarClickAntojo);

document.getElementById('buscador').addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    renderizarProductos(productos.filter(p => p.nombre.toLowerCase().includes(term)));
});

cargarStock();
setInterval(cargarStock, 60000);
