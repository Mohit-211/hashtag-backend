// Email sent from the admin panel's Settings page to check the mail server settings.
// Returns { subject, text, html }.

const { brandName, greeting, renderEmail } = require("./layout");

const settingsTestEmail = ({ name }) => {
  const message = `This is a test from the ${brandName()} admin panel. The mail server settings work.`;

  return {
    subject: `Test email from ${brandName()}`,
    text: `${greeting(name)}\n\n${message}`,
    html: renderEmail({
      heading: "Your email settings work",
      paragraphs: [`${greeting(name)} ${message.charAt(0).toLowerCase()}${message.slice(1)}`],
      note: "You got this because someone pressed \"Send a test email\" on the Settings page.",
    }),
  };
};

module.exports = { settingsTestEmail };
