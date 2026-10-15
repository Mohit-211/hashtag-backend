-- =============================================================================
-- 2026-10-14 (2 of 2): remove the OTP storage. RUN AFTER DEPLOYING THE CODE.
-- =============================================================================
--
-- The OTP flows are gone. This archives, then removes, what stored them:
--   * admins.otp, admins.is_otp_valid, admins.remember_token are copied to
--     `_archive_20261014_admins_otp_cols` (by admin id), then dropped.
--   * The `otps` table is renamed to `_archive_20261014_otps`.
-- The archived values are expired one-time codes and reset tokens with no further
-- use; once you're satisfied the deploy is fine, the archive tables can be dropped.
--
-- Order: back up, deploy the new code, then run this once:
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-14_auth_links_after_deploy.sql
-- Older code still reads these columns, so don't run it before the deploy.
-- Rollback: 2026-10-14_auth_links_after_deploy.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Columns to archive. Expect 3 rows.
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins'
  AND COLUMN_NAME IN ('otp', 'is_otp_valid', 'remember_token');

-- 1. Archive (fails if the archive already exists, so it can't be overwritten).
CREATE TABLE `_archive_20261014_admins_otp_cols` (PRIMARY KEY (`id`))
SELECT `id`, `otp`, `is_otp_valid`, `remember_token`
FROM `admins`;

-- 2. Check: admins holding an OTP or token that isn't identical in the archive. Must be 0.
SET @admins_unarchived = (
  SELECT COUNT(*)
  FROM `admins` a
  LEFT JOIN `_archive_20261014_admins_otp_cols` x ON x.`id` = a.`id`
  WHERE (a.`otp` IS NOT NULL OR a.`remember_token` IS NOT NULL)
    AND NOT (    x.`id` IS NOT NULL
             AND x.`otp` <=> a.`otp`
             AND x.`is_otp_valid` <=> a.`is_otp_valid`
             AND x.`remember_token` <=> a.`remember_token`)
);
SELECT @admins_unarchived AS admins_unarchived;

-- 3. Drop the columns only when the check passed.
SET @sql = IF(@admins_unarchived = 0,
  'ALTER TABLE `admins` DROP COLUMN `otp`, DROP COLUMN `is_otp_valid`, DROP COLUMN `remember_token`',
  'SELECT ''admins: columns NOT dropped, the archive check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Rename the otps table (skipped if it doesn't exist).
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otps'),
  'RENAME TABLE `otps` TO `_archive_20261014_otps`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Result: expect no rows, then the two archive tables.
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins'
  AND COLUMN_NAME IN ('otp', 'is_otp_valid', 'remember_token');
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '_archive_20261014%';
