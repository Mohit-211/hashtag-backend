-- =============================================================================
-- 2026-10-13: archive unused schema left over from the project template
-- =============================================================================
--
-- Changes
--   1. Copies these columns into archive tables, then drops them. No code reads
--      or writes them any more:
--        users        socket_id, fcm_token, reffral_id, remember_token, is_proof_verify
--        admins       socket_id
--        user_tokens  fcm_token
--      admins.remember_token is still used by the admin password reset and stays.
--   2. Renames these tables, which no model or code uses, to
--      _archive_20261013_<name>. Their rows are untouched, and a table that
--      doesn't exist is skipped:
--        packages, user_packages, videos, categories, ss_styles
--
-- Nothing is deleted. Every dropped value is kept, by row id, in an
-- _archive_20261013_* table, and 2026-10-13_archive_unused_schema.rollback.sql
-- puts everything back.
--
-- Order of operations
--   1. Deploy the code from this cleanup first. Older code still selects these
--      columns and fails once they are gone; the new code works either way.
--   2. Back up the database:
--        mysqldump --single-transaction --routines --triggers -u USER -p DB_NAME > before_20261013_cleanup.sql
--   3. Recommended: restore that backup into a scratch database and run this
--      file there first.
--   4. Run this file once, top to bottom, against the app database
--      (CENTRAL_MYSQL_DB):
--        mysql --table -u USER -p DB_NAME < migrations/2026-10-13_archive_unused_schema.sql
--   5. Don't run `npm run migrate` before step 4. It calls
--      sequelize.sync({ alter: true }), which drops every column the models no
--      longer define, without archiving it.
--
-- MySQL commits each schema change immediately, so there is no transaction to
-- roll back. Safety comes from the order instead: archive, verify, then drop.
-- STEP 3 only drops a table's columns when STEP 2 finds every non-empty value
-- already in the archive; otherwise it prints why and leaves the table alone.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 0: pre-flight checks (read-only)
-- -----------------------------------------------------------------------------

-- 0a. The database this session is connected to. Must be the app database.
SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- 0b. Columns to archive and drop. Expect 7 rows. If any are missing, the
--     script stops at 0c before anything changes.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (   (TABLE_NAME = 'users'       AND COLUMN_NAME IN ('socket_id', 'fcm_token', 'reffral_id', 'remember_token', 'is_proof_verify'))
       OR (TABLE_NAME = 'admins'      AND COLUMN_NAME = 'socket_id')
       OR (TABLE_NAME = 'user_tokens' AND COLUMN_NAME = 'fcm_token'))
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 0c. How many rows hold a value in each of those columns, for the record.
SELECT COUNT(*)                 AS users_rows,
       COUNT(socket_id)         AS socket_id_set,
       COUNT(fcm_token)         AS fcm_token_set,
       COUNT(reffral_id)        AS reffral_id_set,
       COUNT(remember_token)    AS remember_token_set,
       SUM(is_proof_verify = 1) AS is_proof_verify_true
FROM users;

SELECT COUNT(*) AS admins_rows, COUNT(socket_id) AS socket_id_set FROM admins;

SELECT COUNT(*) AS user_tokens_rows, COUNT(fcm_token) AS fcm_token_set FROM user_tokens;

-- 0d. Tables to rename, with approximate row counts. Missing ones are skipped.
SELECT TABLE_NAME, TABLE_ROWS AS approx_rows
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('packages', 'user_packages', 'videos', 'categories', 'ss_styles');

-- 0e. Foreign keys from other tables into the tables being renamed. Expect none.
--     Any that exist keep working: MySQL repoints them to the new name.
SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IN ('packages', 'user_packages', 'videos', 'categories', 'ss_styles')
  AND TABLE_NAME NOT IN ('packages', 'user_packages', 'videos', 'categories', 'ss_styles');


-- -----------------------------------------------------------------------------
-- STEP 1: copy the columns into archive tables (only adds tables)
-- -----------------------------------------------------------------------------
-- CREATE TABLE ... SELECT keeps each column's exact type and character set.
-- It fails if the archive table already exists, so a second run can't
-- overwrite an earlier archive.

CREATE TABLE `_archive_20261013_users_cols` (PRIMARY KEY (`id`))
SELECT `id`, `socket_id`, `fcm_token`, `reffral_id`, `remember_token`, `is_proof_verify`
FROM `users`;

CREATE TABLE `_archive_20261013_admins_cols` (PRIMARY KEY (`id`))
SELECT `id`, `socket_id`
FROM `admins`;

CREATE TABLE `_archive_20261013_user_tokens_cols` (PRIMARY KEY (`id`))
SELECT `id`, `fcm_token`
FROM `user_tokens`;


-- -----------------------------------------------------------------------------
-- STEP 2: check the archive (read-only)
-- -----------------------------------------------------------------------------
-- Each count is the number of live rows that hold a value in a column about to
-- be dropped but have no identical copy in the archive. Rows created after
-- STEP 1 hold no values in these columns, so they don't count.

SET @users_unarchived = (
  SELECT COUNT(*)
  FROM `users` u
  LEFT JOIN `_archive_20261013_users_cols` a ON a.`id` = u.`id`
  WHERE (   u.`socket_id` IS NOT NULL
         OR u.`fcm_token` IS NOT NULL
         OR u.`reffral_id` IS NOT NULL
         OR u.`remember_token` IS NOT NULL
         OR u.`is_proof_verify` <> 0)
    AND NOT (    a.`id` IS NOT NULL
             AND a.`socket_id`       <=> u.`socket_id`
             AND a.`fcm_token`       <=> u.`fcm_token`
             AND a.`reffral_id`      <=> u.`reffral_id`
             AND a.`remember_token`  <=> u.`remember_token`
             AND a.`is_proof_verify` <=> u.`is_proof_verify`)
);

SET @admins_unarchived = (
  SELECT COUNT(*)
  FROM `admins` u
  LEFT JOIN `_archive_20261013_admins_cols` a ON a.`id` = u.`id`
  WHERE u.`socket_id` IS NOT NULL
    AND NOT (a.`id` IS NOT NULL AND a.`socket_id` <=> u.`socket_id`)
);

SET @user_tokens_unarchived = (
  SELECT COUNT(*)
  FROM `user_tokens` t
  LEFT JOIN `_archive_20261013_user_tokens_cols` a ON a.`id` = t.`id`
  WHERE t.`fcm_token` IS NOT NULL
    AND NOT (a.`id` IS NOT NULL AND a.`fcm_token` <=> t.`fcm_token`)
);

-- A view or trigger that mentions one of these columns would break once it is
-- dropped. The app defines none, but any match blocks STEP 3.
SET @dependents = (
  SELECT COUNT(*) FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA = DATABASE()
    AND ACTION_STATEMENT REGEXP 'socket_id|fcm_token|reffral_id|remember_token|is_proof_verify'
) + (
  SELECT COUNT(*) FROM information_schema.VIEWS
  WHERE TABLE_SCHEMA = DATABASE()
    AND VIEW_DEFINITION REGEXP 'socket_id|fcm_token|reffral_id|remember_token|is_proof_verify'
);

-- All four must be 0.
SELECT @users_unarchived       AS users_unarchived,
       @admins_unarchived      AS admins_unarchived,
       @user_tokens_unarchived AS user_tokens_unarchived,
       @dependents             AS dependent_views_or_triggers;


-- -----------------------------------------------------------------------------
-- STEP 3: drop the archived columns
-- -----------------------------------------------------------------------------
-- Each ALTER runs only when its STEP 2 count and @dependents are 0. If STEP 2
-- didn't run in this session the variables are NULL, and the drop is skipped.

SET @sql = IF(@users_unarchived = 0 AND @dependents = 0,
  'ALTER TABLE `users` DROP COLUMN `socket_id`, DROP COLUMN `fcm_token`, DROP COLUMN `reffral_id`, DROP COLUMN `remember_token`, DROP COLUMN `is_proof_verify`',
  'SELECT ''users: columns NOT dropped, the STEP 2 check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@admins_unarchived = 0 AND @dependents = 0,
  'ALTER TABLE `admins` DROP COLUMN `socket_id`',
  'SELECT ''admins: column NOT dropped, the STEP 2 check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@user_tokens_unarchived = 0 AND @dependents = 0,
  'ALTER TABLE `user_tokens` DROP COLUMN `fcm_token`',
  'SELECT ''user_tokens: column NOT dropped, the STEP 2 check did not pass'' AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- STEP 4: rename the unused tables (rows unchanged; missing tables skipped)
-- -----------------------------------------------------------------------------

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'packages'),
  'RENAME TABLE `packages` TO `_archive_20261013_packages`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_packages'),
  'RENAME TABLE `user_packages` TO `_archive_20261013_user_packages`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'videos'),
  'RENAME TABLE `videos` TO `_archive_20261013_videos`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'),
  'RENAME TABLE `categories` TO `_archive_20261013_categories`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ss_styles'),
  'RENAME TABLE `ss_styles` TO `_archive_20261013_ss_styles`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- STEP 5: result (read-only)
-- -----------------------------------------------------------------------------

-- Columns still present. Expect no rows.
SELECT TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (   (TABLE_NAME = 'users'       AND COLUMN_NAME IN ('socket_id', 'fcm_token', 'reffral_id', 'remember_token', 'is_proof_verify'))
       OR (TABLE_NAME = 'admins'      AND COLUMN_NAME = 'socket_id')
       OR (TABLE_NAME = 'user_tokens' AND COLUMN_NAME = 'fcm_token'));

-- Archive tables now in place.
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME LIKE '_archive_20261013%'
ORDER BY TABLE_NAME;
