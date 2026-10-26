-- =============================================================================
-- Rollback of 2026-10-26_supplier_markups.sql
-- =============================================================================
--
-- Puts pricing_markups back as `_archive_20261026_pricing_markups` holds it:
-- rows the migration created are removed, and rows it changed get their old
-- values back. A markup changed in the admin panel since then is overwritten
-- too. The archive is kept.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-26_supplier_markups.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 1. Remove the rows the migration created.
DELETE p
FROM `pricing_markups` p
LEFT JOIN `_archive_20261026_pricing_markups` a ON a.`id` = p.`id`
WHERE a.`id` IS NULL
  AND p.`supplier` IN ('SAGE', 'SANMAR', 'SS', 'OTTOCAP');

-- 2. Restore the old values of the rows it changed.
UPDATE `pricing_markups` p
JOIN `_archive_20261026_pricing_markups` a ON a.`id` = p.`id`
SET p.`markup_percent` = a.`markup_percent`,
    p.`is_active` = a.`is_active`,
    p.`deleted_at` = a.`deleted_at`,
    p.`updated_at` = a.`updated_at`;

-- After
SELECT `id`, `supplier`, `markup_percent`, `is_active`, `deleted_at`
FROM `pricing_markups`
ORDER BY `supplier`;
