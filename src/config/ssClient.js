// config/ssClient.js
const axios = require("axios");

const ssClient = axios.create({
  baseURL: "https://api.ssactivewear.com/v2",
  auth: {
    username: process.env.SS_USERNAME,
    password: process.env.SS_PASSWORD,
  },
});

module.exports = ssClient;