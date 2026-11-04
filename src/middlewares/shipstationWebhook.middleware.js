const crypto = require("crypto");
const axios = require("axios");

const catchAsync = require("../utils/catchAsync");

// ShipStation signs every webhook with RSA-SHA256, and anyone can reach this URL: without the
// check, a made-up request could mark any order delivered. The steps and status codes are
// ShipStation's own (docs: Webhook Validation). The signed text is the timestamp, a period and
// the raw body, which is why express.json keeps req.rawBody for this route (app.js).

const JWKS_URL = "https://api.shipengine.com/jwks";
const MAX_AGE_MS = 5 * 60 * 1000;

let publicKeys = new Map();

// The keys rarely change, so they're fetched again only for a key id we don't have.
const getPublicKey = async (keyId) => {
  if (!publicKeys.has(keyId)) {
    const { data } = await axios.get(JWKS_URL, { timeout: 10000 });

    publicKeys = new Map(
      data.keys.map((key) => [key.kid, crypto.createPublicKey({ key, format: "jwk" })]),
    );
  }

  return publicKeys.get(keyId);
};

const verifyShipstationWebhook = catchAsync(async (req, res, next) => {
  const keyId = req.headers["x-shipengine-rsa-sha256-key-id"];
  const signature = req.headers["x-shipengine-rsa-sha256-signature"];
  const timestamp = req.headers["x-shipengine-timestamp"];

  if (!keyId || !signature || !timestamp || !req.rawBody) {
    return res.status(404).end();
  }

  // Also refuses a timestamp that isn't a date.
  if (!(Math.abs(Date.now() - new Date(timestamp).getTime()) <= MAX_AGE_MS)) {
    return res.status(400).end();
  }

  const publicKey = await getPublicKey(keyId);

  const isValid =
    publicKey &&
    crypto
      .createVerify("RSA-SHA256")
      .update(`${timestamp}.`)
      .update(req.rawBody)
      .verify(publicKey, signature, "base64");

  if (!isValid) {
    return res.status(401).end();
  }

  return next();
});

module.exports = { verifyShipstationWebhook };
