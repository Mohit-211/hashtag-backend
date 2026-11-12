const httpStatus = require("http-status");
const moment = require("moment");
const slugify = require("slugify");
const { Op, QueryTypes } = require("sequelize");
const ApiError = require("../../utils/ApiError");
const sequelize = require("../../config/central.db");
const logger = require("../../config/logger");
const { productInStockSql } = require("../../utils/stock");
const {
  GrandCategory,
  ParentCategory,
  ProductCategory,
  GrandCategoryMapping,
} = require("../../models");

// The website lists only what a customer can shop: a parent category that has a product
// GET product?category_id=<parent> would list (not deleted, active, not discontinued, in
// stock), and a grand category with at least one such parent. Every join skips deleted rows,
// as the includes do. One row per grand category and parent category pair.
const SHOP_CATEGORIES_SQL = `
  SELECT gcm.grand_category_id, gcm.parent_category_id
  FROM grand_category_mapping AS gcm
  INNER JOIN parent_categories AS pa
    ON pa.id = gcm.parent_category_id AND pa.deleted_at IS NULL
  WHERE gcm.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM parent_category_mapping AS pam
      INNER JOIN product_categories AS pc
        ON pc.id = pam.product_category_id AND pc.deleted_at IS NULL
      INNER JOIN product_category_mapping AS pcm
        ON pcm.product_category_id = pc.id AND pcm.deleted_at IS NULL
      INNER JOIN products AS shop_product
        ON shop_product.id = pcm.product_id AND shop_product.deleted_at IS NULL
        AND shop_product.is_active = 1 AND shop_product.is_discontinued = 0
      WHERE pam.parent_category_id = gcm.parent_category_id AND pam.deleted_at IS NULL
        AND ${productInStockSql("shop_product.id")}
    )`;

// The same for every shopper, so it's kept in memory and worked out again at most once a minute.
// A category that gains or loses its last product shows up or goes within about a minute.
const SHOP_CATEGORIES_TTL_MS = 60 * 1000;
let shopCategories = null;
let shopCategoriesLoading = null;

const refreshShopCategories = () => {
  if (!shopCategoriesLoading) {
    shopCategoriesLoading = sequelize
      .query(SHOP_CATEGORIES_SQL, { type: QueryTypes.SELECT })
      .then((rows) => {
        shopCategories = {
          loadedAt: Date.now(),
          grandIds: [...new Set(rows.map((row) => row.grand_category_id))],
          parentIds: [...new Set(rows.map((row) => row.parent_category_id))],
        };
        return shopCategories;
      })
      .finally(() => {
        shopCategoriesLoading = null;
      });
  }

  return shopCategoriesLoading;
};

// When the list is a minute old, the request that notices still gets it and the refresh runs
// in the background, so no shopper waits for the query: only the first one after a restart.
const getShopCategories = async () => {
  if (!shopCategories) return refreshShopCategories();

  if (Date.now() - shopCategories.loadedAt >= SHOP_CATEGORIES_TTL_MS) {
    refreshShopCategories().catch((error) => {
      // The last list stays in use, and the next request tries again.
      logger.warn(`Refreshing the website's category list failed: ${error.message}`);
    });
  }

  return shopCategories;
};

const createGrandCategory = async (reqBody) => {
  try {
    if (!reqBody.title || !reqBody.title.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Category title is required");
    }

    const categoryObj = {
      title: reqBody.title,
      created_at: moment(),
    };

    const categoryDoc = await GrandCategory.create(categoryObj);

    return categoryDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// `shopper`: the website's list, with only categories that have products to show. Admins
// (shopper: false) get every category.
const getAllGrandCategories = async (query, { shopper = false } = {}) => {
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

    const parentCategories = {
      model: ParentCategory,
      as: "parent_categories",

      through: {
        attributes: [],
      },

      attributes: ["id", "title", "slug"],
    };

    const order = [["title", "ASC"]];

    if (shopper) {
      const { grandIds, parentIds } = await getShopCategories();

      // In the where, so the count and the pages cover only these grand categories.
      whereCondition.id = { [Op.in]: grandIds };
      parentCategories.where = { id: { [Op.in]: parentIds } };
      parentCategories.required = false;

      // With that filter the database returns parents in any order, so the menu would
      // reshuffle between requests. Id order is the order the website got them in before.
      order.push([{ model: ParentCategory, as: "parent_categories" }, "id", "ASC"]);
    }

    const { rows, count } = await GrandCategory.findAndCountAll({
      where: whereCondition,

      include: [parentCategories],

      limit,
      offset,
      distinct: true,

      order,
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

const findGrandCategoryById = async (id) => {
  try {
    const categoryDoc = await GrandCategory.findOne({
      where: {
        id,
        is_active: true,
      },

      include: [
        {
          model: ParentCategory,
          as: "parent_categories",

          through: {
            attributes: [],
          },

          attributes: ["id", "title"],

          include: [
            {
              model: ProductCategory,
              as: "categories",

              through: {
                attributes: [],
              },

              attributes: ["id", "title", "supplier"],
            },
          ],
        },
      ],
    });

    return categoryDoc ? categoryDoc : "No Grand Category Found";
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateGrandCategory = async (reqBody, id) => {
  try {
    const categoryDoc = await GrandCategory.findByPk(id);

    if (!categoryDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Grand Category not found");
    }

    if (
      reqBody.title &&
      typeof reqBody.title !== "undefined" &&
      reqBody.title !== ""
    ) {
      categoryDoc.title = reqBody.title;

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
      error.message,
    );
  }
};

const deleteGrandCategory = async (body) => {
  try {
    const ids = Array.isArray(body.grand_category_id)
      ? body.grand_category_id
      : [body.grand_category_id];

    const categoryIds = ids.map((id) => String(id).trim()).filter(Boolean);

    if (!categoryIds.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No valid category ids provided",
      );
    }

    const categories = await GrandCategory.findAll({
      where: {
        id: {
          [Op.in]: categoryIds,
        },
      },
    });

    if (!categories.length) {
      throw new ApiError(httpStatus.NOT_FOUND, "No Grand Categories found");
    }

    await GrandCategoryMapping.destroy({
      where: {
        grand_category_id: {
          [Op.in]: categoryIds,
        },
      },
    });

    await Promise.all(categories.map((category) => category.destroy()));

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const mapParentsToGrand = async (reqBody) => {
  try {
    const { grand_category_id, parent_category_ids } = reqBody;

    if (!Array.isArray(parent_category_ids)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "parent_category_ids must be array",
      );
    }

    await GrandCategoryMapping.destroy({
      where: {
        grand_category_id,
      },
      force: true,
    });

    if (parent_category_ids.length === 0) {
      return true;
    }

    const mappings = parent_category_ids.map((id) => ({
      grand_category_id,
      parent_category_id: id,
    }));

    await GrandCategoryMapping.bulkCreate(mappings);

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// Given an array of parent_category_ids, return which Grand Category(s)
// each one is already mapped into.
const getGrandCategoriesForParents = async (parentIds) => {
  try {
    const ids = (Array.isArray(parentIds) ? parentIds : [parentIds])
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));

    if (!ids.length) return {};

    const mappings = await GrandCategoryMapping.findAll({
      where: {
        parent_category_id: { [Op.in]: ids },
      },
      raw: true,
    });

    if (!mappings.length) return {};

    const grandIds = [...new Set(mappings.map((m) => m.grand_category_id))];

    const grands = await GrandCategory.findAll({
      where: { id: { [Op.in]: grandIds }, is_active: true },
      attributes: ["id", "title", "slug"],
      raw: true,
    });

    const grandMap = new Map(grands.map((g) => [g.id, g]));

    const result = {};
    for (const m of mappings) {
      const grand = grandMap.get(m.grand_category_id);
      if (!grand) continue;
      if (!result[m.parent_category_id]) result[m.parent_category_id] = [];
      result[m.parent_category_id].push(grand);
    }

    return result;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const addParentToGrand = async (reqBody) => {
  try {
    const { grand_category_id, parent_category_id } = reqBody;

    if (!grand_category_id || !parent_category_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "grand_category_id and parent_category_id are required",
      );
    }

    const grand = await GrandCategory.findOne({
      where: { id: grand_category_id, is_active: true },
    });
    if (!grand) {
      throw new ApiError(httpStatus.NOT_FOUND, "Grand Category not found");
    }

    const parent = await ParentCategory.findOne({
      where: { id: parent_category_id, is_active: true },
    });
    if (!parent) {
      throw new ApiError(httpStatus.NOT_FOUND, "Parent Category not found");
    }

    const existing = await GrandCategoryMapping.findOne({
      where: { grand_category_id, parent_category_id },
      paranoid: false,
    });

    let created = false;
    if (existing) {
      if (existing.deleted_at) {
        await existing.restore();
        created = true;
      }
    } else {
      await GrandCategoryMapping.create({ grand_category_id, parent_category_id });
      created = true;
    }

    return { grand, created };
  } catch (error) {
    console.error("addParentToGrand error:", error?.errors || error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.errors?.map((e) => e.message).join(", ") || error.message,
    );
  }
};

const removeParentFromGrand = async (reqBody) => {
  const { grand_category_id, parent_category_id } = reqBody;
  await GrandCategoryMapping.destroy({
    where: { grand_category_id, parent_category_id },
  });
  return true;
};

module.exports = {
  createGrandCategory,
  getAllGrandCategories,
  findGrandCategoryById,
  updateGrandCategory,
  deleteGrandCategory,
  mapParentsToGrand,
  getGrandCategoriesForParents,
  addParentToGrand,
  removeParentFromGrand
};
