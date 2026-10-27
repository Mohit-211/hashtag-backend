// Copies the settings still in .env into the Settings page's table (app_settings), so their lines
// can be removed from .env. Values already saved on the Settings page are kept, unless
// --overwrite is passed. Values aren't printed.
//
//   npm run settings:import
//   npm run settings:import -- --overwrite

const settings = require("../config/settings");
const { SETTINGS } = require("../config/settingsCatalog");
const sequelize = require("../config/central.db");

const run = async () => {
  const overwrite = process.argv.includes("--overwrite");

  if (!(await settings.load())) {
    console.error("The app_settings table can't be read. Run migrations/2026-10-27_app_settings_before_deploy.sql first.");
    return 1;
  }

  const values = {};
  const rows = [];
  for (const setting of SETTINGS) {
    const env = process.env[setting.key];
    if (env === undefined || String(env).trim() === "") continue;

    if (settings.entry(setting.key).source === "admin" && !overwrite) {
      rows.push([setting.key, "kept: already saved on the Settings page"]);
      continue;
    }
    const result = settings.check(setting, env);
    if (result.error) {
      rows.push([setting.key, `not imported: ${result.error}`]);
      continue;
    }
    values[setting.key] = env;
    rows.push([setting.key, "imported"]);
  }

  if (Object.keys(values).length) {
    const result = await settings.save(values);
    if (result.errors) {
      console.error("Nothing was imported:", result.errors);
      return 1;
    }
  }

  const width = Math.max(0, ...rows.map(([key]) => key.length));
  for (const [key, status] of rows) console.log(`${key.padEnd(width)}  ${status}`);

  const removable = rows.filter(([, status]) => !status.startsWith("not")).map(([key]) => key);
  if (!removable.length) {
    console.log("\nNothing in .env to import.");
    return 0;
  }
  console.log(`\nThese can now be removed from .env: ${removable.join(", ")}.`);
  console.log("This removes them and keeps the old file as .env.bak:");
  console.log(`  sed -i.bak -E '/^(${removable.join("|")})=/d' .env`);
  console.log("Then restart the app.");
  return 0;
};

run()
  .then(async (code) => {
    await sequelize.close();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await sequelize.close();
    process.exit(1);
  });
