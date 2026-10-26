const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const httpStatus = require("http-status");
const jwt = require("jsonwebtoken");
const { Admin, Role } = require("../../models");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const validateEmail = require("../../helpers/validateEmail");
const validatePassword = require("../../helpers/validatePassword");
const { PASSWORD_RULES } = require("../../helpers/validatePassword");
const {
	sendPasswordResetEmail,
	sendAccountSetupEmail,
} = require("../Common/email.service");
const {
	issueToken,
	wasIssuedRecently,
	consumeToken,
	revokeTokens,
} = require("../Common/accountToken.service");
const { accountTypes, accountTokenPurposes } = require("../../config/types");
const {
	PASSWORD_RESET_MINUTES,
	ACCOUNT_SETUP_HOURS,
	LINK_RESEND_SECONDS,
	links,
} = require("../../config/accountPolicy");
const {
	ADMIN_TOKEN_TYPE,
	isSuperAdminRecord,
} = require("../../middlewares/adminAuth.middleware");

const INVALID_LOGIN = "Invalid email or password. Please try again.";

// Compared against when the email isn't found, so both cases take about as long.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);

const ADMIN_PUBLIC_ATTRIBUTES = ["id", "name", "email", "role_id", "department_id", "is_active", "created_at"];
const ROLE_ATTRIBUTES = ["id", "name", "abbreviation"];

const signAdminToken = (admin) =>
	jwt.sign(
		{
			id: admin.id,
			role_id: admin.role_id,
			department_id: admin.department_id,
			typ: ADMIN_TOKEN_TYPE,
			jti: crypto.randomBytes(16).toString("hex"),
		},
		config.jwt.secret,
		{ algorithm: "HS256", expiresIn: "5d" },
	);

// Super Admin only. The new admin gets an email link to choose their own password;
// no password is generated or emailed.
const createAdminUser = async (userBody) => {
	const admin = await Admin.create({
		name: String(userBody.name).trim(),
		email: String(userBody.email).trim(),
		// Unusable until the admin sets a password from the emailed link.
		password: bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10),
		role_id: userBody.role_id,
		department_id: userBody.department_id,
	});

	const token = await issueToken({
		accountType: accountTypes.ADMIN,
		accountId: admin.id,
		purpose: accountTokenPurposes.ACCOUNT_SETUP,
		expiresAt: new Date(Date.now() + ACCOUNT_SETUP_HOURS * 60 * 60 * 1000),
	});

	await sendAccountSetupEmail(admin.email, {
		name: admin.name,
		link: links.adminResetPassword(token),
		hours: ACCOUNT_SETUP_HOURS,
		isAdmin: true,
	});

	return Admin.findOne({
		attributes: ADMIN_PUBLIC_ATTRIBUTES,
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
		where: { id: admin.id },
	});
};

const loginAdminUser = async (reqBody) => {
	const user = await Admin.scope("withPassword").findOne({
		where: { email: String(reqBody.email).trim(), is_active: true },
	});

	const validPass = await bcrypt.compare(
		String(reqBody.password),
		user?.password || DUMMY_HASH,
	);
	if (!user || !user.password || !validPass) {
		throw new ApiError(httpStatus.BAD_REQUEST, INVALID_LOGIN);
	}

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		role_id: user.role_id,
		token: signAdminToken(user),
	};
};

// Signed-in password change. Older admin tokens stop working; a new one is returned.
const resetAdminPassword = async (reqBody) => {
	const { old_password, new_password, user } = reqBody;

	if (!validatePassword(new_password)) {
		throw new ApiError(httpStatus.BAD_REQUEST, PASSWORD_RULES);
	}

	const userDoc = await Admin.scope("withPassword").findOne({
		where: { id: user.id, is_active: true },
	});

	const validPass =
		userDoc?.password && (await bcrypt.compare(String(old_password), userDoc.password));
	if (!validPass) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password.");
	}

	await userDoc.update({
		password: bcrypt.hashSync(new_password, 10),
		password_changed_at: new Date(),
	});

	return { token: signAdminToken(userDoc) };
};

// Always answers the same way, so it can't be used to find out which emails belong to admins.
const forgotAdminPassword = async (reqBody) => {
	const email = String(reqBody.email || "").trim();
	if (!validateEmail(email)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Please enter a valid email.");
	}

	const admin = await Admin.findOne({ where: { email, is_active: true } });

	if (
		admin &&
		!(await wasIssuedRecently({
			accountType: accountTypes.ADMIN,
			accountId: admin.id,
			purpose: accountTokenPurposes.PASSWORD_RESET,
			seconds: LINK_RESEND_SECONDS,
		}))
	) {
		const token = await issueToken({
			accountType: accountTypes.ADMIN,
			accountId: admin.id,
			purpose: accountTokenPurposes.PASSWORD_RESET,
			expiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000),
		});

		await sendPasswordResetEmail(admin.email, {
			link: links.adminResetPassword(token),
			minutes: PASSWORD_RESET_MINUTES,
		});
	}

	return "";
};

// Sets a password from an emailed reset or account-setup link.
// All existing admin tokens for the account stop working.
const resetAdminPasswordWithToken = async (reqBody) => {
	const { token, password, confirm_password } = reqBody;

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

	const record = await consumeToken({
		token,
		accountType: accountTypes.ADMIN,
		purposes: [
			accountTokenPurposes.PASSWORD_RESET,
			accountTokenPurposes.ACCOUNT_SETUP,
		],
	});

	const admin = await Admin.findOne({
		where: { id: record.account_id, is_active: true },
	});
	if (!admin) {
		throw new ApiError(
			httpStatus.BAD_REQUEST,
			"This link is invalid or has expired. Please request a new one.",
		);
	}

	await admin.update({
		password: bcrypt.hashSync(password, 10),
		password_changed_at: new Date(),
	});

	await revokeTokens({
		accountType: accountTypes.ADMIN,
		accountId: admin.id,
		purposes: [
			accountTokenPurposes.PASSWORD_RESET,
			accountTokenPurposes.ACCOUNT_SETUP,
		],
	});

	return "Password Changed Successfully.";
};

const getProfile = async (reqBody) => {
	const result = await Admin.findOne({
		attributes: ADMIN_PUBLIC_ATTRIBUTES,
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
		where: { id: reqBody.user.id, is_active: true },
	});

	if (!result) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Admin profile not found.");
	}

	return result;
};

const findAdminById = async (id) => {
	const adminDoc = await Admin.findOne({
		attributes: ADMIN_PUBLIC_ATTRIBUTES,
		where: { id: id },
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
	});
	return adminDoc ? adminDoc : {};
};

// Super Admin only. Name, email, role and department can change.
const updateAdmin = async (id, reqBody, actingAdmin) => {
	const adminDoc = await Admin.findOne({
		where: { id: id, is_active: true },
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
	});
	if (!adminDoc) {
		throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
	}

	const updates = {};

	if (reqBody.name && String(reqBody.name).trim()) {
		updates.name = String(reqBody.name).trim();
	}

	if (reqBody.email && String(reqBody.email).trim() !== adminDoc.email) {
		const email = String(reqBody.email).trim();
		if (!validateEmail(email)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Email");
		}
		const taken = await Admin.findOne({ attributes: ["id"], where: { email, is_active: true } });
		if (taken && String(taken.id) !== String(adminDoc.id)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Email already taken");
		}
		updates.email = email;
	}

	if (reqBody.role_id && String(reqBody.role_id) !== String(adminDoc.role_id)) {
		if (String(adminDoc.id) === String(actingAdmin.id)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "You can't change your own role.");
		}
		const role = await Role.findByPk(parseInt(reqBody.role_id));
		if (!role) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Role Id");
		}
		if (isSuperAdminRecord({ role_id: role.id, admin_role: role })) {
			throw new ApiError(httpStatus.FORBIDDEN, "You are not authorized to assign this role.");
		}
		updates.role_id = role.id;
	}

	if (reqBody.department_id) {
		updates.department_id = parseInt(reqBody.department_id);
	}

	await adminDoc.update(updates);

	return findAdminById(adminDoc.id);
};

// Super Admin only. Admins can't delete themselves, and Super Admins can't be deleted here.
const deleteAdmin = async (reqBody, actingAdmin) => {
	const admin = await Admin.findOne({
		where: { id: reqBody.admin_id, is_active: true },
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
	});
	if (!admin) {
		throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
	}
	if (String(admin.id) === String(actingAdmin.id)) {
		throw new ApiError(httpStatus.BAD_REQUEST, "You can't delete your own account.");
	}
	if (isSuperAdminRecord(admin)) {
		throw new ApiError(httpStatus.FORBIDDEN, "A Super Admin can't be deleted.");
	}

	await admin.destroy();
};

const getAllAdmins = async () =>
	Admin.findAll({
		attributes: ADMIN_PUBLIC_ATTRIBUTES,
		where: { is_active: true },
		include: [{ model: Role, as: "admin_role", attributes: ROLE_ATTRIBUTES }],
	});

module.exports = {
	createAdminUser,
	loginAdminUser,
	resetAdminPassword,
	forgotAdminPassword,
	resetAdminPasswordWithToken,
	getProfile,
	getAllAdmins,
	findAdminById,
	updateAdmin,
	deleteAdmin,
};
