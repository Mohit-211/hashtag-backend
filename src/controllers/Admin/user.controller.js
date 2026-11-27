/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { userService, userImportService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");
const pick = require("../../utils/pick");
const settings = require("../../config/settings");


const getAllUsers = catchAsync(async (req, res) => {
	const query = pick(req.query, ["limit", "sortBy", "offset", "page"]);
	const param = pick(req.params, ["roleId"]);

	if (!query["limit"]) {
		query["limit"] = settings.get("DEFAULT_API_DATA_LIMIT");
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

// POST /admin/user/createUser { name, email, mobile? }: 201 { client, password, sign_in_url }. The
// password is shown once in the panel, to copy or email (sendLoginDetails); nothing is emailed here.
const adminAddUser = catchAsync(async (req, res) => {
	const response = await userService.adminAddUser(req.body, { adminId: req.admin?.id ?? null });
	return responseWrapper(res, response, "Client added.", httpStatus.CREATED);
});

// POST /admin/user/sendLoginDetails/:id { password }: emails the client their email and that
// password, which must be their current one.
const sendLoginDetails = catchAsync(async (req, res) => {
	const response = await userService.sendLoginDetails(req.params.id, req.body, { adminId: req.admin?.id ?? null });
	return responseWrapper(res, response, `Login details sent to ${response.email}.`, httpStatus.OK);
});

// GET /admin/user/import/format: the columns, the limits and an example file.
const getClientImportFormat = catchAsync(async (req, res) => {
	const format = await userImportService.getImportFormat();
	return responseWrapper(res, format, "", httpStatus.OK);
});

// POST /admin/user/import/preview (multipart: file): checks the file, saves nothing.
const previewClientImport = catchAsync(async (req, res) => {
	const report = await userImportService.previewImport(req.file);
	return responseWrapper(res, report, "", httpStatus.OK);
});

// POST /admin/user/import (multipart: file): creates every new client in the file, or none. A file
// with problems answers 422 with the same report the preview gives.
const importClients = catchAsync(async (req, res) => {
	const result = await userImportService.importClients(req.file, { adminId: req.admin?.id ?? null });

	if (!result.imported) {
		return res.status(httpStatus.UNPROCESSABLE_ENTITY).json({
			success: false,
			status: httpStatus.UNPROCESSABLE_ENTITY,
			message: "Nothing was imported. Fix the problems listed, then upload the file again.",
			data: result.report,
		});
	}

	const { created } = result.summary;
	return responseWrapper(res, result, `Imported ${created} client${created === 1 ? "" : "s"}.`, httpStatus.CREATED);
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
	sendLoginDetails,
	setUserPassword,
	getClientImportFormat,
	previewClientImport,
	importClients,
};
