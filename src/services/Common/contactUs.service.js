const httpStatus = require('http-status');
const { Op } = require('sequelize');

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

const CONTACT_US_ATTRIBUTES = ["id", "name", "email", "mobile", "reason", "message", "status", "created_at"];

// Without `page`: every active row as a plain array (what the admin panel calls today).
// With `page`: one page as { data, pagination }, filtered by `search` and `status`.
const getAllContactUs = async (query = {}) => {
  try {
    const where = { is_active: true };
    const order = [["created_at", "DESC"]];

    if (query.page === undefined) {
      return await ContactUs.findAll({ attributes: CONTACT_US_ATTRIBUTES, where, order });
    }

    const page = Math.max(parseInt(query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 100);

    if (query.status) {
      where.status = query.status;
    }
    const search = String(query.search || "").trim();
    if (search) {
      where[Op.or] = ["name", "email", "mobile", "reason", "message"].map((field) => ({
        [field]: { [Op.like]: `%${search}%` },
      }));
    }

    const { count, rows } = await ContactUs.findAndCountAll({
      attributes: CONTACT_US_ATTRIBUTES,
      where,
      order,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      data: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
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