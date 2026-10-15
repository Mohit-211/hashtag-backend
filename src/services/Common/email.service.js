const nodemailer = require('nodemailer');
const config = require('../../config/config');
const httpStatus = require('http-status');
const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');
const { verificationEmail, passwordResetEmail, accountSetupEmail } = require('../../templates/authEmails');
const { contactUsConfirmationTemplate, adminContactUsNotificationTemplate, sourcingRequestConfirmationTemplate, sourcingRequestStatusTemplate } = require('../../../public/Email_Template/contactEmailTemplates');

const transport = nodemailer.createTransport(config.email.smtp);

if (config.env !== 'test') {
    transport
        .verify()
        .then(() => logger.info('Connected to email server successfully😊.'))
        .catch(() => logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env 🥺'));
};


const sendEmail = async (to, subject, text, html) => {
    try {
        const msg = { from: config.email.from, to, subject, text };
        if (html) msg.html = html;
        return await transport.sendMail(msg);

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
  return await sendEmail("anshita.varyani@mypageseo.com", subject, `New contact us inquiry from ${name} (${email}): ${message}`, html);
};

const sendSourcingRequestConfirmation = async (to, name, requestedName) => {
  const subject = "We've Received Your Sourcing Request";
  const html = sourcingRequestConfirmationTemplate(name, requestedName);
  return await sendEmail(to, subject, `We've received your sourcing request for ${requestedName}.`, html);
};

const sendSourcingRequestStatusEmail = async (to, name, requestedName, status, adminNotes) => {
  const result = sourcingRequestStatusTemplate(name, requestedName, status, adminNotes);
  if (!result) return;
  return await sendEmail(to, result.subject, result.subject, result.html);
};


module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAccountSetupEmail,
    sendContactUsConfirmation,
    sendAdminContactUsNotification,
    sendSourcingRequestConfirmation,
    sendSourcingRequestStatusEmail
};
