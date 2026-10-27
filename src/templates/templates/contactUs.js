// Contact-us emails. Each returns the HTML body; email.service sets subject and plain text.

const { brandName, greeting, renderEmail } = require("./layout");

// To the customer who filled in the form.
const contactUsConfirmationTemplate = (name, reason) =>
  renderEmail({
    heading: "We've received your message",
    paragraphs: [
      `${greeting(name)} thanks for contacting ${brandName()}.`,
      `We've received your inquiry${reason ? ` about "${reason}"` : ""}. Our team will get back to you soon.`,
    ],
    note: "Please don't reply to this email; replies to this address may not be read.",
  });

// To the team inbox.
const adminContactUsNotificationTemplate = (name, email, mobile, reason, message) =>
  renderEmail({
    heading: "New contact-us inquiry",
    paragraphs: ["Someone filled in the contact form on the website."],
    details: [
      ["Name", name],
      ["Email", email],
      ["Phone", mobile],
      ["Reason", reason],
    ],
    quote: message || "(no message)",
    note: "You can also see this inquiry in the admin panel under Contact Us.",
  });

module.exports = {
  contactUsConfirmationTemplate,
  adminContactUsNotificationTemplate,
};
