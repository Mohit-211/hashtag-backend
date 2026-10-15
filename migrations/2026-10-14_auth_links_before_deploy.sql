-- =============================================================================
-- 2026-10-14 (1 of 2): email-link authentication. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: nothing is changed or removed.
--   * Creates `account_tokens` (hashed one-time tokens for verification,
--     password-reset and account-setup links).
--   * Adds `admins.password_changed_at` (admin sessions issued before a password
--     change stop working).
-- The new code needs both, so run this first. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-14_auth_links_before_deploy.sql
--
-- Don't use `npm run migrate` instead: it would also drop columns the models no
-- longer define, without archiving them.
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `account_tokens` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_type` ENUM('USER', 'ADMIN') NOT NULL,
  `account_id`   BIGINT UNSIGNED NOT NULL,
  `purpose`      ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_SETUP') NOT NULL,
  `token_hash`   CHAR(64) NOT NULL,
  `expires_at`   DATETIME NOT NULL,
  `used_at`      DATETIME NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_tokens_token_hash` (`token_hash`),
  KEY `account_tokens_account_type_account_id_purpose` (`account_type`, `account_id`, `purpose`)
);

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'password_changed_at'),
  'ALTER TABLE `admins` ADD COLUMN `password_changed_at` DATETIME NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- For your information (read-only)
-- -----------------------------------------------------------------------------

-- Self-registered accounts that were never verified. Within 15 minutes of the new
-- code starting, those older than 2 hours are soft-deleted (deleted_at is set and
-- the row stays; the email can register again). Check this number before deploying.
SELECT COUNT(*) AS unverified_accounts_older_than_2h,
       MIN(created_at) AS oldest
FROM users
WHERE status = 'PENDING' AND deleted_at IS NULL
  AND created_at < UTC_TIMESTAMP() - INTERVAL 2 HOUR;

-- Customer accounts whose role isn't the customer role (USR_ROLE_ID in .env).
-- Customer endpoints now always use USR_ROLE_ID, so these accounts couldn't sign in.
-- Expect one row: your customer role id. Several rows: tell your developer.
SELECT role_id, COUNT(*) AS users
FROM users
WHERE deleted_at IS NULL
GROUP BY role_id;

-- Result
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_tokens';
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'password_changed_at';
