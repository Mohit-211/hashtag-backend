const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(5000),

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
    FRONTEND_URL: Joi.string()
      .uri()
      .required()
      .description("customer website, used in verification and password emails"),
    ADMIN_FRONTEND_URL: Joi.string()
      .uri()
      .required()
      .description("admin panel, used in admin password emails"),
    STORAGE_DIR: Joi.string().description("uploads and imports; default: ../storage next to the repo"),
    LOG_DIR: Joi.string().description("log files; default: ../logs next to the repo"),
    TRUST_PROXY: Joi.string()
      .default("loopback")
      .description("Express 'trust proxy' setting; loopback = nginx on the same server"),
    EXPOSE_SUPPLIER_COST: Joi.boolean()
      .default(false)
      .description("true only while the shop switches to price_tiers: keeps supplier cost fields in shopper responses"),
    SMTP_HOST: Joi.string().description("server that will send the emails"),
    SMTP_PORT: Joi.number().description("port to connect to the email server"),
    SMTP_USERNAME: Joi.string().description("username for email server"),
    SMTP_PASSWORD: Joi.string().description("password for email server"),
    EMAIL_FROM: Joi.string().description(
      "the from field in the emails sent by the app",
    ),
    CONTACT_INBOX: Joi.string()
      .email()
      .required()
      .description("team inbox for contact-form messages and new sourcing requests"),
    DEFAULT_API_DATA_LIMIT: Joi.number().default(15),
    ACCESSDOMAINS: Joi.string().description(
      "All allow origin URL coma seprated",
    ),
    DEFAULT_TIMEZONE: Joi.string()
      .default("UTC")
      .description("Default Timezone for application"),
    SQUARE_ENVIRONMENT: Joi.string()
      .valid("production", "sandbox")
      .description("Square environment"),
    SQUARE_ACCESS_TOKEN: Joi.string().description("Square access token"),
    SQUARE_APP_ID: Joi.string().description("Square application ID"),
    SQUARE_LOCATION_ID: Joi.string().description("Square location ID"),

    PAYPAL_CLIENT_ID: Joi.string().description("Paypal access token"),
    PAYPAL_CLIENT_SECRET: Joi.string().description("Paypal client secret"),
    PAYPAL_ENVIRONMENT: Joi.string().description("Paypal environment"),

    SUP_ADM_ROLE_ID: Joi.string(),
    USR_ROLE_ID: Joi.string().required().description("roles.id of customer accounts"),
    ADM_DEPT_ID: Joi.string(),
    DEFAULT_AMOUNT: Joi.number().default(5),
    SUPER_ADMIN_NAME: Joi.string(),
    SUPER_ADMIN_PASSWORD: Joi.string(),
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
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: false,
      requireTLS: true,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
    contactInbox: envVars.CONTACT_INBOX,
  },
  accessDomains: envVars.ACCESSDOMAINS,
  frontendUrl: envVars.FRONTEND_URL.replace(/\/+$/, ""),
  adminFrontendUrl: envVars.ADMIN_FRONTEND_URL.replace(/\/+$/, ""),
  trustProxy: envVars.TRUST_PROXY,
  exposeSupplierCost: envVars.EXPOSE_SUPPLIER_COST,
  storageDir: envVars.STORAGE_DIR,
  logDir: envVars.LOG_DIR,
  defaultLimit: envVars.DEFAULT_API_DATA_LIMIT,
  DEFAULT_TIMEZONE: envVars.DEFAULT_TIMEZONE,

  SQUARE_ENVIRONMENT: envVars.SQUARE_ENVIRONMENT,
  SQUARE_ACCESS_TOKEN: envVars.SQUARE_ACCESS_TOKEN,
  SQUARE_APP_ID: envVars.SQUARE_APP_ID,
  SQUARE_LOCATION_ID: envVars.SQUARE_LOCATION_ID,

  PAYPAL_CLIENT_ID: envVars.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: envVars.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENVIRONMENT: envVars.PAYPAL_ENVIRONMENT,

  SUP_ADM_ROLE_ID: envVars.SUP_ADM_ROLE_ID,
  USR_ROLE_ID: envVars.USR_ROLE_ID,
  ADM_DEPT_ID: envVars.ADM_DEPT_ID,
  DEFAULT_AMOUNT: envVars.DEFAULT_AMOUNT,
  SUPER_ADMIN_NAME: envVars.SUPER_ADMIN_NAME,
  SUPER_ADMIN_PASSWORD: envVars.SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL: envVars.SUPER_ADMIN_EMAIL,
};
