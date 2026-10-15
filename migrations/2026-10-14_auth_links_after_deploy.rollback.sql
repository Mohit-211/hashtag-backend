-- =============================================================================
-- Rollback for 2026-10-14_auth_links_after_deploy.sql
-- =============================================================================
-- Only needed if you roll the code back to a version with the OTP flows.
-- Restores the otps table and the three admins columns with their values.
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-14_auth_links_after_deploy.rollback.sql
-- (account_tokens and admins.password_changed_at from the before-deploy script
-- can stay; older code ignores them.)
-- =============================================================================

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_archive_20261014_otps')
              AND NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otps'),
  'RENAME TABLE `_archive_20261014_otps` TO `otps`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'otp'),
  'ALTER TABLE `admins` ADD COLUMN `remember_token` VARCHAR(255) NULL, ADD COLUMN `otp` VARCHAR(255) NULL, ADD COLUMN `is_otp_valid` TINYINT(1) NULL DEFAULT 1',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Safe-update mode (on by default in MySQL Workbench) rejects joined UPDATEs.
SET SQL_SAFE_UPDATES = 0;

UPDATE `admins` a
JOIN `_archive_20261014_admins_otp_cols` x ON x.`id` = a.`id`
SET a.`otp` = x.`otp`,
    a.`is_otp_valid` = x.`is_otp_valid`,
    a.`remember_token` = x.`remember_token`;
