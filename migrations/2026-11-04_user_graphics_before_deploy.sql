-- =============================================================================
-- 2026-11-04: saved graphics and the per-graphic fee. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: a new table, user_graphics, for the graphics customers upload
-- (decided 4 Nov 2026). Cart, checkout and the graphics endpoints read it, so
-- the code needs it from its first request. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-04_user_graphics_before_deploy.sql
-- Rollback: 2026-11-04_user_graphics.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `user_graphics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `same_as_id` BIGINT UNSIGNED NULL,
  `first_order_id` BIGINT UNSIGNED NULL,
  `file_hash` CHAR(64) NOT NULL,
  `visual_print` BLOB NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(127) NULL,
  `file_size` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_graphics_file` (`user_id`, `file_hash`),
  KEY `user_graphics_same_as` (`same_as_id`),
  KEY `user_graphics_first_order` (`first_order_id`)
);

SELECT COUNT(*) AS user_graphics FROM `user_graphics`;
