-- =============================================================================
-- Rollback of 2026-11-12_pricing_templates_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first. The table is renamed, not dropped, so the
-- templates the admins saved are kept in `_archive_20261112_pricing_templates`.
-- Products that loaded a template keep their pricing: loading copies the rows.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-12_pricing_templates.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
RENAME TABLE `pricing_templates` TO `_archive_20261112_pricing_templates`;

SELECT COUNT(*) AS archived_pricing_templates FROM `_archive_20261112_pricing_templates`;
