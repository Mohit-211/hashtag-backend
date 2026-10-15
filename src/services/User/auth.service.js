/** @format */

const crypto = require("crypto");
const httpStatus = require("http-status");
const bcrypt = require("bcryptjs");
const moment = require("moment");

const {
	User,
	UserAttachment,
	Profile,
	userLoginTiming,
	Timezone,
} = require("../../models");
const config = require("../../config/config");
const logger = require("../../config/logger");
const ApiError = require("../../utils/ApiError");
const validatePassword = require("../../helpers/validatePassword");
const {
	sendVerificationEmail,
	sendPasswordResetEmail,
} = require("../Common/email.service");
const {
	generateAuthTokens,
	revokeUserTokens,
} = require("../Common/token.service");
const {
	issueToken,
	wasIssuedRecently,
	consumeToken,
	revokeTokens,
} = require("../Common/accountToken.service");
const {
	userStatusTypes,
	accountTypes,
	accountTokenPurposes,
} = require("../../config/types");
const {
	UNVERIFIED_ACCOUNT_HOURS,
	PASSWORD_RESET_MINUTES,
	LINK_RESEND_SECONDS,
	links,
} = require("../../config/accountPolicy");

const PASSWORD_RULES =
	"Password should have a minimum length of 8 characters and must have at least 2 digits and No Blank Space";

const INVALID_LOGIN = "Invalid email or password. Please try again.";

// Compared against when the email isn't found, so both cases take about as long.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);

const normalizeEmail = (email) => String(email || "").trim();

// The verification link stops working when the unverified account is deleted.
const verificationDeadline = (user) =>
	new Date(
		new Date(user.created_at).getTime() + UNVERIFIED_ACCOUNT_HOURS * 60 * 60 * 1000,
	);

const sendVerificationLink = async (user, name) => {
	const expiresAt = verificationDeadline(user);
	const hoursLeft = Math.max(
		1,
		Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)),
	);

	const token = await issueToken({
		accountType: accountTypes.USER,
		accountId: user.id,
		purpose: accountTokenPurposes.EMAIL_VERIFICATION,
		expiresAt,
	});

	await sendVerificationEmail(user.email, {
		name,
		link: links.verifyEmail(token),
		hours: hoursLeft,
	});
};

const register = async (body, files, headers) => {
	const { name, email, mobile, password } = body;
	const { role_id } = headers;

	const user = await User.create({
		email: normalizeEmail(email),
		password: bcrypt.hashSync(password, 10),
		role_id: role_id,
		status: userStatusTypes.PENDING,
	});

	await Profile.create({
		email: normalizeEmail(email),
		name: name,
		mobile: mobile,
		user_id: user.id,
	});

	if (files?.images?.length) {
		for (const currImage of files.images) {
			await UserAttachment.create({
				role_id: role_id,
				user_id: user.id,
				title: "Profile Image",
				file_type: "Image",
				file_name: currImage.filename,
				file_uri: "/images",
				file_size: currImage.size,
			});
		}
	}

	// The account exists even if the email fails; the user can ask for a new link.
	try {
		await sendVerificationLink(user, name);
	} catch (error) {
		logger.error(`Verification email to user ${user.id} failed: ${error.message}`);
	}

	return {};
};

const verifyEmail = async (token) => {
	const record = await consumeToken({
		token,
		accountType: accountTypes.USER,
		purposes: [accountTokenPurposes.EMAIL_VERIFICATION],
	});

	const user = await User.findOne({
		where: { id: record.account_id, is_active: true },
	});
	if (!user) {
		throw new ApiError(
			httpStatus.BAD_REQUEST,
			"This account no longer exists. Please register again.",
		);
	}

	if (user.status === userStatusTypes.PENDING) {
		await user.update({ status: userStatusTypes.ACCEPTED });
	}

	return { email: user.email };
};

// Always answers the same way, so it can't be used to find out which emails are registered.
const resendVerification = async (body, headers) => {
	const email = normalizeEmail(body.email);
	if (!email) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Please enter your email.");
	}

	const user = await User.findOne({
		where: {
			email,
			role_id: headers.role_id,
			is_active: true,
			status: userStatusTypes.PENDING,
		},
		include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
	});

	if (
		user &&
		verificationDeadline(user) > new Date() &&
		!(await wasIssuedRecently({
			accountType: accountTypes.USER,
			accountId: user.id,
			purpose: accountTokenPurposes.EMAIL_VERIFICATION,
			seconds: LINK_RESEND_SECONDS,
		}))
	) {
		await sendVerificationLink(user, user.user_profile?.name);
	}

	return "";
};

const login = async (reqBody, headers) => {
	const { role_id, timezone } = headers;

	const user = await User.scope("withPassword").findOne({
		where: { email: normalizeEmail(reqBody.email), is_active: true, role_id: role_id },
		include: [
			{
				model: Profile,
				as: "user_profile",
				attributes: ["id", "name", "mobile", "is_active", "created_at"],
			},
		],
	});

	const validPass = await bcrypt.compare(
		String(reqBody.password),
		user?.password || DUMMY_HASH,
	);
	if (!user || !user.password || !validPass) {
		throw new ApiError(httpStatus.BAD_REQUEST, INVALID_LOGIN);
	}

	if (user.status === userStatusTypes.PENDING) {
		throw new ApiError(
			httpStatus.FORBIDDEN,
			"Please verify your email address first. Check your inbox for the verification link, or request a new one.",
		);
	}
	if (user.status === userStatusTypes.REJECTED) {
		throw new ApiError(
			httpStatus.FORBIDDEN,
			"This account can't sign in. Please contact support.",
		);
	}

	const token = await generateAuthTokens(user);

	await saveLoginTiming(user, token, reqBody, timezone);

	delete token.access.id;
	delete token.refresh.id;

	return {
		id: user.id,
		name: user.user_profile?.name,
		email: user.email,
		tokens: token,
		role_id: user.role_id,
	};
};

// Always answers the same way, so it can't be used to find out which emails are registered.
const forgotPassword = async (body, headers) => {
	const email = normalizeEmail(body.email);
	if (!email) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Please enter your email.");
	}

	const user = await User.findOne({
		where: { email, role_id: headers.role_id, is_active: true },
	});

	const canReset =
		user &&
		user.status !== userStatusTypes.PENDING &&
		user.status !== userStatusTypes.REJECTED;

	if (
		canReset &&
		!(await wasIssuedRecently({
			accountType: accountTypes.USER,
			accountId: user.id,
			purpose: accountTokenPurposes.PASSWORD_RESET,
			seconds: LINK_RESEND_SECONDS,
		}))
	) {
		const token = await issueToken({
			accountType: accountTypes.USER,
			accountId: user.id,
			purpose: accountTokenPurposes.PASSWORD_RESET,
			expiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000),
		});

		await sendPasswordResetEmail(user.email, {
			link: links.resetPassword(token),
			minutes: PASSWORD_RESET_MINUTES,
		});
	}

	return "";
};

// Sets a new password from an emailed reset or account-setup link, then signs
// the account out everywhere.
const resetPasswordWithToken = async (body) => {
	const { token, password, confirm_password } = body;

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
		accountType: accountTypes.USER,
		purposes: [
			accountTokenPurposes.PASSWORD_RESET,
			accountTokenPurposes.ACCOUNT_SETUP,
		],
	});

	const user = await User.findOne({
		where: { id: record.account_id, is_active: true },
	});
	if (!user) {
		throw new ApiError(
			httpStatus.BAD_REQUEST,
			"This link is invalid or has expired. Please request a new one.",
		);
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

	return "";
};

// Signed-in password change. Other sessions are signed out; this one gets a new token.
const resetPassword = async (reqBody) => {
	const { old_password, confirm_password, user } = reqBody;

	const userDoc = await User.scope("withPassword").findOne({
		where: { id: user.id, is_active: true },
	});

	const validPass =
		userDoc?.password && (await bcrypt.compare(String(old_password), userDoc.password));
	if (!validPass) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password.");
	}

	await userDoc.update({ password: bcrypt.hashSync(confirm_password, 10) });

	await revokeUserTokens(userDoc.id);
	const token = await generateAuthTokens(userDoc);

	return {
		tokens: token,
	};
};

const logout = async (reqBody, headers) => {
	const { tokenDoc } = reqBody;

	await saveLogoutTiming(tokenDoc, headers.timezone);
	await tokenDoc.destroy();

	return "";
};

const resolveTimezone = (timezone) =>
	timezone && moment.tz.zone(timezone) ? timezone : config.DEFAULT_TIMEZONE;

// Login/logout history is best effort: a missing or unknown timezone header must
// not stop someone from signing in or out.
const saveLoginTiming = async (user, token, reqBody, timezone) => {
	try {
		const zone = resolveTimezone(timezone);
		const loginTimeUTC = moment.utc();

		const timeZoneDoc = await Timezone.findOne({
			where: { time_zone: zone, is_active: true },
		});
		if (!timeZoneDoc) {
			logger.warn(`Login timing not saved: timezone "${zone}" is not in the timezones table`);
			return null;
		}

		return await userLoginTiming.create({
			user_id: user.id,
			role_id: user.role_id,
			login_time_utc: loginTimeUTC,
			login_time_local: moment.tz(loginTimeUTC, zone).format("YYYY-MM-DD HH:mm:ss"),
			ip_address: reqBody.ip_address,
			token_id: token.access.id,
			time_zone: timeZoneDoc.id,
		});
	} catch (error) {
		logger.warn(`Login timing not saved: ${error.message}`);
		return null;
	}
};

const saveLogoutTiming = async (tokenDoc, timezone) => {
	try {
		const logoutTimeUTC = moment.utc();

		const loginTimingDoc = await userLoginTiming.findOne({
			where: { token_id: tokenDoc.id },
		});
		if (loginTimingDoc) {
			loginTimingDoc.logout_time_utc = logoutTimeUTC;
			loginTimingDoc.logout_time_local = moment
				.tz(logoutTimeUTC, resolveTimezone(timezone))
				.format("YYYY-MM-DD HH:mm:ss");
			await loginTimingDoc.save();
		}
	} catch (error) {
		logger.warn(`Logout timing not saved: ${error.message}`);
	}
};

module.exports = {
	register,
	verifyEmail,
	resendVerification,
	login,
	forgotPassword,
	resetPasswordWithToken,
	resetPassword,
	logout,
};
