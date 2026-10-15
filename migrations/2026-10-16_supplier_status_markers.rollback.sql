-- =============================================================================
-- Rollback of 2026-10-16_supplier_status_markers_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first: the new code needs these columns.
-- The marker values are copied to `_archive_20261016_status_markers` (by id)
-- before the columns are dropped, so nothing recorded is lost.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-16_supplier_status_markers.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
CREATE TABLE `_archive_20261016_status_markers` (
  `table_name` VARCHAR(32) NOT NULL,
  `id` BIGINT UNSIGNED NOT NULL,
  `is_discontinued` TINYINT(1) NULL,
  `discontinued_at` DATETIME NULL,
  `restored_at` DATETIME NULL,
  PRIMARY KEY (`table_name`, `id`)
);

INSERT INTO `_archive_20261016_status_markers` (`table_name`, `id`, `is_discontinued`, `discontinued_at`, `restored_at`)
SELECT 'product_variants', `id`, `is_discontinued`, `discontinued_at`, `restored_at`
FROM `product_variants`
WHERE `is_discontinued` = 1 OR `discontinued_at` IS NOT NULL OR `restored_at` IS NOT NULL;

INSERT INTO `_archive_20261016_status_markers` (`table_name`, `id`, `restored_at`)
SELECT 'products', `id`, `restored_at`
FROM `products`
WHERE `restored_at` IS NOT NULL;

-- 2. Check: marked rows missing from the archive. Must be 0.
SET @unarchived = (
  SELECT COUNT(*) FROM `product_variants` v
  LEFT JOIN `_archive_20261016_status_markers` a ON a.`table_name` = 'product_variants' AND a.`id` = v.`id`
  WHERE (v.`is_discontinued` = 1 OR v.`discontinued_at` IS NOT NULL OR v.`restored_at` IS NOT NULL) AND a.`id` IS NULL
) + (
  SELECT COUNT(*) FROM `products` p
  LEFT JOIN `_archive_20261016_status_markers` a ON a.`table_name` = 'products' AND a.`id` = p.`id`
  WHERE p.`restored_at` IS NOT NULL AND a.`id` IS NULL
);
SELECT @unarchived AS unarchived;

-- 3. Drop the columns only when the check passed.
SET @sql = IF(@unarchived = 0,
  'ALTER TABLE `product_variants` DROP COLUMN `is_discontinued`, DROP COLUMN `discontinued_at`, DROP COLUMN `restored_at`',
  'SELECT ''product_variants: columns NOT dropped, the archive check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@unarchived = 0,
  'ALTER TABLE `products` DROP COLUMN `restored_at`',
  'SELECT ''products: column NOT dropped, the archive check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
