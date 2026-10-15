const slugify = require("../../config/slugify");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const { Op } = require("sequelize");
const {
  Industry,
  UseCase,
  UseCaseParentCategoryMapping,
  ParentCategory,
  Product,
  UseCaseProductOverride,
  ProductCategoryMapping,
  ProductCategory,
  ProductAttachment,
} = require("../../models");
const sequelize = require("../../config/central.db");
const { getSearchVariants } = require("./product.service");
const { getCurrentTiersForProducts, resolveAllTierProductIds, resolveTierProductIds } = require("./tier.service");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const pick = require("../../utils/pick");

// Fields an admin may set; anything else in the request body is ignored. Images come
// from the upload, not the body.
const INDUSTRY_FIELDS = ["title", "slug", "description", "sort_order", "is_active"];
const USE_CASE_FIELDS = ["industry_id", "title", "slug", "description", "sort_order", "is_active"];

const createIndustry = async (body, files) => {
  let industryObj = pick(body, INDUSTRY_FIELDS);

  if (files?.images?.length) {
    industryObj.image = `/images/${files.images[0].filename}`;
  }

  // Generate slug if not provided
  industryObj.slug = body.slug ? slugify(body.slug) : slugify(body.title);

  // Check duplicate slug
  const exists = await Industry.findOne({
    where: {
      slug: industryObj.slug,
      deleted_at: null,
    },
  });

  if (exists) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Industry already exists");
  }

  const industry = await Industry.create(industryObj);

  return industry;
};

const getAllIndustries = async (query) => {
  let { page = 1, limit = 10, search } = query;

  page = Number(page) || 1;
  limit = Number(limit) || 10;

  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

  if (search) {
    where[Op.or] = [
      {
        title: {
          [Op.like]: `%${search}%`,
        },
      },
      {
        slug: {
          [Op.like]: `%${search}%`,
        },
      },
    ];
  }

  const { rows, count } = await Industry.findAndCountAll({
    where,
    include: [
      {
        model: UseCase,
        as: "use_cases",
        required: false,
        where: {
          deleted_at: null,
        },
        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: ["id", "title", "slug"],
            through: {
              attributes: [],
            },
          },
        ],
      },
    ],
    limit,
    offset,
    distinct: true,
    order: [
      ["sort_order", "ASC"],

      [{ model: UseCase, as: "use_cases" }, "sort_order", "ASC"],

      [
        { model: UseCase, as: "use_cases" },
        { model: ParentCategory, as: "parent_categories" },
        "title",
        "ASC",
      ],
    ],
  });

  return {
    data: rows,
    pagination: {
      total: count,
      current_page: page,
      per_page: limit,
      total_pages: Math.ceil(count / limit),
    },
  };
};

const getIndustryById = async (id) => {
  const industry = await Industry.findByPk(id);

  if (!industry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Industry not found");
  }

  return industry;
};

const updateIndustry = async (id, body, files) => {
  const industry = await Industry.findByPk(id);

  if (!industry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Industry not found");
  }

  let updateObj = pick(body, INDUSTRY_FIELDS);

  // Update image if a new one is uploaded
  if (files?.images?.length) {
    updateObj.image = `/images/${files.images[0].filename}`;
  }

  // Generate/update slug
  if (body.slug || body.title) {
    updateObj.slug = body.slug ? slugify(body.slug) : slugify(body.title);

    const exists = await Industry.findOne({
      where: {
        slug: updateObj.slug,
        id: {
          [Op.ne]: id,
        },
        deleted_at: null,
      },
    });

    if (exists) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Industry already exists");
    }
  }

  await industry.update(updateObj);

  return industry;
};

const deleteIndustry = async (id) => {
  const transaction = await sequelize.transaction();

  try {
    const industry = await Industry.findByPk(id, { transaction });

    if (!industry) {
      throw new ApiError(httpStatus.NOT_FOUND, "Industry not found");
    }

    await UseCase.destroy({
      where: {
        industry_id: id,
      },
      transaction,
    });

    await industry.destroy({
      transaction,
    });

    await transaction.commit();

    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const createUseCase = async (body, files) => {
  const industry = await Industry.findByPk(body.industry_id);

  if (!industry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Industry not found");
  }

  const useCaseObj = {
    ...pick(body, USE_CASE_FIELDS),
    slug: body.slug ? slugify(body.slug) : slugify(body.title),
  };

  if (files?.images?.length) {
    useCaseObj.image = `/images/${files.images[0].filename}`;
  }

  const exists = await UseCase.findOne({
    where: {
      industry_id: body.industry_id,
      slug: useCaseObj.slug,
      deleted_at: null,
    },
  });

  if (exists) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Use Case already exists in this industry",
    );
  }

  return await UseCase.create(useCaseObj);
};

const getAllUseCasesDropdown = async () => {
  return await UseCase.findAll({
    where: {
      deleted_at: null,
      is_active: true,
    },
    attributes: ["id", "industry_id", "title", "slug", "image"],
    include: [
      {
        model: Industry,
        as: "industry",
        attributes: ["id", "title"],
      },
    ],
    order: [
      [{ model: Industry, as: "industry" }, "sort_order", "ASC"],
      ["title", "ASC"],
    ],
  });
};

const getAllUseCases = async (query) => {
  let { page = 1, limit = 10, search, industry_id } = query;

  page = Number(page) || 1;
  limit = Number(limit) || 10;

  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

  if (industry_id) {
    where.industry_id = industry_id;
  }

  if (search) {
    where[Op.or] = [
      {
        title: {
          [Op.like]: `%${search}%`,
        },
      },
      {
        slug: {
          [Op.like]: `%${search}%`,
        },
      },
    ];
  }

  const { rows, count } = await UseCase.findAndCountAll({
    where,
    include: [
      {
        model: Industry,
        as: "industry",
        attributes: ["id", "title"],
      },
      {
        model: ParentCategory,
        as: "parent_categories",
        attributes: ["id", "title", "slug"],
        through: {
          attributes: [],
        },
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
    limit,
    offset,
  });

  return {
    data: rows,
    pagination: {
      total: count,
      current_page: page,
      per_page: limit,
      total_pages: Math.ceil(count / limit),
    },
  };
};

const getUseCaseById = async (id) => {
  const useCase = await UseCase.findByPk(id, {
    include: [
      {
        model: Industry,
        as: "industry",
      },
    ],
  });

  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  return useCase;
};

const getUseCasesByIndustry = async (industry_id) => {
  return await UseCase.findAll({
    where: {
      industry_id,
      deleted_at: null,
    },
    order: [
      ["sort_order", "ASC"],
      ["title", "ASC"],
    ],
  });
};

const updateUseCase = async (id, body, files) => {
  const useCase = await UseCase.findByPk(id);

  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  const updateObj = pick(body, USE_CASE_FIELDS);

  // Update image if a new one is uploaded
  if (files?.images?.length) {
    updateObj.image = `/images/${files.images[0].filename}`;
  }

  if (body.slug || body.title) {
    updateObj.slug = body.slug ? slugify(body.slug) : slugify(body.title);

    const exists = await UseCase.findOne({
      where: {
        industry_id: body.industry_id || useCase.industry_id,
        slug: updateObj.slug,
        id: {
          [Op.ne]: id,
        },
        deleted_at: null,
      },
    });

    if (exists) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Use Case already exists");
    }
  }

  await useCase.update(updateObj);

  return useCase;
};

const deleteUseCase = async (id) => {
  const useCase = await UseCase.findByPk(id);

  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  await useCase.destroy();

  return true;
};

const updateUseCaseParentCategories = async (useCaseId, body) => {
  const transaction = await sequelize.transaction();

  try {
    const useCase = await UseCase.findByPk(useCaseId, {
      transaction,
    });

    if (!useCase) {
      throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
    }

    const parentCategoryIds = body.parent_category_ids || [];

    // Physically remove old mappings
    await UseCaseParentCategoryMapping.destroy({
      where: {
        use_case_id: useCaseId,
      },
      force: true,
      transaction,
    });

    if (parentCategoryIds.length) {
      await UseCaseParentCategoryMapping.bulkCreate(
        parentCategoryIds.map((parentCategoryId) => ({
          use_case_id: useCaseId,
          parent_category_id: parentCategoryId,
        })),
        {
          transaction,
        },
      );
    }

    await transaction.commit();

    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const getUseCaseParentCategories = async (id) => {
  const useCase = await UseCase.findByPk(id, {
    include: [
      {
        model: ParentCategory,
        as: "parent_categories",
        through: {
          attributes: [],
        },
      },
    ],
  });

  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  return useCase;
};

// new apis to add prooducts into use case

const getProductsForMultipleUseCases = async (useCaseIds, query) => {
  const {
    page = 1,
    limit = 20,
    search,
    tier,
  } = query;

  if (!useCaseIds.length) {
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

  // ==========================================
  // Verify all use cases
  // ==========================================

  const useCases = await UseCase.findAll({
    where: {
      id: {
        [Op.in]: useCaseIds,
      },
    },
    attributes: ["id"],
    raw: true,
  });

  const foundIds = new Set(useCases.map((u) => u.id));

  const missingIds = useCaseIds.filter(
    (id) => !foundIds.has(id),
  );

  if (missingIds.length) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Use Case(s) not found: ${missingIds.join(", ")}`,
    );
  }

  // ==========================================
  // Get products
  // ==========================================

  const unionProductIds = new Set();
  const includedAnywhere = new Set();

  // ------------------------------------------
  // TIER FILTER
  // ------------------------------------------

  if (tier) {
    for (const useCaseId of useCaseIds) {
      const productIds =
        tier === "all"
          ? await resolveAllTierProductIds(useCaseId)
          : await resolveTierProductIds(
              tier,
              useCaseId,
            );

      productIds.forEach((id) => {
        unionProductIds.add(id);
      });

      // Get manual/category source information
      const {
        includedIds,
      } = await getProductIdsForUseCase(useCaseId);

      includedIds.forEach((id) => {
        if (productIds.includes(id)) {
          includedAnywhere.add(id);
        }
      });
    }
  } else {
    // ------------------------------------------
    // NO TIER FILTER
    // Existing behavior
    // ------------------------------------------

    for (const useCaseId of useCaseIds) {
      const {
        productIds,
        includedIds,
      } = await getProductIdsForUseCase(useCaseId);

      productIds.forEach((id) => {
        unionProductIds.add(id);
      });

      includedIds.forEach((id) => {
        includedAnywhere.add(id);
      });
    }
  }

  // ==========================================
  // No products
  // ==========================================

  if (!unionProductIds.size) {
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

  let finalProductIds = [...unionProductIds];

  // ==========================================
  // Search
  // ==========================================

  if (search) {
    const searchIds = new Set();

    const nameMatches = await Product.findAll({
      where: {
        id: {
          [Op.in]: finalProductIds,
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

    const matchingCategories =
      await ProductCategory.findAll({
        where: {
          title: {
            [Op.like]: `%${search}%`,
          },
        },
        attributes: ["id"],
        raw: true,
      });

    const matchingParentCategories =
      await ParentCategory.findAll({
        where: {
          title: {
            [Op.like]: `%${search}%`,
          },
        },
        attributes: ["id"],
        raw: true,
      });

    let categoryIdsToMatch =
      matchingCategories.map((c) => c.id);

    if (matchingParentCategories.length) {
      const parentCategoryIds =
        matchingParentCategories.map(
          (pc) => pc.id,
        );

      const childCategories =
        await ProductCategory.findAll({
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
          ...childCategories.map(
            (c) => c.id,
          ),
        ]),
      ];
    }

    if (categoryIdsToMatch.length) {
      const categoryMappings =
        await ProductCategoryMapping.findAll({
          where: {
            product_category_id: {
              [Op.in]: categoryIdsToMatch,
            },
            product_id: {
              [Op.in]: finalProductIds,
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

  // ==========================================
  // Fetch products
  // ==========================================

  const offset =
    (Number(page) - 1) * Number(limit);

  const { rows, count } =
    await Product.findAndCountAll({
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

  // ==========================================
  // Format
  // ==========================================

  const data = rows.map((p) => {
    const json = p.toJSON();

    const parentCategoriesMap =
      new Map();

    (json.categories || []).forEach(
      (cat) => {
        (cat.parent_categories || []).forEach(
          (pc) => {
            parentCategoriesMap.set(
              pc.id,
              pc,
            );
          },
        );
      },
    );

    delete json.categories;

    return {
      ...json,
      name: decodeHtmlEntities(json.name),
      parent_categories: [
        ...parentCategoriesMap.values(),
      ],
      source: includedAnywhere.has(p.id)
        ? "manual"
        : "category",
    };
  });

  return {
    data,

    pagination: {
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(
        count / Number(limit),
      ),
    },
  };
};

const getProductIdsForUseCase = async (useCaseId) => {
  const useCase = await UseCase.findByPk(useCaseId, {
    include: [
      {
        model: ParentCategory,
        as: "parent_categories",
        attributes: ["id"],
        through: { attributes: [] },
      },
    ],
  });

  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  const parentCategoryIds = useCase.parent_categories.map((pc) => pc.id);

  const baseProductIds = new Set();
  let categoryProductCount = 0;

  if (parentCategoryIds.length) {
    // Same join shape as getAllProducts' category_id filter — Product ->
    // categories -> parent_categories, inner-joined — so this can never
    // drift from what the storefront shows for the same category.
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
              where: { id: { [Op.in]: parentCategoryIds } },
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

    categoryProductCount = matchingProducts.length;
    matchingProducts.forEach((p) => baseProductIds.add(p.id));
  }

  const overrides = await UseCaseProductOverride.findAll({
    where: { use_case_id: useCaseId },
    attributes: ["product_id", "type"],
    raw: true,
  });

  const includedIds = [];
  const excludedIds = [];

  for (const o of overrides) {
    if (o.type === "exclude") {
      baseProductIds.delete(o.product_id);
      excludedIds.push(o.product_id);
    }
    if (o.type === "include") {
      baseProductIds.add(o.product_id);
      includedIds.push(o.product_id);
    }
  }

  return {
    productIds: [...baseProductIds],
    includedIds,
    excludedIds,
    categoryProductCount, // now actually meaningful
  };
};

const getUseCaseProducts = async (useCaseId, query) => {
  const { page = 1, limit = 20, search } = query;

  const useCase = await UseCase.findByPk(useCaseId);
  if (!useCase) {
    throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");
  }

  const { productIds, includedIds } = await getProductIdsForUseCase(useCaseId);

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

  if (search) {
    // Same normalization as getAllProducts — singular/plural, synonyms,
    // etc. — instead of a single raw LIKE term, so "tee" also matches
    // "tees"/"t-shirt" the way the customer-facing search does.
    const searchVariants = getSearchVariants(search);
    const searchIds = new Set();

    const nameMatches = await Product.findAll({
      where: {
        id: { [Op.in]: productIds },
        is_active: true,
        is_discontinued: false,
        [Op.or]: searchVariants.flatMap((term) => [
          { name: { [Op.like]: `%${term}%` } },
          { description: { [Op.like]: `%${term}%` } },
          { external_style_id: { [Op.like]: `%${term}%` } },
          { external_style_name: { [Op.like]: `%${term}%` } },
        ]),
      },
      attributes: ["id"],
      raw: true,
    });
    nameMatches.forEach((p) => searchIds.add(p.id));

    // Match product categories by title
    const matchingCategories = await ProductCategory.findAll({
      where: {
        [Op.or]: searchVariants.map((term) => ({
          title: { [Op.like]: `%${term}%` },
        })),
      },
      attributes: ["id"],
      raw: true,
    });

    // Match parent categories by title too, since that's what's shown to admins
    const matchingParentCategories = await ParentCategory.findAll({
      where: {
        [Op.or]: searchVariants.map((term) => ({
          title: { [Op.like]: `%${term}%` },
        })),
      },
      attributes: ["id"],
      raw: true,
    });

    let categoryIdsToMatch = matchingCategories.map((c) => c.id);

    if (matchingParentCategories.length) {
      const parentCategoryIds = matchingParentCategories.map((pc) => pc.id);

      const childCategories = await ProductCategory.findAll({
        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: [],
            through: { attributes: [] },
            where: { id: { [Op.in]: parentCategoryIds } },
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

    if (categoryIdsToMatch.length) {
      const categoryMappings = await ProductCategoryMapping.findAll({
        where: {
          product_category_id: { [Op.in]: categoryIdsToMatch },
          product_id: { [Op.in]: productIds },
        },
        attributes: ["product_id"],
        raw: true,
      });
      categoryMappings.forEach((m) => searchIds.add(m.product_id));
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

  const offset = (Number(page) - 1) * Number(limit);

  const { rows, count } = await Product.findAndCountAll({
    where: { id: { [Op.in]: finalProductIds } },
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
        through: { attributes: [] },
        required: false,
        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: ["id", "title"],
            through: { attributes: [] },
          },
        ],
      },
    ],
    limit: Number(limit),
    offset,
    distinct: true,
    order: [["name", "ASC"]],
  });

  let data = rows.map((p) => {
    const json = p.toJSON();

    // Flatten product's categories -> their parent categories into one
    // deduped list, since admins care about parent category, not the
    // raw supplier-provided product category.
    const parentCategoriesMap = new Map();
    (json.categories || []).forEach((cat) => {
      (cat.parent_categories || []).forEach((pc) => {
        parentCategoriesMap.set(pc.id, pc);
      });
    });

    delete json.categories;

    return {
      ...json,
      name: decodeHtmlEntities(json.name),
      parent_categories: [...parentCategoriesMap.values()],
      source: includedSet.has(p.id) ? "manual" : "category",
    };
  });

  // Attach each product's CURRENT tier (Primary/Secondary/Budget — an
  // axis independent of this use case) directly in the response, so the
  // admin table doesn't need a second round trip to show it.
  if (data.length) {
    const tierMap = await getCurrentTiersForProducts(
      data.map((p) => p.id),
      useCaseId,
    );
    data = data.map((p) => ({ ...p, tier: tierMap[p.id] || null }));
  }

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

const addProductsToUseCase = async (useCaseId, productIds) => {
  const useCase = await UseCase.findByPk(useCaseId);
  if (!useCase) throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");

  const rows = productIds.map((product_id) => ({
    use_case_id: useCaseId,
    product_id,
    type: "include",
  }));

  return UseCaseProductOverride.bulkCreate(rows, {
    updateOnDuplicate: ["type", "updated_at"],
  });
};

const excludeProductsFromUseCase = async (useCaseId, productIds) => {
  const useCase = await UseCase.findByPk(useCaseId);
  if (!useCase) throw new ApiError(httpStatus.NOT_FOUND, "Use Case not found");

  const rows = productIds.map((product_id) => ({
    use_case_id: useCaseId,
    product_id,
    type: "exclude",
  }));

  return UseCaseProductOverride.bulkCreate(rows, {
    updateOnDuplicate: ["type", "updated_at"],
  });
};

// Removes any override entirely — product reverts to pure category-driven behavior
const clearProductOverride = async (useCaseId, productId) => {
  return UseCaseProductOverride.destroy({
    where: { use_case_id: useCaseId, product_id: productId },
  });
};

const moveProductsBetweenUseCases = async (
  productIds,
  fromUseCaseId,
  toUseCaseId,
) => {
  const transaction = await sequelize.transaction();

  try {
    const excludeRows = productIds.map((product_id) => ({
      use_case_id: fromUseCaseId,
      product_id,
      type: "exclude",
    }));

    const includeRows = productIds.map((product_id) => ({
      use_case_id: toUseCaseId,
      product_id,
      type: "include",
    }));

    await UseCaseProductOverride.bulkCreate(excludeRows, {
      updateOnDuplicate: ["type", "updated_at"],
      transaction,
    });

    await UseCaseProductOverride.bulkCreate(includeRows, {
      updateOnDuplicate: ["type", "updated_at"],
      transaction,
    });

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const getUseCasesForProduct = async (productId) => {
  // Manual includes
  const manualIncludes = await UseCaseProductOverride.findAll({
    where: { product_id: productId, type: "include" },
    include: [
      {
        model: UseCase,
        as: "use_case",
        attributes: ["id", "title"],
        include: [
          {
            model: Industry,
            as: "industry",
            attributes: ["id", "title"],
          },
        ],
      },
    ],
  });

  const manualExcludes = await UseCaseProductOverride.findAll({
    where: { product_id: productId, type: "exclude" },
    attributes: ["use_case_id"],
    raw: true,
  });
  const excludedUseCaseIds = new Set(manualExcludes.map((e) => e.use_case_id));

  const productCategoryMappings = await ProductCategoryMapping.findAll({
    where: { product_id: productId },
    attributes: ["product_category_id"],
    raw: true,
  });
  const categoryIds = productCategoryMappings.map((m) => m.product_category_id);

  let categoryDerived = [];
  if (categoryIds.length) {
    const categories = await ProductCategory.findAll({
      where: { id: { [Op.in]: categoryIds } },
      include: [
        {
          model: ParentCategory,
          as: "parent_categories",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    const parentCategoryIds = [
      ...new Set(
        categories.flatMap((c) => c.parent_categories.map((pc) => pc.id)),
      ),
    ];

    if (parentCategoryIds.length) {
      categoryDerived = await UseCase.findAll({
        include: [
          {
            model: ParentCategory,
            as: "parent_categories",
            attributes: [],
            through: { attributes: [] },
            where: { id: { [Op.in]: parentCategoryIds } },
          },
          {
            model: Industry,
            as: "industry",
            attributes: ["id", "title"],
          },
        ],
        attributes: ["id", "title"],
      });
    }
  }

  const manual = manualIncludes.map((m) => ({
    id: m.use_case.id,
    title: m.use_case.title,
    industry: m.use_case.industry?.title || null,
    source: "manual",
  }));

  const derived = categoryDerived
    .filter((uc) => !excludedUseCaseIds.has(uc.id))
    .map((uc) => ({
      id: uc.id,
      title: uc.title,
      industry: uc.industry?.title || null,
      source: "category",
    }));

  return [...manual, ...derived];
};

module.exports = {
  createIndustry,
  getAllIndustries,
  getIndustryById,
  updateIndustry,
  deleteIndustry,

  createUseCase,
  getAllUseCasesDropdown,
  getAllUseCases,
  getUseCaseById,
  getUseCasesByIndustry,
  updateUseCase,
  deleteUseCase,

  updateUseCaseParentCategories,
  getUseCaseParentCategories,

  getUseCaseProducts,
  getProductsForMultipleUseCases,
  addProductsToUseCase,
  excludeProductsFromUseCase,
  clearProductOverride,
  moveProductsBetweenUseCases,
  getUseCasesForProduct,
  getProductIdsForUseCase,
};
