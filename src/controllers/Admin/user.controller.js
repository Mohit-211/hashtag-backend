/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { userService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");
const pick = require("../../utils/pick");
const config = require("../../config/config");


const getAllUsers = catchAsync(async (req, res) => {
	const query = pick(req.query, ["limit", "sortBy", "offset", "page"]);
	const param = pick(req.params, ["roleId"]);

	if (!query["limit"]) {
		query["limit"] = config.defaultLimit;
	}
	if (!query["page"]) {
		query["page"] = 1;
	}
	if (!query["sortBy"] || query["sortBy"] === "") {
		query["sortBy"] = "ASC";
	}
	let offset = (query["page"] - 1) * query["limit"];
	query["offset"] = offset;
	const response = await userService.getAllUsers(param, query);
	return responseWrapper(res, response, "");
});

const getUserById = catchAsync(async (req, res) => {
	const response = await userService.getUserById(req.query.id);
	return responseWrapper(res, response, "Successfully Get user", httpStatus.OK);
});

const deleteUser = catchAsync(async (req, res) => {
	await userService.deleteUser(req.body);
	res.status(httpStatus.OK).send({
		code: httpStatus.NO_CONTENT,
		message: "Deleted Successfull.",
		data: "",
	});
});

const adminAddUser = catchAsync(async (req, res) => {
	const response = await userService.adminAddUser(req.body);
	return responseWrapper(res, response, "Successfully add user", httpStatus.OK);
});

const setUserPassword = catchAsync(async (req, res) => {
	await userService.setUserPassword(req.params.id, pick(req.body, ["password", "confirm_password"]));
	return responseWrapper(res, "", "Password set. Share it with the customer; they can change it after signing in.", httpStatus.OK);
});


module.exports = {
	getAllUsers,
	getUserById,
	deleteUser,
	adminAddUser,
	setUserPassword,
};
