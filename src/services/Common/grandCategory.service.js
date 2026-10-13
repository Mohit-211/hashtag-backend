const httpStatus = require("http-status");
const moment = require("moment");
const slugify = require("slugify");
const { Op } = require("sequelize");
const ApiError = require("../../utils/ApiError");
const {
  GrandCategory,
  ParentCategory,
  ProductCategory,
  GrandCategoryMapping,
} = require("../../models");

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

const getAllGrandCategories = async (query) => {
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

    const { rows, count } = await GrandCategory.findAndCountAll({
      where: whereCondition,

      include: [
        {
          model: ParentCategory,
          as: "parent_categories",

          through: {
            attributes: [],
          },

          attributes: ["id", "title", "slug"],
        },
      ],

      limit,
      offset,
      distinct: true,

      order: [["title", "ASC"]],
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
