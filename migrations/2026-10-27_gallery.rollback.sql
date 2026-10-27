-- =============================================================================
-- Rollback of 2026-10-27_gallery_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first. The table is renamed, not dropped, so the
-- photos and captions the team entered are kept in
-- `_archive_20261027_gallery_images` (the image files stay in storage).
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_gallery.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails if the archive already exists, so it can't be overwritten.
RENAME TABLE `gallery_images` TO `_archive_20261027_gallery_images`;

SELECT COUNT(*) AS archived_gallery_images FROM `_archive_20261027_gallery_images`;
