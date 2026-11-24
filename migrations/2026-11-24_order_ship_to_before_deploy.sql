-- =============================================================================
-- 2026-11-24: each order keeps its own shipping address (audit F02). RUN BEFORE
-- DEPLOYING THE CODE, and once more after it's live.
-- =============================================================================
--
-- Additive only: eight columns on `orders`, a copy of the saved address the
-- order's shipping was priced for:
--   ship_to_name, ship_to_phone, ship_to_address_line1, ship_to_address_line2,
--   ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country
-- POST order fills them, and the label, the order's pages and its emails read
-- them, so the code needs them from its first request. Editing or deleting a
-- saved address on the Account page then no longer changes an existing order.
--
-- Each existing order gets its copy from its saved address as it is now,
-- replaced unpaid orders included (a late payment can bring one back). The
-- address an older order was priced for was never stored; this is the address
-- its label would have gone to. No other column changes.
--
-- Safe to run more than once: only orders without a copy are filled. The old
-- code makes orders without one until the deploy has finished, so run this file
-- again once the new code is live. Until then those orders use their saved
-- address, as before.
--
-- Run it right before the push, and again as soon as the deploy is green. In
-- between, nobody presses Buy label: the old code still sends labels to the
-- saved address. Each run prints labelled_address_changed: orders with a label
-- whose saved address was changed after the order was made, so their copy may
-- not be where the label went (at most that many, as below). Only if the
-- second run prints more than 0, compare those orders with their labels in
-- ShipStation, and correct ship_to_* by hand where they differ:
--   SELECT o.id, o.order_number, o.ship_to_address_line1, o.ship_to_city,
--     o.ship_to_state, o.ship_to_postal_code
--   FROM orders o JOIN addresses a ON a.id = o.address_id
--   WHERE o.label_id IS NOT NULL AND o.status <> 'CANCELLED'
--     AND a.updated_at > o.created_at;
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-24_order_ship_to_before_deploy.sql
-- Rollback: 2026-11-24_order_ship_to_before_deploy.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `ship_to_name` VARCHAR(255) NULL DEFAULT NULL AFTER `address_id`,
  ADD COLUMN IF NOT EXISTS `ship_to_phone` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_name`,
  ADD COLUMN IF NOT EXISTS `ship_to_address_line1` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_phone`,
  ADD COLUMN IF NOT EXISTS `ship_to_address_line2` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_address_line1`,
  ADD COLUMN IF NOT EXISTS `ship_to_city` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_address_line2`,
  ADD COLUMN IF NOT EXISTS `ship_to_state` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_city`,
  ADD COLUMN IF NOT EXISTS `ship_to_postal_code` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_state`,
  ADD COLUMN IF NOT EXISTS `ship_to_country` VARCHAR(255) NULL DEFAULT NULL AFTER `ship_to_postal_code`;

-- Read-only. Orders about to get their copy that can still be paid or get a
-- label, and whose saved address was changed after the order was made: their
-- copy is the changed address, not the one they were priced for. At most this
-- many: Set default and deleting an address also change updated_at.
SELECT COUNT(*) AS address_changed_after_order
FROM `orders` AS o
JOIN `addresses` AS a ON a.`id` = o.`address_id`
WHERE o.`ship_to_address_line1` IS NULL
  AND o.`label_id` IS NULL
  AND o.`status` <> 'CANCELLED'
  AND o.`deleted_at` IS NULL
  AND a.`updated_at` > o.`created_at`;

-- Read-only. Orders with a label, not cancelled (cancelling voids it), whose
-- saved address was changed after the order was made: their copy may not be
-- where the label went. Copies from an earlier run count too: the old code can
-- label an order to its edited saved address after the first run copied it.
-- At most this many, for the same reason as above.
SELECT COUNT(*) AS labelled_address_changed
FROM `orders` AS o
JOIN `addresses` AS a ON a.`id` = o.`address_id`
WHERE o.`label_id` IS NOT NULL
  AND o.`status` <> 'CANCELLED'
  AND a.`updated_at` > o.`created_at`;

-- Orders without a copy. A saved address always has address_line1, so a copy
-- always has it too.
UPDATE `orders` AS o
JOIN `addresses` AS a ON a.`id` = o.`address_id`
SET
  o.`ship_to_name` = a.`name`,
  o.`ship_to_phone` = a.`phone`,
  o.`ship_to_address_line1` = a.`address_line1`,
  o.`ship_to_address_line2` = a.`address_line2`,
  o.`ship_to_city` = a.`city`,
  o.`ship_to_state` = a.`state`,
  o.`ship_to_postal_code` = a.`postal_code`,
  o.`ship_to_country` = a.`country`
WHERE o.`ship_to_address_line1` IS NULL;

SELECT
  COUNT(*) AS orders,
  SUM(`ship_to_address_line1` IS NOT NULL) AS with_ship_to,
  SUM(`ship_to_address_line1` IS NULL) AS without_ship_to
FROM `orders`;
