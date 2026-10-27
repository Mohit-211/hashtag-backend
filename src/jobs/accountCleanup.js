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
const { UNVERIFIED_ACCOUNT_HOURS, CLOSED_ACCOUNT_DAYS } = require("../config/accountPolicy");
const { purgeOldTokens } = require("../services/Common/accountToken.service");

const hasOrders = async (id) =>
  (await Order.count({ where: { user_id: id }, paranoid: false })) +
    (await Payment.count({ where: { user_id: id }, paranoid: false })) >
  0;

const findPhotos = (id) =>
  UserAttachment.findAll({
    attributes: ["file_name"],
    where: { user_id: id },
    paranoid: false,
    raw: true,
  });

// Profile photos uploaded at sign-up, once their rows are gone.
const removePhotos = (photos) => {
  for (const { file_name } of photos) {
    if (file_name) {
      fs.promises.unlink(path.join(dirs.images, path.basename(file_name))).catch(() => {});
    }
  }
};

// Erases one account and everything stored for it, in one transaction. Returns false (and logs)
// when it can't. An account with an order or payment is never erased.
const eraseUser = async (id) => {
  if (await hasOrders(id)) {
    logger.warn(`Account ${id} not erased: it has orders or payments`);
    return false;
  }

  const photos = await findPhotos(id);

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
    logger.error(`Account ${id} not erased: ${error.message}`);
    return false;
  }

  removePhotos(photos);
  return true;
};

// A closed account with orders or payments keeps what accounting needs (the client's decision
// of 27 Oct 2026): the email on the account, the name and phone on its profile, and the
// addresses its orders were shipped to. Everything else is erased, and clearing the password
// means it can never sign in or be restored.
const stripClosedAccount = async (id) => {
  const photos = await findPhotos(id);

  try {
    await sequelize.transaction(async (transaction) => {
      const orders = await Order.findAll({
        attributes: ["address_id"],
        where: { user_id: id },
        paranoid: false,
        raw: true,
        transaction,
      });
      const shippedTo = [...new Set(orders.map((order) => order.address_id).filter(Boolean))];

      const byUser = { where: { user_id: id }, force: true, transaction };
      await UserAttachment.destroy(byUser);
      await UserToken.destroy(byUser);
      await userLoginTiming.destroy(byUser);
      await Cart.destroy(byUser);
      await Wishlist.destroy(byUser);
      await Address.destroy({
        where: { user_id: id, ...(shippedTo.length && { id: { [Op.notIn]: shippedTo } }) },
        force: true,
        transaction,
      });
      await AccountToken.destroy({
        where: { account_type: accountTypes.USER, account_id: id },
        transaction,
      });
      await User.update({ password: null }, { where: { id }, paranoid: false, transaction });
    });
  } catch (error) {
    logger.error(`Closed account ${id} not deleted: ${error.message}`);
    return false;
  }

  removePhotos(photos);
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

// Accounts their owners closed more than CLOSED_ACCOUNT_DAYS ago (deleted_by is their own id;
// see deactivateAccount) are deleted: erased completely without orders or payments, otherwise
// stripped to what those need. A stripped account has no password, so it isn't picked again.
const deleteClosedAccounts = async () => {
  const cutoff = new Date(Date.now() - CLOSED_ACCOUNT_DAYS * 24 * 60 * 60 * 1000);

  const closed = await User.findAll({
    attributes: ["id"],
    where: {
      deleted_at: { [Op.lt]: cutoff },
      password: { [Op.ne]: null },
      [Op.and]: [sequelize.where(sequelize.col("deleted_by"), Op.eq, sequelize.col("id"))],
    },
    paranoid: false,
    raw: true,
  });

  let deleted = 0;
  for (const { id } of closed) {
    const done = (await hasOrders(id)) ? await stripClosedAccount(id) : await eraseUser(id);
    if (done) deleted++;
  }

  if (deleted) {
    logger.info(`Deleted ${deleted} account(s) closed more than ${CLOSED_ACCOUNT_DAYS} days ago`);
  }
  return deleted;
};

const runAccountCleanup = async () => {
  try {
    await deleteUnverifiedAccounts();
    await deleteClosedAccounts();
    await purgeOldTokens();
  } catch (error) {
    logger.error(`Account cleanup failed: ${error.message}`);
  }
};

module.exports = {
  deleteUnverifiedAccounts,
  deleteClosedAccounts,
  runAccountCleanup,
};
