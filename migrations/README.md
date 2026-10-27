# Database changes

Schema changes are plain SQL files in this folder, run by hand against the app database:

```sh
mysql --table -u USER -p DB_NAME < migrations/<file>.sql
```

- Back up first (`mysqldump --single-transaction --routines --triggers ...`).
- Anything removed is copied into an `_archive_<date>_*` table first, and each file has a matching `.rollback.sql`.
- Each file's header says whether to run it before or after deploying the code.

There is no `npm run migrate`. It used `sequelize.sync({ alter: true })`, which drops any column a model doesn't define, without keeping a copy.

| File | When | Production |
|---|---|---|
| `2026-10-13_archive_unused_schema.sql` | after deploying `bd36431` | run 15 Oct |
| `2026-10-14_auth_links_before_deploy.sql` | before deploying `335d27b` | run 15 Oct |
| `2026-10-14_auth_links_after_deploy.sql` | after deploying `335d27b` | run 15 Oct |
| `2026-10-16_supplier_status_markers_before_deploy.sql` | before deploying `aba0065` | run (its columns answer in production on 26 Oct) |
| `2026-10-26_supplier_markups.sql` | any time (data only) | not yet |
| `2026-10-27_admin_weight_before_deploy.sql` | before deploying `feature/client-decisions` | not yet |
| `2026-10-27_gallery_before_deploy.sql` | before deploying `feature/client-decisions` | not yet |
| `2026-10-27_app_settings_before_deploy.sql` | before deploying `feature/client-decisions` | not yet |
