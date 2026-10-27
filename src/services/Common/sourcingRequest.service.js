const httpStatus = require("http-status");
const { Op } = require("sequelize");
const { SourcingRequest, SourcingRequestAttachment } = require("../../models");
const ApiError = require("../../utils/ApiError");
const {
  sendSourcingRequestConfirmation,
  sendAdminSourcingRequestNotification,
  sendSourcingRequestStatusEmail,
} = require("./email.service");
const settings = require("../../config/settings");

const createSourcingRequest = async (body, files) => {
  try {
    const {
      name,
      email,
      company,
      requested_name,
      details,
    } = body;

    if (!name?.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Name is required.");
    }

    if (!email?.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email is required.");
    }

    if (!requested_name?.trim()) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Brand or product name is required.",
      );
    }

    const images = files?.images || [];

    // Maximum 10 images
    if (images.length > 10) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "You can upload a maximum of 10 images.",
      );
    }

    const request = await SourcingRequest.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company?.trim() || null,
      requested_name: requested_name.trim(),
      details: details?.trim() || null,
      status: "PENDING",
    });

    // Save attachments
    if (images.length) {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];

        await SourcingRequestAttachment.create({
          sourcing_request_id: request.id,
          file_type: "image",
          file_name: file.filename,
          file_uri: `${settings.getRequired("IMAGE_BASE_URL")}/images/${file.filename}`,
          file_size: file.size,
          is_primary: i === 0,
          is_active: true,
        });
      }
    }

    try {
      await sendSourcingRequestConfirmation(
        request.email,
        request.name,
        request.requested_name,
      );
    } catch (emailError) {
      console.error(
        "Sourcing request confirmation email failed:",
        emailError.message,
      );
    }

    try {
      await sendAdminSourcingRequestNotification(
        request.name,
        request.email,
        request.company,
        request.requested_name,
        request.details,
        images.length,
      );
    } catch (emailError) {
      console.error(
        "Sourcing request team notification failed:",
        emailError.message,
      );
    }

    return request;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllSourcingRequests = async (query) => {
  try {
    let { page = 1, limit = 20, search = "", status } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (search?.trim()) {
      const searchValue = search.trim();

      where[Op.or] = [
        {
          name: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          email: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          company: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          requested_name: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          details: {
            [Op.like]: `%${searchValue}%`,
          },
        },
      ];
    }

    const { count, rows } = await SourcingRequest.findAndCountAll({
      where,

      include: [
        {
          model: SourcingRequestAttachment,
          as: "attachments",
          required: false,
          where: {
            is_active: true,
          },
          attributes: [
            "id",
            "file_type",
            "file_name",
            "file_uri",
            "file_size",
            "is_primary",
            "created_at",
          ],
        },
      ],

      limit,
      offset,

      order: [["created_at", "DESC"]],

      distinct: true,
    });

    return {
      data: rows,

      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateSourcingRequest = async (id, body) => {
  try {
    const { user, status, admin_notes } = body;

    const request = await SourcingRequest.findOne({
      where: {
        id,
      },
    });

    if (!request) {
      throw new ApiError(httpStatus.NOT_FOUND, "Sourcing request not found.");
    }

    /*
     |--------------------------------------------------------------------------
     | VALIDATE STATUS
     |--------------------------------------------------------------------------
     */

    const allowedStatuses = [
      "PENDING",
      "IN_REVIEW",
      "ACCEPTED",
      "REJECTED",
      "COMPLETED",
    ];

    if (status && !allowedStatuses.includes(status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid sourcing request status.",
      );
    }

    const previousStatus = request.status;

    if (admin_notes !== undefined) {
      request.admin_notes = admin_notes;
    }

    if (status) {
      request.status = status;
    }

    request.reviewed_by = user?.id || null;
    request.reviewed_at = new Date();

    /*
     |--------------------------------------------------------------------------
     | BRAND / PRODUCT HANDLING
     |--------------------------------------------------------------------------
     |
     | Temporarily commented out.
     |
     | Need manager confirmation before deciding whether:
     |
     | 1. Accepted BRAND request should automatically create a Brand
     | 2. Accepted PRODUCT request should create/link a Product
     |
     |--------------------------------------------------------------------------
     */

    /*
    if (
      request.request_type === "BRAND" &&
      status === "ACCEPTED" &&
      previousStatus !== "ACCEPTED"
    ) {
      const brandName = request.requested_name.trim();

      const existingBrand = await Brand.findOne({
        where: {
          [Op.or]: [
            {
              name: {
                [Op.like]: brandName,
              },
            },
            {
              slug: slugify(brandName, {
                lower: true,
                strict: true,
                trim: true,
              }),
            },
          ],
        },
      });

      if (existingBrand) {
        request.brand_id = existingBrand.id;
      } else {
        const brand = await Brand.create({
          name: brandName,

          slug: slugify(brandName, {
            lower: true,
            strict: true,
            trim: true,
          }),

          description: request.details || null,

          show_on_website: false,

          is_active: true,
        });

        request.brand_id = brand.id;
      }
    }
    */

    await request.save();

    if (status && status !== previousStatus) {
      try {
        await sendSourcingRequestStatusEmail(
          request.email,
          request.name,
          request.requested_name,
          request.status,
          request.admin_notes,
        );
      } catch (emailError) {
        console.error(
          "Sourcing request status email failed:",
          emailError.message,
        );
      }
    }

    return request;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  createSourcingRequest,
  getAllSourcingRequests,
  updateSourcingRequest,
};
