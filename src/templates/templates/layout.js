// Shared HTML layout for every email. All values are escaped here, so templates can pass
// customer-entered text (names, messages, notes) straight in. The name, logo and colours come
// from the Settings page (How emails look), which defaults to the website's own (Q59); they're
// read on every email, so a change applies to the next one.

const settings = require("../../config/settings");

const brandName = () => settings.get("EMAIL_BRAND_NAME");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Escapes, then keeps the line breaks someone typed.
const multiline = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");

const greeting = (name) => (name ? `Hi ${name},` : "Hi,");

/**
 * @param {object} email
 * @param {string} email.heading
 * @param {string[]} [email.paragraphs]          plain text, one entry per paragraph
 * @param {{text: string, link: string}} [email.button]
 * @param {Array<[string, string]>} [email.details] label/value rows
 * @param {string} [email.quote]                 longer text shown in a box (e.g. a message)
 * @param {Array<{name: string, detail?: string, quantity?: number, amount?: string}>} [email.items]
 *                                               order lines
 * @param {Array<[string, string, boolean?]>} [email.totals] label/amount rows under the lines; true = bold
 * @param {string} [email.note]                  small print at the bottom
 * @param {string} [email.contact]               the address replies go to, named in the footer
 *                                               (without it, the team inbox)
 */
const renderEmail = ({ heading, paragraphs = [], button, details = [], quote, items = [], totals = [], note, contact }) => {
  const brand = brandName();
  const logoUrl = settings.get("EMAIL_LOGO_URL");
  const color = settings.get("EMAIL_BRAND_COLOR");
  const textColor = settings.get("EMAIL_BRAND_TEXT_COLOR");
  const site = settings.get("FRONTEND_URL");
  const contactInbox = settings.get("CONTACT_INBOX");

  const paragraphHtml = paragraphs
    .map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escapeHtml(text)}</p>`)
    .join("");

  const detailsHtml = details.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;border-collapse:collapse;">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#555;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;vertical-align:top;">${multiline(value || "—")}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const quoteHtml = quote
    ? `<div style="margin:0 0 20px;padding:12px 16px;background:#f5f5f5;border-left:3px solid #111;font-size:14px;line-height:1.5;">${multiline(quote)}</div>`
    : "";

  const itemsHtml = items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${totals.length ? 8 : 20}px;font-size:14px;border-collapse:collapse;">${items
        .map(
          (item) =>
            `<tr><td style="padding:8px 8px 8px 0;border-top:1px solid #eee;vertical-align:top;"><strong>${escapeHtml(item.name)}</strong>${item.detail ? `<br><span style="color:#555;font-size:13px;">${escapeHtml(item.detail)}</span>` : ""}</td><td style="padding:8px;border-top:1px solid #eee;vertical-align:top;white-space:nowrap;color:#555;">${item.quantity ? `× ${escapeHtml(item.quantity)}` : ""}</td><td style="padding:8px 0 8px 8px;border-top:1px solid #eee;vertical-align:top;text-align:right;white-space:nowrap;">${escapeHtml(item.amount || "")}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const totalsHtml = totals.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;border-collapse:collapse;">${totals
        .map(
          ([label, value, bold]) =>
            `<tr><td style="padding:3px 8px 3px 0;text-align:right;color:${bold ? "#222" : "#555"};${bold ? "font-weight:bold;" : ""}">${escapeHtml(label)}</td><td style="padding:3px 0 3px 8px;text-align:right;white-space:nowrap;width:1%;${bold ? "font-weight:bold;" : ""}">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const buttonHtml = button
    ? `<p style="margin:0 0 24px;"><a href="${escapeHtml(button.link)}" style="display:inline-block;padding:12px 24px;background:${escapeHtml(color)};color:${escapeHtml(textColor)};text-decoration:none;border-radius:4px;font-size:15px;font-weight:bold;">${escapeHtml(button.text)}</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#555;">If the button doesn't work, copy this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(button.link)}">${escapeHtml(button.link)}</a></p>`
    : "";

  const noteHtml = note
    ? `<p style="margin:0;font-size:13px;color:#555;line-height:1.5;">${escapeHtml(note)}</p>`
    : "";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
      ${logoUrl ? `<tr>
        <td style="padding:28px 32px 0;">
          <a href="${escapeHtml(site || "")}"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand)}" width="160" style="display:block;border:0;width:160px;max-width:100%;height:auto;"></a>
        </td>
      </tr>` : ""}
      <tr>
        <td style="padding:24px 32px 32px;">
          <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
          ${paragraphHtml}${detailsHtml}${quoteHtml}${itemsHtml}${totalsHtml}${buttonHtml}${noteHtml}
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:12px;color:#888;line-height:1.6;">${escapeHtml(brand)}${site ? ` · <a href="${escapeHtml(site)}" style="color:#888;">${escapeHtml(new URL(site).host)}</a>` : ""}${contact ? `<br>Questions? Reply to this email, or write to <a href="mailto:${escapeHtml(contact)}" style="color:#888;">${escapeHtml(contact)}</a>` : contactInbox ? `<br>Questions? Write to <a href="mailto:${escapeHtml(contactInbox)}" style="color:#888;">${escapeHtml(contactInbox)}</a>` : ""}</p>
  </body>
</html>`;
};

module.exports = {
  brandName,
  escapeHtml,
  greeting,
  renderEmail,
};
