const config = require("./config");

// Account email-link rules. The link paths are pages the frontends must provide;
// each page reads ?token= and posts it to the API.
module.exports = {
  // Self-registered accounts not verified within this window are deleted.
  UNVERIFIED_ACCOUNT_HOURS: 2,
  PASSWORD_RESET_MINUTES: 60,
  // Admin-created accounts: how long the "set your password" link works.
  ACCOUNT_SETUP_HOURS: 72,
  // A new verification/reset email for the same account is sent at most this often.
  LINK_RESEND_SECONDS: 60,

  links: {
    verifyEmail: (token) => `${config.frontendUrl}/verify-email?token=${token}`,
    resetPassword: (token) => `${config.frontendUrl}/reset-password?token=${token}`,
    adminResetPassword: (token) => `${config.adminFrontendUrl}/reset-password?token=${token}`,
  },
};
