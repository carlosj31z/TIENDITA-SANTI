-- ============================================================
-- GIANNEXPRESS · PASO 1 de 3 — Crear la estructura en el proyecto NUEVO
-- ============================================================
-- Dónde correrlo: proyecto NUEVO -> SQL Editor -> New query -> pegar todo -> Run
--
-- Es el mismo esquema de supabase/schema.sql pero SIN los productos de
-- ejemplo, porque aquí vas a traer tus datos reales con el paso 2.
-- Correrlo dos veces no rompe nada.
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
-- ROW LEVEL SECURITY — abierto para anon.
-- El panel admin no usa login real, así que la clave pública
-- necesita poder leer y escribir. Cualquiera con la URL y la
-- anon key (visibles en el código del sitio) puede escribir a
-- la base. Es un riesgo asumido a pedido del dueño.
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
-- REALTIME — para que el panel y la tiendita reflejen los
-- cambios al instante entre dispositivos.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['productos','clientes','movimientos','inventario_movs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
