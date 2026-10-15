-- =============================================================================
-- 2026-10-16: supplier status markers. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: nothing is changed or removed except filling the new columns.
--   * product_variants.is_discontinued, discontinued_at: the supplier marks the
--     variant discontinued, or stops listing it.
--   * product_variants.restored_at, products.restored_at: when a supplier sync
--     brought back a row that had been removed.
-- The new code reads and writes these columns, so run this first; until it has
-- run, the new code fails on every product query. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-16_supplier_status_markers_before_deploy.sql
-- Rollback: 2026-10-16_supplier_status_markers.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'is_discontinued'),
  'ALTER TABLE `product_variants` ADD COLUMN `is_discontinued` TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'discontinued_at'),
  'ALTER TABLE `product_variants` ADD COLUMN `discontinued_at` DATETIME NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'restored_at'),
  'ALTER TABLE `product_variants` ADD COLUMN `restored_at` DATETIME NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'restored_at'),
  'ALTER TABLE `products` ADD COLUMN `restored_at` DATETIME NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- Fill the new marker from what the database already knows. Only the new
-- columns are written. The date is left empty where it isn't known.
-- -----------------------------------------------------------------------------

-- SanMar variants whose supplier status is Discontinued.
UPDATE `product_variants`
SET `is_discontinued` = 1
WHERE `supplier` = 'SANMAR'
  AND `is_discontinued` = 0
  AND JSON_VALUE(`meta`, '$.supplier_status') = 'Discontinued';

-- Variants of SAGE products that SAGE marks discontinued.
UPDATE `product_variants` v
JOIN `products` p ON p.`id` = v.`product_id`
SET v.`is_discontinued` = 1,
    v.`discontinued_at` = p.`discontinued_at`
WHERE v.`supplier` = 'SAGE'
  AND v.`is_discontinued` = 0
  AND p.`is_discontinued` = 1;


-- Result
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'product_variants' AND COLUMN_NAME IN ('is_discontinued', 'discontinued_at', 'restored_at'))
    OR (TABLE_NAME = 'products' AND COLUMN_NAME = 'restored_at'));

SELECT `supplier`, SUM(`is_discontinued`) AS discontinued_variants, COUNT(*) AS variants
FROM `product_variants`
WHERE `deleted_at` IS NULL
GROUP BY `supplier`;
