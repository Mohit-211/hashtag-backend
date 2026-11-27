/** @format */

const httpStatus = require("http-status");
const bcrypt = require("bcryptjs");

const { User, Profile } = require("../../models");
const ApiError = require("../../utils/ApiError");
const logger = require("../../config/logger");
const validatePassword = require("../../helpers/validatePassword");
const { PASSWORD_RULES } = require("../../helpers/validatePassword");
const { sendLoginDetailsEmail } = require("../Common/email.service");
const { revokeTokens } = require("../Common/accountToken.service");
const { revokeUserTokens } = require("../Common/token.service");
const { accountTypes, accountTokenPurposes, userStatusTypes } = require("../../config/types");
const { links } = require("../../config/accountPolicy");
const {
  checkClientDetails,
  findClientByEmail,
  newCredentials,
  createClientAccount,
  signInUrl,
} = require("./clientAccounts");

const sequelize = require("../../config/central.db");

const getAllUsers = async (param, query) => {
  try {
    const { limit, sortBy, offset } = query;
    let result = "";
    let where = { is_active: true, status: "ACCEPTED" };

    result = await User.findAndCountAll({
      attributes: [
        "id",
        "email",
        "role_id",
        "status",
        
      ],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: [
            "id",
            "name",
            "user_id",
            "mobile",
            "is_active",
            "created_at",
          ],
        },
      ],
      where: where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["id", sortBy]],
    });

    if (!result)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Failed to Get All User List.",
      );
    return result;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// One client, for the panel's client page (Users › View).
const getUserById = async (id) => {
  if (!/^\d+$/.test(String(id ?? ""))) {
    throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  }

  const userDoc = await User.findOne({
    where: { id: id, is_active: true },
    include: [
      {
        model: Profile,
        as: "user_profile",
        attributes: [
          "name",
          "dialing_code",
          "mobile",
          "is_active",
          "created_at",
        ],
      },
    ],
  });

  if (!userDoc) throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  return userDoc;
};

const deleteUser = async (body) => {
  const t = await sequelize.transaction();

  try {
    if (!Array.isArray(body.user_id) || body.user_id.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user_id");
    }

    const userIds = body.user_id
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));

    if (!userIds.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No valid user IDs provided");
    }

    // 🔍 Check users exist
    const users = await User.findAll({
      where: { id: userIds },
      transaction: t,
    });

    if (!users.length) {
      throw new ApiError(httpStatus.NOT_FOUND, "No users found");
    }


    await User.update(
      {
        is_active: false,
        deleted_at: new Date(),
      },
      {
        where: { id: userIds },
        transaction: t,
      },
    );

    await t.commit();

    return {
      success: true,
      message: "Users and related user packages deleted successfully",
    };
  } catch (error) {
    await t.rollback();
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to delete users",
    );
  }
};

// Adds a client (Users › Add User) with a generated password, returned once: the panel shows it
// to copy, and "Email login details" sends it (sendLoginDetails). Nothing is emailed until then.
// Answers { client: { id, name, email, mobile }, password, sign_in_url }.
const adminAddUser = async (reqBody, { adminId = null } = {}) => {
  const { values, problems } = checkClientDetails(reqBody ?? {});
  const problem = problems.name || problems.email || problems.mobile;
  if (problem) {
    throw new ApiError(httpStatus.BAD_REQUEST, problem);
  }

  const existing = await findClientByEmail(values.email);
  if (existing) {
    const who = existing.user_profile?.name ? ` (${existing.user_profile.name})` : "";
    throw new ApiError(httpStatus.BAD_REQUEST, `${values.email} already has an account${who}.`);
  }

  const { password, hash } = await newCredentials();
  const client = await sequelize.transaction((transaction) =>
    createClientAccount(values, { hash, adminId, transaction }),
  );

  return { client, password, sign_in_url: signInUrl() };
};

// Emails a client their email and password, with a link to sign in ("Email login details" on Add
// User, the CSV import and Set password). The password must be the account's current one, the one
// the admin was just shown, so the email always works and nothing else can be sent this way.
const sendLoginDetails = async (id, reqBody, { adminId = null } = {}) => {
  const password = typeof reqBody?.password === "string" ? reqBody.password : "";
  if (!password) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Send the password to email.");
  }
  if (!/^\d+$/.test(String(id))) {
    throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  }

  const user = await User.scope("withPassword").findOne({
    where: { id, is_active: true },
    include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  }
  if (user.status !== userStatusTypes.ACCEPTED) {
    throw new ApiError(
      httpStatus.CONFLICT,
      user.status === userStatusTypes.PENDING
        ? "This client hasn't verified their email yet, so they can't sign in. Nothing was sent."
        : "This account can't sign in. Nothing was sent.",
    );
  }

  const matches = Boolean(user.password) && (await bcrypt.compare(password, user.password));
  if (!matches) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "That isn't the client's password any more, so nothing was sent. Set a new password, then email that one.",
    );
  }

  try {
    await sendLoginDetailsEmail(user.email, {
      name: user.user_profile?.name,
      password,
      link: links.signIn(),
    });
  } catch (error) {
    // 503: the website address or the mail server isn't set up (Settings).
    if (error.statusCode === httpStatus.SERVICE_UNAVAILABLE) throw error;
    throw new ApiError(httpStatus.BAD_GATEWAY, `The mail server didn't send it: ${error.message}`);
  }
  logger.info(`Admin ${adminId ?? "?"} emailed login details to user ${user.id}`);

  return { email: user.email };
};

// Sets a customer's password, for the admin to share by hand. Passwords are stored one-way,
// so it can't be shown again later. The customer is signed out everywhere, and any emailed
// reset or set-password link stops working. The account's status doesn't change: an account
// that hasn't verified its email still has to.
const setUserPassword = async (id, reqBody) => {
  const { password, confirm_password } = reqBody;

  if (!password || !confirm_password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Please Enter Required Fields : [ password, confirm_password ]",
    );
  }
  if (password !== confirm_password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "New Password and Confirm Password Must Be Equal",
    );
  }
  if (!validatePassword(password)) {
    throw new ApiError(httpStatus.BAD_REQUEST, PASSWORD_RULES);
  }

  const user = await User.findOne({ where: { id, is_active: true } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  await user.update({ password: bcrypt.hashSync(password, 10) });

  await revokeUserTokens(user.id);
  await revokeTokens({
    accountType: accountTypes.USER,
    accountId: user.id,
    purposes: [
      accountTokenPurposes.PASSWORD_RESET,
      accountTokenPurposes.ACCOUNT_SETUP,
    ],
  });
};

module.exports = {
  getAllUsers,
  getUserById,
  deleteUser,
  adminAddUser,
  sendLoginDetails,
  setUserPassword,
};
