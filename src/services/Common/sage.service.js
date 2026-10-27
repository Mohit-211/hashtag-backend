/** @format */

const axios = require("axios");
const { Op } = require("sequelize");
const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");

// SAGE sends onHand as a number, or null when the supplier doesn't share stock levels.
const isStockReported = (onHand) =>
  onHand !== null && onHand !== undefined && onHand !== "" && Number.isFinite(Number(onHand));
const sequelize = require("../../config/central.db");
const {
  SourceRawData,
  Product,
  ProductCategory,
  ProductCategoryMapping,
  ProductAttachment,
  ProductVariant,
  ImportBatch,
  VariantAttachment,
} = require("../../models");
const { downloadSupplierImage } = require("./supplierImage.service");
const {
  restoreListedVariants,
  markProductRestored,
  retireUnlistedVariants,
} = require("./supplierStatus.service");
const { getOrCreateColorCode } = require("./colorService");

const settings = require("../../config/settings");

const BASE_URL = "https://www.promoplace.com/ws/ws.dll/ConnectAPI";
const SAGE_IMAGE_BASE_URL = "https://www.promoplace.com/ws/ws.dll/";

// SAGE credentials from the Settings page (Suppliers).
const getAuth = () => ({
  acctId: settings.getRequired("SAGE_ACCT_ID"),
  loginId: settings.getRequired("SAGE_LOGIN_ID"),
  key: settings.getRequired("SAGE_API_KEY"),
});

// ==================== SUPPLIER SOURCE-OF-TRUTH (READ-ONLY) ====================
// Answers "what does the supplier actually provide right now" using ONLY
// SAGE's own response — colors, SKUs, pics, pricing. This never queries or
// merges with our own product_variants table, so it can be trusted as a
// clean reference to compare against what we've imported.
const getSageSupplierTruth = async (prodEId) => {
  if (!prodEId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "prodEId is required");
  }

  const payload = {
    serviceId: 105,
    apiVer: 130,
    auth: getAuth(),
    prodEId: String(prodEId),
    includeSuppInfo: true,
  };

  const result = await callSageAPI(payload);
  const product = result.product;

  if (!product) {
    return null;
  }

  const {
    prodEid,
    itemNum,
    spc,
    prName,
    colors = "",
    qty = [],
    prc = [],
    net = [],
    pics = [],
    onHand = null,
    discontinued = 0,
  } = product;

  // Single source of truth for which colors currently exist — split exactly
  // the same way saveSageProductToDB does, so this reflects reality without
  // any DB influence.
  const colorList = colors
    ? colors.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const { priceTiers, netTiers, qtyTiers } = buildTierData(prc, net, qty);

  const supplierVariants = colorList.map((colorName) => {
    const sku = `${itemNum || spc || `SAGE-${prodEid}`}-${colorName}`;

    const matchingPic = pics.find(
      (pic) =>
        pic.caption &&
        pic.caption.trim().toLowerCase() === colorName.trim().toLowerCase(),
    );

    return {
      sku,
      color: colorName,
      image: matchingPic?.url || null,
    };
  });

  // Generic/uncaptioned pics (front shots etc.) — not tied to a specific color
  const generalImages = pics.filter((pic) => !pic.caption).map((pic) => pic.url);

  return {
    prodEid,
    name: prName,
    itemNum: itemNum || null,
    spc: spc || null,
    discontinued: !!discontinued,
    stock: isStockReported(onHand) ? Number(onHand) : null,
    variantCount: supplierVariants.length,
    variants: supplierVariants,
    generalImages,
    pricing: {
      qtyTiers,
      priceTiers,
      netTiers,
    },
  };
};

// Ensures net/price/qty tiers are always aligned and net is never missing
const buildTierData = (prc = [], net = [], qty = []) => {
  const priceTiers = prc.map((v) => (v === "" || v == null ? null : Number(v)));
  let netTiers = net.map((v) => (v === "" || v == null ? null : Number(v)));
  const qtyTiers = qty.map((v) => String(v));

  // If SAGE gave no net data at all, or wrong length, fall back to price tiers
  // so the frontend quantity-pricing table is never blank.
  if (!netTiers.length || netTiers.length !== priceTiers.length) {
    console.warn(
      `⚠️ SAGE netTiers missing/misaligned (prc:${priceTiers.length}, net:${netTiers.length}) — falling back to priceTiers`,
    );
    netTiers = [...priceTiers];
  }

  // Align qtyTiers length too, in case SAGE sends mismatched arrays
  while (qtyTiers.length < priceTiers.length) qtyTiers.push(null);

  return { priceTiers, netTiers, qtyTiers };
};

const callSageAPI = async (payload) => {
  try {
    const res = await axios.post(BASE_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    const data = res.data;

    // ✅ New improved check (works for ALL services)
    if (data.errNum || data.errMsg) {
      console.error("SAGE API Error:", {
        errNum: data.errNum,
        errMsg: data.errMsg,
      });
      throw new ApiError(httpStatus.BAD_GATEWAY, data.errMsg || `SAGE Error ${data.errNum || "unknown"}`);
    }

    // For Full Product Detail, it may not have "ok" but has "product"
    if (payload.serviceId === 105 && data.product) {
      return data; // success
    }

    // For other services (Search, Categories, etc.)
    if (!data.ok && payload.serviceId !== 105) {
      throw new ApiError(httpStatus.BAD_GATEWAY, data.errMsg || `SAGE Error ${data.errNum || "unknown"}`);
    }

    return data;
  } catch (error) {
    console.error(
      "Axios Error calling SAGE:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// ==================== RESEARCH LIST ====================
const getResearchList = async (listType = "categories") => {
  if (!["categories", "themes", "compliances", "esg"].includes(listType)) {
    throw new ApiError(httpStatus.BAD_REQUEST,
      'Invalid listType. Use "categories", "themes", "compliances", or "esg"',
    );
  }
  const payload = { serviceId: 101, apiVer: 130, auth: getAuth(), listType };
  const result = await callSageAPI(payload);
  return result.items || [];
};

const getCategories = async () => await getResearchList("categories");


// ==================== SYNC SAGE CATEGORIES (Run once or daily) ====================
const syncSageCategories = async () => {
  let batch;
  try {
    console.log("🚀 Starting SAGE Category Sync...");

    batch = await ImportBatch.create({
      source_name: "SAGE_CATEGORY",
      status: "processing",
    });

    const categories = await getCategories(); // reuse your existing function

    let processed = 0;

    for (const cat of categories) {
      try {
        await ProductCategory.upsert({
          title: cat.name, // e.g. "Key Chains / Rings, Flashlights"
          external_id: String(cat.id), // SAGE category ID
          supplier: "SAGE",
          import_batch_id: batch.id,
        });
        processed++;
      } catch (err) {
        console.error("❌ Failed to save category:", cat.name, err.message);
      }
    }

    await batch.update({
      status: "success",
      total_records: categories.length,
      processed_records: processed,
    });

    console.log(`✅ SAGE Categories synced: ${processed} categories`);
    return { total: processed };
  } catch (err) {
    console.error("❌ SAGE Category sync failed", err.message);
    if (batch) {
      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }
    throw err;
  }
};

const getAllSageCategories = async () => {
  try {
    const categoryDoc = await ProductCategory.findAndCountAll({
      where: { is_active: true, supplier: "SAGE" },
      attributes: ["id", "title"],
      order: [["created_at", "DESC"]],
    });

    if (!categoryDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get all Category",
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

const getSuppliersByCategory = async (reqBody) => {
  try {
    const { category } = reqBody;

    if (!category) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Category is required");
    }

    const result = await searchProducts({
      category,
      maxItems: 200,
    });

    const supplierMap = new Map();

    (result.products || []).forEach((p) => {
      const supplierId = Number(p.suppId || p.suppID);

      if (supplierId) {
        supplierMap.set(supplierId, {
          supplierId,
          supplierName: p.supplier || "Unknown",
        });
      }
    });

    const suppliers = Array.from(supplierMap.values());

    return {
      totalSuppliers: suppliers.length,
      suppliers,
    };
  } catch (error) {
    console.error("Error fetching suppliers:", error.message);
    throw error;
  }
};

// ==================== FIXED: GET SUPPLIERS ====================
const getSuppliers = async () => {
  const searchObj = {
    keywords: "flashlight", // ← safe dummy search so API doesn't throw 10301
    maxTotalItems: 200,
    extraReturnFields: "SUPPID,SUPPLIER",
  };

  const payload = {
    serviceId: 103,
    apiVer: 130,
    auth: getAuth(),
    search: searchObj,
    endBuyerSearch: true,
  };

  const result = await callSageAPI(payload);

  const supplierMap = new Map();
  (result.products || []).forEach((p) => {
    if (p.suppId) {
      supplierMap.set(p.suppId, {
        suppId: p.suppId,
        supplierName: p.supplier || "Unknown",
      });
    }
  });

  return Array.from(supplierMap.values());
};

// ==================== SEARCH PRODUCTS (Improved) ====================
const searchProducts = async (filters = {}) => {
  const page = filters.page || 1;
  const limit = Math.min(filters.maxItems || 100, 1000);

  // 🚀 STEP 1: Fetch ALL products (not paginated from SAGE)
  const searchObj = {
    keywords: filters.keywords || "",
    categories: filters.category || filters.categories || "",
    suppId: filters.supplierId ? parseInt(filters.supplierId, 10) : undefined,
    maxTotalItems: 1000, // ✅ ALWAYS FETCH MAX
    start: 0, // ✅ always from start
    extraReturnFields: "SUPPID,SUPPLIER,CATEGORY,DESCRIPTION",
  };

  Object.keys(searchObj).forEach((key) => {
    if (searchObj[key] === undefined) delete searchObj[key];
  });

  const payload = {
    serviceId: 103,
    apiVer: 130,
    auth: getAuth(),
    search: searchObj,
    endBuyerSearch: true,
  };

  const result = await callSageAPI(payload);

  let allProducts = result.products || [];

  // ✅ STEP 2: (IMPORTANT) Fix category matching (SAGE is messy)
  if (filters.category) {
    const category = filters.category.toLowerCase();

    allProducts = allProducts.filter((p) =>
      p.category?.toLowerCase().includes(category),
    );
  }

  // ✅ STEP 3: Correct total
  const total = allProducts.length;

  // ✅ STEP 4: Apply pagination yourself
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const paginatedProducts = allProducts.slice(startIndex, endIndex);

  const importedProducts = await Product.findAll({
  where: {
    supplier: "SAGE",
    external_style_id: {
      [Op.in]: paginatedProducts.map((p) => String(p.prodEId)),
    },
  },
  attributes: ["id", "external_style_id"], // ← added "id"
  raw: true,
});

// Map external_style_id -> our internal product id, instead of just a
// yes/no Set — the frontend "View Stored" button needs the actual id
// to know where to navigate.
const importedMap = new Map(
  importedProducts.map((p) => [String(p.external_style_id), p.id]),
);

const productsWithImportFlag = paginatedProducts.map((p) => ({
  ...p,
  imported: importedMap.has(String(p.prodEId)),
  importedProductId: importedMap.get(String(p.prodEId)) || null, // ← new field
}));

  return {
    totalFound: total,
    products: productsWithImportFlag,
    page,
    limit,
    searchResponseMsg: result.searchResponseMsg,
  };
};

// ==================== PRODUCT DETAILS (Full Data) ====================
const getProductDetails = async (prodEId, includeSuppInfo = true) => {
  if (!prodEId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "prodEId is required");
  }

  const payload = {
    serviceId: 105,
    apiVer: 130,
    auth: getAuth(),
    prodEId: String(prodEId),
    includeSuppInfo: !!includeSuppInfo,
  };

  const result = await callSageAPI(payload);

  const product = result.product;

  if (!product) {
    return null;
  }

  const importedProduct = await Product.findOne({
    where: {
      supplier: "SAGE",
      external_style_id: String(prodEId),
    },
    attributes: ["id"],
    raw: true,
  });

  let variants = [];

  if (importedProduct) {
    variants = await ProductVariant.findAll({
      where: {
        product_id: importedProduct.id,
      },
      attributes: ["id", "sku", "color", "stock", "price"],
      raw: true,
    });
  }

  return {
    ...product,

    imported: !!importedProduct,

    importedProductId: importedProduct?.id || null,

    variantCount: variants.length,

    variants,
  };
};

const importSageProducts = async (filters = {}) => {
  let batch;

  try {
    batch = await ImportBatch.create({
      source_name: "SAGE_PRODUCT",
      status: "processing",
    });

    let page = 1;
    const limit = 100;

    let totalImported = 0;
    let totalFound = 0;
    let totalPages = 1;

    while (page <= totalPages) {
      const searchResult = await searchProducts({
        ...filters,
        page,
        maxItems: limit,
      });

      if (page === 1) {
        totalFound = searchResult.totalFound;
        totalPages = Math.ceil(totalFound / limit); // ✅ FIX
      }

      if (!searchResult.products.length) {
        console.log(`⚠️ Page ${page} returned empty`);
        break;
      }

      for (const basicProduct of searchResult.products) {
        try {
          const fullProduct = await getProductDetails(
            basicProduct.prodEId,
            true,
          );

          if (fullProduct) {
            await saveSageProductToDB(fullProduct, batch.id);
            totalImported++;
          }
        } catch (err) {
          console.error(
            `❌ Failed prodEId ${basicProduct.prodEId}:`,
            err.message,
          );
        }
      }

      console.log(`✅ Page ${page} done`);

      page++;
    }

    await batch.update({
      status: "success",
      total_records: totalFound,
      processed_records: totalImported,
    });

    return {
      totalImported,
      totalFound,
      batchId: batch.id,
    };
  } catch (err) {
    if (batch) {
      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }
    throw err;
  }
};

const restoreSageProduct = async (productId, transaction) => {
  // Product
  await Product.restore({
    where: {
      id: productId,
    },
    transaction,
  });

  await Product.update(
    {
      is_active: true,
    },
    {
      where: {
        id: productId,
      },
      paranoid: false,
      transaction,
    },
  );

  // Variants are not restored here: after the upsert, saveSageProductToDB brings back
  // only the ones SAGE still lists (restoreListedVariants) and retires the rest.

  // Product Attachments
  await ProductAttachment.restore({
    where: {
      product_id: productId,
    },
    transaction,
  });

  // Category Mappings
  await ProductCategoryMapping.restore({
    where: {
      product_id: productId,
    },
    transaction,
  });

  await ProductCategoryMapping.update(
    {
      is_active: true,
    },
    {
      where: {
        product_id: productId,
      },
      paranoid: false,
      transaction,
    },
  );

};

const saveSageProductToDB = async (sageProduct, batchId) => {
  const {
    prodEid,
    spc,
    itemNum,
    prName,
    description,
    category,
    colors = "",
    prc = [],
    net = [],
    qty = [],
    pics = [],
    onHand = null,
    dimensions,
    prodTime,
    themes,
    discontinued = 0,
    supplier = {},
  } = sageProduct;

  // =====================================================
  // CHECK SYNC LOCK
  // =====================================================

  const existingProduct = await Product.findOne({
    where: {
      supplier: "SAGE",
      external_style_id: String(prodEid),
    },
    attributes: ["id", "sync_locked"],
    paranoid: false,
  });

  if (existingProduct?.sync_locked) {
    console.log(`⏭️ SAGE product ${prodEid} is sync locked. Skipping.`);

    return {
      skipped: true,
      product_id: existingProduct.id,
    };
  }
  let transaction;

  try {
    transaction = await sequelize.transaction();

    const listPrice = prc.length ? Number(prc[0]) || 0 : 0;
    const netPrice = net.length ? Number(net[0]) || 0 : 0;

    const minPrice = prc.length ? Math.min(...prc.map(Number)) : 0;
    const maxPrice = prc.length ? Math.max(...prc.map(Number)) : 0;

    // ✅ Build guaranteed-aligned tier data (never leaves netTiers empty)
    const { priceTiers, netTiers, qtyTiers } = buildTierData(prc, net, qty);

    // ====================== RAW DATA ======================
    await SourceRawData.upsert(
      {
        source_name: "SAGE",
        external_id: String(prodEid),
        raw_json: sageProduct,
        import_batch_id: batchId,
      },
      { transaction },
    );

    const existingProduct = await Product.findOne({
      where: {
        supplier: "SAGE",
        external_style_id: String(prodEid),
      },
      paranoid: false,
      transaction,
    });

    if (existingProduct) {
      await restoreSageProduct(existingProduct.id, transaction);

      // Shown to admins: the sync brought back a product that had been removed.
      if (existingProduct.deleted_at) {
        await markProductRestored(existingProduct.id, transaction);
      }
    }

    await Product.update(
      {
        deleted_at: null,
        is_active: true,
        discontinued_at: null,
      },
      {
        where: {
          external_style_id: String(prodEid),
          supplier: "SAGE",
        },
        paranoid: false,
        transaction,
      },
    );

    // ====================== PRODUCT UPSERT ======================
    const [product] = await Product.upsert(
      {
        name: prName || "Untitled Product",
        description: description || "",
        external_style_id: String(prodEid),
        external_style_name: prName,
        supplier: "SAGE",
        supplier_id: supplier?.suppId,
        supplier_name: supplier?.coName,
        import_batch_id: batchId,

        // === MANAGER'S PRICING ===
        price: listPrice,
        case_price: listPrice,
        retail_price: netPrice,

        // Status & Tracking (Added from SanMar)
        is_discontinued: !!discontinued,
        discontinued_at: discontinued ? new Date() : null,
        is_active: !discontinued,
        deleted_at: null,
        last_supplier_sync_at: new Date(),

        meta: {
          themes,
          productionTime: prodTime,
          dimensions,
          minPrice,
          maxPrice,
          priceTiers,
          netTiers,
          qtyTiers,
          categories: category ? category.split(",").map((c) => c.trim()) : [],
        },
      },
      {
        returning: true,
        transaction,
        fields: [
          "name",
          "description",
          "external_style_id",
          "external_style_name",
          "supplier",
          "supplier_id",
          "supplier_name",
          "import_batch_id",
          "price",
          "case_price",
          "retail_price",
          "is_discontinued",
          "discontinued_at",
          "is_active",
          "last_supplier_sync_at",
          "meta",
          "deleted_at",
        ],
      },
    );

    // MySQL reports no id when the upsert changed nothing (the same data saved twice
    // within one second); look the row up in that case.
    if (!product.id) {
      const saved = await Product.findOne({
        where: { supplier: "SAGE", external_style_id: String(prodEid) },
        attributes: ["id"],
        transaction,
      });
      product.id = saved.id;
    }

    await Product.update(
      {
        deleted_at: null,
        is_active: true,
        discontinued_at: null,
      },
      {
        where: {
          id: product.id,
        },
        paranoid: false,
        transaction,
      },
    );

    // ====================== CATEGORY MAPPING ======================
    if (category) {
      const categories = category.split(",").map((c) => c.trim());
      for (const cat of categories) {
        let catRecord = await ProductCategory.findOne({
          where: { title: cat, supplier: "SAGE" },
          transaction,
        });

        if (!catRecord) {
          catRecord = await ProductCategory.create(
            {
              title: cat,
              supplier: "SAGE",
              import_batch_id: batchId,
            },
            { transaction },
          );
        }
        const mapping = await ProductCategoryMapping.findOne({
          where: {
            product_id: product.id,
            product_category_id: catRecord.id,
          },
          paranoid: false,
          transaction,
        });

        if (mapping) {
          if (mapping) {
            await ProductCategoryMapping.update(
              {
                deleted_at: null,
                is_active: true,
              },
              {
                where: {
                  id: mapping.id,
                },
                paranoid: false,
                transaction,
              },
            );
          }
        } else {
          await ProductCategoryMapping.create(
            {
              product_id: product.id,
              product_category_id: catRecord.id,
              is_active: true,
            },
            { transaction },
          );
        }
      }
    }

    // ====================== PRODUCT IMAGE ======================

    let primaryImage = null;

    // First image only
    const firstPic =
      pics.find((p) => p.hasLogo === 1) ||
      pics.find((p) => !p.caption) ||
      pics[0];

    if (firstPic?.url) {
      const sourceUrl = firstPic.url.startsWith("http")
        ? firstPic.url
        : `${SAGE_IMAGE_BASE_URL}${firstPic.url}`;

      const localUrl = await downloadSupplierImage({
        supplier: "sage",
        imageUrl: sourceUrl,
        styleId: prodEid,
        sku: itemNum || spc || prodEid,
        imageType: "front",
      });

      if (localUrl) {
        primaryImage = {
          localUrl,
          sourceUrl,
        };
      }
    }

    const existingProductImage = await ProductAttachment.findOne({
      where: {
        product_id: product.id,
        is_primary: true,
      },
      paranoid: false,
      transaction,
    });

    if (primaryImage) {
      if (!existingProductImage) {
        await ProductAttachment.create(
          {
            product_id: product.id,
            file_name: primaryImage.localUrl.split("/").pop(),
            file_uri: primaryImage.localUrl,
            source_url: primaryImage.sourceUrl,
            file_type: "image",
            is_primary: true,
            supplier: "SAGE",
          },
          { transaction },
        );
      } else {
        await ProductAttachment.update(
          {
            deleted_at: null,
            file_name: primaryImage.localUrl.split("/").pop(),
            file_uri: primaryImage.localUrl,
            source_url: primaryImage.sourceUrl,
          },
          {
            where: {
              id: existingProductImage.id,
            },
            paranoid: false,
            transaction,
          },
        );
      }
    }

    // ====================== VARIANTS ======================
    const colorList = colors
      ? colors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : ["Default"];

    const variantPayload = await Promise.all(
      colorList.map(async (colorName) => {
        const colorCode = await getOrCreateColorCode("SAGE", colorName);

        return {
          sku: `${itemNum || spc || `SAGE-${prodEid}`}-${colorName}`,

          product_id: product.id,

          price: listPrice,

          case_price: listPrice,

          retail_price: netPrice,

          // SAGE's onHand is the supplier's stock (0 = none) or null when the supplier
          // doesn't report stock. Unreported stock isn't tracked, so it never blocks an order;
          // it used to be stored as 999999, and a reported 0 was too.
          stock: isStockReported(onHand) ? Number(onHand) : null,
          track_inventory: isStockReported(onHand),

          size: "One Size",

          color: colorName,

          color_code: colorCode,

          supplier: "SAGE",

          import_batch_id: batchId,

          supplier_image_synced: false,

          last_supplier_sync_at: new Date(),

          is_active: !discontinued,

          is_discontinued: !!discontinued,

          discontinued_at: discontinued ? new Date() : null,

          meta: {
            priceTiers,
            netTiers,
            qtyTiers,
            dimensions,
            productionTime: prodTime,
            themes,
          },
        };
      }),
    );

       // ====================== CLEAN UP STALE VARIANT ROWS ======================
    // SAGE's `colors` field is the single source of truth for which colors
    // currently exist for this product. Any local row whose color isn't in
    // that list (e.g. legacy "Various" rows from before per-color tracking
    // existed) — or whose SKU no longer matches SAGE's current naming for a
    // color it still lists — is stale local data that must not be kept as
    // if it were a supplier-provided variant.
    const currentSkus = variantPayload.map((v) => v.sku);
    const currentColors = variantPayload.map((v) => v.color);

    // Guard: colorList only falls back to a single "Default" entry when
    // SAGE's colors field is genuinely empty/missing for this response.
    // In that case, DON'T treat every real color as "removed" — that would
    // wipe out legitimate variant history on what's likely a transient
    // SAGE data gap, not an actual color discontinuation.
    const supplierProvidedRealColors = !!colors;

    const staleVariants = await ProductVariant.findAll({
      where: {
        product_id: product.id,
        [Op.or]: [
          // Case 1: color still offered, but SKU naming scheme changed
          {
            color: { [Op.in]: currentColors },
            sku: { [Op.notIn]: currentSkus },
          },
          // Case 2: color no longer offered by supplier at all
          ...(supplierProvidedRealColors
            ? [{ color: { [Op.notIn]: currentColors } }]
            : []),
        ],
      },
      attributes: ["id"],
      paranoid: false,
      transaction,
    });

    if (staleVariants.length) {
      const staleIds = staleVariants.map((v) => v.id);

      console.log(
        `🧹 Retiring ${staleIds.length} stale SAGE variant row(s) for product ${product.id}`,
      );

      // Marked discontinued and soft-deleted, not erased: order lines point at
      // variants (erasing an ordered one made every later sync of the product fail),
      // and a color SAGE lists again comes back below.
      await retireUnlistedVariants({ ids: staleIds, transaction });
    }

    await ProductVariant.bulkCreate(variantPayload, {
      updateOnDuplicate: [
        "price",
        "case_price",
        "color_code",
        "retail_price",
        "stock",
        "track_inventory",
        "is_active",
        "is_discontinued",
        "discontinued_at",
        "last_supplier_sync_at",
        "meta",
      ],
      transaction,
    });

    // Every color SAGE lists is on sale, including ones it marks discontinued (those
    // carry is_discontinued for the admin panel). Listed variants that had been removed
    // come back, with restored_at set.
    await restoreListedVariants({ productId: product.id, skus: currentSkus, transaction });

    await ProductVariant.update(
      {
        is_active: true,
      },
      {
        where: {
          product_id: product.id,
          sku: currentSkus,
        },
        transaction,
      },
    );

    // ====================== VARIANT IMAGES ======================

    // Images only for the variants SAGE lists (retired ones keep theirs, soft-deleted).
    const createdVariants = await ProductVariant.findAll({
      where: {
        product_id: product.id,
        sku: currentSkus,
      },
      transaction,
    });

    for (const variant of createdVariants) {
      const matchingPic = pics.find((pic) => {
        if (!pic.caption) return false;

        return (
          pic.caption.trim().toLowerCase() ===
          (variant.color || "").trim().toLowerCase()
        );
      });

      if (!matchingPic?.url) continue;

      const sourceUrl = matchingPic.url.startsWith("http")
        ? matchingPic.url
        : `${SAGE_IMAGE_BASE_URL}${matchingPic.url}`;

      const localUrl = await downloadSupplierImage({
        supplier: "sage",
        imageUrl: sourceUrl,
        styleId: prodEid,
        sku: variant.sku,
        imageType: "variant",
      });

      if (!localUrl) continue;

      const existingVariantImage = await VariantAttachment.findOne({
        where: {
          variant_id: variant.id,
          is_primary: true,
        },
        transaction,
        paranoid: false,
      });

      if (!existingVariantImage) {
        await VariantAttachment.create(
          {
            variant_id: variant.id,
            file_name: localUrl.split("/").pop(),
            file_uri: localUrl,
            source_url: sourceUrl,
            file_type: "image",
            supplier: "SAGE",
            is_primary: true,
          },
          { transaction },
        );
      } else {
        await VariantAttachment.update(
          {
            deleted_at: null,
            file_name: localUrl.split("/").pop(),
            file_uri: localUrl,
            source_url: sourceUrl,
          },
          {
            where: {
              id: existingVariantImage.id,
            },
            paranoid: false,
            transaction,
          },
        );
      }
    }

    await transaction.commit();

    console.log(`✅ SAGE Product Saved: ${prName} | Price: ${listPrice}`);
    return product;
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("❌ SAGE save failed for", prodEid || prName, err.message);
    throw err;
  }
};

// ==================== SELECTIVE IMPORT (New) ====================
const importSelectedSageProducts = async (prodEIds = [], batchNotes = "") => {
  let batch;

  try {
    if (!Array.isArray(prodEIds) || prodEIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "prodEIds array is required and cannot be empty");
    }

    // Remove duplicates
    prodEIds = [...new Set(prodEIds)];

    batch = await ImportBatch.create({
      source_name: "SAGE_PRODUCT_MANUAL",
      status: "processing",
      notes:
        batchNotes || `Manual selective import of ${prodEIds.length} products`,
    });

    let success = 0;
    let failed = 0;
    const failedIds = [];

    for (const prodEId of prodEIds) {
      try {
        const fullProduct = await getProductDetails(prodEId, true);

        if (fullProduct) {
          await saveSageProductToDB(fullProduct, batch.id);
          success++;
        } else {
          failed++;
          failedIds.push(prodEId);
        }
      } catch (err) {
        console.error(`❌ Failed to import prodEId ${prodEId}:`, err.message);

        failed++;
        failedIds.push(prodEId);
      }
    }

    await batch.update({
      status:
        failed === 0 ? "success" : success > 0 ? "partial_success" : "failed",

      total_records: prodEIds.length,
      processed_records: success,
      error_message: failed > 0 ? `${failed} products failed` : null,
    });

    return {
      success,
      failed,
      total: prodEIds.length,
      failedIds,
      batchId: batch.id,
    };
  } catch (err) {
    if (batch) {
      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }

    console.error("❌ SAGE selective import failed:", err.message);

    throw err;
  }
};

const deleteSageProducts = async (reqBody) => {
  try {
    const { batchId, supplierId, category } = reqBody;

    if (!batchId && !supplierId && !category) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Provide batchId OR supplierId OR category");
    }

    // Only ever SAGE products, whatever batch or supplier id is passed.
    let whereClause = { supplier: "SAGE" };

    // ✅ 1. Batch-based filter
    if (batchId) {
      whereClause.import_batch_id = batchId;
    }

    // ✅ 2. Supplier-based filter
    if (supplierId) {
      whereClause.supplier_id = supplierId;
    }

    // ✅ 3. Fetch products
    let products = await Product.findAll({
      where: whereClause,
      attributes: ["id"],
    });

    let productIds = products.map((p) => p.id);

    // ✅ 4. Category filter (optional)
    if (category && productIds.length) {
      const categoryRecords = await ProductCategory.findAll({
        where: { title: category, supplier: "SAGE" },
      });

      const categoryIds = categoryRecords.map((c) => c.id);

      const mappings = await ProductCategoryMapping.findAll({
        where: {
          product_id: productIds,
          product_category_id: categoryIds,
        },
      });

      productIds = mappings.map((m) => m.product_id);
    }

    let deletedProductsCount = 0;

    // =========================
    // 🧨 DELETE PRODUCTS FLOW
    // =========================
    if (productIds.length) {
      console.log(`🧹 Deleting ${productIds.length} products...`);

      // 1. Variant attachments
      const variants = await ProductVariant.findAll({
        where: { product_id: productIds },
        attributes: ["id"],
      });

      const variantIds = variants.map((v) => v.id);

      if (variantIds.length) {
        await VariantAttachment.destroy({
          where: { variant_id: variantIds },
        });
      }

      // 2. Variants
      await ProductVariant.destroy({
        where: { product_id: productIds },
      });

      // 3. Product attachments
      await ProductAttachment.destroy({
        where: { product_id: productIds },
      });

      // 4. Category mapping
      await ProductCategoryMapping.destroy({
        where: { product_id: productIds },
      });

      // 5. Products
      deletedProductsCount = await Product.destroy({
        where: { id: productIds },
      });
    } else {
      console.log(
        "⚠️ No products found, proceeding to cleanup batch/raw data...",
      );
    }

    // =========================
    // 🧨 ALWAYS CLEAN RAW + BATCH
    // =========================
    let deletedRaw = 0;
    let deletedBatch = 0;

    const sageBatch = batchId
      ? await ImportBatch.findOne({
          attributes: ["id"],
          where: { id: batchId, source_name: { [Op.like]: "SAGE%" } },
        })
      : null;

    if (sageBatch) {
      deletedRaw = await SourceRawData.destroy({
        where: { import_batch_id: batchId },
      });

      deletedBatch = await ImportBatch.destroy({
        where: { id: batchId },
      });
    }

    return {
      success: true,
      deletedProducts: deletedProductsCount,
      deletedRawData: deletedRaw,
      deletedBatch: deletedBatch,
      message:
        deletedProductsCount > 0
          ? "Products and related data deleted successfully"
          : "No products found, but batch/raw data cleaned successfully",
    };
  } catch (error) {
    console.error("❌ Delete Error:", error);
    throw error;
  }
};

module.exports = {
  getSageSupplierTruth,
  getCategories,
  getAllSageCategories,
  getSuppliersByCategory,
  syncSageCategories,
  getSuppliers,
  searchProducts,
  getProductDetails,
  importSageProducts,
  saveSageProductToDB,
  importSelectedSageProducts,
  deleteSageProducts,
  isStockReported,
};
