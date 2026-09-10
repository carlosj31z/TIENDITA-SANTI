-- ============================================================
-- GIANNEXPRESS · Esquema de Supabase
-- ============================================================
-- Cómo usarlo:
-- 1. Entra a tu proyecto en https://supabase.com/dashboard
-- 2. Ve a "SQL Editor" -> "New query"
-- 3. Pega TODO este archivo y dale "Run"
-- 4. Luego ve a "Storage" y confirma que se crearon los buckets
--    "productos" y "qr" (este script los crea, pero si tu plan
--    no lo permite por SQL, créalos a mano como públicos).
--
-- NOTA DE SEGURIDAD:
-- El panel admin (admin/index.html) se protege con una sola
-- contraseña fija en el navegador, no con un usuario real de
-- Supabase Auth. Por eso las políticas de abajo permiten
-- lectura y escritura con la clave "anon" (pública) en todas
-- las tablas: es la única forma de que el panel funcione sin
-- login real. Esto significa que cualquiera con la URL y la
-- anon key (visibles en el código del sitio) podría escribir
-- directo a la base de datos sin pasar por el password del
-- panel. Es un riesgo asumido a pedido del dueño del negocio.
-- Si más adelante quieres cerrarlo del todo, avísame y migramos
-- a Supabase Auth con RLS real basada en el usuario logueado.
-- ============================================================

-- ---------- PRODUCTOS (inventario / catálogo de la tiendita) ----------
create table if not exists public.productos (
  id bigint generated always as identity primary key,
  code text unique,
  nombre text not null,
  precio numeric(10,2) not null default 0,
  stock integer not null default 0,
  categoria text not null default 'General',
  imagen_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- CLIENTES (fiado) ----------
create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  telefono text,
  saldo_actual numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- MOVIMIENTOS (ventas fiadas y pagos de clientes) ----------
create table if not exists public.movimientos (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('VENTA','PAGO')),
  monto numeric(10,2) not null,
  descripcion text,
  items jsonb,
  saldo_resultante numeric(10,2) not null
);
create index if not exists movimientos_cliente_idx on public.movimientos(cliente_id);
create index if not exists movimientos_fecha_idx on public.movimientos(fecha);

-- ---------- INVENTARIO_MOVS (historial de creación/reabastecimiento/venta) ----------
create table if not exists public.inventario_movs (
  id bigint generated always as identity primary key,
  code text,
  nombre text not null,
  cantidad integer not null,
  tipo text not null check (tipo in ('create','restock','venta')),
  fecha timestamptz not null default now()
);
create index if not exists inventario_movs_fecha_idx on public.inventario_movs(fecha);

-- ---------- METODOS_PAGO (Yape, Plin, bancos, etc.) ----------
create table if not exists public.metodos_pago (
  id bigint generated always as identity primary key,
  sistema text not null,
  numero text not null,
  created_at timestamptz not null default now()
);

-- ---------- SETTINGS (clave/valor: QR de cobro, stock mínimo, etc.) ----------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

-- updated_at automático en productos
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY — abierto para anon (ver nota de seguridad arriba)
-- ============================================================
alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.movimientos enable row level security;
alter table public.inventario_movs enable row level security;
alter table public.metodos_pago enable row level security;
alter table public.settings enable row level security;

drop policy if exists "productos_all" on public.productos;
create policy "productos_all" on public.productos for all using (true) with check (true);

drop policy if exists "clientes_all" on public.clientes;
create policy "clientes_all" on public.clientes for all using (true) with check (true);

drop policy if exists "movimientos_all" on public.movimientos;
create policy "movimientos_all" on public.movimientos for all using (true) with check (true);

drop policy if exists "inventario_movs_all" on public.inventario_movs;
create policy "inventario_movs_all" on public.inventario_movs for all using (true) with check (true);

drop policy if exists "metodos_pago_all" on public.metodos_pago;
create policy "metodos_pago_all" on public.metodos_pago for all using (true) with check (true);

drop policy if exists "settings_all" on public.settings;
create policy "settings_all" on public.settings for all using (true) with check (true);

-- ============================================================
-- STORAGE — buckets públicos para imágenes de producto y QR de cobro
-- ============================================================
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('qr', 'qr', true)
on conflict (id) do nothing;

drop policy if exists "productos_bucket_read" on storage.objects;
create policy "productos_bucket_read" on storage.objects
  for select using (bucket_id = 'productos');

drop policy if exists "productos_bucket_write" on storage.objects;
create policy "productos_bucket_write" on storage.objects
  for all using (bucket_id = 'productos') with check (bucket_id = 'productos');

drop policy if exists "qr_bucket_read" on storage.objects;
create policy "qr_bucket_read" on storage.objects
  for select using (bucket_id = 'qr');

drop policy if exists "qr_bucket_write" on storage.objects;
create policy "qr_bucket_write" on storage.objects
  for all using (bucket_id = 'qr') with check (bucket_id = 'qr');

-- ============================================================
-- SEED inicial (mismos productos de ejemplo que tenía el panel local)
-- Se salta automáticamente si ya hay productos cargados.
-- ============================================================
insert into public.productos (code, nombre, precio, stock, categoria)
select * from (values
  ('7751000000001','Soda',1.00,12,'Snacks'),
  ('7751000000002','Casino de Menta',1.30,8,'Snacks'),
  ('7751000000003','Morocha',1.30,15,'Snacks'),
  ('7751000000004','Chomp Naranja',1.30,10,'Snacks'),
  ('7751000000005','Mini Milcky',2.70,6,'Snacks'),
  ('7751000000006','Sparky',1.50,20,'Snacks'),
  ('7751000000007','Chocman',1.00,14,'Snacks'),
  ('7751000000008','Chocobum',1.00,18,'Snacks'),
  ('7751000000009','Mini Fondy',2.70,4,'Snacks'),
  ('7751000000010','Sublime',2.50,22,'Snacks'),
  ('7751000000011','Princesa',3.00,9,'Snacks')
) as v(code,nombre,precio,stock,categoria)
where not exists (select 1 from public.productos);
