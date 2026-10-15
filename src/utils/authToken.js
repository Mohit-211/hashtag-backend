const httpStatus = require("http-status");
const jwt = require("jsonwebtoken");

const config = require("../config/config");
const ApiError = require("./ApiError");

// Token from the x-access-token header (what the frontends send) or a Bearer header.
const getRequestToken = (req) => {
  const header = req.headers["x-access-token"];
  if (header) return String(header);

  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();

  return null;
};

// Verifies signature, algorithm and expiry. Any failure is a 401.
const verifyJwt = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Session expired or invalid. Please sign in again.");
  }
};

module.exports = {
  getRequestToken,
  verifyJwt,
};
