const { Op } = require("sequelize");

const { User, AccountToken } = require("../models");
const logger = require("../config/logger");
const { userStatusTypes, accountTypes } = require("../config/types");
const { UNVERIFIED_ACCOUNT_HOURS } = require("../config/accountPolicy");
const { purgeOldTokens } = require("../services/Common/accountToken.service");

// Self-registered accounts that weren't verified within UNVERIFIED_ACCOUNT_HOURS are
// deleted (soft delete: the row keeps deleted_at, the email can be registered again).
// Admin-created accounts start as ACCEPTED and are never touched.
const deleteUnverifiedAccounts = async () => {
  const cutoff = new Date(Date.now() - UNVERIFIED_ACCOUNT_HOURS * 60 * 60 * 1000);

  const stale = await User.findAll({
    attributes: ["id"],
    where: {
      status: userStatusTypes.PENDING,
      created_at: { [Op.lt]: cutoff },
    },
    raw: true,
  });

  if (!stale.length) return 0;

  const ids = stale.map((user) => user.id);

  await User.update({ is_active: false }, { where: { id: ids } });
  await User.destroy({ where: { id: ids } });
  await AccountToken.destroy({
    where: { account_type: accountTypes.USER, account_id: ids },
  });

  logger.info(`Deleted ${ids.length} account(s) not verified within ${UNVERIFIED_ACCOUNT_HOURS} hours`);
  return ids.length;
};

const runAccountCleanup = async () => {
  try {
    await deleteUnverifiedAccounts();
    await purgeOldTokens();
  } catch (error) {
    logger.error(`Account cleanup failed: ${error.message}`);
  }
};

module.exports = {
  deleteUnverifiedAccounts,
  runAccountCleanup,
};
