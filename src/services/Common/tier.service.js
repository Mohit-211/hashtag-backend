/** @format */

const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const { Op } = require("sequelize");
const {
  ProductTier,
  TierParentCategoryMapping,
  ProductTierOverride,
  ParentCategory,
  Product,
  ProductCategory,
  ProductCategoryMapping,
  ProductAttachment,
} = require("../../models");
const sequelize = require("../../config/central.db");

const getAllTiers = async () => {
  return await ProductTier.findAll({
    where: {
      deleted_at: null,
    },
    order: [["sort_order", "ASC"]],
  });
};

const createTier = async (body) => {
  const { key, title, sort_order = 0 } = body;

  if (!key || !title) {
    throw new ApiError(httpStatus.BAD_REQUEST, "key and title are required");
  }

  const normalizedKey = String(key).toLowerCase().trim();

  const exists = await ProductTier.findOne({
    where: { key: normalizedKey, deleted_at: null },
  });

  if (exists) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Tier with this key already exists",
    );
  }

  return ProductTier.create({
    key: normalizedKey,
    title,
    sort_order,
  });
};

const getTierByKeyOrId = async (idOrKey) => {
  const isNumeric = /^\d+$/.test(String(idOrKey));

  const tier = await ProductTier.findOne({
    where: isNumeric
      ? { id: idOrKey, deleted_at: null }
      : { key: String(idOrKey).toLowerCase(), deleted_at: null },
  });

  if (!tier) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tier not found");
  }

  return tier;
};

const updateTierParentCategories = async (tierId, body) => {
  const transaction = await sequelize.transaction();

  try {
    const tier = await ProductTier.findByPk(tierId, {
      transaction,
    });

    if (!tier) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Tier not found",
      );
    }

    const useCaseId = Number(body.use_case_id);

    if (!useCaseId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "use_case_id is required",
      );
    }

    const parentCategoryIds = body.parent_category_ids || [];

    await TierParentCategoryMapping.destroy({
      where: {
        tier_id: tierId,
        use_case_id: useCaseId,
      },
      force: true,
      transaction,
    });

    if (parentCategoryIds.length) {
      await TierParentCategoryMapping.bulkCreate(
        parentCategoryIds.map((parentCategoryId) => ({
          use_case_id: useCaseId,
          tier_id: tierId,
          parent_category_id: parentCategoryId,
        })),
        { transaction },
      );
    }

    await transaction.commit();

    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const getTierParentCategories = async (tierId, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "use_case_id is required"
    );
  }

  const tier = await ProductTier.findOne({
    where: {
      id: tierId,
      is_active: true,
    },
  });

  if (!tier) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Tier not found"
    );
  }

  const mappings = await TierParentCategoryMapping.findAll({
    where: {
      tier_id: tierId,
      use_case_id: useCaseId,
    },
    attributes: ["parent_category_id"],
    raw: true,
  });

  const parentCategoryIds = mappings.map(
    (item) => item.parent_category_id
  );

  const parentCategories = await ParentCategory.findAll({
    where: {
      id: {
        [Op.in]: parentCategoryIds,
      },
      is_active: true,
    },
  });

  return parentCategories;
};

const getProductIdsForTier = async (tierId, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "use_case_id is required",
    );
  }

  const tier = await ProductTier.findByPk(tierId);

  if (!tier) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Tier not found",
    );
  }

  // -----------------------------------------
  // Get parent categories FOR THIS USE CASE
  // -----------------------------------------
  const mappings = await TierParentCategoryMapping.findAll({
    where: {
      tier_id: tierId,
      use_case_id: useCaseId,
      is_active: true,
    },
    attributes: ["parent_category_id"],
    raw: true,
  });

  const parentCategoryIds = mappings.map(
    (mapping) => mapping.parent_category_id,
  );

  const baseProductIds = new Set();

  // -----------------------------------------
  // Category based products
  // -----------------------------------------
  if (parentCategoryIds.length) {
    const matchingProducts = await Product.findAll({
      attributes: ["id"],
      include: [
        {
          model: ProductCategory,
          as: "categories",
          attributes: [],
          through: { attributes: [] },
          required: true,
          include: [
            {
              model: ParentCategory,
              as: "parent_categories",
              attributes: [],
              through: { attributes: [] },
              required: true,
              where: {
                id: {
                  [Op.in]: parentCategoryIds,
                },
              },
            },
          ],
        },
      ],
      where: {
        is_active: true,
        is_discontinued: false,
      },
      raw: true,
    });

    matchingProducts.forEach((p) => {
      baseProductIds.add(p.id);
    });
  }

  // -----------------------------------------
  // Manual includes FOR THIS USE CASE
  // -----------------------------------------
  const manualIncludes = await ProductTierOverride.findAll({
    where: {
      tier_id: tierId,
      use_case_id: useCaseId,
      type: "include",
    },
    attributes: ["product_id"],
    raw: true,
  });

  const includedIds = manualIncludes.map(
    (o) => o.product_id,
  );

  includedIds.forEach((id) => {
    baseProductIds.add(id);
  });

  // -----------------------------------------
  // Remove conflicting tier/exclusion
  // FOR THIS USE CASE ONLY
  // -----------------------------------------
  if (baseProductIds.size) {
    const conflicting = await ProductTierOverride.findAll({
      where: {
        use_case_id: useCaseId,

        product_id: {
          [Op.in]: [...baseProductIds],
        },

        [Op.or]: [
          {
            type: "exclude",
          },
          {
            type: "include",
            tier_id: {
              [Op.ne]: tierId,
            },
          },
        ],
      },

      attributes: ["product_id"],

      raw: true,
    });

    conflicting.forEach((o) => {
      baseProductIds.delete(o.product_id);
    });
  }

  return {
    productIds: [...baseProductIds],
    includedIds,
  };
};

const resolveTierProductIds = async (tierKeyOrId, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  const tier = await getTierByKeyOrId(tierKeyOrId);

  const { productIds } = await getProductIdsForTier(tier.id, useCaseId);

  return productIds;
};

const getTierProducts = async (tierId, query) => {
  const { page = 1, limit = 20, search, use_case_id } = query;

  const useCaseId = Number(use_case_id);

  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  const tier = await ProductTier.findByPk(tierId);

  if (!tier) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tier not found");
  }

  // Get products for this tier ONLY for this use case
  const { productIds, includedIds } = await getProductIdsForTier(
    tierId,
    useCaseId,
  );

  if (!productIds.length) {
    return {
      data: [],
      pagination: {
        total: 0,
        page: Number(page),
        limit: Number(limit),
        totalPages: 0,
      },
    };
  }

  const includedSet = new Set(includedIds);

  let finalProductIds = productIds;

  // ==========================================================
  // SEARCH
  // ==========================================================

  if (search) {
    const searchIds = new Set();

    // --------------------------------------------------------
    // Product name / external style ID
    // --------------------------------------------------------

    const nameMatches = await Product.findAll({
      where: {
        id: {
          [Op.in]: productIds,
        },

        is_active: true,
        is_discontinued: false,

        [Op.or]: [
          {
            name: {
              [Op.like]: `%${search}%`,
            },
          },
          {
            external_style_id: {
              [Op.like]: `%${search}%`,
            },
          },
        ],
      },

      attributes: ["id"],

      raw: true,
    });

    nameMatches.forEach((p) => {
      searchIds.add(p.id);
    });

    // --------------------------------------------------------
    // Product category search
    // --------------------------------------------------------

    const matchingCategories = await ProductCategory.findAll({
      where: {
        title: {
          [Op.like]: `%${search}%`,
        },
      },

      attributes: ["id"],

      raw: true,
    });

    // --------------------------------------------------------
    // Parent category search
    // --------------------------------------------------------

    const matchingParentCategories = await ParentCategory.findAll({
      where: {
        title: {
          [Op.like]: `%${search}%`,
        },
      },

      attributes: ["id"],

      raw: true,
    });

    let categoryIdsToMatch = matchingCategories.map((c) => c.id);

    // --------------------------------------------------------
    // Parent category → child categories
    // --------------------------------------------------------

    if (matchingParentCategories.length) {
      const parentCategoryIds = matchingParentCategories.map((pc) => pc.id);

      const childCategories = await ProductCategory.findAll({
        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: [],
            through: {
              attributes: [],
            },

            where: {
              id: {
                [Op.in]: parentCategoryIds,
              },
            },
          },
        ],

        attributes: ["id"],

        raw: true,
      });

      categoryIdsToMatch = [
        ...new Set([
          ...categoryIdsToMatch,
          ...childCategories.map((c) => c.id),
        ]),
      ];
    }

    // --------------------------------------------------------
    // Product category mappings
    // --------------------------------------------------------

    if (categoryIdsToMatch.length) {
      const categoryMappings = await ProductCategoryMapping.findAll({
        where: {
          product_category_id: {
            [Op.in]: categoryIdsToMatch,
          },

          product_id: {
            [Op.in]: productIds,
          },
        },

        attributes: ["product_id"],

        raw: true,
      });

      categoryMappings.forEach((m) => {
        searchIds.add(m.product_id);
      });
    }

    finalProductIds = [...searchIds];

    if (!finalProductIds.length) {
      return {
        data: [],

        pagination: {
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0,
        },
      };
    }
  }

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const offset = (Number(page) - 1) * Number(limit);

  const { rows, count } = await Product.findAndCountAll({
    where: {
      id: {
        [Op.in]: finalProductIds,
      },
    },

    include: [
      {
        model: ProductAttachment,
        as: "attachments",
        required: false,
      },

      {
        model: ProductCategory,
        as: "categories",
        attributes: ["id", "title"],

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
          },
        ],
      },
    ],

    limit: Number(limit),
    offset,

    distinct: true,

    order: [["name", "ASC"]],
  });

  // ==========================================================
  // RESPONSE
  // ==========================================================

  const data = rows.map((p) => {
    const json = p.toJSON();

    const parentCategoriesMap = new Map();

    (json.categories || []).forEach((cat) => {
      (cat.parent_categories || []).forEach((pc) => {
        parentCategoriesMap.set(pc.id, pc);
      });
    });

    delete json.categories;

    return {
      ...json,

      parent_categories: [...parentCategoriesMap.values()],

      source: includedSet.has(p.id) ? "manual" : "category",
    };
  });

  return {
    data,

    pagination: {
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    },
  };
};

const setProductTier = async (productId, tierId, useCaseId) => {
  const tier = await ProductTier.findByPk(tierId);

  if (!tier) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tier not found");
  }

  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  await ProductTierOverride.upsert({
    product_id: productId,
    use_case_id: useCaseId,
    tier_id: tierId,
    type: "include",
  });

  return {
    product_id: Number(productId),
    use_case_id: Number(useCaseId),
    tier_id: Number(tierId),
  };
};

const addProductsToTier = async (tierId, productIds, useCaseId) => {
  const tier = await ProductTier.findByPk(tierId);

  if (!tier) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tier not found");
  }

  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  const transaction = await sequelize.transaction();

  try {
    for (const productId of productIds) {
      await ProductTierOverride.upsert(
        {
          product_id: productId,
          use_case_id: useCaseId,
          tier_id: tierId,
          type: "include",
        },
        { transaction },
      );
    }

    await transaction.commit();

    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const excludeProductFromAllTiers = async (productId, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  await ProductTierOverride.upsert({
    product_id: productId,
    use_case_id: useCaseId,
    tier_id: null,
    type: "exclude",
  });

  return true;
};

const clearProductTierOverride = async (productId, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  return ProductTierOverride.destroy({
    where: {
      product_id: productId,
      use_case_id: useCaseId,
    },
  });
};

const getCurrentTiersForProducts = async (
  productIds,
  useCaseId,
) => {
  if (!productIds.length) {
    return {};
  }

  if (!useCaseId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "use_case_id is required",
    );
  }

  const allTiers = await ProductTier.findAll({
    where: {
      deleted_at: null,
    },
    order: [["sort_order", "ASC"]],
  });

  // -----------------------------------------
  // Get tier → parent category mappings
  // FOR THIS USE CASE
  // -----------------------------------------
  const tierMappings =
    await TierParentCategoryMapping.findAll({
      where: {
        use_case_id: useCaseId,
        is_active: true,
        tier_id: {
          [Op.in]: allTiers.map((tier) => tier.id),
        },
      },

      attributes: [
        "tier_id",
        "parent_category_id",
      ],

      raw: true,
    });

  const tierParentMap = new Map();

  tierMappings.forEach((mapping) => {
    const existing =
      tierParentMap.get(mapping.tier_id) ||
      new Set();

    existing.add(mapping.parent_category_id);

    tierParentMap.set(
      mapping.tier_id,
      existing,
    );
  });

  // -----------------------------------------
  // Get overrides ONLY for this use case
  // -----------------------------------------
  const overrides =
    await ProductTierOverride.findAll({
      where: {
        product_id: {
          [Op.in]: productIds,
        },
        use_case_id: useCaseId,
      },
      raw: true,
    });

  const overrideMap = new Map(
    overrides.map((o) => [
      o.product_id,
      o,
    ]),
  );

  // -----------------------------------------
  // Product category mappings
  // -----------------------------------------
  const categoryMappings =
    await ProductCategoryMapping.findAll({
      where: {
        product_id: {
          [Op.in]: productIds,
        },
      },

      attributes: [
        "product_id",
        "product_category_id",
      ],

      raw: true,
    });

  const categoryIds = [
    ...new Set(
      categoryMappings.map(
        (m) => m.product_category_id,
      ),
    ),
  ];

  // -----------------------------------------
  // Category → Parent Categories
  // -----------------------------------------
  const categoryToParents = new Map();

  if (categoryIds.length) {
    const categories =
      await ProductCategory.findAll({
        where: {
          id: {
            [Op.in]: categoryIds,
          },
        },

        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: ["id"],
            through: {
              attributes: [],
            },
          },
        ],
      });

    categories.forEach((category) => {
      categoryToParents.set(
        category.id,
        category.parent_categories.map(
          (pc) => pc.id,
        ),
      );
    });
  }

  // -----------------------------------------
  // Product → Parent Categories
  // -----------------------------------------
  const productToParents = new Map();

  categoryMappings.forEach((mapping) => {
    const parents =
      categoryToParents.get(
        mapping.product_category_id,
      ) || [];

    const existing =
      productToParents.get(
        mapping.product_id,
      ) || new Set();

    parents.forEach((parentId) => {
      existing.add(parentId);
    });

    productToParents.set(
      mapping.product_id,
      existing,
    );
  });

  const result = {};

  // -----------------------------------------
  // Resolve each product
  // -----------------------------------------
  for (const productId of productIds) {
    const override =
      overrideMap.get(productId);

    // Explicit exclusion
    if (override?.type === "exclude") {
      result[productId] = null;
      continue;
    }

    // Explicit manual tier
    if (override?.type === "include") {
      const tier = allTiers.find(
        (t) => t.id === override.tier_id,
      );

      result[productId] = tier
        ? {
            id: tier.id,
            key: tier.key,
            title: tier.title,
            source: "manual",
          }
        : null;

      continue;
    }

    // -----------------------------------------
    // Category based tier FOR THIS USE CASE
    // -----------------------------------------
    const parentIds =
      productToParents.get(productId) ||
      new Set();

    const matchedTier =
      allTiers.find((tier) => {
        const tierParentIds =
          tierParentMap.get(tier.id);

        if (!tierParentIds?.size) {
          return false;
        }

        return [...tierParentIds].some(
          (parentId) =>
            parentIds.has(parentId),
        );
      });

    result[productId] = matchedTier
      ? {
          id: matchedTier.id,
          key: matchedTier.key,
          title: matchedTier.title,
          source: "category",
        }
      : null;
  }

  return result;
};

// Removes tier overrides for MULTIPLE products at once — used by the
// bulk "Remove Tier" action. Products with no override are unaffected
// (they simply have nothing to delete).
const bulkClearProductTierOverrides = async (productIds, useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  return ProductTierOverride.destroy({
    where: {
      product_id: {
        [Op.in]: productIds,
      },
      use_case_id: useCaseId,
    },
  });
};

// Union of every tier's product ids — this is what "All" means in a
// tier filter (every product that currently sits in Primary, Secondary,
// OR Budget), as distinct from omitting the tier filter entirely (which
// means "don't filter by tier at all, show the whole catalog").
const resolveAllTierProductIds = async (useCaseId) => {
  if (!useCaseId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "use_case_id is required");
  }

  const allTiers = await ProductTier.findAll({
    where: {
      deleted_at: null,
    },
  });

  const union = new Set();

  for (const tier of allTiers) {
    const { productIds } = await getProductIdsForTier(tier.id, useCaseId);

    productIds.forEach((id) => {
      union.add(id);
    });
  }

  return [...union];
};

module.exports = {
  getAllTiers,
  createTier,
  getTierByKeyOrId,
  updateTierParentCategories,
  getTierParentCategories,
  getProductIdsForTier,
  resolveTierProductIds,
  getTierProducts,
  setProductTier,
  addProductsToTier,
  excludeProductFromAllTiers,
  clearProductTierOverride,
  getCurrentTiersForProducts,
  bulkClearProductTierOverrides,
  resolveAllTierProductIds,
};
