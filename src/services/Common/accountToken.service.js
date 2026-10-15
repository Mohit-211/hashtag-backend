const crypto = require("crypto");
const httpStatus = require("http-status");
const { Op } = require("sequelize");

const { AccountToken } = require("../../models");
const ApiError = require("../../utils/ApiError");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

// Creates a single-use token and returns the raw value to put in the emailed link.
// Unused tokens the account already had for the same purpose stop working.
const issueToken = async ({ accountType, accountId, purpose, expiresAt }) => {
  await AccountToken.update(
    { used_at: new Date() },
    {
      where: {
        account_type: accountType,
        account_id: accountId,
        purpose,
        used_at: null,
      },
    },
  );

  const token = crypto.randomBytes(32).toString("hex");

  await AccountToken.create({
    account_type: accountType,
    account_id: accountId,
    purpose,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  return token;
};

// True when a link for this purpose was sent within the last `seconds`
// (used to stop a form from being used to flood someone's inbox).
const wasIssuedRecently = async ({ accountType, accountId, purpose, seconds = 60 }) => {
  const recent = await AccountToken.findOne({
    attributes: ["id"],
    where: {
      account_type: accountType,
      account_id: accountId,
      purpose,
      created_at: { [Op.gt]: new Date(Date.now() - seconds * 1000) },
    },
  });

  return !!recent;
};

// Marks the token used and returns it. Throws the same error for unknown, used and
// expired tokens so the response doesn't reveal which one it was.
const consumeToken = async ({ token, accountType, purposes }) => {
  const invalid = new ApiError(
    httpStatus.BAD_REQUEST,
    "This link is invalid or has expired. Please request a new one.",
  );

  if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw invalid;
  }

  const record = await AccountToken.findOne({
    where: {
      token_hash: hashToken(token.toLowerCase()),
      account_type: accountType,
      purpose: { [Op.in]: purposes },
      used_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!record) {
    throw invalid;
  }

  // Conditional update so two simultaneous requests can't both use the token.
  const [updated] = await AccountToken.update(
    { used_at: new Date() },
    { where: { id: record.id, used_at: null } },
  );

  if (!updated) {
    throw invalid;
  }

  return record;
};

const revokeTokens = ({ accountType, accountId, purposes }) =>
  AccountToken.update(
    { used_at: new Date() },
    {
      where: {
        account_type: accountType,
        account_id: accountId,
        purpose: { [Op.in]: purposes },
        used_at: null,
      },
    },
  );

// Removes tokens that were used or expired more than a day ago.
const purgeOldTokens = () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return AccountToken.destroy({
    where: {
      [Op.or]: [
        { used_at: { [Op.lt]: cutoff } },
        { expires_at: { [Op.lt]: cutoff } },
      ],
    },
  });
};

module.exports = {
  issueToken,
  wasIssuedRecently,
  consumeToken,
  revokeTokens,
  purgeOldTokens,
};
