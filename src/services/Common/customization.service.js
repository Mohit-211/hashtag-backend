const { Op } = require("sequelize");

const {
  CustomizationOption,
  CustomizationOptionValue,
  ProductCustomization,
  Product,
  CustomizationOptionValuePricing,
  ProductCustomizationValue,
} = require("../../models");

const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return value === true || value === "true" || value === 1 || value === "1";
};

const createCustomizationOption = async (body) => {
  try {
    const { name, description, allow_text_input, allow_image_upload } = body;

    /*
     * Validate name
     */

    if (!name || !String(name).trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "name is required");
    }

    const optionName = String(name).trim();

    /*
     * Check duplicate
     */

    const existing = await CustomizationOption.findOne({
      where: {
        name: optionName,
      },
    });

    if (existing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Customization option already exists",
      );
    }

    /*
     * Create option
     */

    const option = await CustomizationOption.create({
      name: optionName,

      description:
        description !== undefined && description !== "" ? description : null,

      allow_text_input: parseBoolean(allow_text_input, false),

      allow_image_upload: parseBoolean(allow_image_upload, false),
    });

    return option;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllCustomizationOptions = async (query) => {
  try {
    const { page = 1, limit = 20, search = "" } = query;

    // ============================================================
    // PAGINATION
    // ============================================================

    const pageNum = Math.max(1, parseInt(page, 10) || 1);

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // ============================================================
    // FILTER
    // ============================================================

    const where = {
      is_active: true,
    };

    if (search && search.trim()) {
      const searchValue = search.trim();

      where[Op.or] = [
        {
          name: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          description: {
            [Op.like]: `%${searchValue}%`,
          },
        },
      ];
    }

    // ============================================================
    // GET CUSTOMIZATION OPTIONS
    // ============================================================

    const { rows, count } = await CustomizationOption.findAndCountAll({
      where,

      include: [
        {
          model: CustomizationOptionValue,
          as: "values",

          required: false,

          where: {
            is_active: true,
          },

          separate: true,

          // ====================================================
          // VALUE PRICING
          // ====================================================

          include: [
            {
              model: CustomizationOptionValuePricing,
              as: "pricing",

              required: false,

              where: {
                is_active: true,
              },

              order: [
                ["min_quantity", "ASC"],
                ["quantity", "ASC"],
                ["id", "ASC"],
              ],
            },
          ],

          // Values are returned in creation order.
          order: [["id", "ASC"]],
        },
      ],

      // ========================================================
      // OPTION ORDER
      // ========================================================

      // No sort_order anymore.
      // Use creation order.
      order: [["id", "ASC"]],

      // ========================================================
      // PAGINATION
      // ========================================================

      limit: limitNum,

      offset: (pageNum - 1) * limitNum,
    });

    // ============================================================
    // RESPONSE
    // ============================================================

    return {
      data: rows,

      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getCustomizationOptionById = async (id) => {
  try {
    const option = await CustomizationOption.findOne({
      where: {
        id,
        is_active: true,
      },

      include: [
        {
          model: CustomizationOptionValue,
          as: "values",

          required: false,

          where: {
            is_active: true,
          },

          separate: true,

          include: [
            {
              model: CustomizationOptionValuePricing,
              as: "pricing",
              required: false,
              where: {
                is_active: true,
              },
              order: [
                ["min_quantity", "ASC"],
                ["quantity", "ASC"],
                ["id", "ASC"],
              ],
            },
          ],

          // Values in creation order
          order: [["id", "ASC"]],
        },
      ],
    });

    if (!option) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option not found",
      );
    }

    return option;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateCustomizationOption = async (id, body) => {
  try {
    const option = await CustomizationOption.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!option) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option not found",
      );
    }

    const { name, description, allow_text_input, allow_image_upload } = body;

    const updateData = {};

    if (name !== undefined && String(name).trim()) {
      updateData.name = String(name).trim();
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (allow_text_input !== undefined) {
      updateData.allow_text_input = parseBoolean(allow_text_input);
    }

    if (allow_image_upload !== undefined) {
      updateData.allow_image_upload = parseBoolean(allow_image_upload);
    }

    await option.update(updateData);

    return await getCustomizationOptionById(id);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteCustomizationOption = async (id) => {
  try {
    const option = await CustomizationOption.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!option) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option not found",
      );
    }

    /*
     * Soft delete the customization option.
     *
     * We DO NOT physically delete the option or its values because
     * existing carts/orders may still contain their IDs and pricing
     * snapshots.
     *
     * We only make them unavailable for future product selection.
     */

    // 1. Deactivate the customization option itself
    await option.update({
      is_active: false,
      slug: `${option.slug}-deleted-${option.id}`,
    });

    // 2. Deactivate all product assignments for this option
    await ProductCustomization.update(
      {
        is_active: false,
      },
      {
        where: {
          customization_option_id: option.id,
          is_active: true,
        },
      },
    );

    // 3. Deactivate all value assignments belonging to those
    //    product customizations.
    const productCustomizations = await ProductCustomization.findAll({
      where: {
        customization_option_id: option.id,
      },
      attributes: ["id"],
    });

    if (productCustomizations.length > 0) {
      await ProductCustomizationValue.update(
        {
          is_active: false,
        },
        {
          where: {
            product_customization_id: {
              [Op.in]: productCustomizations.map((item) => item.id),
            },
            is_active: true,
          },
        },
      );
    }

    return option;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const createCustomizationOptionValue = async (optionId, body) => {
  try {
    const option = await CustomizationOption.findOne({
      where: {
        id: optionId,
        is_active: true,
      },
    });

    if (!option) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option not found",
      );
    }

    const { name, pricing_type = "FIXED", fixed_price } = body;

    if (!name || !String(name).trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "name is required");
    }

    if (!["FIXED", "TIERED", "QUANTITY_BASED"].includes(pricing_type)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "pricing_type must be FIXED, TIERED, or QUANTITY_BASED",
      );
    }

    let fixedPrice = null;

    if (pricing_type === "FIXED") {
      if (
        fixed_price === undefined ||
        fixed_price === null ||
        fixed_price === ""
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "fixed_price is required for FIXED pricing",
        );
      }

      fixedPrice = Number(fixed_price);

      if (!Number.isFinite(fixedPrice) || fixedPrice < 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "fixed_price must be 0 or greater",
        );
      }
    }

    if (pricing_type === "TIERED" || pricing_type === "QUANTITY_BASED") {
      fixedPrice = null;
    }

    const optionValue = await CustomizationOptionValue.create({
      customization_option_id: optionId,

      name: String(name).trim(),

      pricing_type,

      fixed_price: fixedPrice,

      is_active: true,
    });

    return optionValue;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateCustomizationOptionValue = async (id, body) => {
  try {
    const optionValue = await CustomizationOptionValue.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!optionValue) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option value not found",
      );
    }

    const { name, pricing_type, fixed_price } = body;

    const updateData = {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, "name is required");
      }

      updateData.name = String(name).trim();
    }

    if (pricing_type !== undefined) {
      if (!["FIXED", "TIERED", "QUANTITY_BASED"].includes(pricing_type)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "pricing_type must be FIXED, TIERED, or QUANTITY_BASED",
        );
      }

      updateData.pricing_type = pricing_type;

      if (pricing_type === "TIERED" || pricing_type === "QUANTITY_BASED") {
        updateData.fixed_price = null;
      }
    }

    const finalPricingType =
      updateData.pricing_type || optionValue.pricing_type;

    if (finalPricingType !== optionValue.pricing_type) {
      await CustomizationOptionValuePricing.update(
        {
          is_active: false,
        },
        {
          where: {
            customization_option_value_id: id,
            is_active: true,
          },
        },
      );
    }

    if (finalPricingType === "FIXED") {
      const finalFixedPrice =
        fixed_price !== undefined
          ? Number(fixed_price)
          : Number(optionValue.fixed_price);

      if (!Number.isFinite(finalFixedPrice) || finalFixedPrice < 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "fixed_price must be 0 or greater",
        );
      }

      updateData.fixed_price = finalFixedPrice;
    }

    if (
      (finalPricingType === "TIERED" ||
        finalPricingType === "QUANTITY_BASED") &&
      fixed_price !== undefined
    ) {
      updateData.fixed_price = null;
    }

    await optionValue.update(updateData);

    return optionValue;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteCustomizationOptionValue = async (id) => {
  try {
    const optionValue = await CustomizationOptionValue.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!optionValue) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Customization option value not found",
      );
    }

    /*
     * Soft delete the customization option value.
     *
     * We DO NOT physically delete it because existing carts/orders
     * may still contain this value and its pricing snapshot.
     */

    // 1. Deactivate the customization option value itself
    await optionValue.update({
      is_active: false,
    });

    // 2. Deactivate all product mappings using this value
    await ProductCustomizationValue.update(
      {
        is_active: false,
      },
      {
        where: {
          customization_option_value_id: optionValue.id,
          is_active: true,
        },
      },
    );

    return {
      message: "Customization option value deleted successfully",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const validateQuantityRange = async ({
  valueId,
  minQuantity,
  maxQuantity,
  excludeId = null,
}) => {
  if (!Number.isInteger(minQuantity) || minQuantity < 1) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "min_quantity must be a whole number greater than 0.",
    );
  }

  if (
    maxQuantity !== null &&
    maxQuantity !== undefined &&
    (!Number.isInteger(maxQuantity) || maxQuantity < minQuantity)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "max_quantity must be empty or greater than or equal to min_quantity.",
    );
  }

  const existing = await CustomizationOptionValuePricing.findAll({
    where: {
      customization_option_value_id: valueId,

      is_active: true,
    },
  });

  const overlaps = existing.some((tier) => {
    // QUANTITY_BASED pricing rows do not have min/max ranges.
    // Only TIERED rows should be checked here.
    if (tier.min_quantity === null || tier.min_quantity === undefined) {
      return false;
    }

    if (excludeId && Number(tier.id) === Number(excludeId)) {
      return false;
    }

    const existingMin = Number(tier.min_quantity);

    const existingMax =
      tier.max_quantity === null ? Infinity : Number(tier.max_quantity);

    const newMax =
      maxQuantity === null || maxQuantity === undefined
        ? Infinity
        : Number(maxQuantity);

    return minQuantity <= existingMax && existingMin <= newMax;
  });

  if (overlaps) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This quantity range overlaps with an existing pricing tier.",
    );
  }
};

const getPricingByValueId = async (valueId) => {
  const value = await CustomizationOptionValue.findOne({
    where: {
      id: valueId,
      is_active: true,
    },
  });

  if (!value) {
    throw new ApiError(httpStatus.NOT_FOUND, "Customization value not found.");
  }
  const order =
    value.pricing_type === "QUANTITY_BASED"
      ? [
          ["quantity", "ASC"],
          ["id", "ASC"],
        ]
      : [
          ["min_quantity", "ASC"],
          ["id", "ASC"],
        ];

  return CustomizationOptionValuePricing.findAll({
    where: {
      customization_option_value_id: valueId,
      is_active: true,
    },

    order,
  });
};

const createPricing = async (valueId, body) => {
  const value = await CustomizationOptionValue.findOne({
    where: {
      id: valueId,
      is_active: true,
    },
  });

  if (!value) {
    throw new ApiError(httpStatus.NOT_FOUND, "Customization value not found.");
  }

  /* ============================================================
   * FIXED
   * ============================================================ */

  if (value.pricing_type === "FIXED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Pricing entries cannot be added to a FIXED customization value.",
    );
  }

  /* ============================================================
   * TIERED
   * ============================================================ */

  if (value.pricing_type === "TIERED") {
    const minQuantity = Number(body.min_quantity);

    const maxQuantity =
      body.max_quantity === null ||
      body.max_quantity === undefined ||
      body.max_quantity === ""
        ? null
        : Number(body.max_quantity);

    const price = Number(body.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "price must be 0 or greater.");
    }

    await validateQuantityRange({
      valueId,
      minQuantity,
      maxQuantity,
    });

    return CustomizationOptionValuePricing.create({
      customization_option_value_id: valueId,

      min_quantity: minQuantity,

      max_quantity: maxQuantity,

      quantity: null,

      price,

      is_active: true,
    });
  }

  /* ============================================================
   * QUANTITY BASED
   * ============================================================ */

  if (value.pricing_type === "QUANTITY_BASED") {
    const quantity = Number(body.quantity);

    const price = Number(body.price);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "quantity must be a whole number greater than 0.",
      );
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "price must be 0 or greater.");
    }

    /* ============================================================
     * CHECK DUPLICATE QUANTITY
     * ============================================================ */

    const existingPricing = await CustomizationOptionValuePricing.findOne({
      where: {
        customization_option_value_id: valueId,
        quantity,
        is_active: true,
      },
    });

    if (existingPricing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This quantity already has a pricing entry.",
      );
    }

    return CustomizationOptionValuePricing.create({
      customization_option_value_id: valueId,

      min_quantity: null,

      max_quantity: null,

      quantity,

      price,

      is_active: true,
    });
  }

  /* ============================================================
   * INVALID PRICING TYPE
   * ============================================================ */

  throw new ApiError(httpStatus.BAD_REQUEST, "Invalid pricing type.");
};

const updatePricing = async (pricingId, body) => {
  const pricing = await CustomizationOptionValuePricing.findOne({
    where: {
      id: pricingId,
      is_active: true,
    },
  });

  if (!pricing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Pricing tier not found.");
  }

  const value = await CustomizationOptionValue.findOne({
    where: {
      id: pricing.customization_option_value_id,
      is_active: true,
    },
  });

  if (!value) {
    throw new ApiError(httpStatus.NOT_FOUND, "Customization value not found.");
  }

  /* ============================================================
   * FIXED
   * ============================================================ */

  if (value.pricing_type === "FIXED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Pricing entries cannot be updated for a FIXED customization value.",
    );
  }

  /* ============================================================
   * TIERED
   * ============================================================ */

  if (value.pricing_type === "TIERED") {
    const minQuantity = Number(body.min_quantity);

    const maxQuantity =
      body.max_quantity === null ||
      body.max_quantity === undefined ||
      body.max_quantity === ""
        ? null
        : Number(body.max_quantity);

    const price = Number(body.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "price must be 0 or greater.");
    }

    await validateQuantityRange({
      valueId: pricing.customization_option_value_id,

      minQuantity,

      maxQuantity,

      excludeId: pricingId,
    });

    await pricing.update({
      min_quantity: minQuantity,
      max_quantity: maxQuantity,
      quantity: null,
      price,
    });

    return pricing;
  }

  /* ============================================================
   * QUANTITY BASED
   * ============================================================ */

  if (value.pricing_type === "QUANTITY_BASED") {
    const quantity = Number(body.quantity);

    const price = Number(body.price);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "quantity must be a whole number greater than 0.",
      );
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "price must be 0 or greater.");
    }

    /* ============================================================
     * CHECK DUPLICATE QUANTITY
     * ============================================================ */

    const existingPricing = await CustomizationOptionValuePricing.findOne({
      where: {
        customization_option_value_id: pricing.customization_option_value_id,

        quantity,

        is_active: true,

        id: {
          [Op.ne]: pricingId,
        },
      },
    });

    if (existingPricing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This quantity already has a pricing entry.",
      );
    }

    await pricing.update({
      min_quantity: null,
      max_quantity: null,
      quantity,
      price,
    });

    return pricing;
  }

  /* ============================================================
   * INVALID PRICING TYPE
   * ============================================================ */

  throw new ApiError(httpStatus.BAD_REQUEST, "Invalid pricing type.");
};

const deletePricing = async (pricingId) => {
  const pricing = await CustomizationOptionValuePricing.findOne({
    where: {
      id: pricingId,
      is_active: true,
    },
  });

  if (!pricing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Pricing tier not found.");
  }

  await pricing.update({
    is_active: false,
  });

  return pricing;
};

const assignProductCustomizations = async (productId, customizations) => {
  try {
    /*
     * Check product
     */

    const product = await Product.findByPk(productId);

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    /*
     * Validate array
     */

    if (!Array.isArray(customizations)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "customizations must be an array",
      );
    }

    /*
     * Empty array removes all current assignments
     *
     * We soft-delete the mappings instead of physically deleting them
     * so existing carts/orders remain historically valid.
     */

    if (!customizations.length) {
      const existingMappings = await ProductCustomization.findAll({
        where: {
          product_id: productId,
          is_active: true,
        },
        attributes: ["id"],
      });

      const mappingIds = existingMappings.map((item) => item.id);

      if (mappingIds.length) {
        await ProductCustomizationValue.update(
          {
            is_active: false,
          },
          {
            where: {
              product_customization_id: {
                [Op.in]: mappingIds,
              },
              is_active: true,
            },
          },
        );

        await ProductCustomization.update(
          {
            is_active: false,
          },
          {
            where: {
              id: {
                [Op.in]: mappingIds,
              },
              is_active: true,
            },
          },
        );
      }

      return [];
    }

    /*
     * Extract option IDs
     */

    const optionIds = customizations.map((item) =>
      Number(item?.customization_option_id),
    );

    /*
     * Validate option IDs
     */

    if (optionIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid customization_option_id",
      );
    }

    /*
     * Prevent duplicate options
     */

    if (new Set(optionIds).size !== optionIds.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Duplicate customization options are not allowed",
      );
    }

    /*
     * Validate value_ids
     */

    for (const item of customizations) {
      if (!Array.isArray(item.value_ids)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `value_ids must be an array for customization option ${item.customization_option_id}`,
        );
      }

      const valueIds = item.value_ids.map((id) => Number(id));

      if (valueIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid value_ids for customization option ${item.customization_option_id}`,
        );
      }

      if (new Set(valueIds).size !== valueIds.length) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Duplicate values are not allowed for customization option ${item.customization_option_id}`,
        );
      }
    }

    /*
     * Fetch active options
     *
     * Deleted/inactive options cannot be assigned again.
     */

    const options = await CustomizationOption.findAll({
      where: {
        id: {
          [Op.in]: optionIds,
        },
        is_active: true,
      },
    });

    const validOptionIds = new Set(options.map((option) => Number(option.id)));

    /*
     * Make sure every option exists and is active
     */

    for (const optionId of optionIds) {
      if (!validOptionIds.has(optionId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Customization option ${optionId} not found or inactive`,
        );
      }
    }

    /*
     * Extract all selected value IDs
     */

    const allValueIds = [
      ...new Set(
        customizations.flatMap((item) =>
          item.value_ids.map((id) => Number(id)),
        ),
      ),
    ];

    /*
     * Fetch active values
     *
     * Deleted/inactive values cannot be assigned again.
     */

    const values = await CustomizationOptionValue.findAll({
      where: {
        id: {
          [Op.in]: allValueIds,
        },
        is_active: true,
      },
    });

    /*
     * Map value -> option
     */

    const valueOptionMap = new Map(
      values.map((value) => [
        Number(value.id),
        Number(value.customization_option_id),
      ]),
    );

    /*
     * Validate selected values belong
     * to their selected option
     */

    for (const item of customizations) {
      const optionId = Number(item.customization_option_id);

      for (const valueId of item.value_ids) {
        const selectedOptionId = valueOptionMap.get(Number(valueId));

        if (!selectedOptionId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Customization value ${valueId} not found or inactive`,
          );
        }

        if (selectedOptionId !== optionId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Customization value ${valueId} does not belong to option ${optionId}`,
          );
        }
      }
    }

    /*
     * Deactivate existing mappings
     *
     * Do NOT destroy them because an existing cart/order may still
     * reference their customization configuration.
     */

    const existingMappings = await ProductCustomization.findAll({
      where: {
        product_id: productId,
        is_active: true,
      },
      attributes: ["id"],
    });

    const existingMappingIds = existingMappings.map((item) => item.id);

    if (existingMappingIds.length) {
      await ProductCustomizationValue.update(
        {
          is_active: false,
        },
        {
          where: {
            product_customization_id: {
              [Op.in]: existingMappingIds,
            },
            is_active: true,
          },
        },
      );

      await ProductCustomization.update(
        {
          is_active: false,
        },
        {
          where: {
            id: {
              [Op.in]: existingMappingIds,
            },
            is_active: true,
          },
        },
      );
    }

    /*
     * Create new active product mappings
     */

    const mappings = customizations.map((item) => ({
      product_id: productId,
      customization_option_id: Number(item.customization_option_id),
      is_active: true,
    }));

    const createdMappings = await ProductCustomization.bulkCreate(mappings);

    /*
     * Create selected value mappings
     */

    const valueMappings = [];

    customizations.forEach((item, index) => {
      const mapping = createdMappings[index];

      item.value_ids.forEach((valueId) => {
        valueMappings.push({
          product_customization_id: mapping.id,
          customization_option_value_id: Number(valueId),
          is_active: true,
        });
      });
    });

    if (valueMappings.length) {
      await ProductCustomizationValue.bulkCreate(valueMappings);
    }

    /*
     * Return updated active customizations
     */

    return await getProductCustomizations(productId);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductCustomizations = async (productId) => {
  try {
    /*
     * Check product
     */

    const product = await Product.findByPk(productId);

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    /*
     * Get customizations
     */

    const data = await ProductCustomization.findAll({
      where: {
        product_id: productId,
        is_active: true,
      },

      include: [
        {
          model: CustomizationOption,
          as: "option",
          where: {
            is_active: true,
          },
          required: true,
          include: [
            {
              model: CustomizationOptionValue,
              as: "values",
              required: false,
              where: {
                is_active: true,
              },
              separate: true,
              include: [
                {
                  model: CustomizationOptionValuePricing,
                  as: "pricing",
                  required: false,

                  where: {
                    is_active: true,
                  },

                  order: [
                    ["min_quantity", "ASC"],
                    ["quantity", "ASC"],
                    ["id", "ASC"],
                  ],
                },
              ],

              order: [["id", "ASC"]],
            },
          ],
        },

        /*
         * Selected values for this product
         */

        {
          model: ProductCustomizationValue,

          as: "values",

          required: false,

          where: {
            is_active: true,
          },

          include: [
            {
              model: CustomizationOptionValue,

              as: "value",

              required: true,

              where: {
                is_active: true,
              },
            },
          ],
        },
      ],

      order: [["id", "ASC"]],
    });

    return data;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  createCustomizationOption,
  getAllCustomizationOptions,
  getCustomizationOptionById,
  updateCustomizationOption,
  deleteCustomizationOption,
  createCustomizationOptionValue,
  updateCustomizationOptionValue,
  deleteCustomizationOptionValue,
  getPricingByValueId,
  createPricing,
  updatePricing,
  deletePricing,
  assignProductCustomizations,
  getProductCustomizations,
};
