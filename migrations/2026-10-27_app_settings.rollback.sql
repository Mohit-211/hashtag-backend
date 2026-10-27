-- =============================================================================
-- Rollback of 2026-10-27_app_settings_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first, and put every setting back in .env: the
-- previous code reads only .env. The table is renamed, not dropped, so the saved
-- values stay in `_archive_20261027_app_settings` (secrets still encrypted with
-- SETTINGS_MASTER_KEY).
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_app_settings.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
RENAME TABLE `app_settings` TO `_archive_20261027_app_settings`;

SELECT COUNT(*) AS archived_settings FROM `_archive_20261027_app_settings`;
