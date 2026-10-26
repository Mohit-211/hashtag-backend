-- =============================================================================
-- 2026-10-26: supplier markups agreed with the client. RUN ANY TIME.
-- =============================================================================
--
-- Sets each supplier's markup to the client's answer (question 11):
--   SAGE 49.25%; SanMar, S&S and OttoCap 66.67%.
-- A supplier's row is updated (and switched back on) if it exists, and created
-- if it doesn't. Prices are worked out from these rows every time, so a cart
-- line takes the new rate the next time it is priced. The code doesn't need
-- this file: without a row it already uses the same rates.
--
-- The current rows are copied to `_archive_20261026_pricing_markups` first.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-26_supplier_markups.sql
-- Rollback: 2026-10-26_supplier_markups.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Before
SELECT `id`, `supplier`, `markup_percent`, `is_active`, `deleted_at`
FROM `pricing_markups`
ORDER BY `supplier`;

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
CREATE TABLE `_archive_20261026_pricing_markups` AS
SELECT * FROM `pricing_markups`;

-- 2. Update the suppliers' rows that exist, including switched-off or deleted ones.
UPDATE `pricing_markups`
SET `markup_percent` = IF(`supplier` = 'SAGE', 49.25, 66.67),
    `is_active` = 1,
    `deleted_at` = NULL,
    `updated_at` = NOW()
WHERE `supplier` IN ('SAGE', 'SANMAR', 'SS', 'OTTOCAP');

-- 3. Create the rows that don't exist.
INSERT INTO `pricing_markups` (`supplier`, `markup_percent`, `is_active`, `created_at`, `updated_at`)
SELECT s.`supplier`, s.`markup_percent`, 1, NOW(), NOW()
FROM (
  SELECT 'SAGE' AS `supplier`, 49.25 AS `markup_percent`
  UNION ALL SELECT 'SANMAR', 66.67
  UNION ALL SELECT 'SS', 66.67
  UNION ALL SELECT 'OTTOCAP', 66.67
) s
WHERE NOT EXISTS (SELECT 1 FROM `pricing_markups` p WHERE p.`supplier` = s.`supplier`);

-- After
SELECT `id`, `supplier`, `markup_percent`, `is_active`, `deleted_at`
FROM `pricing_markups`
ORDER BY `supplier`;
