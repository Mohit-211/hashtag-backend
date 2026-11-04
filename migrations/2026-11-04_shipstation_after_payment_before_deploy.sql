-- =============================================================================
-- 2026-11-04: ShipStation orders and labels after payment. RUN BEFORE DEPLOYING
-- THE CODE.
-- =============================================================================
--
-- Additive only: two columns on orders.
--   carrier_id        the ShipStation carrier of the rate the customer chose
--   label_claimed_at  set while a label is being bought, so a repeated payment
--                     webhook can't buy a second one
-- Order creation and payment read them, so the code needs them from its first
-- request. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-04_shipstation_after_payment_before_deploy.sql
-- Rollback: 2026-11-04_shipstation_after_payment.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'carrier_id'),
  'ALTER TABLE `orders` ADD COLUMN `carrier_id` VARCHAR(100) NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'label_claimed_at'),
  'ALTER TABLE `orders` ADD COLUMN `label_claimed_at` DATETIME NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS orders, SUM(`carrier_id` IS NOT NULL) AS with_carrier_id FROM `orders`;
