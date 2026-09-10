/* ============================================================
   GIANNEXPRESS · Panel admin
   Respaldado 100% en Supabase (productos, clientes, cobros,
   inventario y caja). Sin login: quien tenga el enlace /admin/
   entra directo.
   ============================================================ */

const TIENDA = 'GIANNEXPRESS';

let currentTab = 'cobros';
let currentSubTab = 'scan';
let currentClientId = null;
let editingClientId = null;
let saleCart = {};
let cajaDate = new Date(); cajaDate.setHours(0,0,0,0);

let scanner = null;
let scannerRunning = false;
let lastScannedCode = null;
let lastScanTime = 0;
let audioCtx = null;
let pendingImageFile = null;

const $ = id => document.getElementById(id);
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = n => 'S/ ' + Math.abs(Number(n || 0)).toFixed(2);
const moneyHTML = v => { const s = Number(v||0).toFixed(2).split('.'); return `S/ ${s[0]}<small>.${s[1]}</small>`; };
const sameDay = (d1,d2) => d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function toast(msg){
  const t = $('toast');
  t.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg><span>'+esc(msg)+'</span>';
  t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2400);
}
/* ============================================================
   HOJAS / MODALES — varias formas de salir, no sólo "Cancelar":
   botón atrás (Android o del navegador), tocar fuera de la hoja,
   o tocar la rayita gris de arriba. Se apilan (la hoja de recorte
   de foto se abre encima de la del producto) usando el historial
   del navegador para que el botón atrás cierre de a una.
   ============================================================ */
let modalStack = [];

function openModal(id){
  if(id === 'modalAjustes') loadInvSettings();
  $(id).classList.add('active');
  modalStack.push(id);
  history.pushState({ gxModal: id }, '');
}
/** Cierra sólo la hoja de encima (botón atrás, tocar fuera, tocar la rayita). */
function closeTopModal(){
  if(!modalStack.length) return;
  const id = modalStack.pop();
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
}
/** Cierra todo lo que esté abierto (botones "Cancelar" / acciones que ya cerraban todo). */
function closeModals(){
  const n = modalStack.length;
  modalStack.length = 0;
  document.querySelectorAll('.overlay.active').forEach(o => o.classList.remove('active'));
  if(n > 0) history.go(-n);
}
window.addEventListener('popstate', () => { closeTopModal(); });
document.addEventListener('click', e => {
  const t = e.target;
  if(!t.classList) return;
  if((t.classList.contains('overlay') && t.classList.contains('active')) || t.classList.contains('sheet-handle')){
    history.back();
  }
});
function errMsg(err){ return (err && err.message) ? err.message : 'Ocurrió un error'; }

/* ============================================================
   SETTINGS (tabla key/value en Supabase)
   ============================================================ */
async function getSetting(key, fallback){
  const { data, error } = await supabaseClient.from('settings').select('value').eq('key', key).maybeSingle();
  if(error || !data) return fallback;
  return data.value;
}
async function setSetting(key, value){
  const { error } = await supabaseClient.from('settings').upsert({ key, value });
  if(error) toast('No se pudo guardar: ' + errMsg(error));
}

async function invSettings(){ return await getSetting('inv_settings', { minStock: 3 }); }
async function saveInvSettings(){
  const v = parseInt($('settingMinStock').value) || 3;
  await setSetting('inv_settings', { minStock: v });
  toast('Ajustes guardados');
  closeModals();
  renderProductList(); renderScanHero();
}

/* ============================================================
   MÉTODOS DE COBRO (Plin, Yape, BanBif...)
   ============================================================ */
async function metodosPago(){
  const { data, error } = await supabaseClient.from('metodos_pago').select('*').order('id');
  return error ? [] : data;
}
async function renderMetodos(){
  const met = await metodosPago();
  const trash = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13"/></svg>';
  const admin = $('metodosAdmin');
  if(admin){
    admin.innerHTML = met.length ? '' : '<p style="font-size:13px;color:var(--ink-3);margin-bottom:10px">Aún no agregas números de cobro.</p>';
    met.forEach(m=>{
      admin.innerHTML += `<div class="metodo-row"><span><span class="sis">${esc(m.sistema)}</span> · ${esc(m.numero)}</span><button class="icon-btn" style="background:var(--rojo-bg);color:var(--rojo)" onclick="deleteMetodo(${m.id})" aria-label="Eliminar">${trash}</button></div>`;
    });
  }
  const lista = $('metodosLista');
  if(lista){ lista.innerHTML = met.map(m => `<div class="metodo-row"><span class="sis">${esc(m.sistema)}</span><span>${esc(m.numero)}</span></div>`).join(''); }
}
async function openMetodos(){ await renderMetodos(); openModal('modalMetodos'); }
async function addMetodo(){
  const sistema = $('inputMetSistema').value.trim();
  const numero  = $('inputMetNumero').value.trim();
  if(!sistema || !numero) return toast('Completa sistema y número');
  const { error } = await supabaseClient.from('metodos_pago').insert({ sistema, numero });
  if(error) return toast('Error: ' + errMsg(error));
  $('inputMetSistema').value=''; $('inputMetNumero').value='';
  renderMetodos(); toast('Método de cobro agregado');
}
async function deleteMetodo(id){
  const { error } = await supabaseClient.from('metodos_pago').delete().eq('id', id);
  if(error) return toast('Error: ' + errMsg(error));
  renderMetodos(); toast('Método eliminado');
}

/* ============================================================
   FECHA Y SALUDO
   ============================================================ */
function setDateLine(){
  const now = new Date(); const h = now.getHours();
  const saludo = h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
  const fecha = cap(now.toLocaleDateString('es-PE',{ weekday:'long', day:'numeric', month:'long' }));
  $('greetingLine').innerHTML = `<span class="greet-word">${saludo}</span><span class="greet-date"> · ${fecha}</span>`;
  $('invGreet').textContent = saludo + ', vamos a reponer';
}

/* ============================================================
   NAVEGACIÓN PRINCIPAL
   ============================================================ */
function switchTab(tab){
  currentTab = tab;
  ['cobros','inventario','caja'].forEach(t=>{
    $('tab-'+t).classList.toggle('active', t===tab);
    $('view-'+t).classList.toggle('hidden', t!==tab);
  });
  $('view-client').classList.add('hidden');
  $('tabbar').style.display='flex';
  $('fab').classList.toggle('hidden', tab!=='cobros');
  $('btnSettings').classList.toggle('hidden', tab!=='inventario');
  $('btnMetodos').classList.toggle('hidden', tab!=='cobros');

  if(tab==='cobros') renderCobros();
  else if(tab==='inventario'){ ensureScannerState(); renderScanHero(); }
  else renderCaja();
}
function goHome(){ currentClientId = null; switchTab('cobros'); }
function fabAction(){ if(currentTab==='cobros') openClientModal(); }

function switchSubTab(sub){
  currentSubTab = sub;
  ['scan','list','hist'].forEach(s=>{
    document.querySelector(`.sub-tab[data-sub="${s}"]`).classList.toggle('active', s===sub);
    $('sub-'+s).classList.toggle('hidden', s!==sub);
  });
  if(sub==='scan') { ensureScannerState(); renderScanHero(); }
  else if(sub==='list') { pauseScanner(); renderProductList(); }
  else { pauseScanner(); renderInvHistory(); }
}

/* ============================================================
   MÓDULO 1: COBROS
   ============================================================ */
function statusOf(c){
  const s = r2(c.saldo_actual || 0);
  if(s > 0) return { s, estado:'debe' };
  if(s < 0) return { s, estado:'favor' };
  return { s:0, estado:'dia' };
}
const avatarPalette = ['#B9552E','#C98A2D','#4C7A5A','#8A5A44','#A64A6E','#5A6E8A'];
function avatarColor(name){
  let h=0; for(let i=0;i<name.length;i++) h = name.charCodeAt(i) + ((h<<5)-h);
  return avatarPalette[Math.abs(h) % avatarPalette.length];
}
async function renderCobros(){
  const q = ($('searchInput').value || '').toLowerCase();
  const { data, error } = await supabaseClient.from('clientes').select('*');
  if(error){ toast('Error al cargar clientes: ' + errMsg(error)); return; }
  let clientes = data;
  const stats = clientes.map(statusOf);
  const porCobrar = r2(stats.filter(s=>s.estado==='debe').reduce((a,s)=>a+s.s,0));
  $('heroAmount').innerHTML = moneyHTML(porCobrar);
  $('heroDebtors').textContent = stats.filter(s=>s.estado==='debe').length;
  $('heroClients').textContent = clientes.length;

  clientes.sort((a,b)=> (r2(b.saldo_actual) - r2(a.saldo_actual)) || a.nombre.localeCompare(b.nombre));
  if(q) clientes = clientes.filter(c=>c.nombre.toLowerCase().includes(q));
  $('clientCount').textContent = clientes.length;
  const box = $('listaClientes'); box.innerHTML='';
  if(clientes.length===0){
    box.innerHTML = `<div class="empty"><div class="big">${q?'Sin resultados':'Aún no hay clientes'}</div>${q?'Prueba con otro nombre.':'Toca el botón naranja para agregar el primero.'}</div>`;
    return;
  }
  clientes.forEach(c=>{
    const st = statusOf(c);
    const chip = st.estado==='debe' ? '<span class="chip chip-rojo">Debe</span>'
               : st.estado==='favor'? '<span class="chip chip-verde">A favor</span>'
               : '<span class="chip chip-verde">Al día</span>';
    const waMini = c.telefono ? `<span class="wa-mini"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.6a8 8 0 0 1-11.7 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/></svg></span>` : '';
    const div = document.createElement('div');
    div.className='client-card'; div.onclick=()=>openClient(c.id);
    div.innerHTML = `
      <div class="avatar" style="background:${avatarColor(c.nombre)}">${esc(c.nombre.charAt(0).toUpperCase())}</div>
      <div class="client-info">
        <div class="client-name">${esc(c.nombre)}</div>
        <div class="client-sub">${waMini}${esc(c.telefono || 'Sin teléfono')}</div>
      </div>
      <div class="client-right">
        <div class="client-amount ${st.estado==='debe'?'debe':'dia'}">${fmt(st.s)}</div>
        ${chip}
      </div>`;
    box.appendChild(div);
  });
}

function openClientModal(client){
  editingClientId = client ? client.id : null;
  $('clientModalTitle').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  $('btnDeleteClient').classList.toggle('hidden', !client);
  $('inputNombre').value = client ? client.nombre : '';
  $('inputTelefono').value = client ? (client.telefono||'') : '';
  openModal('modalCliente');
  setTimeout(()=>{ const el=$('inputNombre'); if(el) el.focus(); }, 250);
}
async function saveClient(){
  const nombre = $('inputNombre').value.trim();
  if(!nombre) return toast('Escribe un nombre');
  const telefono = $('inputTelefono').value.trim();
  let error;
  if(editingClientId){ ({ error } = await supabaseClient.from('clientes').update({nombre,telefono}).eq('id', editingClientId)); }
  else { ({ error } = await supabaseClient.from('clientes').insert({nombre,telefono,saldo_actual:0})); }
  if(error) return toast('Error: ' + errMsg(error));
  toast(editingClientId ? 'Cliente actualizado' : 'Cliente agregado');
  closeModals(); renderCobros();
  if(currentClientId) renderClientDetail(currentClientId);
}
async function deleteClient(){
  const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', editingClientId).maybeSingle();
  if(!c) return;
  if(!confirm(`¿Eliminar a ${c.nombre} y todo su historial de ${TIENDA}?\nEsta acción no se puede deshacer.`)) return;
  const { error } = await supabaseClient.from('clientes').delete().eq('id', c.id);
  if(error) return toast('Error: ' + errMsg(error));
  closeModals(); toast('Cliente eliminado');
  if(currentClientId === c.id) goHome(); else renderCobros();
}
async function openClient(id){
  currentClientId = id;
  $('view-cobros').classList.add('hidden');
  $('view-inventario').classList.add('hidden');
  $('view-caja').classList.add('hidden');
  $('view-client').classList.remove('hidden');
  $('tabbar').style.display='none';
  $('fab').classList.add('hidden');
  $('btnSettings').classList.add('hidden');
  $('btnMetodos').classList.add('hidden');
  renderClientDetail(id);
}
async function editCurrentClient(){
  const { data } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
  openClientModal(data);
}

async function renderClientDetail(id){
  const { data: c, error } = await supabaseClient.from('clientes').select('*').eq('id', id).maybeSingle();
  if(error || !c) return goHome();
  const st = statusOf(c);
  $('detailName').textContent = c.nombre;
  $('detailPhone').textContent = c.telefono || 'Sin teléfono';
  $('detailSaldo').textContent = fmt(st.s);
  $('detailSaldo').className = 'val ' + (st.estado==='debe' ? 'debe' : 'dia');
  $('detailSaldoSub').textContent = st.estado==='debe' ? 'Pendiente de pago'
                                  : st.estado==='favor' ? 'Tiene saldo a favor'
                                  : 'Sin deuda · todo pagado ✔';
  const waBtn = $('waBtn');
  if(c.telefono){ waBtn.classList.remove('hidden'); waBtn.onclick = ()=>openWhatsApp(c); }
  else waBtn.classList.add('hidden');

  const { data: movs } = await supabaseClient.from('movimientos').select('*').eq('cliente_id', id).order('fecha', { ascending:false });
  const box = $('listaHistorial'); box.innerHTML='';
  if(!movs || movs.length===0){
    box.innerHTML = '<div class="empty" style="padding:30px"><div class="big">Sin movimientos</div>Aquí aparecerá cada fiado y cada pago.</div>';
    return;
  }
  movs.forEach(m=>{
    const esVenta = m.tipo==='VENTA';
    const f = new Date(m.fecha);
    const fecha = f.toLocaleDateString('es-PE',{day:'2-digit',month:'short'}) + ' · ' + f.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
    const div = document.createElement('div');
    div.className = 'tl-client ' + (esVenta?'venta':'pago');
    div.innerHTML = `
      <div class="tl-dot"></div>
      <div class="tl-card">
        <div class="tl-head"><span class="tl-type">${esVenta?'Fiado':'Pago'}</span><span class="tl-date">${fecha}</span></div>
        <div class="tl-desc">${esc(m.descripcion || (esVenta?'Venta fiada':'Pago recibido'))}</div>
        <div class="tl-foot">
          <span class="tl-amount">${esVenta?'+':'−'} ${fmt(m.monto)}</span>
          <span class="tl-balance">Saldo: ${fmt(m.saldo_resultante)}</span>
        </div>
      </div>`;
    box.appendChild(div);
  });
}

/* ---------- DEUDA POR PRODUCTO (FIFO) ---------- */
async function deudaDetalle(clienteId){
  const { data: movs } = await supabaseClient.from('movimientos').select('*').eq('cliente_id', clienteId).order('fecha');
  const cola = [];
  for(const m of (movs||[])){
    if(m.tipo === 'VENTA'){
      const items = (Array.isArray(m.items) && m.items.length)
        ? m.items : [{ nombre:(m.descripcion||'Venta fiada').replace(/\n/g,', '), cantidad:1, subtotal:m.monto }];
      items.forEach(it => cola.push({ nombre:it.nombre, cantidad:it.cantidad, restante:r2(it.subtotal) }));
    } else {
      let pago = r2(m.monto);
      while(pago > 0 && cola.length){
        const head = cola[0];
        if(head.restante <= pago){ pago = r2(pago - head.restante); cola.shift(); }
        else { head.restante = r2(head.restante - pago); pago = 0; }
      }
    }
  }
  return cola.filter(i => i.restante > 0);
}

/* ---------- WHATSAPP ---------- */
function waLink(phone, text){
  let d = (phone||'').replace(/\D/g,'');
  if(d.length === 9) d = '51' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
async function waMessage(c){
  const st = statusOf(c);
  let msg = `Hola ${c.nombre}, te saluda ${TIENDA} 🛒\n\n`;
  if(st.estado === 'debe'){
    msg += `Tu saldo pendiente es: *${fmt(st.s)}*\n`;
    const detalle = await deudaDetalle(c.id);
    if(detalle.length === 1) msg += `\n• ${detalle[0].cantidad} × ${detalle[0].nombre}\n`;
    else if(detalle.length > 1){ msg += '\n'; detalle.forEach(it => { msg += `• ${it.cantidad} × ${it.nombre} — ${fmt(it.restante)}\n`; }); }
    const met = await metodosPago();
    if(met.length === 1) msg += `\nPuedes pagar por *${met[0].sistema}* al *${met[0].numero}* o en la tiendita. ¡Gracias por tu preferencia! 💚`;
    else if(met.length > 1){ msg += `\nPuedes pagar por:\n`; met.forEach(m => { msg += `• ${m.sistema}: ${m.numero}\n`; }); msg += `o en la tiendita. ¡Gracias por tu preferencia! 💚`; }
    else msg += `\nPuedes pagar en la tiendita o pidiéndome el QR de cobro por este chat. ¡Gracias por tu preferencia! 💚`;
  } else if(st.estado === 'favor') msg += `Tienes un saldo a favor de *${fmt(st.s)}*. ¡Gracias por tu preferencia! 💚`;
  else msg += `Tu cuenta está al día. ¡Gracias por tu preferencia! 💚`;
  return msg;
}
async function openWhatsApp(c){
  if(!c.telefono) return toast('Guarda su número para escribirle');
  window.open(waLink(c.telefono, await waMessage(c)), '_blank');
}

/* ---------- QR de cobro (persistido en Supabase Storage) ---------- */
async function onQRFile(e){
  const f = e.target.files[0]; if(!f) return;
  try{
    const ext = (f.name.split('.').pop() || 'png').toLowerCase();
    const path = `qr/cobro-${Date.now()}.${ext}`;
    const { error } = await supabaseClient.storage.from('qr').upload(path, f, { upsert:true, cacheControl:'3600' });
    if(error) throw error;
    const { data } = supabaseClient.storage.from('qr').getPublicUrl(path);
    await setSetting('qr_url', data.publicUrl);
    renderQR();
    toast('QR guardado');
  }catch(err){ toast('Error al subir QR: ' + errMsg(err)); }
  e.target.value = '';
}
async function renderQR(){
  const url = await getSetting('qr_url', null);
  if(url){ $('qrImg').src = url; $('qrImg').classList.remove('hidden'); $('qrEmpty').classList.add('hidden'); }
  else { $('qrImg').classList.add('hidden'); $('qrEmpty').classList.remove('hidden'); }
}
async function shareQRWhatsApp(){
  const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
  if(!c) return;
  const dataUrl = await getSetting('qr_url', null);
  if(!dataUrl) return toast('Primero carga tu QR de cobro');
  const text = (await waMessage(c)) + '\n\n📲 Te mando mi QR de cobro 👇';
  try{
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'qr-giannexpress.png', { type: blob.type || 'image/png' });
    if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title: TIENDA, text }); return; }
  }catch(err){}
  if(c.telefono){ window.open(waLink(c.telefono, text), '_blank'); toast('Adjunta el QR en el chat'); }
  else toast('El cliente no tiene número guardado');
}

/* ---------- VENTA FIADA (usa productos del inventario, descuenta stock) ---------- */
async function openSale(){
  const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
  const st = statusOf(c);
  $('saleClientName').textContent = c.nombre;
  $('saleClientDebt').textContent = st.estado==='debe' ? 'Debe ' + fmt(st.s) : 'Al día';
  saleCart = {};
  await renderSaleProducts(); updateSaleTotal();
  openModal('modalVenta');
}
async function renderSaleProducts(){
  const { data: prods } = await supabaseClient.from('productos').select('*');
  const box = $('saleProductList'); box.innerHTML='';
  (prods||[]).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  (prods||[]).forEach(p=>{
    const qty = saleCart[p.id] || 0;
    const agotado = (typeof p.stock==='number' && p.stock <= 0);
    const stockInfo = (typeof p.stock==='number') ? `<div class="sale-item-stock">Stock: ${p.stock}</div>` : '';
    const div = document.createElement('div');
    div.className='sale-item'; div.style.opacity = agotado ? '.5' : '1';
    div.innerHTML = `
      <div class="sale-item-info">
        <div class="sale-item-name">${esc(p.nombre)}</div>
        <div class="sale-item-price">${fmt(p.precio)}</div>${stockInfo}
      </div>
      ${ agotado
        ? `<span class="chip chip-rojo" style="margin:0">Agotado</span>`
        : (qty > 0
          ? `<div class="stepper"><button class="step-btn" onclick="saleSub(${p.id})">−</button><span class="step-qty">${qty}</span><button class="step-btn" onclick="saleAdd(${p.id})">+</button></div>`
          : `<div class="stepper"><button class="step-btn add" onclick="saleAdd(${p.id})">+</button></div>`)
      }`;
    box.appendChild(div);
  });
}
async function saleAdd(id){
  const { data: p } = await supabaseClient.from('productos').select('*').eq('id', id).maybeSingle();
  if(!p) return;
  if(typeof p.stock==='number' && (saleCart[id]||0) >= p.stock){ toast('Sin stock disponible'); return; }
  saleCart[id]=(saleCart[id]||0)+1; renderSaleProducts(); updateSaleTotal();
}
function saleSub(id){ if(!saleCart[id])return; saleCart[id]--; if(saleCart[id]<=0)delete saleCart[id]; renderSaleProducts(); updateSaleTotal(); }
async function updateSaleTotal(){
  let total=0;
  for(const [id,qty] of Object.entries(saleCart)){
    const { data: p } = await supabaseClient.from('productos').select('precio').eq('id', id).maybeSingle();
    if(p) total += Number(p.precio) * qty;
  }
  $('saleTotal').textContent = fmt(total);
}
async function confirmSale(){
  const items = Object.entries(saleCart).filter(([id,q])=>q>0);
  if(items.length===0) return toast('Agrega al menos un producto');
  try{
    let total=0; const partes=[]; const itemsDetalle=[];
    for(const [id,qty] of items){
      const { data: p, error } = await supabaseClient.from('productos').select('*').eq('id', id).maybeSingle();
      if(error || !p) throw error || new Error('Producto no encontrado');
      const subtotal = r2(Number(p.precio) * qty);
      total += subtotal;
      partes.push(`${qty} × ${p.nombre}`);
      itemsDetalle.push({ nombre:p.nombre, cantidad:qty, precio:Number(p.precio), subtotal });
      if(typeof p.stock==='number'){
        const nuevoStock = Math.max(0, p.stock - qty);
        await supabaseClient.from('productos').update({ stock: nuevoStock }).eq('id', p.id);
      }
      await supabaseClient.from('inventario_movs').insert({ code: p.code, nombre: p.nombre, cantidad: qty, tipo: 'venta' });
    }
    total = r2(total);
    const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
    const nuevoSaldo = r2(Number(c.saldo_actual) + total);
    await supabaseClient.from('clientes').update({ saldo_actual: nuevoSaldo }).eq('id', c.id);
    await supabaseClient.from('movimientos').insert({
      cliente_id: c.id, tipo:'VENTA', monto:total, descripcion:partes.join('\n'), items:itemsDetalle, saldo_resultante:nuevoSaldo
    });
    closeModals(); toast('Fiado registrado · stock actualizado');
    renderClientDetail(currentClientId); renderCobros(); renderScanHero();
  }catch(err){ toast('Error al registrar el fiado: ' + errMsg(err)); }
}

/* ---------- PAGO ---------- */
async function openPago(){
  const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
  const st = statusOf(c);
  $('pagoSub').textContent = st.estado==='debe' ? `${c.nombre} debe ${fmt(st.s)}.` : `${c.nombre} está al día.`;
  renderQR(); renderMetodos(); openModal('modalPago');
}
async function confirmPago(){
  const monto = r2($('inputMontoPago').value);
  if(isNaN(monto) || monto<=0) return toast('Monto inválido');
  const nota = $('inputDescPago').value.trim();
  try{
    const { data: c } = await supabaseClient.from('clientes').select('*').eq('id', currentClientId).maybeSingle();
    const nuevoSaldo = r2(Number(c.saldo_actual) - monto);
    await supabaseClient.from('clientes').update({ saldo_actual: nuevoSaldo }).eq('id', c.id);
    await supabaseClient.from('movimientos').insert({
      cliente_id: c.id, tipo:'PAGO', monto, descripcion: nota || 'Pago recibido', saldo_resultante:nuevoSaldo
    });
    $('inputMontoPago').value=''; $('inputDescPago').value='';
    closeModals(); toast('Pago registrado');
    renderClientDetail(currentClientId); renderCobros();
  }catch(err){ toast('Error al registrar el pago: ' + errMsg(err)); }
}

/* ============================================================
   MÓDULO 2: INVENTARIO — ESCÁNER
   ============================================================ */
async function renderScanHero(){
  const { data: prods } = await supabaseClient.from('productos').select('stock');
  const total = (prods||[]).reduce((s,p)=>s+(p.stock||0),0);
  $('invNum').textContent = total;
  $('invSub').textContent = (prods||[]).length + ((prods||[]).length===1 ? ' producto registrado' : ' productos registrados');
}

function playAckSound(){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [329.63, 415.30, 493.88].forEach((f,i)=>{
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = f; o.type = 'sine';
      const t = now + i*0.035;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.38);
      o.start(t); o.stop(t+0.38);
    });
  }catch(e){}
}
function vibrate(){ if(navigator.vibrate) navigator.vibrate([45,25,45]); }

async function startScanner(){
  if(scannerRunning) return;
  const status = $('scanStatus');
  const placeholder = $('scanPlaceholder');
  const overlay = $('scanOverlay');

  if(location.protocol === 'file:'){
    status.textContent = 'Abre la app por HTTPS para usar la cámara';
    status.className = 'scan-status error';
    $('scanPlTxt').textContent = 'Cámara bloqueada';
    $('scanPlHint').textContent = 'Archivo local';
    overlay.style.display = 'none';
    return;
  }
  status.textContent = 'Iniciando cámara…';
  status.className = 'scan-status';
  placeholder.style.display = 'none';
  overlay.style.display = 'flex';

  try{
    if(!scanner) scanner = new Html5Qrcode("reader");
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10, qrbox: { width: 260, height: 140 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      },
      (decodedText)=>{ handleScan(decodedText); },
      ()=>{}
    );
    scannerRunning = true;
    updateToggleBtn();
    status.textContent = 'Cámara activa · apunta al código';
  }catch(err){
    status.textContent = 'No se pudo abrir la cámara. Usa el ingreso manual.';
    status.className = 'scan-status error';
    placeholder.style.display = 'flex';
    $('scanPlTxt').textContent = 'Error de cámara';
    $('scanPlHint').textContent = '';
    overlay.style.display = 'none';
  }
}
function pauseScanner(){
  if(!scanner || !scannerRunning) return;
  try{ scanner.stop().catch(()=>{}); }catch(e){}
  scannerRunning = false;
  updateToggleBtn();
  $('scanStatus').textContent = 'Cámara en pausa';
}
async function ensureScannerState(){
  if(currentTab==='inventario' && currentSubTab==='scan'){
    if(!scannerRunning) await startScanner();
  } else {
    if(scannerRunning) pauseScanner();
  }
}
function updateToggleBtn(){
  const icon = $('toggleIcon');
  const text = $('toggleText');
  if(scannerRunning){
    text.textContent = 'Pausar';
    icon.innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  }else{
    text.textContent = 'Reanudar';
    icon.innerHTML = '<path d="M7 5v14l12-7z"/>';
  }
}
$('btnToggleScanner').addEventListener('click', ()=>{ if(scannerRunning) pauseScanner(); else startScanner(); });
$('btnManual').addEventListener('click', ()=>{
  const code = $('manualCode').value.trim();
  if(!code){ toast('Escribe un código'); return; }
  handleScan(code);
  $('manualCode').value = '';
});
$('manualCode').addEventListener('keypress', e=>{ if(e.key==='Enter') $('btnManual').click(); });

$('cropCanvas').addEventListener('pointerdown', cropPointerDown);
$('cropCanvas').addEventListener('pointermove', cropPointerMove);
$('cropCanvas').addEventListener('pointerup', cropPointerUp);
$('cropCanvas').addEventListener('pointercancel', cropPointerUp);
$('cropZoom').addEventListener('input', e=>{
  cropScale = cropMinScale * (Number(e.target.value) / 100);
  clampCropOffset();
  drawCrop();
});

async function handleScan(code){
  const now = Date.now();
  if(code===lastScannedCode && now-lastScanTime<2500) return;
  lastScannedCode = code; lastScanTime = now;

  playAckSound(); vibrate();

  const frame = $('scanFrame');
  frame.classList.remove('flash'); void frame.offsetWidth;
  frame.classList.add('flash');
  setTimeout(()=>frame.classList.remove('flash'), 650);

  $('scanStatus').textContent = 'Código reconocido';
  $('scanStatus').className = 'scan-status success';

  openProductSheet(code);
}

/* ---------- SHEET producto escaneado (crear / sumar stock) ---------- */
function imgPreviewHTML(url){
  const placeholderIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';
  return url ? `<img src="${esc(url)}">` : placeholderIcon;
}
function onProductImageFile(e){
  const f = e.target.files[0];
  e.target.value = ''; // permite elegir el mismo archivo dos veces seguidas
  if(!f) return;
  openCropTool(f);
}

/* ---------- RECORTAR / CENTRAR LA FOTO ---------- */
const CROP_SIZE = 640; // resolución del recorte cuadrado que se sube
let cropImage = null;
let cropScale = 1, cropMinScale = 1, cropOffsetX = 0, cropOffsetY = 0;
let cropDragging = false, cropLastX = 0, cropLastY = 0;

function openCropTool(file){
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      cropImage = img;
      cropMinScale = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
      cropScale = cropMinScale;
      cropOffsetX = 0; cropOffsetY = 0;
      $('cropZoom').value = 100;
      drawCrop();
      openModal('modalCrop');
    };
    img.onerror = () => toast('No se pudo abrir esa imagen');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function drawCrop(){
  if(!cropImage) return;
  const canvas = $('cropCanvas');
  canvas.width = CROP_SIZE; canvas.height = CROP_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F7F4F8';
  ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
  const w = cropImage.width * cropScale;
  const h = cropImage.height * cropScale;
  const x = (CROP_SIZE - w) / 2 + cropOffsetX;
  const y = (CROP_SIZE - h) / 2 + cropOffsetY;
  ctx.drawImage(cropImage, x, y, w, h);
}

function clampCropOffset(){
  const w = cropImage.width * cropScale;
  const h = cropImage.height * cropScale;
  const maxX = Math.max(0, (w - CROP_SIZE) / 2);
  const maxY = Math.max(0, (h - CROP_SIZE) / 2);
  cropOffsetX = Math.max(-maxX, Math.min(maxX, cropOffsetX));
  cropOffsetY = Math.max(-maxY, Math.min(maxY, cropOffsetY));
}

function cropPointerDown(e){
  cropDragging = true;
  cropLastX = e.clientX; cropLastY = e.clientY;
  e.target.setPointerCapture(e.pointerId);
}
function cropPointerMove(e){
  if(!cropDragging) return;
  const canvas = $('cropCanvas');
  const ratio = CROP_SIZE / canvas.clientWidth;
  cropOffsetX += (e.clientX - cropLastX) * ratio;
  cropOffsetY += (e.clientY - cropLastY) * ratio;
  cropLastX = e.clientX; cropLastY = e.clientY;
  clampCropOffset();
  drawCrop();
}
function cropPointerUp(){ cropDragging = false; }

async function confirmCrop(){
  const canvas = $('cropCanvas');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if(!blob) return toast('No se pudo procesar la foto');
  pendingImageFile = new File([blob], 'producto.jpg', { type: 'image/jpeg' });
  const prev = $('imgPreview');
  if(prev) prev.innerHTML = `<img src="${URL.createObjectURL(blob)}">`;
  history.back(); // el popstate cierra sólo la hoja de recorte, la de producto sigue abierta
}
async function uploadProductImage(file, code){
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `productos/${code}-${Date.now()}.${ext}`;
  const { error } = await supabaseClient.storage.from('productos').upload(path, file, { upsert:true, cacheControl:'3600' });
  if(error) throw error;
  const { data } = supabaseClient.storage.from('productos').getPublicUrl(path);
  return data.publicUrl;
}

async function openProductSheet(code){
  pendingImageFile = null;
  const { data: existing } = await supabaseClient.from('productos').select('*').eq('code', code).maybeSingle();
  const content = $('sheetContent');
  if(existing){
    content.innerHTML = `
      <div class="sheet-head-prod">
        <div style="flex:1">
          <div class="code-chip"><span class="dot"></span>${esc(code)}</div>
          <div class="name">${esc(existing.nombre)}</div>
          <div class="stock-line">Stock actual: <b>${existing.stock||0}</b> unidades · ${fmt(existing.precio)}</div>
        </div>
        <button class="icon-btn" onclick="closeModals()" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="field">
        <label>Cantidad a sumar al inventario</label>
        <input type="number" id="addQty" value="1" min="1" inputmode="numeric">
      </div>
      <button class="btn btn-fiado btn-full" onclick="addStock('${esc(code)}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        Sumar al inventario
      </button>
      <div class="btn-row">
        <button class="btn btn-soft" onclick="editProductFromSheet('${esc(code)}')">Editar producto</button>
        <button class="btn btn-soft" onclick="rescan()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>
          Volver a escanear
        </button>
      </div>
    `;
    setTimeout(()=>{ const el=$('addQty'); if(el) el.focus(); }, 350);
  }else{
    content.innerHTML = `
      <div class="sheet-head-prod">
        <div style="flex:1">
          <div class="code-chip"><span class="dot"></span>Código escaneado</div>
          <div class="name">Producto nuevo</div>
          <div class="stock-line">Este código no está registrado. Ponle nombre, precio, foto y stock inicial.</div>
        </div>
        <button class="icon-btn" onclick="closeModals()" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="field">
        <label>Código de barras</label>
        <input type="text" id="newCode" value="${esc(code)}" inputmode="numeric">
        <div class="hint">¿Se leyó mal? Corrígelo aquí o vuelve a escanear.</div>
      </div>
      <div class="img-upload">
        <div class="preview" id="imgPreview">${imgPreviewHTML(null)}</div>
        <button class="btn btn-soft" type="button" onclick="document.getElementById('prodImgInput').click()">Subir foto</button>
        <input type="file" id="prodImgInput" accept="image/*" hidden onchange="onProductImageFile(event)">
      </div>
      <div class="field">
        <label>Nombre del producto</label>
        <input type="text" id="newName" placeholder="Ej: Sublime">
      </div>
      <div class="field-row">
        <div class="field"><label>Precio (S/)</label><input type="number" id="newPrice" step="0.10" min="0" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Stock inicial</label><input type="number" id="newQty" value="1" min="1" inputmode="numeric"></div>
      </div>
      <div class="field"><label>Categoría</label><input type="text" id="newCategoria" placeholder="Ej: Snacks, Bebidas…" value="General"></div>
      <button class="btn btn-fiado btn-full" onclick="createProduct()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
        Crear producto
      </button>
      <button class="btn btn-ghost btn-full" style="margin-top:9px" onclick="rescan()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>
        Volver a escanear
      </button>
    `;
    setTimeout(()=>{ const el=$('newName'); if(el) el.focus(); }, 350);
  }
  openModal('modalProducto');
}

/** Cierra la hoja de producto y reactiva la cámara para escanear otro código. */
function rescan(){
  lastScannedCode = null;
  closeModals();
  switchSubTab('scan');
}

async function createProduct(){
  const code = $('newCode').value.trim();
  const nombre = $('newName').value.trim();
  const precio = r2($('newPrice').value);
  const qty = parseInt($('newQty').value) || 1;
  const categoria = ($('newCategoria').value || '').trim() || 'General';
  if(!code) return toast('Falta el código de barras');
  if(!nombre) return toast('Ponle un nombre al producto');
  if(isNaN(precio) || precio < 0) return toast('Precio inválido');

  try{
    let imagen_url = null;
    if(pendingImageFile) imagen_url = await uploadProductImage(pendingImageFile, code);
    const { error } = await supabaseClient.from('productos').insert({ code, nombre, precio, stock:qty, categoria, imagen_url });
    if(error) throw error;
    await supabaseClient.from('inventario_movs').insert({ code, nombre, cantidad:qty, tipo:'create' });
    playAckSound();
    toast(nombre + ' agregado al inventario');
    closeModals(); renderScanHero(); renderProductList();
  }catch(err){ toast('Error al guardar: ' + errMsg(err)); }
}

async function addStock(code){
  const qty = parseInt($('addQty').value) || 1;
  const { data: p } = await supabaseClient.from('productos').select('*').eq('code', code).maybeSingle();
  if(!p) return;
  try{
    const newStock = (p.stock||0) + qty;
    await supabaseClient.from('productos').update({ stock: newStock }).eq('id', p.id);
    await supabaseClient.from('inventario_movs').insert({ code, nombre: p.nombre, cantidad:qty, tipo:'restock' });
    playAckSound();
    toast('+' + qty + ' unidades a ' + p.nombre);
    closeModals(); renderScanHero(); renderProductList();
  }catch(err){ toast('Error: ' + errMsg(err)); }
}

async function editProductFromSheet(code){
  pendingImageFile = null;
  const { data: p } = await supabaseClient.from('productos').select('*').eq('code', code).maybeSingle();
  if(!p) return;
  const content = $('sheetContent');
  content.innerHTML = `
    <div class="sheet-head-prod">
      <div style="flex:1">
        <div class="code-chip"><span class="dot"></span>${esc(code)}</div>
        <div class="name">Editar producto</div>
        <div class="stock-line">Cambia el nombre, precio, categoría o foto.</div>
      </div>
      <button class="icon-btn" onclick="closeModals()" aria-label="Cerrar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="img-upload">
      <div class="preview" id="imgPreview">${imgPreviewHTML(p.imagen_url)}</div>
      <button class="btn btn-soft" type="button" onclick="document.getElementById('prodImgInput').click()">Cambiar foto</button>
      <input type="file" id="prodImgInput" accept="image/*" hidden onchange="onProductImageFile(event)">
    </div>
    <div class="field"><label>Nombre</label><input type="text" id="editName" value="${esc(p.nombre)}"></div>
    <div class="field-row">
      <div class="field"><label>Precio (S/)</label><input type="number" id="editPrice" step="0.10" min="0" value="${p.precio}" inputmode="decimal"></div>
      <div class="field"><label>Stock</label><input type="number" id="editStock" min="0" value="${p.stock||0}" inputmode="numeric"></div>
    </div>
    <div class="field"><label>Categoría</label><input type="text" id="editCategoria" value="${esc(p.categoria||'General')}"></div>
    <button class="btn btn-fiado btn-full" onclick="saveProductEdit('${esc(code)}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
      Guardar cambios
    </button>
    <button class="btn btn-danger btn-full" style="margin-top:9px" onclick="deleteProductFromSheet('${esc(code)}')">Eliminar producto</button>
  `;
  openModal('modalProducto');
  setTimeout(()=>{ const el=$('editStock'); if(el) el.focus(); }, 350);
}

async function saveProductEdit(code){
  const nombre = $('editName').value.trim();
  const precio = r2($('editPrice').value);
  const stock = parseInt($('editStock').value);
  const categoria = ($('editCategoria').value || '').trim() || 'General';
  if(!nombre) return toast('Escribe un nombre');
  if(isNaN(precio) || precio < 0) return toast('Precio inválido');
  try{
    const { data: p } = await supabaseClient.from('productos').select('*').eq('code', code).maybeSingle();
    if(!p) return;
    const update = { nombre, precio, categoria };
    if(!isNaN(stock) && stock >= 0) update.stock = stock;
    if(pendingImageFile) update.imagen_url = await uploadProductImage(pendingImageFile, code);
    const { error } = await supabaseClient.from('productos').update(update).eq('id', p.id);
    if(error) throw error;
    closeModals(); toast('Producto actualizado');
    renderScanHero(); renderProductList();
  }catch(err){ toast('Error al guardar: ' + errMsg(err)); }
}

async function deleteProductFromSheet(code){
  const { data: p } = await supabaseClient.from('productos').select('*').eq('code', code).maybeSingle();
  if(!p) return;
  if(!confirm(`¿Eliminar "${p.nombre}"? El historial de movimientos se mantiene.`)) return;
  const { error } = await supabaseClient.from('productos').delete().eq('id', p.id);
  if(error) return toast('Error: ' + errMsg(error));
  closeModals(); toast('Producto eliminado');
  renderScanHero(); renderProductList();
}

/* ---------- LISTA DE PRODUCTOS ---------- */
async function renderProductList(){
  const { data } = await supabaseClient.from('productos').select('*');
  const prods = data || [];
  const search = ($('searchProduct').value || '').toLowerCase();
  const arr = prods
    .filter(p => p.nombre.toLowerCase().includes(search) || (p.code||'').includes(search))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre));

  const set = await invSettings();
  let totalUnits=0, lowCount=0;
  prods.forEach(p=>{ totalUnits += (p.stock||0); if((p.stock||0) <= set.minStock) lowCount++; });

  $('statTotal').textContent = prods.length;
  $('statUnits').textContent = totalUnits;
  $('statLow').textContent = lowCount;

  const list = $('productList');
  if(arr.length===0){
    list.innerHTML = `<div class="empty"><div class="big">${search ? 'Sin resultados' : 'Inventario vacío'}</div>${search ? 'Prueba con otro término' : 'Escanea el primer producto para comenzar'}</div>`;
    return;
  }
  list.innerHTML = arr.map(p=>{
    const stock = p.stock||0;
    let cls='', chipCls='chip-verde', chipTxt='Al día';
    if(stock === 0){ cls='out'; chipCls='chip-rojo'; chipTxt='Agotado'; }
    else if(stock <= set.minStock){ cls='low'; chipCls='chip-honey'; chipTxt='Reponer'; }
    const avatarInner = p.imagen_url
      ? `<img src="${esc(p.imagen_url)}">`
      : esc(p.nombre.split(' ').filter(w=>w.length).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'··');
    return `
      <div class="product ${cls}" onclick="openProductSheet('${esc(p.code)}')">
        <div class="avatar">${avatarInner}</div>
        <div class="info">
          <div class="name">${esc(p.nombre)}</div>
          <div class="code">${esc(p.code)} · ${fmt(p.precio)}</div>
          <div class="meta"><span class="chip ${chipCls}">${chipTxt}</span></div>
        </div>
        <div class="qty">${stock}</div>
        <button class="product-edit-btn" onclick="event.stopPropagation(); editProductFromSheet('${esc(p.code)}')" aria-label="Corregir stock">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/></svg>
        </button>
      </div>`;
  }).join('');
}

/* ---------- HISTORIAL DE INVENTARIO ---------- */
async function renderInvHistory(){
  const { data } = await supabaseClient.from('inventario_movs').select('*').order('fecha', { ascending:false }).limit(100);
  const hist = data || [];
  const list = $('invHistoryList');
  if(hist.length===0){
    list.innerHTML = '<div class="empty"><div class="big">Sin movimientos</div>Aquí aparecerá cada restock, creación y venta.</div>';
    return;
  }
  list.innerHTML = '<div class="timeline">' + hist.map(h=>{
    const d = new Date(h.fecha);
    const dateStr = d.toLocaleDateString('es-PE') + ' · ' + d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
    const qtyStr = h.tipo==='venta' ? '−'+h.cantidad : '+'+h.cantidad;
    return `
      <div class="tl-item ${h.tipo}">
        <div class="tl-info">
          <div class="tl-name">${esc(h.nombre)}</div>
          <div class="tl-date">${dateStr} · ${h.tipo==='venta'?'Venta fiada':(h.tipo==='create'?'Creado':'Reabastecido')}</div>
        </div>
        <div class="tl-qty">${qtyStr}</div>
      </div>`;
  }).join('') + '</div>';
}
async function resetAllInv(){
  if(!confirm('¿Borrar TODO el inventario (productos y movimientos)?\nLos clientes y cobros NO se tocan.')) return;
  if(!confirm('Esta acción no se puede deshacer. ¿Confirmas?')) return;
  await supabaseClient.from('productos').delete().not('id','is',null);
  await supabaseClient.from('inventario_movs').delete().not('id','is',null);
  toast('Inventario borrado');
  closeModals(); renderScanHero(); renderProductList(); renderInvHistory();
}

/* ============================================================
   MÓDULO 3: CAJA
   ============================================================ */
function cambiarDia(delta){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const n = new Date(cajaDate); n.setDate(n.getDate() + delta);
  if(n > hoy) return;
  cajaDate = n; renderCaja();
}
const startOfWeek = d => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const startOfMonth = d => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x; };
const sumas = movs => ({
  vendido: r2(movs.filter(m=>m.tipo==='VENTA').reduce((s,m)=>s+Number(m.monto),0)),
  cobrado: r2(movs.filter(m=>m.tipo==='PAGO').reduce((s,m)=>s+Number(m.monto),0))
});
function resumenRow(tag, rango, v, c){
  const f = Math.max(0, r2(v - c));
  return `
    <div class="resumen-tag">${tag}<small>${rango}</small></div>
    <div class="resumen-cell caramel"><small>Vendido</small>${fmt(v)}</div>
    <div class="resumen-cell verde"><small>Cobrado</small>${fmt(c)}</div>
    <div class="resumen-cell ${f===0?'verde':'honey'}"><small>Falta</small>${fmt(f)}</div>`;
}
async function renderCaja(){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const esHoy = sameDay(cajaDate, hoy);
  $('dayNext').style.visibility = esHoy ? 'hidden' : 'visible';
  $('cajaFecha').textContent = esHoy ? 'Hoy' : cajaDate.toLocaleDateString('es-PE',{weekday:'short', day:'numeric', month:'short'});
  $('cajaLabel').textContent = esHoy ? 'Vendido hoy' : 'Vendido el ' + cajaDate.toLocaleDateString('es-PE',{day:'numeric', month:'short'});

  const { data } = await supabaseClient.from('movimientos').select('*');
  const movsAll = data || [];
  const movs = movsAll.filter(m => sameDay(new Date(m.fecha), cajaDate));
  const ventas = movs.filter(m => m.tipo==='VENTA');
  const pagos  = movs.filter(m => m.tipo==='PAGO');
  const vendido = r2(ventas.reduce((s,m)=>s+Number(m.monto),0));
  const cobrado = r2(pagos.reduce((s,m)=>s+Number(m.monto),0));
  const falta   = Math.max(0, r2(vendido - cobrado));

  $('cajaVendido').innerHTML = moneyHTML(vendido);
  $('cajaMetaVentas').textContent = ventas.length;
  $('cajaMetaCobros').textContent = pagos.length;
  $('cajaCobrado').textContent = fmt(cobrado);
  const faltaEl = $('cajaFalta');
  faltaEl.textContent = fmt(falta);
  faltaEl.className = 'stat-val ' + (falta === 0 ? 'verde' : 'caramel');
  $('cajaFaltaLbl').textContent = (falta === 0 && vendido > 0) ? 'Caja completa ✔' : 'Falta p/ completar caja';

  const lun = startOfWeek(cajaDate);
  const dom = new Date(lun); dom.setDate(dom.getDate()+6); dom.setHours(23,59,59,999);
  const iniMes = startOfMonth(cajaDate);
  const finMes = new Date(iniMes.getFullYear(), iniMes.getMonth()+1, 0, 23,59,59,999);
  const inRange = m => { const d = new Date(m.fecha); return d >= lun && d <= dom; };
  const inMonth = m => { const d = new Date(m.fecha); return d >= iniMes && d <= finMes; };
  const sem = sumas(movsAll.filter(inRange));
  const mes = sumas(movsAll.filter(inMonth));
  const mShort = d => d.toLocaleDateString('es-PE',{month:'short'});
  $('rowSemana').innerHTML = resumenRow('Semana', `${lun.getDate()} – ${dom.getDate()} ${mShort(dom)}`, sem.vendido, sem.cobrado);
  $('rowMes').innerHTML    = resumenRow('Mes', `${cap(mShort(iniMes))} ${iniMes.getFullYear()}`, mes.vendido, mes.cobrado);

  /* Productos del día */
  const { data: prodsData } = await supabaseClient.from('productos').select('nombre, precio');
  const priceMap = {}; (prodsData||[]).forEach(p => priceMap[p.nombre] = Number(p.precio));
  const agg = {};
  ventas.forEach(m=>{
    let lines = [];
    if(Array.isArray(m.items) && m.items.length) lines = m.items.map(it => ({ nombre:it.nombre, cantidad:it.cantidad, subtotal:r2(it.subtotal) }));
    else (m.descripcion||'').split('\n').forEach(ln=>{
      const mt = ln.match(/^\s*(\d+)\s*×\s*(.+)$/);
      if(mt) lines.push({ nombre:mt[2].trim(), cantidad:parseInt(mt[1]), subtotal:r2(parseInt(mt[1]) * (priceMap[mt[2].trim()]||0)) });
      else if(ln.trim()) lines.push({ nombre:ln.trim(), cantidad:1, subtotal:r2(priceMap[ln.trim()]||0) });
    });
    lines.forEach(l=>{ const a = agg[l.nombre] || (agg[l.nombre] = { qty:0, monto:0 }); a.qty += l.cantidad; a.monto = r2(a.monto + l.subtotal); });
  });
  const entries = Object.entries(agg).sort((a,b)=> b[1].qty - a[1].qty || a[0].localeCompare(b[0]));
  $('cajaProdCount').textContent = entries.length;
  const boxP = $('cajaProductos'); boxP.innerHTML='';
  if(!entries.length) boxP.innerHTML = '<div class="empty" style="padding:26px"><div class="big">Nada vendido este día</div>Cuando registres fiados, aparecerán aquí con sus cantidades.</div>';
  entries.forEach(([nombre,a])=>{
    const div = document.createElement('div');
    div.className = 'prod-row';
    div.innerHTML = `<span class="prod-row-name">${esc(nombre)}</span><span class="chip chip-honey">×${a.qty}</span><span class="prod-row-monto">${fmt(a.monto)}</span>`;
    boxP.appendChild(div);
  });

  /* Flujo del día */
  const { data: clientesData } = await supabaseClient.from('clientes').select('id, nombre');
  const cMap = {}; (clientesData||[]).forEach(c => cMap[c.id] = c.nombre);
  movs.sort((a,b)=> b.fecha.localeCompare(a.fecha));
  const boxF = $('cajaFlujo'); boxF.innerHTML='';
  if(!movs.length) boxF.innerHTML = '<div class="empty" style="padding:26px"><div class="big">Sin movimientos</div>Aún no hay fiados ni cobros este día.</div>';
  movs.forEach(m=>{
    const esVenta = m.tipo==='VENTA';
    const f = new Date(m.fecha);
    const hora = f.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
    const nombre = cMap[m.cliente_id] || 'Cliente';
    const desc = (nombre + ' · ' + (m.descripcion || (esVenta?'Venta fiada':'Pago recibido'))).replace(/\n/g,', ');
    const div = document.createElement('div');
    div.className = 'tape-row';
    div.innerHTML = `
      <div class="tape-time">${hora}</div>
      <div class="tape-main">
        <span class="tape-type ${esVenta?'venta':'cobro'}">${esVenta?'Fiado':'Cobro'}</span>
        <span class="tape-desc">${esc(desc)}</span>
      </div>
      <div class="tape-monto ${esVenta?'venta':'cobro'}">${esVenta?'':'+'}${fmt(m.monto)}</div>`;
    boxF.appendChild(div);
  });
}

/* ============================================================
   AJUSTES
   ============================================================ */
async function loadInvSettings(){ $('settingMinStock').value = (await invSettings()).minStock; }

/* ============================================================
   TIEMPO REAL — refleja al instante cambios hechos desde otro
   dispositivo (web o la app), sin recargar la página.
   ============================================================ */
function refreshCurrentView(){
  if(currentClientId){ renderClientDetail(currentClientId); return; }
  if(currentTab === 'cobros'){ renderCobros(); return; }
  if(currentTab === 'inventario'){
    renderScanHero();
    if(currentSubTab === 'list') renderProductList();
    else if(currentSubTab === 'hist') renderInvHistory();
    return;
  }
  if(currentTab === 'caja'){ renderCaja(); }
}

function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const refreshDebounced = debounce(refreshCurrentView, 250);

function setupRealtime(){
  supabaseClient
    .channel('admin-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => { renderScanHero(); refreshDebounced(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_movs' }, refreshDebounced)
    .subscribe();
}

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

/* ============================================================
   INIT
   ============================================================ */
function initApp(){
  setDateLine();
  switchTab('cobros');
  renderScanHero();
  renderProductList();
  renderInvHistory();
  setupRealtime();
}
initApp();
