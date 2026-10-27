-- =============================================================================
-- 2026-10-27: weights set by an admin. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only. product_variants.admin_weight_lb holds a weight an admin set
-- (client decision Q31), in pounds. Supplier syncs never write it, so it outlives
-- the monthly updates; shipping uses it before the supplier's unit_weight.
-- The new code reads this column on every variant query, so run this first;
-- until it has run, the new code fails on every product query. It's safe to run
-- more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_admin_weight_before_deploy.sql
-- Rollback: 2026-10-27_admin_weight.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'admin_weight_lb'),
  'ALTER TABLE `product_variants` ADD COLUMN `admin_weight_lb` DECIMAL(10,3) NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS variants, SUM(`admin_weight_lb` IS NOT NULL) AS with_admin_weight
FROM `product_variants`;
