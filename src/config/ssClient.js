// config/ssClient.js
const axios = require("axios");
const settings = require("./settings");

const ssClient = axios.create({
  baseURL: "https://api.ssactivewear.com/v2",
});

// The account number and API key come from the Settings page on every request, so new ones
// work without a restart.
ssClient.interceptors.request.use((request) => {
  request.auth = {
    username: settings.getRequired("SS_USERNAME"),
    password: settings.getRequired("SS_PASSWORD"),
  };
  return request;
});

module.exports = ssClient;
