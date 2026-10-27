-- =============================================================================
-- 2026-10-27: gallery photos managed in the admin. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: a new table, gallery_images, for the photos and captions the
-- team manages in the admin panel (client decision Q56). The gallery endpoints
-- read it; nothing else does. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_gallery_before_deploy.sql
-- Rollback: 2026-10-27_gallery.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `gallery_images` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `file_name` VARCHAR(255) NOT NULL,
  `caption` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `gallery_images_listing` (`is_active`, `deleted_at`, `sort_order`)
);

SELECT COUNT(*) AS gallery_images FROM `gallery_images`;
