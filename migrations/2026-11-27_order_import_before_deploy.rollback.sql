-- Undoes 2026-11-27_order_import_before_deploy.sql, after deploying the code from before it.
-- Imported orders have no saved address, so they're removed first (their items too), or
-- address_id couldn't be required again. Back up first.

DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.imported_at IS NOT NULL;
DELETE FROM orders WHERE imported_at IS NOT NULL;

ALTER TABLE orders
  DROP KEY orders_import_batch,
  DROP COLUMN import_batch_id,
  DROP COLUMN imported_at,
  MODIFY address_id BIGINT UNSIGNED NOT NULL;

SHOW COLUMNS FROM orders WHERE Field IN ('address_id', 'imported_at', 'import_batch_id');
