-- =============================================================================
-- 2026-10-27: settings managed in the admin panel. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: a new table, app_settings, for the values that move out of .env
-- into the admin panel's Settings page (API keys, mail server, shipping sender,
-- payment credentials...). Secrets are stored encrypted with a key derived from
-- SETTINGS_MASTER_KEY in .env. Until a value is saved here, the app keeps reading
-- the variable of the same name from .env, so nothing changes at deploy time.
-- Without this table the app still starts, on .env values only, and logs an
-- error. It's safe to run more than once.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-10-27_app_settings_before_deploy.sql
-- Rollback: 2026-10-27_app_settings.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NULL,
  `is_secret` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
);

SELECT COUNT(*) AS app_settings FROM `app_settings`;
