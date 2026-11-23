// Artwork approval emails to the customer: a link to the page where they check how each item will
// look, then approve it or request changes (orderApproval.service.js sends them from the admin
// panel's Artwork approval page). They say "artwork", as the customer's page does, never "proof".
// From the order address (order@, email.service.js); replies go back to it. Returns
// { subject, text, html }.
//
//   kind         "first" (the first email), "updated" (new versions) or "reminder"
//   items        [{ name, detail }]: the order's lines, each with where it stands and its options,
//                no prices
//   message      the team's message, or empty
//   link         the approval page with the customer's key

const { greeting, renderEmail } = require("./layout");

const PRODUCTION = "We'll start production once everything is approved.";

// The intro follows the greeting and says something the heading doesn't.
const WORDING = {
  first: {
    subject: (number) => `Your artwork for order ${number} is ready to review`,
    heading: "Your artwork is ready to review",
    intro: (number) => `you can now see how the items in your order ${number} will look with your artwork.`,
    ask: "Please check each item, then approve it or request changes.",
  },
  updated: {
    subject: (number) => `Updated artwork for order ${number} is ready to review`,
    heading: "We've updated your artwork",
    intro: (number) => `your order ${number} has new artwork previews to check.`,
    ask: "Please take another look, then approve each item or request changes.",
  },
  reminder: {
    subject: (number) => `Reminder: your artwork for order ${number} is waiting for your approval`,
    heading: "Your artwork is waiting for your approval",
    intro: (number) => `just a reminder about the artwork for your order ${number}.`,
    ask: "Please check the items still waiting, then approve each one or request changes.",
  },
};

const BUTTON = "Review your artwork";
const WARNING = "Anyone with this link can approve, so please don't forward it.";
// The HTML footer says it already (layout.js), so only the plain text has it.
const QUESTIONS = "Questions? Just reply to this email.";

const approvalEmail = ({ kind, name, orderNumber, items = [], message, link, contact }) => {
  const wording = WORDING[kind] || WORDING.first;
  const paragraphs = [`${greeting(name)} ${wording.intro(orderNumber)}`, `${wording.ask} ${PRODUCTION}`];
  // Labelled, so the customer knows who wrote it.
  const quote = message ? `A note from our team:\n${message}` : "";

  return {
    subject: wording.subject(orderNumber),
    text: [
      ...paragraphs,
      quote,
      items.map((item) => `- ${item.name}${item.detail ? ` (${item.detail})` : ""}`).join("\n"),
      `${BUTTON}: ${link}`,
      WARNING,
      QUESTIONS,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: renderEmail({
      heading: wording.heading,
      paragraphs,
      quote: quote || undefined,
      items,
      button: { text: BUTTON, link },
      note: WARNING,
      contact,
    }),
  };
};

module.exports = { approvalEmail };
