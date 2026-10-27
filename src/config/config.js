const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Only what the server needs to start, and who may change everything else, stays in .env. The
// rest (API keys, mail server, shipping sender, payment credentials, links...) is managed on
// the admin panel's Settings page: see settingsCatalog.js and settings.js. Those variables are
// still read from .env until they're saved there, so they aren't checked here.
const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(5000),
    DEFAULT_TIMEZONE: Joi.string()
      .default("UTC")
      .description("Default Timezone for application"),

    CENTRAL_MYSQL_HOST: Joi.string()
      .required()
      .description("Central Mysql Host"),
    CENTRAL_MYSQL_USER: Joi.string()
      .required()
      .description("Central Mysql User"),
    CENTRAL_MYSQL_DB: Joi.string().required().description("Central Mysql DB"),
    CENTRAL_MYSQL_PORT: Joi.string().required().description("Central Port"),

    JWT_SECRET: Joi.string()
      .min(32)
      .required()
      .description("JWT secret key, at least 32 random characters"),
    JWT_ACCESS_EXPIRATION_DAYS: Joi.number()
      .default(5)
      .description("days after which customer access tokens expire"),

    SETTINGS_MASTER_KEY: Joi.string()
      .min(32)
      .required()
      .description("asked for on the admin Settings page to reveal or change settings; also encrypts the secret ones"),

    STORAGE_DIR: Joi.string().description("uploads and imports; default: ../storage next to the repo"),
    LOG_DIR: Joi.string().description("log files; default: ../logs next to the repo"),
    TRUST_PROXY: Joi.string()
      .default("loopback")
      .description("Express 'trust proxy' setting; loopback = nginx on the same server"),
    ACCESSDOMAINS: Joi.string().description(
      "All allow origin URL coma seprated",
    ),

    SUP_ADM_ROLE_ID: Joi.string(),
    USR_ROLE_ID: Joi.string().required().description("roles.id of customer accounts"),
    ADM_DEPT_ID: Joi.string(),
    DEFAULT_AMOUNT: Joi.number().default(5),
    SUPER_ADMIN_NAME: Joi.string(),
    SUPER_ADMIN_EMAIL: Joi.string(),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  databases: {
    central: {
      db: envVars.CENTRAL_MYSQL_DB,
      port: envVars.CENTRAL_MYSQL_PORT,
      host: envVars.CENTRAL_MYSQL_HOST,
      user: envVars.CENTRAL_MYSQL_USER,
      passwd: envVars.CENTRAL_MYSQL_PASSWORD,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationDays: envVars.JWT_ACCESS_EXPIRATION_DAYS,
  },
  settingsMasterKey: envVars.SETTINGS_MASTER_KEY,
  accessDomains: envVars.ACCESSDOMAINS,
  trustProxy: envVars.TRUST_PROXY,
  storageDir: envVars.STORAGE_DIR,
  logDir: envVars.LOG_DIR,
  DEFAULT_TIMEZONE: envVars.DEFAULT_TIMEZONE,

  SUP_ADM_ROLE_ID: envVars.SUP_ADM_ROLE_ID,
  USR_ROLE_ID: envVars.USR_ROLE_ID,
  ADM_DEPT_ID: envVars.ADM_DEPT_ID,
  DEFAULT_AMOUNT: envVars.DEFAULT_AMOUNT,
  SUPER_ADMIN_NAME: envVars.SUPER_ADMIN_NAME,
  SUPER_ADMIN_EMAIL: envVars.SUPER_ADMIN_EMAIL,
};
