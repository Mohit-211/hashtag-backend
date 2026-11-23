const nodemailer = require('nodemailer');
const settings = require('../../config/settings');
const httpStatus = require('http-status');
const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');
const {
    verificationEmail,
    passwordResetEmail,
    accountSetupEmail,
    passwordChangedEmail,
    contactUsConfirmationTemplate,
    adminContactUsNotificationTemplate,
    sourcingRequestConfirmationTemplate,
    adminSourcingRequestNotificationTemplate,
    sourcingRequestStatusTemplate,
    orderConfirmedEmail,
    orderCancelledEmail,
    orderShippedEmail,
    orderDeliveredEmail,
    approvalEmail,
    settingsTestEmail,
} = require('../../templates');

// Built from the Settings page values (Email sending), and again when they change.
let mail = { signature: null, transport: null };

const getTransport = () => {
    const user = settings.get('SMTP_USERNAME');
    const smtp = {
        host: settings.getRequired('SMTP_HOST'),
        port: settings.get('SMTP_PORT'),
        secure: false,
        requireTLS: true,
        // A server that needs no sign-in gets no username.
        ...(user && { auth: { user, pass: settings.get('SMTP_PASSWORD') } }),
    };
    const signature = JSON.stringify(smtp);
    if (mail.signature !== signature) {
        mail = { signature, transport: nodemailer.createTransport(smtp) };
    }
    return mail.transport;
};

// Logs whether the mail server accepts the current settings: at start, and when they change.
const verifyTransport = async () => {
    try {
        await getTransport().verify();
        logger.info('Connected to email server successfully😊.');
    } catch (error) {
        logger.warn(`Unable to connect to email server (${error.message}). Check Email sending on the Settings page 🥺`);
    }
};

settings.onChange((keys) => {
    if (keys.some((key) => key.startsWith('SMTP_'))) verifyTransport();
});

// Who each kind of email to customers comes from (the client's addresses, 20 Nov 2026; Settings
// page, Email sending):
//   order    order confirmed, cancelled, shipped, delivered; artwork to approve
//   support  sign-up, password and account emails; support questions (order, shipping, payment,
//            customization)
//   info     general inquiries from the contact form
//   quotes   sourcing requests ("can't find it")
// Replies go back to the same address. Without one, the default sender (EMAIL_FROM) is used.
const SENDERS = {
    order: 'EMAIL_FROM_ORDERS',
    support: 'EMAIL_FROM_SUPPORT',
    info: 'EMAIL_FROM_INFO',
    quotes: 'EMAIL_FROM_QUOTES',
};

// "Name <address>" → address.
const addressOf = (sender) => (String(sender || '').match(/<([^<>]+)>\s*$/)?.[1] ?? String(sender || '')).trim() || null;

// { from, replyTo, contact } for one kind of email: contact is the address named in its footer.
const senderFor = (kind) => {
    const from = settings.get(SENDERS[kind]) || settings.get('EMAIL_FROM') || undefined;
    const address = addressOf(from);
    return { from, replyTo: address || undefined, contact: address || undefined };
};

// options.from / options.replyTo: who it comes from and where replies go. Without them, the
// default sender, and replies go to it.
const sendEmail = async (to, subject, text, html, { from, replyTo } = {}) => {
    try {
        // Without a sender, the mail server's default is used, as before the Settings page.
        const msg = { from: from || settings.get('EMAIL_FROM') || undefined, to, subject, text };
        if (replyTo) msg.replyTo = replyTo;
        if (html) msg.html = html;
        return await getTransport().sendMail(msg);

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

// One email from a template result ({ subject, text, html }) to a customer, from `kind`'s address.
const sendAs = (kind, to, email) => {
    const { from, replyTo } = senderFor(kind);
    return sendEmail(to, email.subject, email.text, email.html, { from, replyTo });
};

// Account emails, from support@. Delivery is awaited so a failed send surfaces as an error.
const sendVerificationEmail = (to, { name, link, hours }) =>
    sendAs('support', to, verificationEmail({ name, link, hours, contact: senderFor('support').contact }));

const sendPasswordResetEmail = (to, { link, minutes }) =>
    sendAs('support', to, passwordResetEmail({ link, minutes, contact: senderFor('support').contact }));

const sendAccountSetupEmail = (to, { name, link, hours, isAdmin }) =>
    sendAs('support', to, accountSetupEmail({ name, link, hours, isAdmin, contact: senderFor('support').contact }));

const sendPasswordChangedEmail = (to, { name } = {}) =>
    sendAs('support', to, passwordChangedEmail({ name, contact: senderFor('support').contact }));

// The website's support form (hashtag-next src/data/supportData.ts): Order Issue, Customization
// Help, Shipping & Delivery and Payment Issue are support questions (support@); General Inquiry,
// and anything else, is a general inquiry (info@).
const SUPPORT_REASON = /order|ship|deliver|track|pay|refund|return|custom|revision|issue|problem|damage|wrong/i;
const contactKind = (reason) => (SUPPORT_REASON.test(String(reason || '')) ? 'support' : 'info');

const sendContactUsConfirmation = async (to, name, reason) => {
  const kind = contactKind(reason);
  const { from, replyTo, contact } = senderFor(kind);
  const subject = "We've Received Your Inquiry";
  const html = contactUsConfirmationTemplate(name, reason, contact);
  return await sendEmail(to, subject, `We've received your inquiry (${reason}). Our team will get back to you soon.`, html, { from, replyTo });
};

// To the team inbox, from the default sender as before. Replying answers the customer.
const sendAdminContactUsNotification = async (name, email, mobile, reason, message) => {
  const subject = contactKind(reason) === 'support' ? `New support question: ${reason}` : "New Contact Us Inquiry";
  const html = adminContactUsNotificationTemplate(name, email, mobile, reason, message);
  return await sendEmail(settings.getRequired('CONTACT_INBOX'), subject, `New contact us inquiry from ${name} (${email}): ${message}`, html, { replyTo: email || undefined });
};

// Sourcing requests, from quotes@.
const sendSourcingRequestConfirmation = async (to, name, requestedName) => {
  const { from, replyTo, contact } = senderFor('quotes');
  const subject = "We've Received Your Sourcing Request";
  const html = sourcingRequestConfirmationTemplate(name, requestedName, contact);
  return await sendEmail(to, subject, `We've received your sourcing request for ${requestedName}.`, html, { from, replyTo });
};

const sendAdminSourcingRequestNotification = async (name, email, company, requestedName, details, imageCount) => {
  const subject = "New Sourcing Request";
  const html = adminSourcingRequestNotificationTemplate(name, email, company, requestedName, details, imageCount);
  return await sendEmail(settings.getRequired('CONTACT_INBOX'), subject, `New sourcing request from ${name} (${email}) for ${requestedName}`, html, { replyTo: email || undefined });
};

const sendSourcingRequestStatusEmail = async (to, name, requestedName, status, adminNotes) => {
  const { from, replyTo, contact } = senderFor('quotes');
  const result = sourcingRequestStatusTemplate(name, requestedName, status, adminNotes, contact);
  if (!result) return;
  return await sendEmail(to, result.subject, result.subject, result.html, { from, replyTo });
};

// Order emails, from order@. `order` is what orderEmails.service.js reads from the order.
const withOrderContact = (order) => ({ ...order, contact: senderFor('order').contact });

const sendOrderConfirmedEmail = (to, order) => sendAs('order', to, orderConfirmedEmail(withOrderContact(order)));
const sendOrderCancelledEmail = (to, order, options) => sendAs('order', to, orderCancelledEmail(withOrderContact(order), options));
const sendOrderShippedEmail = (to, order) => sendAs('order', to, orderShippedEmail(withOrderContact(order)));
const sendOrderDeliveredEmail = (to, order) => sendAs('order', to, orderDeliveredEmail(withOrderContact(order)));

// Artwork for the customer to review and approve (templates/approvals.js), sent from the admin
// panel's Artwork approval page. Awaited: the page shows whether it went.
const sendApprovalEmail = (to, approval) => sendAs('order', to, approvalEmail(withOrderContact(approval)));


// From the Settings page: proves the mail server settings work. With `key` (a sender setting
// such as EMAIL_FROM_ORDERS, `label` its name on the page) it's sent from that sender, to check
// the mail account may send as it. Returns the sender it was sent as.
const sendSettingsTestEmail = async (to, name, { key, label } = {}) => {
    const from = (key && settings.get(key)) || settings.get('EMAIL_FROM') || null;
    const address = key ? addressOf(from) : null;
    const mail = settingsTestEmail({ name, label: key ? label : null, from, address, account: settings.get('SMTP_USERNAME') });
    await sendEmail(to, mail.subject, mail.text, mail.html, key ? { from: from || undefined, replyTo: address || undefined } : {});
    return from;
};


module.exports = {
    verifyTransport,
    senderFor,
    sendSettingsTestEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAccountSetupEmail,
    sendPasswordChangedEmail,
    sendContactUsConfirmation,
    sendAdminContactUsNotification,
    sendSourcingRequestConfirmation,
    sendAdminSourcingRequestNotification,
    sendSourcingRequestStatusEmail,
    sendOrderConfirmedEmail,
    sendOrderCancelledEmail,
    sendOrderShippedEmail,
    sendOrderDeliveredEmail,
    sendApprovalEmail,
};
