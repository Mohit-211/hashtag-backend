-- =============================================================================
-- Rollback of 2026-11-24_order_ship_to_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first: the new code reads these columns. Each
-- order's copy is kept in `_archive_20261124_order_ship_to` (by order id)
-- before the columns are dropped. The previous code ships to, and shows, the
-- saved address again. Running the migration again later copies each saved
-- address as it is then; the archive keeps the copies as they were.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-24_order_ship_to_before_deploy.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
CREATE TABLE `_archive_20261124_order_ship_to` AS
SELECT
  `id`, `order_number`, `address_id`,
  `ship_to_name`, `ship_to_phone`, `ship_to_address_line1`, `ship_to_address_line2`,
  `ship_to_city`, `ship_to_state`, `ship_to_postal_code`, `ship_to_country`
FROM `orders`
WHERE `ship_to_address_line1` IS NOT NULL;

ALTER TABLE `orders`
  DROP COLUMN IF EXISTS `ship_to_name`,
  DROP COLUMN IF EXISTS `ship_to_phone`,
  DROP COLUMN IF EXISTS `ship_to_address_line1`,
  DROP COLUMN IF EXISTS `ship_to_address_line2`,
  DROP COLUMN IF EXISTS `ship_to_city`,
  DROP COLUMN IF EXISTS `ship_to_state`,
  DROP COLUMN IF EXISTS `ship_to_postal_code`,
  DROP COLUMN IF EXISTS `ship_to_country`;

SELECT COUNT(*) AS archived_orders FROM `_archive_20261124_order_ship_to`;
