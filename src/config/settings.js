const crypto = require("crypto");
const httpStatus = require("http-status");

const config = require("./config");
const logger = require("./logger");
const ApiError = require("../utils/ApiError");
const { GROUPS, SETTINGS_BY_KEY } = require("./settingsCatalog");

// The settings the admin manages on the Settings page (settingsCatalog.js). They're stored in
// the app_settings table, loaded into memory at start and refreshed every minute, so get() is
// synchronous. A setting nobody has saved there yet is read from the .env variable of the same
// name, then from its default. Secret values are encrypted in the table with a key derived
// from SETTINGS_MASTER_KEY, so a database dump doesn't give away API keys.

const REFRESH_MS = 60 * 1000;

let stored = new Map(); // key -> { value (decrypted text), updated_at, updated_by }
let signature = null; // row count and latest change of the last load
const listeners = new Set();
const warned = new Set();

const warnOnce = (key, message) => {
  if (warned.has(key)) return;
  warned.add(key);
  logger.warn(message);
};

// ---------------------------------------------------------------- the settings key

const deriveKey = (masterKey) =>
  Buffer.from(crypto.hkdfSync("sha256", masterKey, "hashtag-backend", "app_settings v1", 32));

let encryptionKey = null;
const currentKey = () => {
  encryptionKey ||= deriveKey(config.settingsMasterKey);
  return encryptionKey;
};

// "v1:<iv>:<tag>:<ciphertext>", base64 parts, AES-256-GCM.
const encrypt = (plain, key = currentKey()) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
};

const decrypt = (text, key = currentKey()) => {
  const [version, iv, tag, data] = String(text).split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("not an encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};

// Whether someone typed SETTINGS_MASTER_KEY. Compared as hashes, in constant time.
const isMasterKey = (candidate) => {
  if (typeof candidate !== "string" || !candidate) return false;
  const typed = crypto.createHash("sha256").update(candidate).digest();
  const actual = crypto.createHash("sha256").update(config.settingsMasterKey).digest();
  return crypto.timingSafeEqual(typed, actual);
};

// ---------------------------------------------------------------- values

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const inRange = (setting, number) => {
  if (setting.min !== undefined && number < setting.min) return `must be at least ${setting.min}`;
  if (setting.max !== undefined && number > setting.max) return `must be at most ${setting.max}`;
  return null;
};

// Checks a value typed in the admin or found in .env. Returns { value, text }: value for the
// code (a number, a boolean, a list of hosts...), text as it's stored. Or { error }.
const check = (setting, raw) => {
  const text = String(raw).trim();

  switch (setting.type) {
    case "url": {
      let url;
      try {
        url = new URL(text);
      } catch {
        return { error: "must be a web address starting with https://" };
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "must be a web address starting with https://" };
      }
      const clean = text.replace(/\/+$/, "");
      return { value: clean, text: clean };
    }
    case "email":
      return EMAIL.test(text) ? { value: text, text } : { error: "must be an email address" };
    case "sender": {
      const address = (text.match(/<([^<>]+)>$/)?.[1] ?? text).trim();
      return EMAIL.test(address)
        ? { value: text, text }
        : { error: 'must be an email address, or a name and an address like "Name <address>"' };
    }
    case "integer":
    case "number": {
      const number = Number(text);
      if (text === "" || !Number.isFinite(number)) return { error: "must be a number" };
      if (setting.type === "integer" && !Number.isInteger(number)) return { error: "must be a whole number" };
      const error = inRange(setting, number);
      return error ? { error } : { value: number, text: String(number) };
    }
    case "boolean": {
      const lower = text.toLowerCase();
      if (["true", "1", "yes", "on"].includes(lower)) return { value: true, text: "true" };
      if (["false", "0", "no", "off"].includes(lower)) return { value: false, text: "false" };
      return { error: "must be true or false" };
    }
    case "enum":
      return setting.options.includes(text)
        ? { value: text, text }
        : { error: `must be one of: ${setting.options.join(", ")}` };
    case "color":
      return /^#[0-9a-fA-F]{6}$/.test(text)
        ? { value: text.toLowerCase(), text: text.toLowerCase() }
        : { error: "must be a colour like #fae52e" };
    case "code2":
      return /^[A-Za-z]{2}$/.test(text)
        ? { value: text.toUpperCase(), text: text.toUpperCase() }
        : { error: "must be a two-letter code, e.g. TX" };
    case "hosts": {
      const hosts = text.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
      if (hosts.some((host) => !HOST.test(host))) {
        return { error: "must be host names separated by commas, e.g. images.example.com" };
      }
      return { value: hosts, text: hosts.join(",") };
    }
    default:
      return text ? { value: text, text } : { error: "can't be empty" };
  }
};

const envValue = (key) => {
  const value = process.env[key];
  return value === undefined || String(value).trim() === "" ? null : String(value);
};

// Where a setting's value comes from right now: "admin" (saved in the Settings page), "env"
// (still in .env), "default" or "unset". raw is the saved or .env text.
const entry = (key) => {
  const saved = stored.get(key);
  if (saved) return { raw: saved.value, source: "admin", updated_at: saved.updated_at, updated_by: saved.updated_by };
  const env = envValue(key);
  if (env !== null) return { raw: env, source: "env" };
  const setting = SETTINGS_BY_KEY[key];
  return { raw: null, source: setting.default === undefined ? "unset" : "default" };
};

const settingOf = (key) => {
  const setting = SETTINGS_BY_KEY[key];
  if (!setting) throw new Error(`Unknown setting ${key}`);
  return setting;
};

const defaultOf = (setting) => {
  const value = typeof setting.default === "function" ? setting.default(get) : setting.default;
  return value === undefined ? null : value;
};

// The value the code should use, or null when it isn't set.
const get = (key) => {
  const setting = settingOf(key);
  const { raw, source } = entry(key);
  if (raw !== null) {
    const result = check(setting, raw);
    if (!result.error) return result.value;
    warnOnce(key, `${key} from ${source === "env" ? ".env" : "the Settings page"} isn't valid (${result.error}); using its default.`);
  }
  return defaultOf(setting);
};

// Like get(), for a feature that can't work without the setting: a 503 that tells the admin
// where to set it.
const getRequired = (key) => {
  const value = get(key);
  if (value === null || value === "" || (Array.isArray(value) && !value.length)) {
    const setting = settingOf(key);
    const group = GROUPS.find((candidate) => candidate.key === setting.group).label;
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      `${setting.label} isn't set up yet. An admin can set it in Settings, under ${group}.`,
    );
  }
  return value;
};

// ---------------------------------------------------------------- the table

// Reads app_settings into memory. Returns false, keeping what's loaded, when the table can't be
// read (e.g. the migration hasn't run yet): the app then works on .env values.
const load = async () => {
  const { AppSetting } = require("../models");

  let rows;
  try {
    rows = await AppSetting.findAll({ raw: true });
  } catch (error) {
    logger.error(`Settings couldn't be read from the database, so .env values are used: ${error.message}`);
    return false;
  }

  const next = new Map();
  for (const row of rows) {
    if (!SETTINGS_BY_KEY[row.key] || row.value === null) continue;
    let value = row.value;
    if (row.is_secret) {
      try {
        value = decrypt(value);
      } catch {
        // Keeps what this process already had, e.g. while the key is being rotated.
        warnOnce(
          `decrypt:${row.key}`,
          `${row.key} can't be decrypted. Was SETTINGS_MASTER_KEY changed without running npm run settings:rekey? Using the last value read, or .env.`,
        );
        if (stored.has(row.key)) next.set(row.key, stored.get(row.key));
        continue;
      }
    }
    next.set(row.key, { value, updated_at: row.updated_at, updated_by: row.updated_by });
  }

  const changed = [...new Set([...stored.keys(), ...next.keys()])].filter(
    (key) => stored.get(key)?.value !== next.get(key)?.value,
  );
  stored = next;
  signature = `${rows.length}:${Math.max(0, ...rows.map((row) => new Date(row.updated_at).getTime()))}`;

  if (changed.length) {
    for (const listener of listeners) {
      try {
        listener(changed);
      } catch (error) {
        logger.error(`Settings change listener failed: ${error.message}`);
      }
    }
  }
  return true;
};

// Picks up changes made outside this process (npm run settings:import, another server).
let refreshTimer = null;
const startRefresh = () => {
  if (refreshTimer) return;
  const { AppSetting } = require("../models");
  const sequelize = require("./central.db");

  refreshTimer = setInterval(async () => {
    try {
      const [row] = await AppSetting.findAll({
        attributes: [
          [sequelize.fn("COUNT", sequelize.col("key")), "count"],
          [sequelize.fn("MAX", sequelize.col("updated_at")), "latest"],
        ],
        raw: true,
      });
      const latest = `${row.count}:${row.latest ? new Date(row.latest).getTime() : 0}`;
      if (latest !== signature) await load();
    } catch (error) {
      logger.error(`Settings refresh failed: ${error.message}`);
    }
  }, REFRESH_MS);
  refreshTimer.unref();
};

// Called with the keys whose value changed, after each load.
const onChange = (listener) => listeners.add(listener);

// At start: which settings still come from .env, and which required ones aren't set.
const report = () => {
  const { SETTINGS } = require("./settingsCatalog");
  const fromEnv = SETTINGS.filter((setting) => entry(setting.key).source === "env").map((setting) => setting.key);
  if (fromEnv.length) {
    logger.warn(
      `${fromEnv.length} setting(s) still come from .env: ${fromEnv.join(", ")}. Run npm run settings:import (or save them on the Settings page), then remove them from .env.`,
    );
  }
  const missing = SETTINGS.filter((setting) => setting.required && get(setting.key) === null).map((setting) => setting.key);
  if (missing.length) {
    logger.warn(`Required settings not set: ${missing.join(", ")}. Set them on the admin panel's Settings page.`);
  }
};

// Saves values typed in the admin (or imported from .env): { KEY: value }. null or "" removes the
// saved value, so .env or the default applies again; a required setting with neither can't be
// emptied. Every value is checked first: when one isn't valid nothing is saved and
// { errors: { KEY: message } } comes back.
const save = async (values, { adminId = null } = {}) => {
  const errors = {};
  const writes = [];
  const removals = [];

  for (const [key, raw] of Object.entries(values || {})) {
    const setting = SETTINGS_BY_KEY[key];
    if (!setting) {
      errors[key] = "isn't a setting";
      continue;
    }
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      if (setting.required && setting.default === undefined && envValue(key) === null) {
        errors[key] = "can't be empty: the site needs it";
      } else {
        removals.push(key);
      }
      continue;
    }
    const result = check(setting, raw);
    if (result.error) {
      errors[key] = result.error;
      continue;
    }
    writes.push({ key, text: result.text, secret: Boolean(setting.secret) });
  }

  if (Object.keys(errors).length) return { errors };

  const { AppSetting } = require("../models");
  const sequelize = require("./central.db");
  await sequelize.transaction(async (transaction) => {
    for (const write of writes) {
      await AppSetting.upsert(
        {
          key: write.key,
          value: write.secret ? encrypt(write.text) : write.text,
          is_secret: write.secret,
          updated_by: adminId,
        },
        { transaction },
      );
    }
    if (removals.length) {
      await AppSetting.destroy({ where: { key: removals }, transaction });
    }
  });

  await load();
  return { saved: writes.map((write) => write.key), removed: removals };
};

module.exports = {
  get,
  getRequired,
  entry,
  check,
  load,
  startRefresh,
  onChange,
  report,
  save,
  isMasterKey,
  deriveKey,
  encrypt,
  decrypt,
};
