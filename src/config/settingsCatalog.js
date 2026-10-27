// Every setting the admin panel manages (Settings page), in the order it shows them. Values
// live in the app_settings table; while a value hasn't moved there yet, the variable of the
// same name in .env is used instead (see settings.js).
//
// type:     string | url | email | sender | integer | number | boolean | enum | color |
//           code2 (two capital letters) | hosts (comma-separated host names)
// secret:   encrypted in the database; the admin panel shows only the first and last 5
//           characters until the settings key is entered
// required: the site doesn't work fully without it; it can't be saved empty
// default:  used when neither the admin nor .env has a value (a function gets the others)

const GROUPS = [
  { key: "website", label: "Website and links" },
  { key: "email", label: "Email sending" },
  { key: "email_look", label: "How emails look" },
  { key: "shipping", label: "Shipping" },
  { key: "payments", label: "Payments" },
  { key: "suppliers", label: "Suppliers" },
  { key: "services", label: "Other services" },
  { key: "shop", label: "Shop behaviour" },
];

const SETTINGS = [
  // Website and links
  {
    key: "FRONTEND_URL",
    group: "website",
    label: "Website address",
    type: "url",
    required: true,
    description: "The shop, e.g. https://hashtagbillionaire.com. Used in the links in account emails and in the email footer.",
  },
  {
    key: "ADMIN_FRONTEND_URL",
    group: "website",
    label: "Admin panel address",
    type: "url",
    required: true,
    description: "Used in the set-password and reset-password links emailed to admins.",
  },
  {
    key: "IMAGE_BASE_URL",
    group: "website",
    label: "API address",
    type: "url",
    required: true,
    description: "This server's public address, e.g. https://node.hashtagbillionaire.com. Uploaded images are linked from it.",
  },

  // Email sending
  { key: "SMTP_HOST", group: "email", label: "Mail server", type: "string", required: true, description: "e.g. smtp.gmail.com" },
  {
    key: "SMTP_PORT",
    group: "email",
    label: "Mail server port",
    type: "integer",
    min: 1,
    max: 65535,
    default: 587,
    description: "Usually 587. The connection is upgraded to TLS.",
  },
  {
    key: "SMTP_USERNAME",
    group: "email",
    label: "Mail server username",
    type: "string",
    description: "Leave empty only if the mail server needs no sign-in.",
  },
  { key: "SMTP_PASSWORD", group: "email", label: "Mail server password", type: "string", secret: true },
  {
    key: "EMAIL_FROM",
    group: "email",
    label: "Sender",
    type: "sender",
    required: true,
    description: 'Who emails come from, e.g. "HashtagBillionaire <no-reply@hashtagbillionaire.com>". The address must be one the mail server may send from.',
  },
  {
    key: "CONTACT_INBOX",
    group: "email",
    label: "Team inbox",
    type: "email",
    required: true,
    description: "Receives contact-form messages and new sourcing requests.",
  },

  // How emails look
  { key: "EMAIL_BRAND_NAME", group: "email_look", label: "Name in emails", type: "string", default: "HashtagBillionaire" },
  {
    key: "EMAIL_LOGO_URL",
    group: "email_look",
    label: "Logo",
    type: "url",
    default: (get) => (get("FRONTEND_URL") ? `${get("FRONTEND_URL")}/logo_header.png` : null),
    description: "Shown at the top of every email. Default: the website's header logo.",
  },
  { key: "EMAIL_BRAND_COLOR", group: "email_look", label: "Button colour", type: "color", default: "#fae52e" },
  { key: "EMAIL_BRAND_TEXT_COLOR", group: "email_look", label: "Button text colour", type: "color", default: "#1c1c19" },

  // Shipping
  {
    key: "SHIP_FROM_NAME",
    group: "shipping",
    label: "Sender name",
    type: "string",
    required: true,
    description: "On shipping labels and rate quotes.",
  },
  { key: "SHIP_FROM_PHONE", group: "shipping", label: "Sender phone", type: "string", required: true },
  { key: "SHIP_FROM_ADDRESS_LINE1", group: "shipping", label: "Sender street address", type: "string", required: true },
  { key: "SHIP_FROM_CITY", group: "shipping", label: "Sender city", type: "string", required: true },
  { key: "SHIP_FROM_STATE", group: "shipping", label: "Sender state", type: "code2", required: true, description: "Two-letter code, e.g. TX." },
  { key: "SHIP_FROM_POSTAL_CODE", group: "shipping", label: "Sender ZIP code", type: "string", required: true },
  { key: "SHIP_FROM_COUNTRY", group: "shipping", label: "Sender country", type: "code2", default: "US" },
  {
    key: "DEFAULT_PACKAGE_WEIGHT_LB",
    group: "shipping",
    label: "Default weight per item (lb)",
    type: "number",
    min: 0.01,
    max: 150,
    default: 1,
    description: "For items with no weight from the supplier or the admin.",
  },
  {
    key: "SHIPSTATION_API_KEY",
    group: "shipping",
    label: "ShipStation API key",
    type: "string",
    secret: true,
    required: true,
    description: "Rates, labels and tracking.",
  },

  // Payments
  {
    key: "SQUARE_ENVIRONMENT",
    group: "payments",
    label: "Square mode",
    type: "enum",
    options: ["production", "sandbox"],
    required: true,
    description: "sandbox takes test payments only.",
  },
  { key: "SQUARE_APP_ID", group: "payments", label: "Square application ID", type: "string", required: true },
  { key: "SQUARE_LOCATION_ID", group: "payments", label: "Square location ID", type: "string", required: true },
  { key: "SQUARE_ACCESS_TOKEN", group: "payments", label: "Square access token", type: "string", secret: true, required: true },
  {
    key: "PAYPAL_ENVIRONMENT",
    group: "payments",
    label: "PayPal mode",
    type: "enum",
    options: ["production", "sandbox"],
    required: true,
    description: "sandbox takes test payments only.",
  },
  { key: "PAYPAL_CLIENT_ID", group: "payments", label: "PayPal client ID", type: "string", required: true },
  { key: "PAYPAL_CLIENT_SECRET", group: "payments", label: "PayPal client secret", type: "string", secret: true, required: true },

  // Suppliers
  { key: "SAGE_ACCT_ID", group: "suppliers", label: "SAGE account number", type: "integer", min: 1, required: true },
  { key: "SAGE_LOGIN_ID", group: "suppliers", label: "SAGE login ID", type: "string", required: true },
  { key: "SAGE_API_KEY", group: "suppliers", label: "SAGE API key", type: "string", secret: true, required: true },
  { key: "SS_USERNAME", group: "suppliers", label: "S&S Activewear account number", type: "string", required: true },
  { key: "SS_PASSWORD", group: "suppliers", label: "S&S Activewear API key", type: "string", secret: true, required: true },
  {
    key: "OTTOCAP_IMAGE_HOSTS",
    group: "suppliers",
    label: "OttoCap image hosts",
    type: "hosts",
    description: "Comma-separated host names the OttoCap image proxy may fetch from. Empty: the hosts in the OttoCap catalog.",
  },

  // Other services
  {
    key: "GOOGLE_MAPS_API_KEY",
    group: "services",
    label: "Google Maps API key",
    type: "string",
    secret: true,
    description: "Finds the map position of saved addresses. Without it, addresses save without one.",
  },
  {
    key: "OPENAI_API_KEY",
    group: "services",
    label: "OpenAI API key",
    type: "string",
    secret: true,
    description: "Matches supplier colour names to colour swatches during imports.",
  },
  {
    key: "TURNSTILE_SECRET_KEY",
    group: "services",
    label: "Cloudflare Turnstile secret key",
    type: "string",
    secret: true,
    description: "When set, the contact and sourcing forms need a Turnstile check. Set it only once the shop shows the widget.",
  },

  // Shop behaviour
  {
    key: "EXPOSE_SUPPLIER_COST",
    group: "shop",
    label: "Send supplier cost to the shop",
    type: "boolean",
    default: false,
    description: "On only until the shop prices SAGE products from price_tiers; shoppers can read cost while it's on.",
  },
  {
    key: "DEFAULT_API_DATA_LIMIT",
    group: "shop",
    label: "Default page size",
    type: "integer",
    min: 1,
    max: 200,
    default: 15,
    description: "For the few lists that don't say how many rows they want.",
  },
];

const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map((setting) => [setting.key, setting]));

module.exports = { GROUPS, SETTINGS, SETTINGS_BY_KEY };
