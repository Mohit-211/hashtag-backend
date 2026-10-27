// Re-encrypts the secret settings after SETTINGS_MASTER_KEY changes (a leaked key, someone who
// knew it left). Put the new key in .env as SETTINGS_MASTER_KEY and the old one as
// SETTINGS_MASTER_KEY_OLD, run this, remove SETTINGS_MASTER_KEY_OLD and restart the app.
// Until it restarts, the running app keeps the values it already read (see settings.load).
//
//   npm run settings:rekey

const config = require("../config/config");
const settings = require("../config/settings");
const sequelize = require("../config/central.db");
const { AppSetting } = require("../models");

const run = async () => {
  const oldMasterKey = process.env.SETTINGS_MASTER_KEY_OLD;
  if (!oldMasterKey) {
    console.error("Set SETTINGS_MASTER_KEY_OLD in .env to the previous key, and SETTINGS_MASTER_KEY to the new one.");
    return 1;
  }

  const oldKey = settings.deriveKey(oldMasterKey);
  const newKey = settings.deriveKey(config.settingsMasterKey);
  const rows = await AppSetting.findAll({ where: { is_secret: true } });

  let rekeyed = 0;
  await sequelize.transaction(async (transaction) => {
    for (const row of rows) {
      if (row.value === null) continue;
      let plain;
      try {
        plain = settings.decrypt(row.value, oldKey);
      } catch {
        settings.decrypt(row.value, newKey); // throws when neither key reads it
        console.log(`${row.key}: already on the new key`);
        continue;
      }
      await row.update({ value: settings.encrypt(plain, newKey) }, { transaction });
      rekeyed++;
    }
  });

  console.log(`Re-encrypted ${rekeyed} secret setting(s). Remove SETTINGS_MASTER_KEY_OLD from .env and restart the app.`);
  return 0;
};

run()
  .then(async (code) => {
    await sequelize.close();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(`Nothing was changed: ${error.message}`);
    await sequelize.close();
    process.exit(1);
  });
