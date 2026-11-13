-- =============================================================================
-- Rollback of 2026-11-13_payments_go_live_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first. What's removed is copied first:
--   `_archive_20261113_order_fields`   each order's handling fee, attention note
--                                      and cancellation details, where set
--   `_archive_20261113_app_settings`   the HANDLING_FEE_RULE setting
-- Orders keep their totals, which already include any handling fee they paid.
-- The previous code adds $35 to each tumbler cart line again by itself.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-13_payments_go_live.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
CREATE TABLE `_archive_20261113_order_fields` AS
SELECT `id`, `order_number`, `handling_amount`, `attention_note`, `cancelled_at`, `cancelled_by`, `cancel_reason`
FROM `orders`
WHERE `handling_amount` <> 0
   OR `attention_note` IS NOT NULL
   OR `cancelled_at` IS NOT NULL
   OR `cancel_reason` IS NOT NULL;

CREATE TABLE `_archive_20261113_app_settings` AS
SELECT * FROM `app_settings` WHERE `key` = 'HANDLING_FEE_RULE';

ALTER TABLE `orders`
  DROP COLUMN IF EXISTS `handling_amount`,
  DROP COLUMN IF EXISTS `attention_note`,
  DROP COLUMN IF EXISTS `cancelled_at`,
  DROP COLUMN IF EXISTS `cancelled_by`,
  DROP COLUMN IF EXISTS `cancel_reason`;

DELETE FROM `app_settings` WHERE `key` = 'HANDLING_FEE_RULE';

SELECT COUNT(*) AS archived_orders FROM `_archive_20261113_order_fields`;
SELECT COUNT(*) AS archived_settings FROM `_archive_20261113_app_settings`;
