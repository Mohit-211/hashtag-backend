const httpStatus = require("http-status");

const settings = require("../../config/settings");
const { GROUPS, SETTINGS } = require("../../config/settingsCatalog");
const logger = require("../../config/logger");
const { Admin } = require("../../models");
const ApiError = require("../../utils/ApiError");
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
  return Array.isArray(value) ? value.join(",") : String(value);
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

// Sends a test email to the signed-in admin with the saved mail server settings. The mail
// server's own answer is passed on (as a 502, which production shows), so the admin can fix it.
const sendTestEmail = async (admin) => {
  try {
    await sendSettingsTestEmail(admin.email, admin.name);
  } catch (error) {
    if (error.statusCode === httpStatus.SERVICE_UNAVAILABLE) throw error;
    throw new ApiError(httpStatus.BAD_GATEWAY, `The mail server didn't send it: ${error.message}`);
  }
  return { sent_to: admin.email };
};

module.exports = {
  listSettings,
  unlockSettings,
  updateSettings,
  sendTestEmail,
};
