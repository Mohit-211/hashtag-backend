-- =============================================================================
-- 2026-11-13: payments go-live release. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only, and safe to run more than once:
--
-- 1. Five columns on `orders`, which the new code reads and writes from its first
--    request:
--      handling_amount  the order handling fee, charged once per order (was a
--                       $35 charge inside each tumbler cart line)
--      attention_note   something the team must look at (stock that ran out
--                       after payment, a payment for a cancelled order)
--      cancelled_at, cancelled_by, cancel_reason   the admin panel's Cancel order
--
-- 2. The HANDLING_FEE_RULE setting, so the fee keeps applying as it did: $35, the
--    SAGE category "Tumblers", SAGE supplier 51093. Once per order now, not once
--    per cart line. Admins change it on the Settings page, under Order fees.
--    Skipped if the setting already exists, or if there's no SAGE "Tumblers"
--    category, in which case there is no fee until an admin sets one.
--
-- No existing row changes value. Existing orders get handling_amount 0.00, which
-- is right: their totals already include whatever they were charged.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-13_payments_go_live_before_deploy.sql
-- Rollback: 2026-11-13_payments_go_live.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `handling_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `shipping_amount`,
  ADD COLUMN IF NOT EXISTS `attention_note` VARCHAR(500) NULL DEFAULT NULL AFTER `shipment_error`,
  ADD COLUMN IF NOT EXISTS `cancelled_at` DATETIME NULL DEFAULT NULL AFTER `shipped_at`,
  ADD COLUMN IF NOT EXISTS `cancelled_by` INT NULL DEFAULT NULL AFTER `cancelled_at`,
  ADD COLUMN IF NOT EXISTS `cancel_reason` VARCHAR(255) NULL DEFAULT NULL AFTER `cancelled_by`;

INSERT INTO `app_settings` (`key`, `value`, `is_secret`)
SELECT
  'HANDLING_FEE_RULE',
  CONCAT(
    '{"amount":35,"label":"Handling fee","category_ids":[',
    GROUP_CONCAT(`id` ORDER BY `id`),
    '],"suppliers":["SAGE:51093"]}'
  ),
  0
FROM `product_categories`
WHERE `title` = 'Tumblers' AND `supplier` = 'SAGE' AND `deleted_at` IS NULL
HAVING COUNT(*) > 0
ON DUPLICATE KEY UPDATE `key` = `key`;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('handling_amount', 'attention_note', 'cancelled_at', 'cancelled_by', 'cancel_reason')
ORDER BY ORDINAL_POSITION;

SELECT `key`, `value` FROM `app_settings` WHERE `key` = 'HANDLING_FEE_RULE';
