const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { settingsService } = require("../../services/Admin");
const responseWrapper = require("../../config/responseWrapper");

// Answers can hold secrets: never cached by the browser or a proxy.
const noStore = (res) => res.set("Cache-Control", "no-store");

const getSettings = catchAsync(async (req, res) => {
  noStore(res);
  const data = await settingsService.listSettings();
  return responseWrapper(res, data, "", httpStatus.OK);
});

const unlockSettings = catchAsync(async (req, res) => {
  noStore(res);
  const data = await settingsService.unlockSettings(req.body, req.admin);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const updateSettings = catchAsync(async (req, res) => {
  noStore(res);
  const data = await settingsService.updateSettings(req.body, req.admin);
  return responseWrapper(res, data, "Settings saved", httpStatus.OK);
});

const sendTestEmail = catchAsync(async (req, res) => {
  const data = await settingsService.sendTestEmail(req.admin);
  return responseWrapper(res, data, `Test email sent to ${data.sent_to}`, httpStatus.OK);
});

module.exports = {
  getSettings,
  unlockSettings,
  updateSettings,
  sendTestEmail,
};
