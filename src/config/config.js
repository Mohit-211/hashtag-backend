const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
  .keys({
    APP_NAME: Joi.string().required().description("Your Application Name"),
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
    ////CENTRAL_MYSQL_PASSWORD: Joi.string().required().description('Central Mysql Password'),
    CENTRAL_MYSQL_DB: Joi.string().required().description("Central Mysql DB"),
    CENTRAL_MYSQL_PORT: Joi.string().required().description("Central Port"),

    // MONGODB_URL: Joi.string().required().description('Mongo DB url'),

    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    SMTP_HOST: Joi.string().description("server that will send the emails"),
    SMTP_PORT: Joi.number().description("port to connect to the email server"),
    SMTP_USERNAME: Joi.string().description("username for email server"),
    SMTP_PASSWORD: Joi.string().description("password for email server"),
    EMAIL_FROM: Joi.string().description(
      "the from field in the emails sent by the app",
    ),
    DEFAULT_API_DATA_LIMIT: Joi.number().default(15),
    ACCESSDOMAINS: Joi.string().description(
      "All allow origin URL coma seprated",
    ),
    API_BASE_URL: Joi.string().description("Base url for apis"),
    ADMIN_BASE_URL: Joi.string().description("Base url for Admin apis"),
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
    ADM_ROLE_ID: Joi.string(),
    SUB_ADM_ROLE_ID: Joi.string(),
    ENG_ROLE_ID: Joi.string(),
    EDTR_ROLE_ID: Joi.string(),
    USR_ROLE_ID: Joi.string(),
    SP_ROLE_ID: Joi.string(),
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
  app_name: envVars.APP_NAME,
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
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_DAYS,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes:
      envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
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
  },
  accessDomains: envVars.ACCESSDOMAINS,
  defaultLimit: envVars.DEFAULT_API_DATA_LIMIT,
  API_BASE_URL: envVars.API_BASE_URL,
  ADMIN_BASE_URL: envVars.ADMIN_BASE_URL,
  DEFAULT_TIMEZONE: envVars.DEFAULT_TIMEZONE,

  SQUARE_ENVIRONMENT: envVars.SQUARE_ENVIRONMENT,
  SQUARE_ACCESS_TOKEN: envVars.SQUARE_ACCESS_TOKEN,
  SQUARE_APP_ID: envVars.SQUARE_APP_ID,
  SQUARE_LOCATION_ID: envVars.SQUARE_LOCATION_ID,

  PAYPAL_CLIENT_ID: envVars.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: envVars.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENVIRONMENT: envVars.PAYPAL_ENVIRONMENT,

  SUP_ADM_ROLE_ID: envVars.SUP_ADM_ROLE_ID,
  ADM_ROLE_ID: envVars.ADM_ROLE_ID,
  SUB_ADM_ROLE_ID: envVars.SUB_ADM_ROLE_ID,
  ENG_ROLE_ID: envVars.ENG_ROLE_ID,
  EDTR_ROLE_ID: envVars.EDTR_ROLE_ID,
  USR_ROLE_ID: envVars.USR_ROLE_ID,
  SP_ROLE_ID: envVars.SP_ROLE_ID,
  ADM_DEPT_ID: envVars.ADM_DEPT_ID,
  DEFAULT_AMOUNT: envVars.DEFAULT_AMOUNT,
  SUPER_ADMIN_NAME: envVars.SUPER_ADMIN_NAME,
  SUPER_ADMIN_PASSWORD: envVars.SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL: envVars.SUPER_ADMIN_EMAIL,
};
