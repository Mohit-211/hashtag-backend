-- =============================================================================
-- Rollback of 2026-11-06_customization_fixed_quantity_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first: it refuses FIXED_QUANTITY, so no new row can
-- appear while this runs.
--
-- The ENUM can only lose the value once no row uses it, and those rows can't
-- simply become FIXED: a total of 100 would become 100 per item. Each row is
-- copied, as it was, to `_archive_20261106_fixed_quantity_values`, then in one
-- statement it's taken out of use:
--
--   is_active = 0     customers can't pick it and the admin panel stops listing it.
--   deleted_at set    is_active alone isn't enough: changing the quantity of a cart
--                     line reprices it with inactive values too, and would charge
--                     the amount per item. The cart can't load a deleted row, so that
--                     change gets a 400 instead. The customer removes the line and
--                     adds the product again.
--   pricing_type      FIXED, only because the ENUM needs a value.
--   fixed_price NULL  so no row says FIXED with a total in it, if it's ever restored
--                     by hand. The amount stays in the archive.
--
-- Cart lines and orders aren't touched: they keep the totals they were priced at.
-- Product assignments stay, and neither the panel nor the shop lists them while
-- the value is deleted.
--
-- To bring the rows back after running the before_deploy file again:
--   UPDATE `customization_option_values` v
--   JOIN `_archive_20261106_fixed_quantity_values` a ON a.`id` = v.`id`
--   SET v.`pricing_type` = a.`pricing_type`, v.`fixed_price` = a.`fixed_price`,
--       v.`is_active` = a.`is_active`, v.`deleted_at` = a.`deleted_at`;
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-06_customization_fixed_quantity.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
--    CREATE TABLE ... SELECT keeps each column's exact type, so the archive's
--    pricing_type still holds FIXED_QUANTITY after step 3.
CREATE TABLE `_archive_20261106_fixed_quantity_values` (PRIMARY KEY (`id`)) AS
SELECT * FROM `customization_option_values` WHERE `pricing_type` = 'FIXED_QUANTITY';

-- 2. Take the archived rows out of use, all in one statement, so none is ever live as FIXED.
UPDATE `customization_option_values` v
JOIN `_archive_20261106_fixed_quantity_values` a ON a.`id` = v.`id`
SET v.`is_active` = 0,
    v.`deleted_at` = COALESCE(v.`deleted_at`, NOW()),
    v.`pricing_type` = 'FIXED',
    v.`fixed_price` = NULL;

-- 3. Remove the value, only when no row uses it. Must be 0.
SET @still_using = (
  SELECT COUNT(*) FROM `customization_option_values` WHERE `pricing_type` = 'FIXED_QUANTITY'
);
SELECT @still_using AS still_using;

SET @sql = IF(@still_using = 0,
  'ALTER TABLE `customization_option_values` MODIFY COLUMN `pricing_type` ENUM(''FIXED'',''TIERED'',''QUANTITY_BASED'') NOT NULL DEFAULT ''FIXED''',
  'SELECT ''pricing_type NOT changed: rows still use FIXED_QUANTITY'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- For the record. A cart line counted here can't change quantity until it's removed
-- and added again.
SELECT COUNT(*) AS archived_values FROM `_archive_20261106_fixed_quantity_values`;

SELECT COUNT(*) AS cart_lines_with_the_type
FROM `cart`
WHERE `deleted_at` IS NULL AND `pricing_snapshot` LIKE '%FIXED_QUANTITY%';
