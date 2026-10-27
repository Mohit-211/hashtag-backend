const nodemailer = require('nodemailer');
const settings = require('../../config/settings');
const httpStatus = require('http-status');
const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');
const {
    verificationEmail,
    passwordResetEmail,
    accountSetupEmail,
    contactUsConfirmationTemplate,
    adminContactUsNotificationTemplate,
    sourcingRequestConfirmationTemplate,
    adminSourcingRequestNotificationTemplate,
    sourcingRequestStatusTemplate,
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


const sendEmail = async (to, subject, text, html) => {
    try {
        // Without a sender, the mail server's default is used, as before the Settings page.
        const msg = { from: settings.get('EMAIL_FROM') || undefined, to, subject, text };
        if (html) msg.html = html;
        return await getTransport().sendMail(msg);

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

// Account emails. Delivery is awaited so a failed send surfaces as an error.
const sendVerificationEmail = (to, { name, link, hours }) => {
    const mail = verificationEmail({ name, link, hours });
    return sendEmail(to, mail.subject, mail.text, mail.html);
};

const sendPasswordResetEmail = (to, { link, minutes }) => {
    const mail = passwordResetEmail({ link, minutes });
    return sendEmail(to, mail.subject, mail.text, mail.html);
};

const sendAccountSetupEmail = (to, { name, link, hours, isAdmin }) => {
    const mail = accountSetupEmail({ name, link, hours, isAdmin });
    return sendEmail(to, mail.subject, mail.text, mail.html);
};

const sendContactUsConfirmation = async (to, name, reason) => {
  const subject = "We've Received Your Inquiry";
  const html = contactUsConfirmationTemplate(name, reason);
  return await sendEmail(to, subject, `We've received your inquiry (${reason}). Our team will get back to you soon.`, html);
};

const sendAdminContactUsNotification = async (name, email, mobile, reason, message) => {
  const subject = "New Contact Us Inquiry";
  const html = adminContactUsNotificationTemplate(name, email, mobile, reason, message);
  return await sendEmail(settings.getRequired('CONTACT_INBOX'), subject, `New contact us inquiry from ${name} (${email}): ${message}`, html);
};

const sendSourcingRequestConfirmation = async (to, name, requestedName) => {
  const subject = "We've Received Your Sourcing Request";
  const html = sourcingRequestConfirmationTemplate(name, requestedName);
  return await sendEmail(to, subject, `We've received your sourcing request for ${requestedName}.`, html);
};

const sendAdminSourcingRequestNotification = async (name, email, company, requestedName, details, imageCount) => {
  const subject = "New Sourcing Request";
  const html = adminSourcingRequestNotificationTemplate(name, email, company, requestedName, details, imageCount);
  return await sendEmail(settings.getRequired('CONTACT_INBOX'), subject, `New sourcing request from ${name} (${email}) for ${requestedName}`, html);
};

const sendSourcingRequestStatusEmail = async (to, name, requestedName, status, adminNotes) => {
  const result = sourcingRequestStatusTemplate(name, requestedName, status, adminNotes);
  if (!result) return;
  return await sendEmail(to, result.subject, result.subject, result.html);
};


// From the Settings page: proves the mail server settings work.
const sendSettingsTestEmail = (to, name) => {
    const mail = settingsTestEmail({ name });
    return sendEmail(to, mail.subject, mail.text, mail.html);
};


module.exports = {
    verifyTransport,
    sendSettingsTestEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAccountSetupEmail,
    sendContactUsConfirmation,
    sendAdminContactUsNotification,
    sendSourcingRequestConfirmation,
    sendAdminSourcingRequestNotification,
    sendSourcingRequestStatusEmail
};
