const nodemailer = require('nodemailer');
const config = require('../../config/config');
const logger = require('../../config/logger');
const { forgotPasswordSendOTPFormat, emailVerificationFormat } = require('../../../public/Email_Template');
const ApiError = require('../../utils/ApiError');
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

// OTP mails are sent without waiting for delivery; a failed send is only logged.
const sendOtpMail = async (to, subject, template, otp) => {
    try {
        const message = {
            from: `${config.email.from}`,
            to: `${to}`,
            subject,
            text: `Please click on the following link to verify your email`,
            html: `${template(otp)}`,
        };
        transport.sendMail(message, (error) => {
            if (error) {
                console.log('Email sent error:  ', error);
            }
        });

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const sendEmailVerification = (to, otp) =>
    sendOtpMail(to, 'Please verify your email', emailVerificationFormat, otp);

const sendForgotPasswordOTP = (to, otp) =>
    sendOtpMail(to, 'Forget Password Request', forgotPasswordSendOTPFormat, otp);

const sendAdminCredentials = async (to, password) => {
	const subject = "Welcome to Hashtag Billionaire: Your Login Credentials";
	const text = `Dear User,

  Welcome to Hashtag Billionaire! You have been successfully registered by our admin. Please find your login credentials below:

  Email Address: ${to}
  Temporary Password: ${password}

  
  For security reasons, we highly recommend changing your password after your first login. If you did not create this account, please ignore this email.
  
  Best Regards,
  Hashtag Billionaire Team`;
	return await sendEmail(to, subject, text);
};

const sendUserCredentials = async (to, password) => {
	const subject = "Welcome to Hashtag Billionaire: Your Login Credentials";
	const text = `Dear User,
    
    Welcome to the Hashtag Billionaire! Our admin has successfully registered you. Please find your login credentials below.
    Now, get ready to embark on an exciting journey of creativity! 
    To access your account, please visit our secure login page with your login credentials below:
  

    Email Address: ${to}
    Password: ${password}
    
    Remember to keep these details safe and secure! 
    If you have any issues or have additional questions, please send an email to support@glamlink.net
    
    Best Regards,
    Hashtag Billionaire Team`;

	return await sendEmail(to, subject, text);
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
    sendForgotPasswordOTP,
    sendEmailVerification,
    sendAdminCredentials,
    sendUserCredentials,
    sendContactUsConfirmation,
    sendAdminContactUsNotification,
    sendSourcingRequestConfirmation,
    sendSourcingRequestStatusEmail
};
