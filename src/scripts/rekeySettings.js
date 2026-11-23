// Re-encrypts the secret settings after SETTINGS_MASTER_KEY changes (a leaked key, someone who
// knew it left), and the order approval links' keys, which are encrypted with it too
// (approvalStore.js). Put the new key in .env as SETTINGS_MASTER_KEY and the old one as
// SETTINGS_MASTER_KEY_OLD, run this, remove SETTINGS_MASTER_KEY_OLD and restart the app.
// Until it restarts, the running app keeps the values it already read (see settings.load).
//
//   npm run settings:rekey

const { Op } = require("sequelize");

const config = require("../config/config");
const settings = require("../config/settings");
const sequelize = require("../config/central.db");
const { AppSetting, OrderApproval } = require("../models");
const { TOKEN_KEY_LABEL } = require("../services/Common/approvalStore");

// Re-encrypts one value with the new key. Returns the new text, or null when it's already on the
// new key; throws when neither key reads it.
const rekey = (text, oldKey, newKey) => {
  let plain;
  try {
    plain = settings.decrypt(text, oldKey);
  } catch {
    settings.decrypt(text, newKey); // throws when neither key reads it
    return null;
  }
  return settings.encrypt(plain, newKey);
};

// The approvals whose link has a key, or [] before their table exists (its migration not run yet).
const approvalLinks = async (transaction) => {
  try {
    return await OrderApproval.findAll({
      attributes: ["id", "token_enc"],
      where: { token_enc: { [Op.ne]: null } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  } catch (error) {
    if (error.original?.code !== "ER_NO_SUCH_TABLE") throw error;
    console.log("order_approvals doesn't exist yet: no approval links to re-encrypt.");
    return [];
  }
};

const run = async () => {
  const oldMasterKey = process.env.SETTINGS_MASTER_KEY_OLD;
  if (!oldMasterKey) {
    console.error("Set SETTINGS_MASTER_KEY_OLD in .env to the previous key, and SETTINGS_MASTER_KEY to the new one.");
    return 1;
  }

  const oldKey = settings.deriveKey(oldMasterKey);
  const newKey = settings.deriveKey(config.settingsMasterKey);
  const oldLinkKey = settings.deriveKey(oldMasterKey, TOKEN_KEY_LABEL);
  const newLinkKey = settings.deriveKey(config.settingsMasterKey, TOKEN_KEY_LABEL);
  const rows = await AppSetting.findAll({ where: { is_secret: true } });

  let rekeyed = 0;
  let links = 0;
  await sequelize.transaction(async (transaction) => {
    for (const row of rows) {
      if (row.value === null) continue;
      const value = rekey(row.value, oldKey, newKey);
      if (value === null) {
        console.log(`${row.key}: already on the new key`);
        continue;
      }
      await row.update({ value }, { transaction });
      rekeyed++;
    }

    for (const approval of await approvalLinks(transaction)) {
      const value = rekey(approval.token_enc, oldLinkKey, newLinkKey);
      if (value === null) continue;
      await approval.update({ token_enc: value }, { transaction });
      links++;
    }
  });

  console.log(
    `Re-encrypted ${rekeyed} secret setting(s) and ${links} approval link(s). Remove SETTINGS_MASTER_KEY_OLD from .env and restart the app.`,
  );
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
