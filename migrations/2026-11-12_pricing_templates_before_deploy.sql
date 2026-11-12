-- =============================================================================
-- 2026-11-12: pricing templates for the admin panel. RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: a new table, pricing_templates, for the named quantity pricing
-- the admins save and load into products (panel request F29). The panel asks for
-- the list whenever its product pages open, so the code needs the table from its
-- first request. It's safe to run more than once.
--
-- active_name is filled by the database: the lowercased name while the template
-- isn't deleted, NULL once it is. Its unique key keeps names unique among
-- templates that aren't deleted, even when two admins save at the same moment.
-- The table's collation compares names without case.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-12_pricing_templates_before_deploy.sql
-- Rollback: 2026-11-12_pricing_templates.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `pricing_templates` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `pricing_mode` ENUM('tiered', 'quantity_fixed') NOT NULL,
  `pricing_rows` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  `active_name` VARCHAR(100) AS (IF(`deleted_at` IS NULL, LOWER(`name`), NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pricing_templates_active_name` (`active_name`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SELECT COUNT(*) AS pricing_templates FROM `pricing_templates`;
