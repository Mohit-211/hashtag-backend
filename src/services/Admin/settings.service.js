const httpStatus = require("http-status");

const settings = require("../../config/settings");
const { GROUPS, SETTINGS } = require("../../config/settingsCatalog");
const logger = require("../../config/logger");
const { Admin } = require("../../models");
const ApiError = require("../../utils/ApiError");
const validateEmail = require("../../helpers/validateEmail");
const { sendSettingsTestEmail } = require("../Common/email.service");

// The admin panel's Settings page: everything that used to be in .env apart from what the server
// needs to start. Every admin sees the page; revealing secrets and saving changes take the
// settings key (SETTINGS_MASTER_KEY in .env).

const WRONG_KEY = "That settings key isn't right.";

// A secret shows its first and last 5 characters. Shorter than 20 it shows only dots: 10 of,
// say, 12 characters would give it away.
const mask = (text) => (text.length >= 20 ? `${text.slice(0, 5)}…${text.slice(-5)}` : "••••••••");

const asText = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(",");
  // A handling_fee rule is an object; the page edits it as JSON text.
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const describe = (setting, admins, reveal) => {
  const { source, updated_at, updated_by } = settings.entry(setting.key);
  const text = asText(settings.get(setting.key));
  const defaultValue =
    typeof setting.default === "function" ? asText(setting.default(settings.get)) : asText(setting.default);

  return {
    key: setting.key,
    label: setting.label,
    description: setting.description || null,
    type: setting.type,
    ...(setting.options && { options: setting.options }),
    ...(setting.min !== undefined && { min: setting.min }),
    ...(setting.max !== undefined && { max: setting.max }),
    secret: Boolean(setting.secret),
    required: Boolean(setting.required),
    // A sender that can send a test email (sendTestEmail with its key).
    ...(setting.testEmail && { test_email: true }),
    value: text === null ? null : setting.secret && !reveal ? mask(text) : text,
    default: setting.secret ? null : defaultValue,
    source,
    missing: Boolean(setting.required) && text === null,
    updated_at: source === "admin" ? updated_at : null,
    updated_by: source === "admin" && updated_by ? admins.get(updated_by) || { id: updated_by, name: null } : null,
  };
};

// Every setting by group. reveal: secrets in full (after the settings key was entered).
const listSettings = async ({ reveal = false } = {}) => {
  const adminIds = [
    ...new Set(SETTINGS.map((setting) => settings.entry(setting.key).updated_by).filter(Boolean)),
  ];
  const admins = new Map(
    (adminIds.length ? await Admin.findAll({ attributes: ["id", "name"], where: { id: adminIds }, paranoid: false, raw: true }) : [])
      .map((admin) => [admin.id, { id: admin.id, name: admin.name }]),
  );

  const groups = GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    settings: SETTINGS.filter((setting) => setting.group === group.key).map((setting) =>
      describe(setting, admins, reveal),
    ),
  }));
  const all = groups.flatMap((group) => group.settings);

  return {
    revealed: reveal,
    groups,
    from_env: all.filter((setting) => setting.source === "env").map((setting) => setting.key),
    missing_required: all.filter((setting) => setting.missing).map((setting) => setting.key),
  };
};

const checkKey = (masterKey, admin, action) => {
  if (!settings.isMasterKey(masterKey)) {
    logger.warn(`Admin ${admin.id} entered a wrong settings key to ${action}`);
    throw new ApiError(httpStatus.FORBIDDEN, WRONG_KEY);
  }
};

// Edit mode: every value in full.
const unlockSettings = async (body, admin) => {
  checkKey(body?.master_key, admin, "reveal settings");
  logger.info(`Admin ${admin.id} revealed the settings`);
  return listSettings({ reveal: true });
};

// Saves the changed settings, { master_key, values: { KEY: value } }; null or "" puts a setting
// back to .env or its default. All or nothing: one invalid value and nothing is saved.
const updateSettings = async (body, admin) => {
  checkKey(body?.master_key, admin, "change settings");

  const values = body?.values;
  if (!values || typeof values !== "object" || Array.isArray(values) || !Object.keys(values).length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Send the settings to change in values, e.g. { "values": { "SMTP_HOST": "smtp.example.com" } }.',
    );
  }

  const result = await settings.save(values, { adminId: admin.id });
  if (result.errors) {
    const error = new ApiError(httpStatus.BAD_REQUEST, "Some settings aren't valid, so nothing was saved.");
    error.details = { errors: result.errors };
    throw error;
  }

  logger.info(`Admin ${admin.id} changed settings: ${[...result.saved, ...result.removed].join(", ")}`);
  return { ...(await listSettings()), saved: result.saved, removed: result.removed };
};

// Sends a test email with the saved mail server settings: from the Sender, or with `key` from
// that sender setting (one with test_email, e.g. EMAIL_FROM_ORDERS); to the signed-in admin, or
// to `to`. The mail server's own answer is passed on (as a 502, which production shows), so the
// admin can fix it. Returns { sent_to, sent_from }.
const sendTestEmail = async (admin, { key, to } = {}) => {
  const setting = key ? SETTINGS.find((candidate) => candidate.key === key) : null;
  if (key && !setting?.testEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That setting can't send a test email.");
  }

  const recipient = to ? String(to).trim() : admin.email;
  if (!recipient || !validateEmail(recipient)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Enter a valid email address to send the test to.");
  }

  let sentFrom;
  try {
    sentFrom = await sendSettingsTestEmail(recipient, recipient === admin.email ? admin.name : null, {
      key: setting?.key,
      label: setting?.label,
    });
  } catch (error) {
    if (error.statusCode === httpStatus.SERVICE_UNAVAILABLE) throw error;
    throw new ApiError(httpStatus.BAD_GATEWAY, `The mail server didn't send it: ${error.message}`);
  }
  logger.info(`Admin ${admin.id} sent a test email${setting ? ` (${setting.key})` : ""} to ${recipient}`);
  return { sent_to: recipient, sent_from: sentFrom };
};

module.exports = {
  listSettings,
  unlockSettings,
  updateSettings,
  sendTestEmail,
};
