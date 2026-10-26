// Sourcing-request emails to the customer who asked for a product or brand, and to the team inbox.

const { greeting, renderEmail } = require("./layout");

// Sent when the request is submitted. Returns the HTML body.
const sourcingRequestConfirmationTemplate = (name, requestedName) =>
  renderEmail({
    heading: "We've received your sourcing request",
    paragraphs: [
      `${greeting(name)} thanks for your request${requestedName ? ` for "${requestedName}"` : ""}.`,
      "Our team will look into it and let you know by email when its status changes.",
    ],
  });

// To the team inbox, when the request is submitted. Returns the HTML body.
const adminSourcingRequestNotificationTemplate = (name, email, company, requestedName, details, imageCount) =>
  renderEmail({
    heading: "New sourcing request",
    paragraphs: ["Someone asked for a product or brand on the website."],
    details: [
      ["Name", name],
      ["Email", email],
      ["Company", company],
      ["Asked for", requestedName],
      ["Images", imageCount ? String(imageCount) : "none"],
    ],
    quote: details || "(no details)",
    note: "You can also see this request in the admin panel under Sourcing Requests.",
  });

// Wording per status (sourcing_requests.status). PENDING sends nothing.
const STATUS_MESSAGES = {
  IN_REVIEW: {
    subject: "We're reviewing your sourcing request",
    heading: "Your request is being reviewed",
    body: "Our team is now reviewing your request. We'll email you again when there's an update.",
  },
  ACCEPTED: {
    subject: "Your sourcing request was accepted",
    heading: "Good news: we can source it",
    body: "We've accepted your request and are working on getting it into the catalog.",
  },
  REJECTED: {
    subject: "Update on your sourcing request",
    heading: "We couldn't source this one",
    body: "Unfortunately we aren't able to source this item at the moment.",
  },
  COMPLETED: {
    subject: "Your sourcing request is complete",
    heading: "It's ready",
    body: "We've completed your request. The item is now available on the website.",
  },
};

// Sent when an admin changes the status. Returns { subject, html }, or null when the
// status needs no email.
const sourcingRequestStatusTemplate = (name, requestedName, status, adminNotes) => {
  const message = STATUS_MESSAGES[String(status || "").toUpperCase()];
  if (!message) return null;

  return {
    subject: message.subject,
    html: renderEmail({
      heading: message.heading,
      paragraphs: [
        `${greeting(name)} here's an update on your request${requestedName ? ` for "${requestedName}"` : ""}.`,
        message.body,
      ],
      quote: adminNotes ? `Note from our team:\n${adminNotes}` : undefined,
    }),
  };
};

module.exports = {
  sourcingRequestConfirmationTemplate,
  adminSourcingRequestNotificationTemplate,
  sourcingRequestStatusTemplate,
};
