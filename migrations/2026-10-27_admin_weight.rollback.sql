-- =============================================================================
-- Rollback of 2026-10-27_admin_weight_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first: the new code needs this column.
-- The weights admins set are copied to `_archive_20261027_admin_weights` (by
-- variant id) before the column is dropped, so none is lost.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_admin_weight.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
CREATE TABLE `_archive_20261027_admin_weights` (
  `id` BIGINT UNSIGNED NOT NULL,
  `admin_weight_lb` DECIMAL(10,3) NOT NULL,
  PRIMARY KEY (`id`)
);

INSERT INTO `_archive_20261027_admin_weights` (`id`, `admin_weight_lb`)
SELECT `id`, `admin_weight_lb`
FROM `product_variants`
WHERE `admin_weight_lb` IS NOT NULL;

-- 2. Drop the column.
ALTER TABLE `product_variants` DROP COLUMN `admin_weight_lb`;

SELECT COUNT(*) AS archived_weights FROM `_archive_20261027_admin_weights`;
