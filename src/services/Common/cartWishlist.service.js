/** @format */

const sequelize = require("../../config/central.db");
const { calculatePricing } = require("../../config/pricing");
const { Op } = require("sequelize");
const path = require("path");
const {
  Wishlist,
  ProductVariant,
  Product,
  VariantAttachment,
  Cart,
  Size,
  ProductAttachment,
  Order,
  OrderItem,
  ProductCategory,
  ParentCategory,
  GrandCategory,
  ProductCustomization,
  ProductCustomizationValue,
  CustomizationOption,
  CustomizationOptionValue,
  CustomizationOptionValuePricing,
  ProductAddOn,
  AddOnProduct,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const {
  buildPricingSnapshot,
  buildSagePricingSnapshot,
} = require("../../utils/pricing/buildPricingSnapshot");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
// A stored value that doesn't parse comes back as null instead of failing the whole cart.
const { parseJson } = require("../../utils/orderFormat");
const { cancelShipstationShipment } = require("../../config/shipstation");

// Variant's primary image, else its first image, else the product's first attachment.
const getVariantImage = (variant) => {
  if (!variant) return null;

  if (variant.images?.length) {
    const primary = variant.images.find((img) => img.is_primary);
    return (primary || variant.images[0])?.file_uri || null;
  }

  if (variant.product?.attachments?.length) {
    return variant.product.attachments[0]?.file_uri || null;
  }

  return null;
};

const addToWishlist = async (body) => {
  try {
    const { user, product_id, variant_id } = body;
    const exists = await Wishlist.findOne({
      where: { user_id: user.id, variant_id, is_active: true },
    });

    if (exists) {
      return exists; // already added (Myntra behavior)
    }

    return await Wishlist.create({
      user_id: user.id,
      product_id,
      variant_id,
    });
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getWishlist = async (body) => {
  try {
    const { user } = body;

    const data = await Wishlist.findAll({
      where: { user_id: user.id, is_active: true },
      include: [
        {
          model: ProductVariant,
          as: "variant",
          include: [
            {
              model: Product,
              as: "product",
              attributes: ["id", "name", "description"],
              include: [
                {
                  model: ProductAttachment,
                  as: "attachments",
                  required: false,
                },
              ],
            },
            {
              model: VariantAttachment,
              as: "images",
              required: false,
            },
            {
              model: Size,
              as: "size_details",
              attributes: ["name"],
              required: false,
            },
          ],
        },
      ],
    });

    const formatted = (
      await Promise.all(
        data.map(async (item) => {
          const v = item.variant;

          if (!v) return null;

          const effectivePrice =
            v.case_price && Number(v.case_price) > 0 ? v.case_price : v.price;

          const pricing = await calculatePricing(effectivePrice, v.supplier);

          let stock_status = "AVAILABLE";
          let stock_message = "In stock";

          if (v.track_inventory) {
            if (v.stock === 0) {
              stock_status = "OUT_OF_STOCK";
              stock_message = "Out of stock";
            } else if (v.stock < 10) {
              stock_status = "FEW_LEFT";
              stock_message = `Only ${v.stock} left`;
            }
          }

          return {
            id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,

            name: decodeHtmlEntities(v.product?.name || null),
            description: v.product?.description || null,

            price: pricing.final_price,
            base_price: pricing.base_price,

            color: v.color,
            color_code: v.color_code,
            size: v.size_details?.name || null,

            image: getVariantImage(v),

            stock: v.stock,
            stock_status,
            stock_message,
          };
        }),
      )
    ).filter(Boolean);
    return formatted;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const removeFromWishlist = async (user, id) => {
  try {
    const item = await Wishlist.findOne({
      where: { id, user_id: user.id, is_active: true },
    });
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, "Wishlist item not found");

    await item.destroy();
    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const moveWishlistToCart = async (body) => {
  const t = await sequelize.transaction();

  try {
    const { user, wishlist_id } = body;

    const wishlistItem = await Wishlist.findOne({
      where: { id: wishlist_id, user_id: user.id },
      transaction: t,
    });

    if (!wishlistItem) throw new ApiError(httpStatus.NOT_FOUND, "Wishlist item not found");

    // ✅ GET VARIANT
    const variant = await ProductVariant.findByPk(wishlistItem.variant_id, {
      transaction: t,
    });

    if (!variant) throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");

    // 🔥 USE MIN QUANTITY
    await addToCart({
      user,
      product_id: wishlistItem.product_id,
      variant_id: wishlistItem.variant_id,
      quantity: variant.min_order_quantity, // ✅ FIX
    });

    await wishlistItem.destroy({ transaction: t });

    await t.commit();

    return { message: "Moved to cart" };
  } catch (error) {
    await t.rollback();
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getProductCategories = async (productId) => {
  return await ProductCategory.findAll({
    attributes: ["id", "title", "supplier"],

    include: [
      {
        model: Product,
        as: "products",
        where: {
          id: productId,
        },
        attributes: [],
        through: {
          attributes: [],
        },
      },

      {
        model: ParentCategory,
        as: "parent_categories",
        attributes: ["id", "title"],
        through: {
          attributes: [],
        },
        required: false,

        include: [
          {
            model: GrandCategory,
            as: "grand_categories",
            attributes: ["id", "title"],
            through: {
              attributes: [],
            },
            required: false,
          },
        ],
      },
    ],
  });
};

const buildManualPricingSnapshot = async ({
  product,
  variant,
  quantity,
  customization = [],
  addons = [],
  allowInactiveCustomization = false,
}) => {
  const finalQty = Number(quantity);

  if (!Number.isInteger(finalQty) || finalQty <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Quantity must be a valid number greater than 0",
    );
  }

  /*
   * ---------------------------------------------------------
   * PRODUCT BASE PRICE
   * ---------------------------------------------------------
   *
   * MANUAL products already contain their selling price.
   * No supplier markup is applied.
   *
   * Pricing modes:
   *
   * fixed:
   *   variant.price is a PER-UNIT price.
   *
   * quantity_fixed:
   *   configured quantity_pricing price is the TOTAL price
   *   for that exact quantity.
   *
   * tiered:
   *   configured bulk_pricing price is a PER-UNIT price
   *   for the matching quantity range.
   */

  let variantMeta = variant.meta || {};

  if (typeof variantMeta === "string") {
    try {
      variantMeta = JSON.parse(variantMeta);
    } catch (error) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid pricing metadata for manual product variant",
      );
    }
  }

  const pricingMode = String(
    variantMeta.pricing_mode || "fixed",
  ).toLowerCase();

  let basePrice = 0;
  let productTotal = 0;
  let productPricingTier = null;

  /*
   * ---------------------------------------------------------
   * FIXED
   * ---------------------------------------------------------
   *
   * Example:
   *
   * price = 29.99
   * quantity = 10
   *
   * productTotal = 29.99 × 10
   */

  if (pricingMode === "fixed") {
    basePrice = Number(variant.price || 0);

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid product price for manual product variant",
      );
    }

    productTotal = +(basePrice * finalQty).toFixed(2);
  }

  /*
   * ---------------------------------------------------------
   * QUANTITY_FIXED
   * ---------------------------------------------------------
   *
   * Example:
   *
   * quantity_pricing:
   *
   * [
   *   { quantity: 50, price: 21.79 },
   *   { quantity: 100, price: 30.67 }
   * ]
   *
   * If quantity = 100:
   *
   * productTotal = 30.67
   *
   * NOT:
   *
   * 30.67 × 100
   */

  else if (pricingMode === "quantity_fixed") {
    const quantityPricing = Array.isArray(
      variantMeta.quantity_pricing,
    )
      ? variantMeta.quantity_pricing
      : [];

    const matchingPricing = quantityPricing.find((tier) => {
      const tierQuantity = Number(tier.quantity);

      return (
        Number.isFinite(tierQuantity) &&
        tierQuantity === finalQty
      );
    });

    if (!matchingPricing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No product pricing found for quantity ${finalQty}. This product requires one of its configured quantities.`,
      );
    }

    const configuredPrice = Number(matchingPricing.price);

    if (
      !Number.isFinite(configuredPrice) ||
      configuredPrice < 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid product pricing for quantity ${finalQty}`,
      );
    }

    basePrice = configuredPrice;

    /*
     * IMPORTANT:
     *
     * quantity_fixed price is already the TOTAL
     * for the selected quantity.
     */

    productTotal = +configuredPrice.toFixed(2);

    productPricingTier = {
      quantity: Number(matchingPricing.quantity),
      price: +configuredPrice.toFixed(2),
    };
  }

  /*
   * ---------------------------------------------------------
   * TIERED
   * ---------------------------------------------------------
   *
   * Example:
   *
   * 10 - 24  => 11.76
   * 25 - 49  => 8.82
   * 50 - 99  => 7.64
   *
   * quantity = 12
   *
   * productTotal = 11.76 × 12
   */

  else if (pricingMode === "tiered") {
    const bulkPricing = Array.isArray(
      variantMeta.bulk_pricing,
    )
      ? variantMeta.bulk_pricing
      : [];

    const matchingPricing = bulkPricing.find((tier) => {
      const minQuantity = Number(
        tier.min_quantity ??
          tier.min_qty ??
          tier.min,
      );

      const maxQuantityValue =
        tier.max_quantity ??
        tier.max_qty ??
        tier.max;

      const maxQuantity =
        maxQuantityValue === null ||
        maxQuantityValue === undefined ||
        maxQuantityValue === ""
          ? null
          : Number(maxQuantityValue);

      return (
        Number.isFinite(minQuantity) &&
        minQuantity <= finalQty &&
        (maxQuantity === null ||
          (Number.isFinite(maxQuantity) &&
            maxQuantity >= finalQty))
      );
    });

    if (!matchingPricing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No product pricing tier found for quantity ${finalQty}`,
      );
    }

    const configuredPrice = Number(
      matchingPricing.price,
    );

    if (
      !Number.isFinite(configuredPrice) ||
      configuredPrice < 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid product pricing for quantity ${finalQty}`,
      );
    }

    const minQuantity = Number(
      matchingPricing.min_quantity ??
        matchingPricing.min_qty ??
        matchingPricing.min,
    );

    const maxQuantityValue =
      matchingPricing.max_quantity ??
      matchingPricing.max_qty ??
      matchingPricing.max;

    const maxQuantity =
      maxQuantityValue === null ||
      maxQuantityValue === undefined ||
      maxQuantityValue === ""
        ? null
        : Number(maxQuantityValue);

    basePrice = configuredPrice;

    /*
     * TIERED price is PER UNIT.
     */

    productTotal = +(
      configuredPrice * finalQty
    ).toFixed(2);

    productPricingTier = {
      min_quantity: Number.isFinite(minQuantity)
        ? minQuantity
        : null,

      max_quantity:
        maxQuantity === null ||
        Number.isFinite(maxQuantity)
          ? maxQuantity
          : null,

      price: +configuredPrice.toFixed(2),
    };
  }

  /*
   * ---------------------------------------------------------
   * INVALID PRICING MODE
   * ---------------------------------------------------------
   */

  else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid pricing mode "${variantMeta.pricing_mode}" for manual product variant`,
    );
  }

  /*
   * ---------------------------------------------------------
   * CUSTOMIZATION PRICING
   * ---------------------------------------------------------
   *
   * FIXED:
   *     fixed_price is PER-UNIT.
   *     fixed_price × product quantity
   *
   * TIERED:
   *     selected tier price is PER-UNIT.
   *     selected tier price × product quantity
   *
   * QUANTITY_BASED:
   *     selected quantity price is the TOTAL price
   *     for the entire product quantity.
   *
   * Example:
   *
   * quantity = 25
   * configured price = 4.25
   *
   * customization total = 4.25
   *
   * NOT:
   *
   * 4.25 × 25
   */

  const customizationItems = [];
  let customizationTotal = 0;

  if (customization.length) {
    for (const item of customization) {
      const optionId = Number(
        item.customization_option_id,
      );

      const valueId = Number(
        item.customization_option_value_id,
      );

      if (!optionId || !valueId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "customization_option_id and customization_option_value_id are required",
        );
      }

      /*
       * Make sure this option is assigned
       * to this product.
       *
       * For a NEW cart:
       *   only active mappings are allowed.
       *
       * For an EXISTING cart:
       *   allowInactiveCustomization = true allows
       *   previously selected mappings to continue working.
       */

      const productCustomization =
        await ProductCustomization.findOne({
          where: {
            product_id: product.id,
            customization_option_id: optionId,

            ...(allowInactiveCustomization
              ? {}
              : {
                  is_active: true,
                }),
          },
        });

      if (!productCustomization) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Customization option ${optionId} is not available for this product`,
        );
      }

      /*
       * Make sure this value is assigned
       * to that product customization.
       */

      const productCustomizationValue =
        await ProductCustomizationValue.findOne({
          where: {
            product_customization_id:
              productCustomization.id,

            customization_option_value_id:
              valueId,

            ...(allowInactiveCustomization
              ? {}
              : {
                  is_active: true,
                }),
          },
        });

      if (!productCustomizationValue) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Customization value ${valueId} is not available for this product`,
        );
      }

      /*
       * Load option.
       */

      const option =
        await CustomizationOption.findOne({
          where: {
            id: optionId,

            ...(allowInactiveCustomization
              ? {}
              : {
                  is_active: true,
                }),
          },
        });

      if (!option) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Customization option ${optionId} not found`,
        );
      }

      /*
       * Load value.
       */

      const value =
        await CustomizationOptionValue.findOne({
          where: {
            id: valueId,
            customization_option_id: optionId,

            ...(allowInactiveCustomization
              ? {}
              : {
                  is_active: true,
                }),
          },
        });

      if (!value) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Customization value ${valueId} not found`,
        );
      }

      /*
       * -----------------------------------------------------
       * RESOLVE CUSTOMIZATION PRICE
       * -----------------------------------------------------
       */

      let unitPrice = 0;
      let pricingTier = null;

      /*
       * FIXED
       *
       * fixed_price is PER UNIT.
       */

      if (value.pricing_type === "FIXED") {
        unitPrice = Number(
          value.fixed_price || 0,
        );
      }

      /*
       * TIERED
       *
       * Find the tier matching the product quantity.
       *
       * The selected price is PER UNIT.
       */

      else if (value.pricing_type === "TIERED") {
        pricingTier =
          await CustomizationOptionValuePricing.findOne({
            where: {
              customization_option_value_id:
                value.id,

              is_active: true,

              min_quantity: {
                [Op.lte]: finalQty,
              },

              [Op.or]: [
                {
                  max_quantity: null,
                },
                {
                  max_quantity: {
                    [Op.gte]: finalQty,
                  },
                },
              ],
            },

            order: [
              ["min_quantity", "DESC"],
            ],
          });

        if (!pricingTier) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `No customization pricing tier found for "${value.name}" at quantity ${finalQty}`,
          );
        }

        unitPrice = Number(
          pricingTier.price || 0,
        );
      }

      /*
       * QUANTITY_BASED
       *
       * Find the highest configured quantity
       * that is <= the product quantity.
       *
       * IMPORTANT:
       *
       * QUANTITY_BASED price is the TOTAL
       * customization price for the selected
       * product quantity.
       *
       * It is NOT a per-unit price.
       *
       * Example:
       *
       * quantity = 25
       * configured price = 4.25
       *
       * customization total = 4.25
       *
       * NOT:
       *
       * 4.25 × 25
       */

      else if (
        value.pricing_type === "QUANTITY_BASED"
      ) {
        pricingTier =
          await CustomizationOptionValuePricing.findOne({
            where: {
              customization_option_value_id:
                value.id,

              is_active: true,

              quantity: {
                [Op.lte]: finalQty,
              },
            },

            order: [
              ["quantity", "DESC"],
            ],
          });

        if (!pricingTier) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `No quantity-based customization pricing found for "${value.name}" at quantity ${finalQty}`,
          );
        }

        unitPrice = Number(
          pricingTier.price || 0,
        );
      }

      /*
       * INVALID CUSTOMIZATION PRICING TYPE
       */

      else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid pricing type for customization value "${value.name}"`,
        );
      }

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid customization price for "${value.name}"`,
        );
      }

      /*
       * -----------------------------------------------------
       * CUSTOMIZATION TOTAL
       * -----------------------------------------------------
       *
       * FIXED:
       *     unit price × product quantity
       *
       * TIERED:
       *     unit price × product quantity
       *
       * QUANTITY_BASED:
       *     selected quantity price is already
       *     the total for the entire quantity.
       */

      const total =
        value.pricing_type === "QUANTITY_BASED"
          ? +unitPrice.toFixed(2)
          : +(unitPrice * finalQty).toFixed(2);

      customizationTotal += total;

      customizationItems.push({
        customization_option_id: option.id,

        option_name: option.name,

        customization_option_value_id:
          value.id,

        value_name: value.name,

        pricing_type:
          value.pricing_type,

        /*
         * QUANTITY_BASED is not a unit price.
         *
         * Store null so the snapshot is not misleading.
         */
        unit_price:
          value.pricing_type === "QUANTITY_BASED"
            ? null
            : +unitPrice.toFixed(2),

        quantity: finalQty,

        total,

        ...(pricingTier
          ? {
              pricing_tier: {
                id: pricingTier.id,

                min_quantity:
                  pricingTier.min_quantity,

                max_quantity:
                  pricingTier.max_quantity,

                quantity:
                  pricingTier.quantity,

                price:
                  +Number(
                    pricingTier.price,
                  ).toFixed(2),
              },
            }
          : {}),
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * ADD-ONS
   * ---------------------------------------------------------
   */

  const addonItems = [];
  let addonTotal = 0;

  if (addons.length) {
    for (const addonRequest of addons) {
      const productAddOnId = Number(
        addonRequest.product_addon_id,
      );

      if (!productAddOnId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "product_addon_id is required for each add-on",
        );
      }

      /*
       * Find ProductAddOn mapping.
       */

      const productAddOn =
        await ProductAddOn.findOne({
          where: {
            id: productAddOnId,
            product_id: product.id,
            is_active: true,
          },
        });

      if (!productAddOn) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Add-on ${productAddOnId} is not available for this product`,
        );
      }

      /*
       * Load master add-on product.
       */

      const addonProduct =
        await AddOnProduct.findOne({
          where: {
            id: productAddOn.addon_product_id,
            is_active: true,
          },
        });

      if (!addonProduct) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Add-on product ${productAddOn.addon_product_id} not found`,
        );
      }

      /*
       * Use ProductAddOn.price.
       *
       * This is the product-specific add-on price.
       */

      const unitPrice = Number(
        productAddOn.price || 0,
      );

      /*
       * IMPORTANT:
       *
       * Add-on quantity is independent.
       *
       * Example:
       *
       * Product quantity = 50
       * Add-on quantity = 10
       *
       * Add-on total = add-on price × 10
       */

      const addonQuantity = Number(
        addonRequest.quantity,
      );

      if (
        !Number.isInteger(addonQuantity) ||
        addonQuantity <= 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Add-on quantity must be a valid number greater than 0",
        );
      }

      const total = +(
        unitPrice * addonQuantity
      ).toFixed(2);

      addonTotal += total;

      addonItems.push({
        product_addon_id:
          productAddOn.id,

        addon_product_id:
          addonProduct.id,

        name: addonProduct.name,

        unit_price:
          +unitPrice.toFixed(2),

        quantity: addonQuantity,

        total,
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * TOTALS
   * ---------------------------------------------------------
   */

  const grandTotal = +(
    productTotal +
    customizationTotal +
    addonTotal
  ).toFixed(2);

  const finalPricePerItem = +(
    grandTotal / finalQty
  ).toFixed(2);

  return {
    supplier: "MANUAL",

    quantity: finalQty,

    product_price: {
      base_price:
        +basePrice.toFixed(2),

      markup_percent: 0,

      markup_amount: 0,

      final_product_price:
        +basePrice.toFixed(2),

      pricing_mode: pricingMode,

      ...(productPricingTier
        ? {
            pricing_tier:
              productPricingTier,
          }
        : {}),

      total: productTotal,
    },

    customization: {
      items: customizationItems,

      total:
        +customizationTotal.toFixed(2),
    },

    addons: addonItems,

    addon_total:
      +addonTotal.toFixed(2),

    totals: {
      product_total: productTotal,

      customization_total:
        +customizationTotal.toFixed(2),

      addon_total:
        +addonTotal.toFixed(2),

      grand_total: grandTotal,
    },

    final_price_per_item:
      finalPricePerItem,

    total_price: grandTotal,
  };
};

const addToCart = async (body, files) => {
  try {
    let {
      user,
      product_id,
      type,
      variants = [],
      customization = null,
    } = body;

    /*
     * =========================================================
     * MANUAL PRODUCT CART
     * =========================================================
     *
     * MANUAL products always use:
     *
     * variants: [
     *   {
     *     variant_id,
     *     quantity,
     *     customization,
     *     addons
     *   }
     * ]
     *
     * One variant = one cart row.
     *
     * Multiple variants = multiple cart rows.
     *
     * Each variant can have its own customization
     * and add-ons.
     *
     * Existing supplier cart logic below remains untouched.
     */

    if (type === "MANUAL") {
      /*
       * -------------------------------------------------------
       * Validate product
       * -------------------------------------------------------
       */

      const manualProduct = await Product.findOne({
        where: {
          id: product_id,
          supplier: "MANUAL",
          is_active: true,
        },
      });

      if (!manualProduct) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Manual product not found",
        );
      }

      /*
       * -------------------------------------------------------
       * Parse variants
       * -------------------------------------------------------
       */

      if (typeof variants === "string") {
        try {
          variants = JSON.parse(variants);
        } catch (error) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "variants must be valid JSON",
          );
        }
      }

      /*
       * variants is mandatory for MANUAL products.
       */

      if (
        !Array.isArray(variants) ||
        !variants.length
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "At least one variant is required",
        );
      }

      /*
       * -------------------------------------------------------
       * Invalidate pending order
       * -------------------------------------------------------
       */

      await invalidatePendingOrder(user.id);

      /*
       * -------------------------------------------------------
       * Logo
       * -------------------------------------------------------
       */

      let logo_image = null;

      if (files?.images?.length) {
        const file = files.images[0];

        logo_image = `/images/${file.filename}`;
      }

      const customizationImages =
        files?.customization_images || [];

      /*
       * -------------------------------------------------------
       * Create cart rows
       * -------------------------------------------------------
       */

      const createdCartItems = [];

      /*
       * Each variant gets its own:
       *
       * - quantity
       * - customization
       * - add-ons
       * - pricing snapshot
       * - Cart row
       */

      for (const variantItem of variants) {
        /*
         * -----------------------------------------------------
         * Validate variant object
         * -----------------------------------------------------
         */

        if (
          !variantItem ||
          typeof variantItem !== "object"
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Each variant must be a valid object",
          );
        }

        const variantId = Number(
          variantItem.variant_id,
        );

        const finalQty = Number(
          variantItem.quantity,
        );

        /*
         * -----------------------------------------------------
         * Validate variant ID
         * -----------------------------------------------------
         */

        if (!variantId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "variant_id is required for each variant",
          );
        }

        /*
         * -----------------------------------------------------
         * Validate quantity
         * -----------------------------------------------------
         */

        if (
          !Number.isInteger(finalQty) ||
          finalQty <= 0
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Quantity must be a valid number greater than 0 for variant ${variantId}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Resolve variant
         * -----------------------------------------------------
         */

        const manualVariant =
          await ProductVariant.findOne({
            where: {
              id: variantId,
              product_id: manualProduct.id,
              supplier: "MANUAL",
              is_active: true,
            },
          });

        if (!manualVariant) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid variant ${variantId} for this manual product`,
          );
        }

        /*
         * -----------------------------------------------------
         * Validate inventory
         * -----------------------------------------------------
         */

        if (
          manualVariant.track_inventory &&
          finalQty >
            Number(manualVariant.stock)
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Not enough stock for variant ${variantId}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Validate minimum quantity
         * -----------------------------------------------------
         */

        if (
          Number(
            manualVariant.min_order_quantity || 1,
          ) > finalQty
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Minimum order quantity for variant ${variantId} is ${manualVariant.min_order_quantity}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Validate maximum quantity
         * -----------------------------------------------------
         */

        if (
          manualVariant.max_order_quantity &&
          finalQty >
            Number(
              manualVariant.max_order_quantity,
            )
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Maximum order quantity for variant ${variantId} is ${manualVariant.max_order_quantity}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Parse variant customization
         * -----------------------------------------------------
         */

        let variantCustomization =
          variantItem.customization || [];

        if (
          typeof variantCustomization ===
          "string"
        ) {
          try {
            variantCustomization =
              JSON.parse(
                variantCustomization,
              );
          } catch (error) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `customization must be valid JSON for variant ${variantId}`,
            );
          }
        }

        if (
          variantCustomization === null ||
          variantCustomization === undefined
        ) {
          variantCustomization = [];
        }

        if (
          !Array.isArray(
            variantCustomization,
          )
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `customization must be an array for variant ${variantId}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Validate MANUAL customization
         * permissions + artwork
         * -----------------------------------------------------
         */

        const validatedCustomization = [];

        for (const customizationItem of variantCustomization) {
          if (
            !customizationItem ||
            typeof customizationItem !==
              "object"
          ) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Invalid customization item for variant ${variantId}`,
            );
          }

          const optionId = Number(
            customizationItem.customization_option_id,
          );

          if (!optionId) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `customization_option_id is required for variant ${variantId}`,
            );
          }

          const option =
            await CustomizationOption.findOne(
              {
                where: {
                  id: optionId,
                  is_active: true,
                },
              },
            );

          if (!option) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Customization option ${optionId} not found`,
            );
          }

          /*
           * ---------------------------------------------------
           * Verify option is assigned to this product
           * ---------------------------------------------------
           */

          const productCustomization =
            await ProductCustomization.findOne(
              {
                where: {
                  product_id:
                    manualProduct.id,

                  customization_option_id:
                    optionId,

                  is_active: true,
                },
              },
            );

          if (!productCustomization) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Customization option "${option.name}" is not available for this product`,
            );
          }

          /*
           * ---------------------------------------------------
           * Verify selected value belongs to
           * this product option
           * ---------------------------------------------------
           */

          const valueId = Number(
            customizationItem.customization_option_value_id,
          );

          if (valueId) {
            const selectedValue =
              await ProductCustomizationValue.findOne(
                {
                  where: {
                    product_customization_id:
                      productCustomization.id,

                    customization_option_value_id:
                      valueId,

                    is_active: true,
                  },
                },
              );

            if (!selectedValue) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Customization value ${valueId} is not available for option "${option.name}"`,
              );
            }
          }

          const updatedItem = {
            ...customizationItem,
          };

          delete updatedItem.logo_image;

          /*
           * ---------------------------------------------------
           * TEXT INPUT
           * ---------------------------------------------------
           */

          if (
            customizationItem.text !==
              undefined &&
            customizationItem.text !==
              null &&
            customizationItem.text !== ""
          ) {
            if (!option.allow_text_input) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Text input is not allowed for customization "${option.name}"`,
              );
            }
          }

          /*
           * ---------------------------------------------------
           * ARTWORK
           * ---------------------------------------------------
           */

          const hasImageIndex =
            customizationItem.image_index !==
              undefined &&
            customizationItem.image_index !==
              null;

          if (hasImageIndex) {
            if (
              !option.allow_image_upload
            ) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Artwork upload is not allowed for customization "${option.name}"`,
              );
            }

            const imageIndex = Number(
              customizationItem.image_index,
            );

            if (
              !Number.isInteger(
                imageIndex,
              ) ||
              imageIndex < 0
            ) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Invalid artwork image index for customization "${option.name}"`,
              );
            }

            const artworkFile =
              customizationImages[
                imageIndex
              ];

            if (!artworkFile) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Artwork file is missing for customization "${option.name}"`,
              );
            }

            const extension = path
              .extname(
                artworkFile.originalname,
              )
              .toLowerCase();

            if (
              ![".svg", ".ai"].includes(
                extension,
              )
            ) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Invalid artwork format for customization "${option.name}". Only SVG and Adobe Illustrator (.ai) files are allowed.`,
              );
            }

            updatedItem.logo_image =
              `/images/${artworkFile.filename}`;

            delete updatedItem.image_index;
          }

          validatedCustomization.push(
            updatedItem,
          );
        }

        variantCustomization =
          validatedCustomization;

        /*
         * -----------------------------------------------------
         * Parse variant add-ons
         * -----------------------------------------------------
         */

        let variantAddons =
          variantItem.addons || [];

        if (
          typeof variantAddons === "string"
        ) {
          try {
            variantAddons =
              JSON.parse(
                variantAddons,
              );
          } catch (error) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `addons must be valid JSON for variant ${variantId}`,
            );
          }
        }

        if (
          variantAddons === null ||
          variantAddons === undefined
        ) {
          variantAddons = [];
        }

        if (
          !Array.isArray(variantAddons)
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `addons must be an array for variant ${variantId}`,
          );
        }

        /*
         * -----------------------------------------------------
         * Build MANUAL customization configuration
         * -----------------------------------------------------
         */

        const customization_config = {
          type: "MANUAL",

          quantity: finalQty,

          customization:
            variantCustomization,

          addons: variantAddons,
        };

        /*
         * -----------------------------------------------------
         * Build MANUAL pricing snapshot
         * -----------------------------------------------------
         *
         * Pricing is calculated independently
         * for each variant.
         */

        const pricing_snapshot =
          await buildManualPricingSnapshot({
            product: manualProduct,

            variant: manualVariant,

            quantity: finalQty,

            customization:
              variantCustomization,

            addons: variantAddons,
          });

        /*
         * -----------------------------------------------------
         * Create ONE cart row for this variant
         * -----------------------------------------------------
         */

        const cart = await Cart.create({
          user_id: user.id,

          product_id:
            manualProduct.id,

          variant_id:
            manualVariant.id,

          quantity: finalQty,

          logo_image,

          customization_config,

          pricing_snapshot,
        });

        createdCartItems.push(cart);
      }

      /*
       * Return all created cart rows.
       */

      return createdCartItems;
    }

    /*
     * =========================================================
     * EXISTING SUPPLIER CART LOGIC
     * =========================================================
     *
     * DO NOT CHANGE THIS SECTION.
     *
     * SS
     * SANMAR
     * OTTOCAP
     * SAGE
     *
     * All existing supplier behavior remains exactly the same.
     */

    if (
      customization &&
      typeof customization === "string"
    ) {
      customization = JSON.parse(
        customization,
      );
    }

    if (!Array.isArray(customization)) {
      throw new ApiError(httpStatus.BAD_REQUEST,
        "Invalid customization format",
      );
    }

    await invalidatePendingOrder(user.id);

    let logo_image = null;

    if (files?.images?.length) {
      const file = files.images[0];

      logo_image = `/images/${file.filename}`;
    }

    const createdCartItems = [];

    for (const customizationItem of customization) {
      const sizes =
        customizationItem.sizes || [];

      if (!sizes.length) {
        throw new ApiError(httpStatus.BAD_REQUEST,
          "At least one size is required",
        );
      }

      for (const sizeItem of sizes) {
        const variant =
          await ProductVariant.findOne({
            where: {
              id: sizeItem.variant_id,
              is_active: true,
            },

            include: [
              {
                model: Product,
                as: "product",
              },
            ],
          });

        if (!variant) {
          throw new ApiError(httpStatus.NOT_FOUND,
            `Variant ${sizeItem.variant_id} not found`,
          );
        }

        const categories =
          await getProductCategories(
            variant.product_id,
          );

        const finalQty = Number(
          sizeItem.quantity || 0,
        );

        // Negative or fractional quantities would produce negative or partial prices.
        if (!Number.isInteger(finalQty) || finalQty <= 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Quantity for variant ${sizeItem.variant_id} must be a whole number greater than 0`,
          );
        }

        if (
          variant.track_inventory &&
          finalQty >
            Number(variant.stock)
        ) {
          throw new ApiError(httpStatus.BAD_REQUEST,
            `Not enough stock for variant ${sizeItem.variant_id}`,
          );
        }

        const customizationForRow = {
          ...customizationItem,
          size: sizeItem,
        };

        delete customizationForRow.sizes;

        let pricing_snapshot;

        if (
          variant.supplier === "SAGE"
        ) {
          // Same input as repricing (buildSupplierPricingSnapshot): the handling
          // charge and drinkware fee depend on the product and its categories.
          pricing_snapshot =
            await buildSagePricingSnapshot({
              variant,

              product: {
                ...variant.product.toJSON(),
                categories,
              },

              quantity: finalQty,

              customization:
                customizationForRow,
            });
        } else {
          pricing_snapshot =
            await buildPricingSnapshot({
              variant,

              quantity: finalQty,

              customization:
                customizationForRow,

              categories,
            });
        }

        const cart = await Cart.create({
          user_id: user.id,

          product_id:
            variant.product_id,

          variant_id:
            variant.id,

          quantity: finalQty,

          logo_image,

          customization_config:
            customizationForRow,

          pricing_snapshot,
        });

        createdCartItems.push(cart);
      }
    }

    return createdCartItems;
  } catch (error) {
    throw error;
  }
};

const getCart = async (body) => {
  try {
    const { user } = body;

    const data = await Cart.findAll({
      where: {
        user_id: user.id,
        is_active: true,
      },

      include: [
        {
          model: ProductVariant,
          as: "variant",

          include: [
            {
              model: Product,
              as: "product",

              attributes: [
                "id",
                "name",
                "description",
              ],

              include: [
                {
                  model: ProductAttachment,
                  as: "attachments",

                  required: false,
                },
              ],
            },

            {
              model: VariantAttachment,
              as: "images",

              required: false,
            },

            {
              model: Size,
              as: "size_details",

              attributes: ["name"],

              required: false,
            },
          ],
        },
      ],
    });

    let cart_total = 0;

    /*
     * ---------------------------------------------------------
     * FORMAT CART ITEMS
     * ---------------------------------------------------------
     */

    const formatted = await Promise.all(
      data.map(async (item) => {
        const v = item.variant;

        if (!v) {
          return null;
        }

        /*
         * -----------------------------------------------------
         * Parse stored cart configuration
         * -----------------------------------------------------
         */

        let customization_config =
          item.customization_config;

        let pricing_snapshot =
          item.pricing_snapshot;

        /*
         * -----------------------------------------------------
         * Parse pricing snapshot
         * -----------------------------------------------------
         */

        if (
          pricing_snapshot &&
          typeof pricing_snapshot === "string"
        ) {
          pricing_snapshot =
            JSON.parse(
              pricing_snapshot,
            );
        }

        // MANUAL only: add option/value names and full artwork URLs.
        // Supplier customization_config is returned as stored.
        if (v.supplier === "MANUAL") {
          customization_config =
            await enrichManualCustomizationConfig(customization_config);
        }

        const image = getVariantImage(v);

        /*
         * -----------------------------------------------------
         * PRICE
         * -----------------------------------------------------
         */

        let price = 0;

        let base_price = 0;

        let item_total = 0;

        /*
         * =====================================================
         * MANUAL PRODUCT
         * =====================================================
         *
         * MANUAL pricing is already resolved when the item
         * was added to cart.
         *
         * Therefore ALWAYS use pricing_snapshot.
         *
         * Do NOT call calculatePricing() for MANUAL.
         */

        if (
          v.supplier === "MANUAL"
        ) {
          price = Number(
            pricing_snapshot?.final_price_per_item ||
              0,
          );

          base_price = Number(
            pricing_snapshot?.product_price
              ?.final_product_price || 0,
          );

          item_total = Number(
            pricing_snapshot?.total_price || 0,
          );
        }

        /*
         * =====================================================
         * EXISTING SUPPLIER PRODUCTS
         * =====================================================
         *
         * Keep existing behavior unchanged.
         */

        else if (
          customization_config
        ) {
          price = Number(
            pricing_snapshot?.final_price_per_item ||
              0,
          );

          base_price = Number(
            pricing_snapshot?.product_price
              ?.final_product_price || 0,
          );

          item_total = Number(
            pricing_snapshot?.total_price || 0,
          );
        }

        /*
         * Existing supplier product without
         * customization.
         */

        else {
          const effectivePrice =
            v.case_price &&
            Number(v.case_price) > 0
              ? v.case_price
              : v.price;

          const pricing =
            (await calculatePricing(
              effectivePrice,
              v.supplier,
            )) || {
              base_price: Number(
                effectivePrice || 0,
              ),

              final_price: Number(
                effectivePrice || 0,
              ),
            };

          price = Number(
            pricing.final_price || 0,
          );

          base_price = Number(
            pricing.base_price || 0,
          );

          item_total =
            price *
            Number(item.quantity || 0);
        }

        /*
         * -----------------------------------------------------
         * Add item total to cart total
         * -----------------------------------------------------
         */

        cart_total += item_total;

        /*
         * -----------------------------------------------------
         * Stock status
         * -----------------------------------------------------
         */

        let stock_status =
          "AVAILABLE";

        let stock_message =
          "In stock";

        if (v.track_inventory) {
          if (
            Number(v.stock) <= 0
          ) {
            stock_status =
              "OUT_OF_STOCK";

            stock_message =
              "Out of stock";
          } else if (
            Number(v.stock) < 10
          ) {
            stock_status =
              "FEW_LEFT";

            stock_message =
              `Only ${v.stock} left`;
          }
        }

        /*
         * -----------------------------------------------------
         * Return formatted cart item
         * -----------------------------------------------------
         */

        return {
          cart_id: item.id,

          quantity: item.quantity,

          product_id:
            item.product_id,

          variant_id:
            item.variant_id,

          name: decodeHtmlEntities(
            v.product?.name || null,
          ),

          description:
            v.product?.description ||
            null,

          price:
            +Number(
              price || 0,
            ).toFixed(2),

          base_price:
            +Number(
              base_price || 0,
            ).toFixed(2),

          total_price:
            +Number(
              item_total || 0,
            ).toFixed(2),

          /*
           * ---------------------------------------------------
           * customization_config
           * ---------------------------------------------------
           *
           * MANUAL:
           *   Parsed object
           *   + option name
           *   + value name
           *   + artwork full URL
           *
           * SUPPLIERS:
           *   Existing behavior remains unchanged.
           * ---------------------------------------------------
           */

          customization_config,

          /*
           * ---------------------------------------------------
           * pricing_snapshot
           * ---------------------------------------------------
           */

          pricing_snapshot,

          /*
           * ---------------------------------------------------
           * Existing top-level logo_image
           * ---------------------------------------------------
           *
           * This is NOT the new customization artwork field.
           */

          logo_image: item.logo_image
            ? `${process.env.IMAGE_BASE_URL}${item.logo_image}`
            : null,

          color: v.color,

          color_code:
            v.color_code,

          size:
            v.size_details?.name ||
            v.size ||
            null,

          image,

          stock:
            Number(v.stock || 0),

          stock_status,

          stock_message,

          is_purchasable:
            !v.track_inventory ||
            Number(v.stock || 0) > 0,

          can_increase:
            (!v.max_order_quantity ||
              item.quantity <
                v.max_order_quantity) &&
            (!v.track_inventory ||
              item.quantity <
                Number(
                  v.stock || 0,
                )),

          can_decrease:
            item.quantity >
            Number(
              v.min_order_quantity || 1,
            ),
        };
      }),
    );

    const filteredFormatted =
      formatted.filter(Boolean);

    /*
     * ---------------------------------------------------------
     * FINAL CART RESPONSE
     * ---------------------------------------------------------
     */

    return {
      items: filteredFormatted,

      summary: {
        items_total:
          +Number(
            cart_total || 0,
          ).toFixed(2),

        shipping_cost: 0,

        grand_total:
          +Number(
            cart_total || 0,
          ).toFixed(2),
      },
    };
  } catch (error) {
    console.log(
      "❌ GET CART ERROR:",
      error,
    );

    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

const enrichManualCustomizationConfig = async (customizationConfig) => {
  if (!customizationConfig) {
    return customizationConfig;
  }

  let config = customizationConfig;

  if (typeof config === "string") {
    config = parseJson(config);
  }

  if (!config?.customization || !Array.isArray(config.customization)) {
    return config;
  }

  config.customization = await Promise.all(
    config.customization.map(async (customizationItem) => {
      if (!customizationItem || typeof customizationItem !== "object") {
        return customizationItem;
      }

      const updatedItem = {
        ...customizationItem,
      };

      /*
       * ---------------------------------------------------------
       * Customization Option Name
       * ---------------------------------------------------------
       */

      const optionId = Number(customizationItem.customization_option_id);

      if (optionId) {
        const customizationOption = await CustomizationOption.findOne({
          where: {
            id: optionId,
          },
          attributes: ["id", "name"],
        });

        if (customizationOption) {
          updatedItem.customization_option_name = customizationOption.name;
        }
      }

      /*
       * ---------------------------------------------------------
       * Customization Option Value Name
       * ---------------------------------------------------------
       */

      const valueId = Number(customizationItem.customization_option_value_id);

      if (valueId) {
        const customizationOptionValue = await CustomizationOptionValue.findOne(
          {
            where: {
              id: valueId,
            },
            attributes: ["id", "name"],
          },
        );

        if (customizationOptionValue) {
          updatedItem.customization_option_value_name =
            customizationOptionValue.name;
        }
      }

      /*
       * ---------------------------------------------------------
       * Customization Artwork
       * ---------------------------------------------------------
       */

      if (
        updatedItem.logo_image &&
        typeof updatedItem.logo_image === "string" &&
        updatedItem.logo_image.startsWith("/")
      ) {
        updatedItem.logo_image = `${process.env.IMAGE_BASE_URL}${updatedItem.logo_image}`;
      }

      return updatedItem;
    }),
  );

  return config;
};

// A cart line as the cart endpoints return it: JSON columns parsed and logo_image as a
// full URL. MANUAL lines also get option/value names and full artwork URLs.
const toCartItemResponse = async (cart, isManual) => {
  const response = cart.toJSON();

  if (isManual) {
    response.customization_config = await enrichManualCustomizationConfig(
      response.customization_config,
    );
  } else if (
    response.customization_config &&
    typeof response.customization_config === "string"
  ) {
    response.customization_config = parseJson(response.customization_config);
  }

  if (
    response.pricing_snapshot &&
    typeof response.pricing_snapshot === "string"
  ) {
    response.pricing_snapshot = parseJson(response.pricing_snapshot);
  }

  response.logo_image = response.logo_image
    ? `${process.env.IMAGE_BASE_URL}${response.logo_image}`
    : null;

  return response;
};

// Reprices an existing MANUAL cart line at a new quantity and saves it.
// allowInactiveCustomization lets an existing cart keep a customization the admin deleted
// or deactivated after the item was added; addToCart doesn't pass it, so new carts can't.
const repriceManualCartItem = async (cart, variant, customization, quantity) => {
  const manualCustomization = customization?.customization || [];

  const manualAddons = customization?.addons || [];

  const pricing_snapshot = await buildManualPricingSnapshot({
    product: variant.product,

    variant,

    quantity,

    customization: manualCustomization,

    addons: manualAddons,

    allowInactiveCustomization: true,
  });

  await cart.update({
    quantity,

    customization_config: {
      ...(customization || {}),

      type: "MANUAL",

      quantity,

      customization: manualCustomization,

      addons: manualAddons,
    },

    pricing_snapshot,
  });

  return toCartItemResponse(cart, true);
};

// Pricing snapshot of a supplier cart line at a new quantity. Lines without a
// customization have none.
const buildSupplierPricingSnapshot = async (variant, customization, quantity) => {
  const categories = await getProductCategories(variant.product_id);

  if (!customization) {
    return null;
  }

  if (variant.supplier === "SAGE") {
    return buildSagePricingSnapshot({
      variant,

      product: {
        ...variant.product.toJSON(),
        categories,
      },

      quantity,

      customization,
    });
  }

  return buildPricingSnapshot({
    variant,

    quantity,

    customization,
  });
};

const incrementCart = async (body) => {
  try {
    const { cart_id, user } = body;

    const cart = await Cart.findOne({ where: { id: cart_id, user_id: user.id } });

    if (!cart) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cart not found");
    }

    await invalidatePendingOrder(cart.user_id);

    const variant = await ProductVariant.findByPk(cart.variant_id, {
      include: [
        {
          model: Product,
          as: "product",
        },
      ],
    });

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    const newQty = Number(cart.quantity) + 1;

    /*
     * ---------------------------------------------------------
     * Inventory validation
     * ---------------------------------------------------------
     */

    if (
      variant.track_inventory &&
      newQty > Number(variant.stock)
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Only ${variant.stock} left`);
    }

    /*
     * ---------------------------------------------------------
     * Maximum quantity validation
     * ---------------------------------------------------------
     */

    if (
      variant.max_order_quantity &&
      newQty > Number(variant.max_order_quantity)
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST,
        `Maximum order quantity is ${variant.max_order_quantity}`,
      );
    }

    /*
     * ---------------------------------------------------------
     * Parse stored customization
     * ---------------------------------------------------------
     */

    let customization = cart.customization_config;

    if (
      customization &&
      typeof customization === "string"
    ) {
      customization = JSON.parse(customization);
    }

    if (variant.supplier === "MANUAL") {
      return await repriceManualCartItem(cart, variant, customization, newQty);
    }

    if (customization?.size) {
      customization.size.quantity = newQty;
    }

    const pricing_snapshot = await buildSupplierPricingSnapshot(
      variant,
      customization,
      newQty,
    );

    await cart.update({
      quantity: newQty,

      customization_config: customization,

      pricing_snapshot,
    });

    return await toCartItemResponse(cart, false);
  } catch (error) {
    console.log(
      "❌ INCREMENT CART ERROR:",
      error,
    );

    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const decrementCart = async (body) => {
  try {
    const { cart_id, user } = body;

    const cart = await Cart.findOne({ where: { id: cart_id, user_id: user.id } });

    if (!cart) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cart not found");
    }

    await invalidatePendingOrder(cart.user_id);

    const variant = await ProductVariant.findByPk(cart.variant_id, {
      include: [
        {
          model: Product,
          as: "product",
        },
      ],
    });

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    const newQty = Number(cart.quantity) - 1;

    /*
     * ---------------------------------------------------------
     * Minimum quantity validation
     * ---------------------------------------------------------
     *
     * Existing behavior:
     * when quantity reaches below minimum, remove
     * the cart item completely.
     */

    if (newQty < Number(variant.min_order_quantity || 1)) {
      await cart.destroy();

      return {
        success: true,
        message: "Item removed from cart",
      };
    }

    /*
     * ---------------------------------------------------------
     * Parse stored customization
     * ---------------------------------------------------------
     */

    let customization = cart.customization_config;

    if (customization && typeof customization === "string") {
      customization = JSON.parse(customization);
    }

    if (variant.supplier === "MANUAL") {
      return await repriceManualCartItem(cart, variant, customization, newQty);
    }

    if (customization?.size) {
      customization.size.quantity = newQty;
    }

    const pricing_snapshot = await buildSupplierPricingSnapshot(
      variant,
      customization,
      newQty,
    );

    await cart.update({
      quantity: newQty,

      customization_config: customization,

      pricing_snapshot,
    });

    return await toCartItemResponse(cart, false);
  } catch (error) {
    console.log("❌ DECREMENT CART ERROR:", error);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateCartQuantity = async (body) => {
  try {
    const { cart_id, quantity, user } = body;

    const cart = await Cart.findOne({ where: { id: cart_id, user_id: user.id } });

    if (!cart) {
      throw new ApiError(httpStatus.NOT_FOUND, "Cart not found");
    }

    await invalidatePendingOrder(cart.user_id);

    const variant = await ProductVariant.findByPk(cart.variant_id, {
      include: [
        {
          model: Product,
          as: "product",
        },
      ],
    });

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    const finalQty = Number(quantity);

    // =========================================================
    // REMOVE ITEM WHEN QUANTITY IS 0 OR LESS
    // =========================================================
    if (!finalQty || finalQty <= 0) {
      await cart.destroy();

      return {
        message: "Item removed from cart",
      };
    }

    if (!Number.isInteger(finalQty)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Quantity must be a whole number");
    }

    // =========================================================
    // INVENTORY VALIDATION
    // =========================================================
    if (variant.track_inventory && finalQty > Number(variant.stock)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Stock exceeded");
    }

    // =========================================================
    // MAX ORDER QUANTITY VALIDATION
    // =========================================================
    if (
      variant.max_order_quantity &&
      finalQty > Number(variant.max_order_quantity)
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST,
        `Maximum order quantity is ${variant.max_order_quantity}`,
      );
    }

    // =========================================================
    // GET EXISTING CUSTOMIZATION CONFIG
    // =========================================================
    let customization = cart.customization_config;

    if (customization && typeof customization === "string") {
      customization = JSON.parse(customization);
    }

    if (variant.supplier === "MANUAL") {
      return await repriceManualCartItem(cart, variant, customization, finalQty);
    }

    const pricing_snapshot = await buildSupplierPricingSnapshot(
      variant,
      customization,
      finalQty,
    );

    // Unlike increment/decrement, this leaves customization_config (and its
    // size.quantity) as stored.
    await cart.update({
      quantity: finalQty,

      pricing_snapshot,
    });

    return cart;
  } catch (error) {
    console.log("❌ UPDATE CART QTY ERROR:", error);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

const removeFromCart = async (user, cart_id) => {
  try {
    const cart = await Cart.findOne({ where: { id: cart_id, user_id: user.id } });
    if (!cart) throw new ApiError(httpStatus.NOT_FOUND, "Cart not found");
    await invalidatePendingOrder(cart.user_id);
    await cart.destroy();
    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const moveCartToWishlist = async (body) => {
  const t = await sequelize.transaction();

  try {
    const { user, cart_id } = body;

    const cartItem = await Cart.findOne({
      where: { id: cart_id, user_id: user.id },
      transaction: t,
    });

    if (!cartItem) throw new ApiError(httpStatus.NOT_FOUND, "Cart item not found");

    // ✅ ADD TO WISHLIST
    await addToWishlist({
      user,
      product_id: cartItem.product_id,
      variant_id: cartItem.variant_id,
    });

    // ✅ REMOVE FROM CART
    await cartItem.destroy({ transaction: t });

    await t.commit();

    return { message: "Moved to wishlist" };
  } catch (error) {
    await t.rollback();
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const invalidatePendingOrder = async (userId) => {
  try {
    const order = await Order.findOne({
      where: {
        user_id: userId,
        payment_status: "PENDING",
        status: "PENDING_PAYMENT",
      },
      order: [["created_at", "DESC"]],
    });

    if (!order) {
      return;
    }

    console.log(`🗑 Invalidating Pending Order: ${order.order_number}`);
    if (order.label_id) {
      try {
        await cancelShipstationShipment(order);
      } catch (err) {
        console.error("⚠️ Failed to cancel ShipStation shipment:", err.message);
      }
    }

    /*
    |--------------------------------------------------------------------------
    | DELETE ORDER ITEMS
    |--------------------------------------------------------------------------
    */

    await OrderItem.destroy({
      where: {
        order_id: order.id,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | DELETE ORDER
    |--------------------------------------------------------------------------
    */

    await order.destroy();

    console.log(`✅ Pending Order Removed: ${order.order_number}`);
  } catch (error) {
    console.error("❌ Invalidate Pending Order Error:", error.message);

    throw error;
  }
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  moveWishlistToCart,

  addToCart,
  getCart,
  updateCartQuantity,
  incrementCart,
  decrementCart,
  removeFromCart,
  moveCartToWishlist,
};
