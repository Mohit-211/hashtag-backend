-- =============================================================================
-- Rollback for 2026-10-13_archive_unused_schema.sql
-- =============================================================================
-- Renames the archived tables back and restores the dropped columns with their
-- values. The _archive_20261013_*_cols tables are left in place.
--
-- The current code works with or without these columns. Only roll back the
-- schema if you are also rolling the code back to a version that needs them.
--
-- Run once against the app database:
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-13_archive_unused_schema.rollback.sql
-- Each part checks the current state and skips itself if there is nothing to undo.
-- =============================================================================


-- 1. Rename the tables back (skipped for any that wasn't renamed).

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261013_packages'),
  'RENAME TABLE `_archive_20261013_packages` TO `packages`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261013_user_packages'),
  'RENAME TABLE `_archive_20261013_user_packages` TO `user_packages`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261013_videos'),
  'RENAME TABLE `_archive_20261013_videos` TO `videos`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261013_categories'),
  'RENAME TABLE `_archive_20261013_categories` TO `categories`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261013_ss_styles'),
  'RENAME TABLE `_archive_20261013_ss_styles` TO `ss_styles`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 2. Re-add the dropped columns (skipped where they still exist). The types are
--    the ones the old models declared; the archive tables keep the originals if
--    you need to compare (SHOW CREATE TABLE `_archive_20261013_users_cols`).

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'socket_id'),
  'ALTER TABLE `users` ADD COLUMN `socket_id` VARCHAR(150) NULL, ADD COLUMN `fcm_token` VARCHAR(255) NULL, ADD COLUMN `reffral_id` VARCHAR(255) NULL, ADD COLUMN `remember_token` VARCHAR(255) NULL, ADD COLUMN `is_proof_verify` TINYINT(1) NULL DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'socket_id'),
  'ALTER TABLE `admins` ADD COLUMN `socket_id` VARCHAR(150) NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_tokens' AND COLUMN_NAME = 'fcm_token'),
  'ALTER TABLE `user_tokens` ADD COLUMN `fcm_token` TEXT NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 3. Copy the archived values back. Rows created after the cleanup keep the
--    column defaults. Safe-update mode (on by default in MySQL Workbench)
--    rejects these joined UPDATEs, so it is turned off for this session.

SET SQL_SAFE_UPDATES = 0;

UPDATE `users` u
JOIN `_archive_20261013_users_cols` a ON a.`id` = u.`id`
SET u.`socket_id`       = a.`socket_id`,
    u.`fcm_token`       = a.`fcm_token`,
    u.`reffral_id`      = a.`reffral_id`,
    u.`remember_token`  = a.`remember_token`,
    u.`is_proof_verify` = a.`is_proof_verify`;

UPDATE `admins` u
JOIN `_archive_20261013_admins_cols` a ON a.`id` = u.`id`
SET u.`socket_id` = a.`socket_id`;

UPDATE `user_tokens` t
JOIN `_archive_20261013_user_tokens_cols` a ON a.`id` = t.`id`
SET t.`fcm_token` = a.`fcm_token`;
