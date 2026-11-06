-- =============================================================================
-- 2026-11-06: FIXED_QUANTITY customization pricing. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: adds FIXED_QUANTITY to customization_option_values.pricing_type.
-- Its amount goes in the existing fixed_price column. The new code saves the type
-- as soon as an admin picks it, so the column needs the value first. The code
-- that's live now never writes it, so this can run while that code is serving.
-- It's safe to run more than once.
--
-- MODIFY replaces the column's whole definition, so it only runs on the exact
-- column this file expects. Anything else is left alone and reported. On
-- production on 6 November, SHOW CREATE TABLE gave:
--   `pricing_type` enum('FIXED','TIERED','QUANTITY_BASED') NOT NULL DEFAULT 'FIXED'
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-06_customization_fixed_quantity_before_deploy.sql
-- Rollback: 2026-11-06_customization_fixed_quantity.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

SHOW CREATE TABLE `customization_option_values`;

SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
INTO @column_type, @is_nullable, @column_default
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'customization_option_values'
  AND COLUMN_NAME = 'pricing_type';

SET @sql = CASE
  WHEN @column_type = 'enum(''FIXED'',''TIERED'',''QUANTITY_BASED'',''FIXED_QUANTITY'')'
    THEN 'SELECT ''pricing_type already has FIXED_QUANTITY: nothing to do'' AS skipped'
  WHEN @column_type = 'enum(''FIXED'',''TIERED'',''QUANTITY_BASED'')'
    AND @is_nullable = 'NO'
    AND TRIM(BOTH '''' FROM @column_default) = 'FIXED'
    THEN 'ALTER TABLE `customization_option_values` MODIFY COLUMN `pricing_type` ENUM(''FIXED'',''TIERED'',''QUANTITY_BASED'',''FIXED_QUANTITY'') NOT NULL DEFAULT ''FIXED'''
  ELSE 'SELECT ''pricing_type NOT changed: it is not the column this file expects'' AS skipped'
END;
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'customization_option_values'
  AND COLUMN_NAME = 'pricing_type';
