/** @format */

const httpStatus = require("http-status");
const moment = require("moment");
const ApiError = require("../../utils/ApiError");
const {
  ProductCategory,
  ImportBatch,
  ParentCategory,
  Product,
  Brand,
} = require("../../models");
const ssClient = require("../../config/ssClient");
const { Op } = require("sequelize");

const createCategory = async (reqBody) => {
  try {
    const categoryObj = {
      title: reqBody.title,
      created_at: moment(),
      supplier: "MANUAL",
      external_id: null,
      import_batch_id: null,
    };

    const categoryDoc = await ProductCategory.create(categoryObj);
    if (!categoryDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create new Category",
      );
    }
    return categoryDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllCategories = async (query) => {
  try {
    let { page = 1, limit = 20, search, supplier } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    const whereCondition = {
      is_active: true,
    };

    // Search
    if (search) {
      whereCondition.title = {
        [Op.like]: `%${search}%`,
      };
    }

    // Supplier Filter
    if (supplier && supplier !== "ALL") {
      whereCondition.supplier = supplier;
    }

    const { rows, count } = await ProductCategory.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["title", "ASC"]], // alphabetical
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
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const findCategoryById = async (id) => {
  try {
    const categoryDoc = await ProductCategory.findOne({
      where: { id: id, is_active: true },
    });
    return categoryDoc ? categoryDoc : "No Category Found";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateCategory = async (reqBody, id) => {
  try {
    const categoryDoc = await ProductCategory.findByPk(id);

    if (!categoryDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
    }
    if (
      reqBody.title &&
      typeof reqBody.title !== "undefined" &&
      reqBody.title !== ""
    ) {
      categoryDoc["title"] = reqBody.title;
    }
    if (
      reqBody.description &&
      typeof reqBody.description !== "undefined" &&
      reqBody.description !== ""
    ) {
      categoryDoc["description"] = reqBody.description;
    }

    await categoryDoc.save();
    return categoryDoc ? categoryDoc : {};
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteCategory = async (body) => {
  try {
    if (!Array.isArray(body.category_id) || body.category_id.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category_id");
    }

    // Ensure all IDs are trimmed and filtered
    const categoryIds = body.category_id
      .map((id) => String(id).trim())
      .filter(Boolean);

    if (categoryIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No valid blog IDs provided");
    }

    // Find all categories with the given IDs
    const categories = await ProductCategory.findAll({
      where: {
        id: categoryIds,
      },
    });

    if (categories.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No categories found");
    }

    // Delete the category themselves
    await Promise.all(categories.map((category) => category.destroy()));
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const syncSSCategories = async () => {
  let batch;

  try {
    console.log("🚀 Starting S&S Category Sync...");

    // ✅ 1. CREATE BATCH (optional but recommended)
    batch = await ImportBatch.create({
      source_name: "SS_CATEGORY",
      status: "processing",
    });

    // ✅ 2. FIXED API CALL (IMPORTANT 🔥)
    const res = await ssClient.get("/categories?mediaType=json");

    const categories = res.data;

    let processed = 0;

    // ✅ 3. LOOP
    for (const c of categories) {
      try {
        await ProductCategory.upsert({
          title: c.name,
          external_id: String(c.categoryID),
          supplier: "SS",
          import_batch_id: batch.id,
        });

        processed++;
      } catch (err) {
        console.error("❌ Failed category:", c, err.message);
      }
    }

    // ✅ 4. SUCCESS UPDATE
    await batch.update({
      status: "success",
      total_records: categories.length,
      processed_records: processed,
    });

    console.log("✅ Categories synced with names");
  } catch (err) {
    console.error("❌ Category sync failed", err.message);

    // 🔥 DEBUG FULL RESPONSE (VERY IMPORTANT)
    console.error("❌ FULL ERROR:", err.response?.data);

    // ❌ ROLLBACK (only this batch)
    if (batch) {
      await ProductCategory.destroy({
        where: { import_batch_id: batch.id },
      });

      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }
  }
};

const getProductsWithoutParentCategory = async () => {
  try {
    const products = await Product.findAll({
      where: {
        is_active: true,
      },

      attributes: [
        "id",
        "name",
        "supplier",
        "external_style_id",
        "external_style_name",
        "brand_id",
      ],

      include: [
        {
          model: ProductCategory,
          as: "categories",
          attributes: ["id", "title", "supplier", "external_id"],

          through: {
            attributes: [],
          },

          required: false,

          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: ["id", "title"],

              through: {
                attributes: [],
              },

              required: false,
            },
          ],
        },

        {
          model: Brand,
          as: "brand",
          attributes: ["id", "name"],
          required: false,
        },
      ],

      order: [["id", "DESC"]],
    });

    // =====================================================
    // PRODUCTS WITHOUT A PRODUCT CATEGORY
    // =====================================================

    const productsWithoutCategory = products.filter((product) => {
      const data = product.toJSON();

      return !data.categories || data.categories.length === 0;
    });

    // =====================================================
    // PRODUCTS WHERE CATEGORY IS NOT MAPPED TO PARENT
    // =====================================================

    const productsWithoutParentCategory = products.filter((product) => {
      const data = product.toJSON();

      const categories = data.categories || [];

      // No category at all
      if (categories.length === 0) {
        return true;
      }

      // Every category must have a parent
      const allCategoriesHaveParent = categories.every(
        (category) =>
          Array.isArray(category.parent_categories) &&
          category.parent_categories.length > 0,
      );

      return !allCategoriesHaveParent;
    });

    return {
      total_products_without_category: productsWithoutCategory.length,

      total_products_without_parent_category:
        productsWithoutParentCategory.length,

      products: productsWithoutParentCategory,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  findCategoryById,
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
  syncSSCategories,
  getProductsWithoutParentCategory,
};
