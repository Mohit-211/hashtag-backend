
const bcrypt = require("bcryptjs");
const httpStatus = require("http-status");
const randomize = require("randomatic");
const jwt = require("jsonwebtoken");
const { Admin, Role } = require("../../models");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const { emailService } = require("../Common");
const { otpTypes } = require("../../config/types");
const { sendAdminCredentials } = require("../Common/email.service");

const createAdminUser = async (userBody) => {
	try {
		const password = Math.random().toString(36).substring(2, 12);
		let salt = bcrypt.genSaltSync(10);
		const userObj = {
			name: userBody.name,
			email: userBody.email,
			password: bcrypt.hashSync(password, salt),
			role_id: userBody.role_id,
			department_id: userBody.department_id,
		};
		const user = await Admin.create(userObj);

		if (!user) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new admin",
			);
		}
		let result = await Admin.findOne({
			attributes: ["id", "name", "email", "role_id", "department_id"],
			include: [
				{
					model: Role,
					as: "admin_role",
					attributes: ["id", "name", "abbreviation"],
				},
			],

			where: { id: user?.id, is_active: true },
		});

		let isSend = await sendAdminCredentials(userBody.email, password);
		if (!isSend) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Unable to send Credentials to This Email",
			);
		}
		if (!result)
			throw new ApiError(httpStatus.BAD_REQUEST, "Failed to Get Profile.");
		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const loginAdminUser = async (reqBody) => {
	try {
		const user = await Admin.findOne({
			where: { email: reqBody.email, is_active: true },
		});

		if (!user) {
			throw new ApiError(httpStatus.BAD_REQUEST, "User not found.");
		}

		const validPass = await bcrypt.compare(reqBody.password, user.password);
		if (!validPass) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Invalid password. Please try again.",
			);
		}

		const token = jwt.sign(
			{
				id: user.id,
				role_id: user.role_id,
				department_id: user.department_id,
				is_backlisted: false,
			},
			Buffer.from(config.jwt.secret, "hex"),
			{ algorithm: "HS256", expiresIn: "5d" },
		);
		const response = {
			id: user.id,
			name: user.name,
			email: user.email,
			role_id: user.role_id,
			token: token,
		};
		return response;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const resetAdminPassword = async (reqBody) => {
	try {
		const { old_password, confirm_password, user } = reqBody;

		const userDoc = await Admin.findByPk(user.id);

		if (!userDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "User Not Found.");
		}

		const validPass = await bcrypt.compare(old_password, userDoc?.password);
		if (!validPass) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password.");
		}

		let salt = bcrypt.genSaltSync(10);
		const userObj = {
			password: bcrypt.hashSync(confirm_password, salt),
		};

		const isUserPasswordUpdate = await Admin.update(userObj, {
			where: { id: user?.id },
		});

		if (!isUserPasswordUpdate) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to Change Password.",
			);
		}
		return "Password Changed Successfully.";
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const sendOTP = async (email) => {
	try {
		const user = await Admin.findOne({
			where: { email: email, is_active: true },
		});
		if (!user) {
			throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email");
		}
		const generatedOTP = randomize("0", 6);
		await emailService.sendForgotPasswordOTP(email, generatedOTP);

		await Admin.update(
			{ otp: generatedOTP, is_otp_valid: true },
			{ where: { email: user.email } },
		);
		return true;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const verifyOTP = async (email, otp, otp_type) => {
	try {
		if (!email || !otp) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Please Enter Required Fields : [email, otp]",
			);
		}

		const user = await Admin.findOne({ where: { email: email } });
		if (!user) {
			throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email");
		}

		if (otp !== user.otp || user.is_otp_valid === false) {
			throw new ApiError(httpStatus.NOT_FOUND, "Invalid OTP Entered");
		}
		let token = "";
		if (otp_type === otpTypes.FORGOT_PASSWORD) {
			token = jwt.sign(
				{
					id: user.id,
					role_id: user.role_id,
					department_id: user.department_id,
					is_backlisted: false,
				},
				Buffer.from(config.jwt.secret, "hex"),
				{ algorithm: "HS256", expiresIn: "1d" },
			);
			user.remember_token = token;
		}
		user.is_otp_valid = false;
		await user.save();
		return token ? { token } : "";
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const forgotAdminPassword = async (reqBody) => {
	try {
		const { email, password, confirm_password, token } = reqBody;
		if (!email || !password || !confirm_password || !token) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Please Enter Required Fields : [ email, password, confirm_password, token ]",
			);
		}

		const user = await Admin.findOne({
			where: { email: email, remember_token: token, is_active: true },
		});
		if (!user) {
			throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email or Token");
		}

		if (password !== confirm_password) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"New Password and Confirm Password Must Be Equal",
			);
		}

		let salt = bcrypt.genSaltSync(10);
		const userObj = {
			password: bcrypt.hashSync(confirm_password, salt),
			remember_token: null,
		};

		const isUserPasswordUpdate = await Admin.update(userObj, {
			where: { id: user?.id },
		});

		if (!isUserPasswordUpdate) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to Change Password.",
			);
		}
		return "Password Changed Successfully.";
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getProfile = async (reqBody) => {
	try {
		const { user } = reqBody;
		const result = await Admin.findOne({
			attributes: ["id", "name", "email", "role_id", "department_id"],
			include: [
				{
					model: Role,
					as: "admin_role",
					attributes: ["id", "name", "abbreviation"],
				}
			],
			where: { id: user.id, is_active: true },
		});

		if (!result) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Admin profile not found.");
		}

		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Failed to fetch admin profile",
		);
	}
};

const findAdminById = async (id) => {
	const adminDoc = await Admin.findOne({
		where: { id: id },
		include: [
			{
				model: Role,
				as: "admin_role",
			},
		],
	});
	return adminDoc ? adminDoc : {};
};

const updateAdmin = async (id,reqBody) => {
	const adminDoc = await Admin.findOne({
		where: {
			id: id,
		},
	});

	if (
		reqBody.name &&
		reqBody.name !== "" &&
		typeof reqBody.name !== "undefined"
	) {
		adminDoc["name"] = reqBody.name;
	}

	if (
		reqBody.email &&
		reqBody.email !== "" &&
		typeof reqBody.email !== "undefined"
	) {
		adminDoc["email"] = reqBody.email;
	}
	if (
		reqBody.role_id &&
		reqBody.role_id !== "" &&
		typeof reqBody.role_id !== "undefined"
	) {
		adminDoc["role_id"] = reqBody.role_id;
	}

	await adminDoc.save();
	return adminDoc ? adminDoc : {};
};

const deleteAdmin = async (reqBody) => {
	const admin = await Admin.findOne({
		where: {
			id: reqBody.admin_id,
		},
	});
	if (!admin) {
		throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
	}
	await admin.destroy({
		where: {
			id: reqBody.admin_id,
			is_active: true,
		},
	});
};

const getAllAdmins = async () => {
	try {
		const userDoc = await Admin.findAll({
			where: { is_active: true },
			include: [
				{
					model: Role,
					as: "admin_role",
				},
			],
		});

		if (!userDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"|=> Failed to get all User <=|",
			);
		}

		return userDoc;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

module.exports = {
	createAdminUser,
	loginAdminUser,
	resetAdminPassword,
	sendOTP,
	verifyOTP,
	forgotAdminPassword,
	getProfile,
	getAllAdmins,
	findAdminById,
	updateAdmin,
	deleteAdmin,
};
