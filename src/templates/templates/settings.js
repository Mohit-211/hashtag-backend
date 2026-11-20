// Email sent from the admin panel's Settings page to check the mail server settings, or one
// sender setting ("Order emails come from"…). Returns { subject, text, html }.

const { brandName, greeting, renderEmail } = require("./layout");

// label: the sender setting being tested, from: its value, address: the address in it, account:
// the mail server username (SMTP_USERNAME). Without label, the mail server test as before.
const settingsTestEmail = ({ name, label, from, address, account }) => {
  if (label) {
    const intro = `this is a test of "${label}" on the ${brandName()} Settings page. It was sent as ${from}.`;
    const ownAddress = account && address && account.toLowerCase() === address.toLowerCase();
    const check = ownAddress
      ? `That's the mail account's own address, so it always shows as the sender.`
      : `If your inbox shows it from ${address}, this address works. If it shows ${account || "another address"} instead, the mail account can't send as ${address} yet: in that account's Gmail, add it under Settings → Accounts → Send mail as. Replies go to ${address} either way.`;

    return {
      subject: `Test email from ${address}`,
      text: `${greeting(name)} ${intro}\n\n${check}`,
      html: renderEmail({
        heading: "Testing a sender",
        paragraphs: [`${greeting(name)} ${intro}`, check],
        note: "You got this because someone pressed \"Send test email\" on the Settings page.",
      }),
    };
  }

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
