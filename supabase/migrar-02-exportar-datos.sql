-- ============================================================
-- GIANNEXPRESS · PASO 2 de 3 — Sacar los datos del proyecto VIEJO
-- ============================================================
-- Dónde correrlo: proyecto VIEJO -> SQL Editor -> New query -> Run
--
-- No mueve nada: sólo LEE tus tablas y devuelve UNA celda de texto con
-- todos los INSERT ya escritos. Copias esa celda completa y la pegas en
-- el SQL Editor del proyecto NUEVO (ahí es el paso 3).
--
-- Si el proyecto viejo da "connection timeout", pulsa antes "Restart
-- project" y espera un par de minutos: sólo necesita responder una vez.
--
-- Los id se conservan a propósito: movimientos.cliente_id apunta a
-- clientes.id, y si los id cambiaran las deudas quedarían enlazadas al
-- cliente equivocado.
-- ============================================================

select
  '-- ==== datos exportados el ' || now()::date || ' ====' || E'\n' ||
  'begin;' || E'\n\n' ||
  coalesce((
    select string_agg(sql, E'\n' order by ord, n)
    from (
      -- 1. clientes (antes que movimientos, por la llave foránea)
      select 1 as ord, id as n, format(
        'insert into public.clientes (id, nombre, telefono, saldo_actual, created_at) overriding system value values (%L, %L, %L, %L, %L);',
        id, nombre, telefono, saldo_actual, created_at) as sql
      from public.clientes

      union all
      select 2, id, format(
        'insert into public.productos (id, code, nombre, precio, stock, categoria, imagen_url, created_at, updated_at) overriding system value values (%L, %L, %L, %L, %L, %L, %L, %L, %L);',
        id, code, nombre, precio, stock, categoria, imagen_url, created_at, updated_at)
      from public.productos

      union all
      select 3, id, format(
        'insert into public.movimientos (id, cliente_id, fecha, tipo, monto, descripcion, items, saldo_resultante) overriding system value values (%L, %L, %L, %L, %L, %L, %L, %L);',
        id, cliente_id, fecha, tipo, monto, descripcion, items, saldo_resultante)
      from public.movimientos

      union all
      select 4, id, format(
        'insert into public.inventario_movs (id, code, nombre, cantidad, tipo, fecha) overriding system value values (%L, %L, %L, %L, %L, %L);',
        id, code, nombre, cantidad, tipo, fecha)
      from public.inventario_movs

      union all
      select 5, id, format(
        'insert into public.metodos_pago (id, sistema, numero, created_at) overriding system value values (%L, %L, %L, %L);',
        id, sistema, numero, created_at)
      from public.metodos_pago

      union all
      select 6, 0, format(
        'insert into public.settings (key, value) values (%L, %L);',
        key, value)
      from public.settings
    ) t
  ), '-- (no había datos que copiar)') || E'\n\n' ||
  -- Los contadores de id quedarían en 1 y el primer producto nuevo
  -- chocaría con uno existente. Esto los deja después del último id.
  'select setval(pg_get_serial_sequence(''public.clientes'',''id''), coalesce((select max(id) from public.clientes), 1));' || E'\n' ||
  'select setval(pg_get_serial_sequence(''public.productos'',''id''), coalesce((select max(id) from public.productos), 1));' || E'\n' ||
  'select setval(pg_get_serial_sequence(''public.movimientos'',''id''), coalesce((select max(id) from public.movimientos), 1));' || E'\n' ||
  'select setval(pg_get_serial_sequence(''public.inventario_movs'',''id''), coalesce((select max(id) from public.inventario_movs), 1));' || E'\n' ||
  'select setval(pg_get_serial_sequence(''public.metodos_pago'',''id''), coalesce((select max(id) from public.metodos_pago), 1));' || E'\n\n' ||
  'commit;'
  as pegar_esto_en_el_proyecto_nuevo;
