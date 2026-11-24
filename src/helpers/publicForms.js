const httpStatus = require("http-status");

const ApiError = require("../utils/ApiError");

// The website's contact and sourcing forms, checked again here before anything is saved or emailed
// (audit point F16). Both forms email a confirmation to the address typed, so it must be one
// address, and every field keeps the form's own limits. The limits and subjects are the website's:
// hashtag-next src/lib/validation.ts, src/components/support/SupportContactForm.tsx,
// src/components/conatctUs/Conciergesourcingsection.tsx and src/data/supportData.ts (the same in
// 7590672, live, and 11c00f8).

// The website's email rule (zod 4's): letters, digits and _'+- in dot-separated parts before the @;
// letters, digits and hyphens in the domain, which ends in two or more letters. Spaces, commas,
// semicolons, quotes and <> can't appear, so nodemailer always reads exactly one recipient.
const EMAIL_PATTERN = /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

// The support form's subjects (hashtag-next src/data/supportData.ts). email.service.js answers the
// first four from support@ and General Inquiry from info@.
const CONTACT_SUBJECTS = ["Order Issue", "Customization Help", "Shipping & Delivery", "Payment Issue", "General Inquiry"];

const INVALID_EMAIL = "Enter a single valid email address.";

const refuse = (message) => new ApiError(httpStatus.BAD_REQUEST, message);

const count = (number) => number.toLocaleString("en-US");

// What the customer typed: trimmed, each line break as "\n". Browsers send a textarea's line breaks
// as "\r\n", which would otherwise count twice against the form's limit.
const typed = (value) => value.replace(/\r\n?/g, "\n").trim();

const isBlank = (value) => value === undefined || value === null || (typeof value === "string" && !typed(value));

// A text field between `min` and `max` characters, counted like the website (one per UTF-16 unit,
// a line break once). A number sent as JSON (a phone number, say) counts as its digits, as the
// contact form saved it before. Returns the typed text, or null for an optional field left empty.
const textField = (value, { label, min = 0, max, optional = false }) => {
  if (isBlank(value)) {
    if (optional) return null;
    throw refuse(`${label} is required.`);
  }
  const limits = min > 0 ? `${label} must be ${count(min)} to ${count(max)} characters.` : `${label} must be ${count(max)} characters or fewer.`;
  const raw = Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== "string") throw refuse(limits);
  const text = typed(raw);
  if (text.length < min || text.length > max) throw refuse(limits);
  return text;
};

// One email address of up to `max` characters, trimmed.
const emailField = (value, { max }) => {
  if (isBlank(value)) throw refuse("Email is required.");
  if (typeof value !== "string") throw refuse(INVALID_EMAIL);
  const email = value.trim();
  if (email.length > max) throw refuse(`Email must be ${count(max)} characters or fewer.`);
  if (!EMAIL_PATTERN.test(email)) throw refuse(INVALID_EMAIL);
  return email;
};

const subjectField = (value) => {
  const subject = typeof value === "string" ? value.trim() : "";
  if (!CONTACT_SUBJECTS.includes(subject)) throw refuse("Choose a subject from the list.");
  return subject;
};

// POST contactUs, checked in the form's order so the first message is the one the form would show.
// contactus.email is VARCHAR(100) in production (the model says 255), so the address stops at 100
// characters, not the form's 254. The website never sends a phone number; one sent elsewhere
// keeps to its column.
const checkContactForm = (body = {}) => ({
  name: textField(body.name, { label: "Full name", min: 2, max: 80 }),
  email: emailField(body.email, { max: 100 }),
  reason: subjectField(body.reason),
  message: textField(body.message, { label: "Message", min: 10, max: 2000 }),
  mobile: textField(body.mobile, { label: "Phone number", max: 30, optional: true }),
});

// POST sourcing-requests/create, in the form's order. The email is kept in lower case, as before.
const checkSourcingRequest = (body = {}) => ({
  name: textField(body.name, { label: "Name", min: 2, max: 80 }),
  email: emailField(body.email, { max: 254 }).toLowerCase(),
  company: textField(body.company, { label: "Company", max: 120, optional: true }),
  requested_name: textField(body.requested_name, { label: "Brand or product name", min: 2, max: 200 }),
  details: textField(body.details, { label: "Details", max: 2000, optional: true }),
});

module.exports = {
  EMAIL_PATTERN,
  CONTACT_SUBJECTS,
  checkContactForm,
  checkSourcingRequest,
};
