-- ============================================================
-- GIANNEXPRESS · Esquema de Supabase
-- ============================================================
-- Cómo usarlo:
-- 1. Entra a tu proyecto en https://supabase.com/dashboard
-- 2. Ve a "SQL Editor" -> "New query"
-- 3. Pega TODO este archivo y dale "Run"
-- 4. Al final debe listar las 6 tablas. Si no las lista, algo falló.
-- 5. Luego ve a "Storage" y confirma que se crearon los buckets
--    "productos" y "qr" (este script los crea, pero si tu plan
--    no lo permite por SQL, créalos a mano como públicos).
--
-- Correrlo dos veces es seguro: no borra ni duplica nada.
--
-- POR QUÉ LA PARTE DE STORAGE VA DENTRO DE BLOQUES CON "exception":
-- el SQL Editor corre todo el script como UNA transacción, así que
-- una sola instrucción que falle deshace TODO lo anterior, tablas
-- incluidas. Crear políticas sobre storage.objects es lo que suele
-- fallar por permisos, y se llevaba puesto el resto sin que se
-- notara: el script parecía haber corrido y no quedaba nada. Ahora
-- esa parte avisa y sigue adelante; las tablas quedan creadas.
--
-- NOTA DE SEGURIDAD:
-- El panel admin (admin/index.html) no tiene login real: se entra
-- sólo con la URL. Por eso las políticas de abajo permiten
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

-- ---------- PERMISOS DE LAS TABLAS ----------
-- El panel admin no usa login real, así que la clave pública necesita
-- poder leer y escribir. Riesgo asumido a pedido del dueño.
do $$
declare t text;
begin
  foreach t in array array['productos','clientes','movimientos','inventario_movs','metodos_pago','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
  end loop;
end $$;

-- ---------- STORAGE (tolerante a fallos) ----------
-- Si esto no se puede hacer por SQL, crea los buckets a mano en
-- Storage -> New bucket, con los nombres "productos" y "qr", públicos.
do $$
begin
  insert into storage.buckets (id, name, public) values ('productos','productos',true)
    on conflict (id) do update set public = true;
  insert into storage.buckets (id, name, public) values ('qr','qr',true)
    on conflict (id) do update set public = true;
exception when others then
  raise notice 'Buckets: no se pudieron crear por SQL (%). Créalos a mano como públicos.', sqlerrm;
end $$;

do $$
declare b text;
begin
  foreach b in array array['productos','qr'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_bucket_read');
    execute format('create policy %I on storage.objects for select using (bucket_id = %L)', b || '_bucket_read', b);
    execute format('drop policy if exists %I on storage.objects', b || '_bucket_write');
    execute format('create policy %I on storage.objects for all using (bucket_id = %L) with check (bucket_id = %L)', b || '_bucket_write', b, b);
  end loop;
exception when others then
  raise notice 'Políticas de Storage: %. Un bucket marcado como público ya permite leer las fotos.', sqlerrm;
end $$;

-- ---------- TIEMPO REAL ----------
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
exception when others then
  raise notice 'Tiempo real: %. La app igual funciona, sólo tarda en reflejar cambios de otro dispositivo.', sqlerrm;
end $$;

-- ---------- PRODUCTOS DE EJEMPLO (sólo si no hay ninguno) ----------
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


-- ---------- REFRESCAR EL CACHÉ DE LA API ----------
-- La API guarda en memoria qué tablas existen. Si se creó una tabla y el
-- caché no se refrescó, la web recibe "Could not find the table in the
-- schema cache" aunque la tabla esté ahí.
notify pgrst, 'reload schema';

-- ---------- COMPROBACIÓN ----------
-- Debe listar las 6 tablas, cada una con permiso abierto.
select
  t.table_name as tabla,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.table_name) as politicas
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in ('productos','clientes','movimientos','inventario_movs','metodos_pago','settings')
order by t.table_name;
