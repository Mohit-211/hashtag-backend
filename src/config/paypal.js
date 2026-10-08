const {
  Client,
  Environment,
} = require("@paypal/paypal-server-sdk");

const config = require("./config");

const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: config.PAYPAL_CLIENT_ID,
    oAuthClientSecret: config.PAYPAL_CLIENT_SECRET,
  },

  environment:
    config.PAYPAL_ENVIRONMENT === "production"
      ? Environment.Production
      : Environment.Sandbox,
});

module.exports = paypalClient;