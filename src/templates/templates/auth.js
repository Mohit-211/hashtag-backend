// Account emails: verification, password reset and account setup links.
// Each returns { subject, text, html }.

const { BRAND, greeting, renderEmail } = require("./layout");

const verificationEmail = ({ name, link, hours }) => {
  const note = `This link expires in ${hours} hours. Accounts that aren't verified within ${hours} hours are deleted automatically, after which you can register again. If you didn't create this account, you can ignore this email.`;

  return {
    subject: `Verify your email for ${BRAND}`,
    text: `${greeting(name)}\n\nPlease verify your email address to activate your ${BRAND} account:\n${link}\n\n${note}`,
    html: renderEmail({
      heading: "Verify your email",
      paragraphs: [`${greeting(name)} please verify your email address to activate your ${BRAND} account.`],
      button: { text: "Verify email", link },
      note,
    }),
  };
};

const passwordResetEmail = ({ link, minutes }) => {
  const note = `This link expires in ${minutes} minutes and can only be used once. If you didn't ask for this, you can ignore this email; your password stays the same.`;

  return {
    subject: `Reset your ${BRAND} password`,
    text: `We received a request to reset your ${BRAND} password. Choose a new password here:\n${link}\n\n${note}`,
    html: renderEmail({
      heading: "Reset your password",
      paragraphs: [`We received a request to reset your ${BRAND} password.`],
      button: { text: "Choose a new password", link },
      note,
    }),
  };
};

const accountSetupEmail = ({ name, link, hours, isAdmin }) => {
  const where = `${BRAND}${isAdmin ? " (admin panel)" : ""}`;
  const note = `This link expires in ${hours} hours. If it expires, use "Forgot password" on the sign-in page.`;

  return {
    subject: isAdmin ? `Your ${BRAND} admin account` : `Your ${BRAND} account is ready`,
    text: `${greeting(name)}\n\nAn account has been created for you on ${where}. Set your password here:\n${link}\n\n${note}`,
    html: renderEmail({
      heading: "Set your password",
      paragraphs: [
        `${greeting(name)} an account has been created for you on ${where}. Choose a password to start using it.`,
      ],
      button: { text: "Set password", link },
      note,
    }),
  };
};

module.exports = {
  verificationEmail,
  passwordResetEmail,
  accountSetupEmail,
};
