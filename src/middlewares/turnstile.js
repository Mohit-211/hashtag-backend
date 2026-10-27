const axios = require("axios");
const httpStatus = require("http-status");

const config = require("../config/config");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// The widget's hidden form field, or the same token sent as JSON.
const TOKEN_FIELDS = ["cf-turnstile-response", "turnstile_token"];

const REFUSED = "We couldn't confirm this was sent by a person. Please try again.";

// Public forms need a Cloudflare Turnstile token once TURNSTILE_SECRET_KEY is set (client
// decision Q60). Without the key they work as before, so this can go live before the shop
// shows the widget. Each token is checked with Cloudflare once; a refusal is a 400.
const verifyTurnstile = async (req, res, next) => {
  const secret = config.turnstileSecretKey;
  if (!secret) return next();

  const body = req.body || {};
  const token = TOKEN_FIELDS.map((field) => body[field]).find(Boolean);
  TOKEN_FIELDS.forEach((field) => delete body[field]);

  if (typeof token !== "string") {
    return next(new ApiError(httpStatus.BAD_REQUEST, REFUSED));
  }

  try {
    const { data } = await axios.post(
      SITEVERIFY_URL,
      new URLSearchParams({ secret, response: token }),
      { timeout: 10000 },
    );
    if (data.success) return next();
    logger.warn(`Turnstile refused a ${req.originalUrl} submission: ${(data["error-codes"] || []).join(", ")}`);
  } catch (error) {
    logger.error(`Turnstile check failed: ${error.message}`);
  }
  return next(new ApiError(httpStatus.BAD_REQUEST, REFUSED));
};

module.exports = { verifyTurnstile };
