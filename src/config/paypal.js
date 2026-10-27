const {
  Client,
  Environment,
} = require("@paypal/paypal-server-sdk");

const settings = require("./settings");

// Built from the Settings page values (Payments), and again when they change.
let cached = { signature: null, client: null };

const getPaypalClient = () => {
  const clientId = settings.getRequired("PAYPAL_CLIENT_ID");
  const clientSecret = settings.getRequired("PAYPAL_CLIENT_SECRET");
  const environment = settings.getRequired("PAYPAL_ENVIRONMENT");

  const signature = [environment, clientId, clientSecret].join("\n");
  if (cached.signature !== signature) {
    cached = {
      signature,
      client: new Client({
        clientCredentialsAuthCredentials: {
          oAuthClientId: clientId,
          oAuthClientSecret: clientSecret,
        },
        environment:
          environment === "production"
            ? Environment.Production
            : Environment.Sandbox,
      }),
    };
  }
  return cached.client;
};

module.exports = { getPaypalClient };
