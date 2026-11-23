-- =============================================================================
-- 2026-11-23: order approval (mockup proofs). RUN BEFORE DEPLOYING THE CODE.
-- =============================================================================
--
-- Additive only: four new tables for the proofs the team uploads per order and
-- the customer approves through an emailed link (Orders, Approval in the admin
-- panel). The Orders list, the Dashboard and the label step after payment read
-- them, so the code needs them from its first request. It's safe to run more
-- than once.
--
--   order_approvals        one per order: status, label hold, production lock,
--                          and the link (its key's SHA-256 and an encrypted copy)
--   order_approval_lines   what the customer approves: the order's items grouped
--                          by product, colour and design
--   order_approval_files   proofs (drafts until sent) and the customer's pictures;
--                          the files are in <storage>/approvals
--   order_approval_events  the history, append-only: every status is worked out
--                          from it
--
-- Statuses and event types are plain text checked in the code, so a new value
-- never needs an ALTER.
--
-- Run against the app database (CENTRAL_MYSQL_DB):
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-23_order_approvals_before_deploy.sql
-- Rollback: 2026-11-23_order_approvals_before_deploy.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

CREATE TABLE IF NOT EXISTS `order_approvals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `hold_state` VARCHAR(24) NOT NULL DEFAULT 'NONE',
  `token_hash` CHAR(64) NULL,
  `token_enc` TEXT NULL,
  `link_created_at` DATETIME(3) NULL,
  `link_disabled_at` DATETIME(3) NULL,
  `locked_at` DATETIME(3) NULL,
  `locked_by` INT NULL,
  `first_sent_at` DATETIME(3) NULL,
  `last_sent_at` DATETIME(3) NULL,
  `approved_at` DATETIME(3) NULL,
  `last_customer_event_id` BIGINT UNSIGNED NULL,
  `admin_seen_event_id` BIGINT UNSIGNED NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_approvals_order` (`order_id`),
  UNIQUE KEY `order_approvals_token` (`token_hash`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `order_approval_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `approval_id` BIGINT UNSIGNED NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `product_id` BIGINT UNSIGNED NULL,
  `order_item_ids` LONGTEXT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `detail` LONGTEXT NULL,
  `no_proof` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(24) NOT NULL DEFAULT 'NOT_SENT',
  `current_version` INT NOT NULL DEFAULT 0,
  `approved_version` INT NULL,
  `approved_event_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `order_approval_lines_approval` (`approval_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `order_approval_files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `approval_id` BIGINT UNSIGNED NOT NULL,
  `line_id` BIGINT UNSIGNED NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `version` INT NULL,
  `note_event_id` BIGINT UNSIGNED NULL,
  `position` INT NOT NULL DEFAULT 0,
  `stored_name` VARCHAR(100) NOT NULL,
  `preview_name` VARCHAR(100) NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime` VARCHAR(100) NOT NULL,
  `bytes` INT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `admin_id` INT NULL,
  `removed_at` DATETIME(3) NULL,
  `copied_from_file_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `order_approval_files_approval` (`approval_id`),
  KEY `order_approval_files_line` (`line_id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `order_approval_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `approval_id` BIGINT UNSIGNED NOT NULL,
  `line_id` BIGINT UNSIGNED NULL,
  `file_id` BIGINT UNSIGNED NULL,
  `type` VARCHAR(32) NOT NULL,
  `actor` VARCHAR(16) NOT NULL,
  `admin_id` INT NULL,
  `version` INT NULL,
  `target_event_id` BIGINT UNSIGNED NULL,
  `batch_id` CHAR(32) NULL,
  `body` TEXT NULL,
  `meta` LONGTEXT NULL,
  `ip` VARCHAR(64) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `order_approval_events_approval` (`approval_id`, `id`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SELECT
  (SELECT COUNT(*) FROM `order_approvals`) AS order_approvals,
  (SELECT COUNT(*) FROM `order_approval_lines`) AS order_approval_lines,
  (SELECT COUNT(*) FROM `order_approval_files`) AS order_approval_files,
  (SELECT COUNT(*) FROM `order_approval_events`) AS order_approval_events;
