/** @format */

const httpStatus = require("http-status");
const bcrypt = require("bcryptjs");

const {
  User,
  Profile,
  UserPackage,
  Package,
  Payment,
  ContactUs,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const { sendUserCredentials } = require("../Common/email.service");

const sequelize = require("../../config/central.db");
const { Op } = require("sequelize");
const { stat } = require("node:fs");

const getAllUsers = async (param, query) => {
  try {
    const { roleId } = param;
    const { limit, sortBy, offset } = query;
    let result = "";
    let where = { is_active: true, status: "ACCEPTED" };

    // Find and count users with reels count included in user_profile
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
        // {
        //   model: UserAddress,
        //   as: "user_attachments",
        //   attributes: [
        //     "id",
        //     "title",
        //     "file_type",
        //     "file_name",
        //     "file_uri",
        //     "role_id",
        //   ],
        //   order: [["id", "desc"]],
        //   limit: 1,
        // },
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

    // ✅ Generate random password and hash it
    const salt = bcrypt.genSaltSync(10);
    const password = Math.random().toString(36).substring(2, 12);

    // ✅ Create user
    const user = await User.create({
      email,
      password: bcrypt.hashSync(password, salt),
      role_id: 6,
      status: "ACCEPTED",
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

    // ✅ Send login credentials to user
    const isSend = await sendUserCredentials(email, password);
    if (!isSend) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Unable to send credentials",
      );
    }
  } catch (error) {
    console.error("Error in adminAddUser:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  deleteUser,
  adminAddUser,
};
