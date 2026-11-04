-- =============================================================================
-- Rollback of 2026-11-04_user_graphics_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first. The table is renamed, not dropped, so the
-- customers' saved graphics are kept in `_archive_20261104_user_graphics` (the
-- files stay in storage).
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-04_user_graphics.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
RENAME TABLE `user_graphics` TO `_archive_20261104_user_graphics`;

SELECT COUNT(*) AS archived_user_graphics FROM `_archive_20261104_user_graphics`;
