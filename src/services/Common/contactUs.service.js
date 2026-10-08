const httpStatus = require('http-status');
const slugify = require('slugify');

const { ContactUs } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { sendAdminContactUsNotification, sendContactUsConfirmation } = require('./email.service');


const createContactUs = async (reqBody) => {
  try {
    const contactUsObj = {
      name: reqBody.name,
      email: reqBody.email,
      mobile: reqBody.mobile,
      reason: reqBody.reason,
      message: reqBody.message,
      status: "NEW",
    };

    const contactUsDoc = await ContactUs.create(contactUsObj);

    if (!contactUsDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to submit inquiry."
      );
    }

    // Send confirmation to customer
    await sendContactUsConfirmation(
      contactUsObj.email,
      contactUsObj.name,
      contactUsObj.reason
    );

    // Notify admin
    await sendAdminContactUsNotification(
      contactUsObj.name,
      contactUsObj.email,
      contactUsObj.mobile,
      contactUsObj.reason,
      contactUsObj.message
    );

  return {
  success: true,
  message:
    "Your inquiry has been submitted successfully. Our team will contact you soon.",
};
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const getAllContactUs = async () => {
  try {
    const contactUsDoc = await ContactUs.findAll({
      attributes: [
        "id",
        "name",
        "email",
        "mobile",
        "reason",
        "message",
        "status",
        "created_at",
      ],
      where: {
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return contactUsDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const updateContactUs = async (reqBody, id) => {
  try {
    const contactUsDoc = await ContactUs.findByPk(id);

    if (!contactUsDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inquiry not found.");
    }

    if (
      reqBody.status &&
      ["NEW", "IN_PROGRESS", "CLOSED"].includes(reqBody.status)
    ) {
      contactUsDoc.status = reqBody.status;
    }

    await contactUsDoc.save();

    return contactUsDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const deleteContactUs = async (id) => {
  try {
    const contactUsDoc = await ContactUs.findByPk(id);

    if (!contactUsDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inquiry not found.");
    }

    await contactUsDoc.destroy();

    return {
      success: true,
      message: "Contact inquiry deleted successfully.",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

module.exports = {
    createContactUs,
    getAllContactUs,
    updateContactUs,
    deleteContactUs
};