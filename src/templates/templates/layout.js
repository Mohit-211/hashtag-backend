// Shared HTML layout for every email. All values are escaped here, so templates can pass
// customer-entered text (names, messages, notes) straight in.

const BRAND = "Hashtag Billionaire";

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
 * @param {string} [email.note]                  small print at the bottom
 */
const renderEmail = ({ heading, paragraphs = [], button, details = [], quote, note }) => {
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

  const buttonHtml = button
    ? `<p style="margin:0 0 24px;"><a href="${escapeHtml(button.link)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:15px;">${escapeHtml(button.text)}</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#555;">If the button doesn't work, copy this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${escapeHtml(button.link)}">${escapeHtml(button.link)}</a></p>`
    : "";

  const noteHtml = note
    ? `<p style="margin:0;font-size:13px;color:#555;line-height:1.5;">${escapeHtml(note)}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
          ${paragraphHtml}${detailsHtml}${quoteHtml}${buttonHtml}${noteHtml}
        </td>
      </tr>
    </table>
    <p style="text-align:center;font-size:12px;color:#888;">${BRAND}</p>
  </body>
</html>`;
};

module.exports = {
  BRAND,
  escapeHtml,
  greeting,
  renderEmail,
};
