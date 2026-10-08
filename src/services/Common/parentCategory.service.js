/** @format */

const httpStatus = require("http-status");
const moment = require("moment");
const ApiError = require("../../utils/ApiError");
const slugify = require("slugify");
const { Op } = require("sequelize");
const ParentCategory = require("../../models/parentCategory.model");
const { ProductCategory, ParentCategoryMapping } = require("../../models");

const createParentCategory = async (reqBody) => {
  try {

      if (
      !reqBody.title ||
      !reqBody.title.trim()
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Category title is required",
      );
    }
    const categoryObj = {
      title: reqBody.title,
      created_at: moment(),
    };

    const categoryDoc = await ParentCategory.create(categoryObj);

    return categoryDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const getAllParentCategories = async (query) => {
  try {
    let { page = 1, limit = 20, search } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    const whereCondition = {
      is_active: true,
    };

    if (search) {
      whereCondition.title = {
        [Op.like]: `%${search}%`,
      };
    }

    const { rows, count } = await ParentCategory.findAndCountAll({
      where: whereCondition,

      include: [
        {
          model: ProductCategory,
          as: "categories",

          through: {
            attributes: [],
          },

          attributes: ["id", "title"],
        },
      ],

      limit,
      offset,

      distinct: true,

      order: [
        ["title", "ASC"],
      ],
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
      error.message
    );
  }
};

const findParentCategoryById = async (id) => {
  try {
    const categoryDoc = await ParentCategory.findOne({
      where: {
        id,
        is_active: true,
      },

      include: [
        {
          model: ProductCategory,
          as: "categories",

          through: {
            attributes: [],
          },

          attributes: ["id", "title","supplier"],
        },
      ],
    });

    return categoryDoc
      ? categoryDoc
      : "No Parent Category Found";
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const updateParentCategory = async (reqBody, id) => {
  try {
    const categoryDoc = await ParentCategory.findByPk(id);

    if (!categoryDoc) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Parent Category not found"
      );
    }

    if (
      reqBody.title &&
      typeof reqBody.title !== "undefined" &&
      reqBody.title !== ""
    ) {
      categoryDoc.title = reqBody.title;

      // ✅ UPDATE SLUG ALSO
      categoryDoc.slug = slugify(reqBody.title, {
        lower: true,
        strict: true,
      });
    }

    await categoryDoc.save();

    return categoryDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const deleteParentCategory = async (body) => {
  try {
    const ids = Array.isArray(body.parent_category_id)
      ? body.parent_category_id
      : [body.parent_category_id];

    const categoryIds = ids
      .map((id) => String(id).trim())
      .filter(Boolean);

    if (!categoryIds.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No valid category ids provided"
      );
    }

    const categories = await ParentCategory.findAll({
      where: {
        id: {
          [Op.in]: categoryIds,
        },
      },
    });

    if (!categories.length) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No Parent Categories found"
      );
    }

    await ParentCategoryMapping.destroy({
      where: {
        parent_category_id: {
          [Op.in]: categoryIds,
        },
      },
    });

    await Promise.all(
      categories.map((category) => category.destroy())
    );

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const mapCategoriesToParent = async (
  reqBody,
) => {
  try {
    const {
      parent_category_id,
      product_category_ids,
    } = reqBody;

    if (
      !Array.isArray(
        product_category_ids,
      )
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "product_category_ids must be array",
      );
    }

    // ✅ REMOVE OLD MAPPINGS

    await ParentCategoryMapping.destroy(
      {
        where: {
          parent_category_id,
        },
          force: true,
      },
    );

    // ✅ ALLOW EMPTY

    if (
      product_category_ids.length === 0
    ) {
      return true;
    }

    const mappings =
      product_category_ids.map(
        (id) => ({
          parent_category_id,

          product_category_id: id,
        }),
      );

    await ParentCategoryMapping.bulkCreate(
      mappings
    );

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

// Given an array of product_category_ids, return which Parent Categories
// each one is already mapped into. { [product_category_id]: [{id, title, slug}] }
// Read-only lookup — used by Edit Product to show existing mappings.
const getParentCategoriesForCategories = async (categoryIds) => {
  try {
    const ids = (Array.isArray(categoryIds) ? categoryIds : [categoryIds])
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));

    if (!ids.length) return {};

    const mappings = await ParentCategoryMapping.findAll({
      where: {
        product_category_id: { [Op.in]: ids },
      },
      raw: true,
    });

    if (!mappings.length) return {};

    const parentIds = [...new Set(mappings.map((m) => m.parent_category_id))];

    const parents = await ParentCategory.findAll({
      where: { id: { [Op.in]: parentIds }, is_active: true },
      attributes: ["id", "title", "slug"],
      raw: true,
    });

    const parentMap = new Map(parents.map((p) => [p.id, p]));

    const result = {};
    for (const m of mappings) {
      const parent = parentMap.get(m.parent_category_id);
      if (!parent) continue; // parent may have been deactivated
      if (!result[m.product_category_id]) result[m.product_category_id] = [];
      result[m.product_category_id].push(parent);
    }

    return result;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const addCategoryToParent = async (reqBody) => {
  try {
    const { parent_category_id, product_category_id } = reqBody;

    if (!parent_category_id || !product_category_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "parent_category_id and product_category_id are required",
      );
    }

    const parent = await ParentCategory.findOne({
      where: { id: parent_category_id, is_active: true },
    });
    if (!parent) {
      throw new ApiError(httpStatus.NOT_FOUND, "Parent Category not found");
    }

    const category = await ProductCategory.findByPk(product_category_id);
    if (!category) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product Category not found");
    }

    // Look for ANY row for this pair, including soft-deleted ones —
    // paranoid mode hides deleted_at rows from a normal query, but the
    // unique index on (parent_category_id, product_category_id) still
    // blocks a fresh INSERT if an old soft-deleted row is sitting there.
    // This is exactly what "Validation error" after a successful-looking
    // INSERT log usually means.
    const existing = await ParentCategoryMapping.findOne({
      where: { parent_category_id, product_category_id },
      paranoid: false,
    });

    let created = false;
    if (existing) {
      if (existing.deleted_at) {
        await existing.restore();
        created = true;
      }
      // else: already active, nothing to do — this is a no-op add
    } else {
      await ParentCategoryMapping.create({
        parent_category_id,
        product_category_id,
      });
      created = true;
    }

    return { parent, created };
  } catch (error) {
    console.error("addCategoryToParent error:", error?.errors || error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.errors?.map((e) => e.message).join(", ") || error.message,
    );
  }
};

const removeCategoryFromParent = async (reqBody) => {
  const { parent_category_id, product_category_id } = reqBody;
  await ParentCategoryMapping.destroy({
    where: { parent_category_id, product_category_id },
  });
  return true;
};

module.exports = {
  createParentCategory,
  getAllParentCategories,
  findParentCategoryById,
  updateParentCategory,
  deleteParentCategory,
  mapCategoriesToParent,
  addCategoryToParent,
  getParentCategoriesForCategories,
  removeCategoryFromParent
};