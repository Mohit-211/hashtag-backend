// Account emails: verification, password reset and account setup links.

const BRAND = "Hashtag Billionaire";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const layout = ({ heading, intro, buttonText, link, note }) => `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:15px;">${escapeHtml(buttonText)}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#555;">If the button doesn't work, copy this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">${escapeHtml(note)}</p>
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:12px;color:#888;">${BRAND}</p>
  </body>
</html>`;

const greeting = (name) => (name ? `Hi ${name},` : "Hi,");

const verificationEmail = ({ name, link, hours }) => ({
  subject: `Verify your email for ${BRAND}`,
  text: `${greeting(name)}\n\nPlease verify your email address to activate your ${BRAND} account:\n${link}\n\nThis link expires in ${hours} hours. Accounts that aren't verified within ${hours} hours are deleted automatically, after which you can register again.\n\nIf you didn't create this account, you can ignore this email.`,
  html: layout({
    heading: "Verify your email",
    intro: `${greeting(name)} please verify your email address to activate your ${BRAND} account.`,
    buttonText: "Verify email",
    link,
    note: `This link expires in ${hours} hours. Accounts that aren't verified within ${hours} hours are deleted automatically, after which you can register again. If you didn't create this account, you can ignore this email.`,
  }),
});

const passwordResetEmail = ({ link, minutes }) => ({
  subject: `Reset your ${BRAND} password`,
  text: `We received a request to reset your ${BRAND} password. Choose a new password here:\n${link}\n\nThis link expires in ${minutes} minutes and can only be used once.\n\nIf you didn't ask for this, you can ignore this email; your password stays the same.`,
  html: layout({
    heading: "Reset your password",
    intro: `We received a request to reset your ${BRAND} password.`,
    buttonText: "Choose a new password",
    link,
    note: `This link expires in ${minutes} minutes and can only be used once. If you didn't ask for this, you can ignore this email; your password stays the same.`,
  }),
});

const accountSetupEmail = ({ name, link, hours, isAdmin }) => ({
  subject: isAdmin
    ? `Your ${BRAND} admin account`
    : `Your ${BRAND} account is ready`,
  text: `${greeting(name)}\n\nAn account has been created for you on ${BRAND}${isAdmin ? " (admin panel)" : ""}. Set your password here:\n${link}\n\nThis link expires in ${hours} hours. If it expires, use "Forgot password" on the sign-in page.`,
  html: layout({
    heading: "Set your password",
    intro: `${greeting(name)} an account has been created for you on ${BRAND}${isAdmin ? " (admin panel)" : ""}. Choose a password to start using it.`,
    buttonText: "Set password",
    link,
    note: `This link expires in ${hours} hours. If it expires, use "Forgot password" on the sign-in page.`,
  }),
});

module.exports = {
  verificationEmail,
  passwordResetEmail,
  accountSetupEmail,
};
