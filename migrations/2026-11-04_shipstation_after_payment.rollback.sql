-- =============================================================================
-- Rollback of 2026-11-04_shipstation_after_payment_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first: the new code needs these columns.
-- carrier_id is copied to `_archive_20261104_order_carriers` (by order id) before
-- the columns are dropped. label_claimed_at only matters while a label is being
-- bought, so it isn't kept.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-04_shipstation_after_payment.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
CREATE TABLE `_archive_20261104_order_carriers` (
  `id` BIGINT UNSIGNED NOT NULL,
  `carrier_id` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`)
);

INSERT INTO `_archive_20261104_order_carriers` (`id`, `carrier_id`)
SELECT `id`, `carrier_id`
FROM `orders`
WHERE `carrier_id` IS NOT NULL;

-- 2. Remove.
ALTER TABLE `orders` DROP COLUMN `carrier_id`, DROP COLUMN `label_claimed_at`;

SELECT COUNT(*) AS archived_order_carriers FROM `_archive_20261104_order_carriers`;
