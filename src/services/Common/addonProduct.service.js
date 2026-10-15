/** @format */

const { Op } = require("sequelize");
const { AddOnProduct, ProductAddOn, Product } = require("../../models");

const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");


// MariaDB returns JSON columns as text. The admin endpoints always send `features` as
// an array; the storefront's product add-ons endpoint still sends the stored text,
// which the shop parses itself.
const parseFeatures = (features) => {
  if (Array.isArray(features)) return features;
  if (typeof features !== "string" || !features) return [];
  try {
    const parsed = JSON.parse(features);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const forAdmin = (addon) => {
  const data = addon.toJSON();
  data.features = parseFeatures(data.features);
  return data;
};

const createAddOnProduct = async (body, files) => {
  try {
    let { name, description, features, price } = body;

    // -----------------------------------------
    // Validate name
    // -----------------------------------------

    if (!name || !String(name).trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "name is required");
    }

    // -----------------------------------------
    // Validate price
    // -----------------------------------------

    if (price === undefined || price === null || price === "") {
      throw new ApiError(httpStatus.BAD_REQUEST, "price is required");
    }

    const parsedPrice = Number(price);

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "price must be a valid number greater than or equal to 0",
      );
    }

    // -----------------------------------------
    // Parse features
    // -----------------------------------------

    if (features && typeof features === "string") {
      try {
        features = JSON.parse(features);
      } catch (error) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "features must be valid JSON",
        );
      }
    }

    if (features === undefined || features === null || features === "") {
      features = [];
    }

    if (!Array.isArray(features)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "features must be an array");
    }

    // -----------------------------------------
    // Image
    // -----------------------------------------

    const imageFile = files?.images?.[0];

    // -----------------------------------------
    // Create Add-on
    // -----------------------------------------

    const addon = await AddOnProduct.create({
      name: String(name).trim(),

      description:
        description !== undefined && description !== "" ? description : null,

      features,

      price: parsedPrice,

      image: imageFile
        ? `${process.env.IMAGE_BASE_URL}/images/${imageFile.filename}`
        : null,

      is_active: true,
    });

    return forAdmin(addon);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllAddOnProducts = async (query) => {
  try {
    const { page = 1, limit = 20, search = "" } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const where = {
      is_active: true,
    };

    // -----------------------------------------
    // Search
    // -----------------------------------------

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

    // -----------------------------------------
    // Fetch
    // -----------------------------------------

    const { rows, count } = await AddOnProduct.findAndCountAll({
      where,

      order: [["created_at", "DESC"]],

      limit: limitNum,

      offset: (pageNum - 1) * limitNum,
    });

    return {
      data: rows.map(forAdmin),

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

const getAddOnProductById = async (id) => {
  try {
    const addon = await AddOnProduct.findOne({
      where: {
        id,
      },
    });

    if (!addon) {
      throw new ApiError(httpStatus.NOT_FOUND, "Add-on product not found");
    }

    return forAdmin(addon);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateAddOnProduct = async (id, body, files) => {
  try {
    const addon = await AddOnProduct.findOne({
      where: {
        id,
      },
    });

    if (!addon) {
      throw new ApiError(httpStatus.NOT_FOUND, "Add-on product not found");
    }

    let { name, description, features, price, is_active } = body;

    // -----------------------------------------
    // Parse features
    // -----------------------------------------

    if (features !== undefined && typeof features === "string") {
      try {
        features = JSON.parse(features);
      } catch (error) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "features must be valid JSON",
        );
      }
    }

    if (features !== undefined && !Array.isArray(features)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "features must be an array");
    }

    // -----------------------------------------
    // Validate price
    // -----------------------------------------

    if (price !== undefined && price !== null && price !== "") {
      const parsedPrice = Number(price);

      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "price must be a valid number greater than or equal to 0",
        );
      }

      price = parsedPrice;
    }

    // -----------------------------------------
    // Prepare update
    // -----------------------------------------

    const updateData = {};

    if (name !== undefined && String(name).trim()) {
      updateData.name = String(name).trim();
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (features !== undefined) {
      updateData.features = features;
    }

    if (price !== undefined) {
      updateData.price = price;
    }

    if (is_active !== undefined) {
      updateData.is_active =
        is_active === true ||
        is_active === "true" ||
        is_active === 1 ||
        is_active === "1";
    }

    // -----------------------------------------
    // Image
    // -----------------------------------------

    const imageFile = files?.images?.[0];

    if (imageFile) {
      updateData.image = `${process.env.IMAGE_BASE_URL}/images/${imageFile.filename}`;
    } else if (body.remove_image === true || body.remove_image === "true") {
      // Sent when the admin removed the image without picking a new one.
      updateData.image = null;
    }

    // -----------------------------------------
    // Update
    // -----------------------------------------

    await addon.update(updateData);

    return forAdmin(addon);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteAddOnProduct = async (id) => {
  try {
    const addon = await AddOnProduct.findOne({
      where: {
        id,
      },
    });

    if (!addon) {
      throw new ApiError(httpStatus.NOT_FOUND, "Add-on product not found");
    }

    await addon.destroy();

    return {
      message: "Add-on product deleted successfully",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const assignProductAddOns = async (productId, addons) => {
  try {
    // -----------------------------------------
    // Check Product
    // -----------------------------------------

    const product = await Product.findByPk(productId);

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    // -----------------------------------------
    // Validate addons
    // -----------------------------------------

    if (!Array.isArray(addons)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "addons must be an array");
    }

    // Allow empty array to remove all add-ons
    if (!addons.length) {
      await ProductAddOn.destroy({
        where: {
          product_id: productId,
        },
      });

      return [];
    }

    // -----------------------------------------
    // Validate Add-on IDs
    // -----------------------------------------

    const addonIds = addons.map((item) => Number(item?.addon_product_id));

    if (addonIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid addon_product_id");
    }

    // -----------------------------------------
    // Prevent duplicate add-ons
    // -----------------------------------------

    const uniqueAddonIds = new Set(addonIds);

    if (uniqueAddonIds.size !== addonIds.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Duplicate add-on products are not allowed",
      );
    }

    // -----------------------------------------
    // Fetch Add-on Products
    // -----------------------------------------

    const addonProducts = await AddOnProduct.findAll({
      where: {
        id: {
          [Op.in]: addonIds,
        },

        is_active: true,
      },
    });

    const validAddonIds = new Set(
      addonProducts.map((addon) => Number(addon.id)),
    );

    // -----------------------------------------
    // Validate every add-on
    // -----------------------------------------

    for (const item of addons) {
      const addonId = Number(item.addon_product_id);

      if (!validAddonIds.has(addonId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Add-on product ${addonId} not found or inactive`,
        );
      }

      const price = Number(item.price);

      if (!Number.isFinite(price) || price < 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid price for add-on ${addonId}`,
        );
      }

      if (
        item.sort_order !== undefined &&
        (!Number.isInteger(Number(item.sort_order)) ||
          Number(item.sort_order) < 0)
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid sort_order for add-on ${addonId}`,
        );
      }
    }

    // -----------------------------------------
    // Remove Existing Mappings
    // -----------------------------------------

    await ProductAddOn.destroy({
      where: {
        product_id: productId,
      },
    });

    // -----------------------------------------
    // Create New Mappings
    // -----------------------------------------

    const mappings = addons.map((item, index) => ({
      product_id: productId,

      addon_product_id: Number(item.addon_product_id),

      price: Number(item.price),

      sort_order:
        item.sort_order !== undefined ? Number(item.sort_order) : index,

      is_active: true,
    }));

    await ProductAddOn.bulkCreate(mappings);

    // -----------------------------------------
    // Return Updated Add-ons
    // -----------------------------------------

    return await getProductAddOns(productId);
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductAddOns = async (productId) => {
  try {
    // -----------------------------------------
    // Check Product
    // -----------------------------------------

    const product = await Product.findByPk(productId);

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    // -----------------------------------------
    // Get Product Add-ons
    // -----------------------------------------

    const addons = await ProductAddOn.findAll({
      where: {
        product_id: productId,
        is_active: true,
      },

      include: [
        {
          model: AddOnProduct,

          as: "addon",

          where: {
            is_active: true,
          },

          required: true,
        },
      ],

      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    // -----------------------------------------
    // Format Response
    // -----------------------------------------

    return addons.map((item) => ({
      id: item.id,

      addon_product_id: item.addon_product_id,

      name: item.addon.name,

      image: item.addon.image,

      description: item.addon.description,

      features: item.addon.features,

      // Product-specific price
      price: Number(item.price),

      // Master add-on price
      addon_price: Number(item.addon.price),

      sort_order: item.sort_order,
    }));
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  createAddOnProduct,
  getAllAddOnProducts,
  getAddOnProductById,
  updateAddOnProduct,
  deleteAddOnProduct,
  assignProductAddOns,
  getProductAddOns,
};
