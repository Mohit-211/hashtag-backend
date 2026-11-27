-- Run BEFORE deploying the CSV import of a client's previous orders (admin panel: a client's
-- page › Import previous orders). Undo with 2026-11-27_order_import_before_deploy.rollback.sql.
--
-- - imported_at: when the order was imported from a CSV file. Empty for every order placed on the
--   website, so it's how an imported (previous) order is told apart.
-- - import_batch_id: the import that made it (import_batches.id), so one import can be undone.
-- - address_id may be empty: an imported order has no saved address. Its ship-to, when the file
--   gives one, is in the ship_to_* columns like any order's.
--
-- Only adds columns and relaxes one: the code before this release keeps working with it.

ALTER TABLE orders
  ADD COLUMN imported_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN import_batch_id CHAR(36) NULL DEFAULT NULL,
  ADD KEY orders_import_batch (import_batch_id),
  MODIFY address_id BIGINT UNSIGNED NULL;

-- Result: imported_at and import_batch_id are there, and address_id says Null = YES.
SHOW COLUMNS FROM orders WHERE Field IN ('address_id', 'imported_at', 'import_batch_id');
