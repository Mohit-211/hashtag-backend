# Database changes

Schema changes are plain SQL files in this folder, run by hand against the app database:

```sh
mysql --table -u USER -p DB_NAME < migrations/<file>.sql
```

- Back up first (`mysqldump --single-transaction --routines --triggers ...`).
- Anything removed is copied into an `_archive_<date>_*` table first, and each file has a matching `.rollback.sql`.
- Each file's header says whether to run it before or after deploying the code.

There is no `npm run migrate`. It used `sequelize.sync({ alter: true })`, which drops any column a model doesn't define, without keeping a copy.
