-- =============================================================================
-- Rollback of 2026-11-23_order_approvals_before_deploy.sql
-- =============================================================================
--
-- Deploy the previous code first. The tables are renamed, not dropped, so every
-- approval, its history and the customers' notes are kept in the
-- `_archive_20261123_order_approval*` tables (the files stay in
-- <storage>/approvals). The four renames happen together.
--
--   mysql --table -u USER -p DB_NAME < migrations/2026-11-23_order_approvals_before_deploy.rollback.sql
-- =============================================================================

SELECT DATABASE() AS connected_database, VERSION() AS server_version;

-- Fails, renaming nothing, if an archive already exists, so it can't be overwritten.
RENAME TABLE
  `order_approvals` TO `_archive_20261123_order_approvals`,
  `order_approval_lines` TO `_archive_20261123_order_approval_lines`,
  `order_approval_files` TO `_archive_20261123_order_approval_files`,
  `order_approval_events` TO `_archive_20261123_order_approval_events`;

SELECT
  (SELECT COUNT(*) FROM `_archive_20261123_order_approvals`) AS archived_order_approvals,
  (SELECT COUNT(*) FROM `_archive_20261123_order_approval_lines`) AS archived_order_approval_lines,
  (SELECT COUNT(*) FROM `_archive_20261123_order_approval_files`) AS archived_order_approval_files,
  (SELECT COUNT(*) FROM `_archive_20261123_order_approval_events`) AS archived_order_approval_events;
