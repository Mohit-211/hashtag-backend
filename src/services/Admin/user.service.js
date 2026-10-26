/** @format */

const httpStatus = require("http-status");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const { User, Profile } = require("../../models");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const validatePassword = require("../../helpers/validatePassword");
const { PASSWORD_RULES } = require("../../helpers/validatePassword");
const { sendAccountSetupEmail } = require("../Common/email.service");
const { issueToken, revokeTokens } = require("../Common/accountToken.service");
const { revokeUserTokens } = require("../Common/token.service");
const { accountTypes, accountTokenPurposes, userStatusTypes } = require("../../config/types");
const { ACCOUNT_SETUP_HOURS, links } = require("../../config/accountPolicy");

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

const getUserById = async (id) => {
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

  if (!userDoc)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to Get This User",
    );
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

// The customer gets an email link to choose their own password; no password is
// generated or emailed. Admin-created accounts count as verified.
const adminAddUser = async (reqBody) => {
  try {
    const { name, email } = reqBody;

    // ✅ Check if user already exists
    const existingUser = await User.findOne({
      where: { email: reqBody.email },
    });
    if (existingUser) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email already exists");
    }

    // ✅ Create user; the password is unusable until set from the emailed link
    const user = await User.create({
      email,
      password: bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10),
      role_id: config.USR_ROLE_ID,
      status: userStatusTypes.ACCEPTED,
    });

    // ✅ Create profile
    const userProfile = await Profile.create({
      email,
      name,
      user_id: user.id,
    });

    if (!userProfile) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create profile",
      );
    }

    // ✅ Email a "set your password" link
    const token = await issueToken({
      accountType: accountTypes.USER,
      accountId: user.id,
      purpose: accountTokenPurposes.ACCOUNT_SETUP,
      expiresAt: new Date(Date.now() + ACCOUNT_SETUP_HOURS * 60 * 60 * 1000),
    });

    await sendAccountSetupEmail(email, {
      name,
      link: links.resetPassword(token),
      hours: ACCOUNT_SETUP_HOURS,
      isAdmin: false,
    });
  } catch (error) {
    console.error("Error in adminAddUser:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
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
  setUserPassword,
};
