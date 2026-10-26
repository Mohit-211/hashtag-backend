const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");

const sequelize = require("../config/central.db");
const {
  User,
  Profile,
  UserAttachment,
  UserToken,
  userLoginTiming,
  AccountToken,
  Cart,
  Wishlist,
  Address,
  Order,
  Payment,
} = require("../models");
const logger = require("../config/logger");
const { dirs } = require("../config/storage");
const { userStatusTypes, accountTypes } = require("../config/types");
const { UNVERIFIED_ACCOUNT_HOURS } = require("../config/accountPolicy");
const { purgeOldTokens } = require("../services/Common/accountToken.service");

// Erases one account and everything stored for it, in one transaction. Returns false (and logs)
// when it can't: an account with an order or payment is kept, since an unverified account
// can't sign in to place one.
const eraseUser = async (id) => {
  const orders =
    (await Order.count({ where: { user_id: id }, paranoid: false })) +
    (await Payment.count({ where: { user_id: id }, paranoid: false }));
  if (orders) {
    logger.warn(`Unverified account ${id} not erased: it has orders or payments`);
    return false;
  }

  const photos = await UserAttachment.findAll({
    attributes: ["file_name"],
    where: { user_id: id },
    paranoid: false,
    raw: true,
  });

  try {
    await sequelize.transaction(async (transaction) => {
      const byUser = { where: { user_id: id }, force: true, transaction };
      await UserAttachment.destroy(byUser);
      await Profile.destroy(byUser);
      await UserToken.destroy(byUser);
      await userLoginTiming.destroy(byUser);
      await Cart.destroy(byUser);
      await Wishlist.destroy(byUser);
      await Address.destroy(byUser);
      await AccountToken.destroy({
        where: { account_type: accountTypes.USER, account_id: id },
        transaction,
      });
      await User.destroy({ where: { id }, force: true, transaction });
    });
  } catch (error) {
    logger.error(`Unverified account ${id} not erased: ${error.message}`);
    return false;
  }

  // Profile photos uploaded at sign-up.
  for (const { file_name } of photos) {
    if (file_name) {
      fs.promises.unlink(path.join(dirs.images, path.basename(file_name))).catch(() => {});
    }
  }
  return true;
};

// Self-registered accounts that weren't verified within UNVERIFIED_ACCOUNT_HOURS are erased
// for good, so the same email can register again (the client's decision of 26 Oct 2026).
// That includes the accounts the earlier version of this job only hid (soft delete).
// Admin-created accounts start as ACCEPTED and are never touched.
const deleteUnverifiedAccounts = async () => {
  const cutoff = new Date(Date.now() - UNVERIFIED_ACCOUNT_HOURS * 60 * 60 * 1000);

  const stale = await User.findAll({
    attributes: ["id"],
    where: {
      status: userStatusTypes.PENDING,
      created_at: { [Op.lt]: cutoff },
    },
    paranoid: false,
    raw: true,
  });

  let erased = 0;
  for (const { id } of stale) {
    if (await eraseUser(id)) erased++;
  }

  if (erased) {
    logger.info(`Erased ${erased} account(s) not verified within ${UNVERIFIED_ACCOUNT_HOURS} hours`);
  }
  return erased;
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
