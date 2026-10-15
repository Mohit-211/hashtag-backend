const { calculatePricing } = require("../../config/pricing");
const httpStatus = require("http-status");
const ApiError = require("../ApiError");

/*
|--------------------------------------------------------------------------
| SAGE HANDLING CHARGE
|--------------------------------------------------------------------------
*/

const SAGE_HANDLING_CHARGE = {
  enabled: true,
  amount: 35,
  name: "Handling Charges",

  supplier_id: "51093",
  category: "Tumblers",
};

const SAGE_DRINKWARE_SECOND_LOCATION_PRICE = 8;

/*
|--------------------------------------------------------------------------
| EMBROIDERY
|--------------------------------------------------------------------------
*/

const EMBROIDERY_PRICING = {
  LEFT_CHEST: {
    "1-11": 12,
    "12-23": 11,
    "24-35": 10,
    "36-71": 9,
    "72-95": 8,
    "96-143": 7,
    "144+": 6,
  },

  RIGHT_CHEST: {
    "1-11": 12,
    "12-23": 11,
    "24-35": 10,
    "36-71": 9,
    "72-95": 8,
    "96-143": 7,
    "144+": 6,
  },

  SLEEVE: {
    "1-11": 12,
    "12-23": 11,
    "24-35": 10,
    "36-71": 9,
    "72-95": 8,
    "96-143": 7,
    "144+": 6,
  },

  HAT_FRONT: {
    "1-11": 15,
    "12-23": 14,
    "24-35": 12,
    "36-71": 11,
    "72-95": 10,
    "96-143": 9,
    "144+": 8,
  },

  HAT_SIDE: {
    "1-11": 10,
    "12-23": 9,
    "24-35": 8,
    "36-71": 7,
    "72-95": 6,
    "96-143": 5,
    "144+": 5,
  },

  HAT_BACK_ARCH: {
    "1-11": 10,
    "12-23": 9,
    "24-35": 8,
    "36-71": 7,
    "72-95": 6,
    "96-143": 5,
    "144+": 5,
  },

  FULL_BACK_STANDARD: {
    "1-11": 18,
    "12-23": 16,
    "24-35": 14,
    "36-71": 13,
    "72-95": 12,
    "96-143": 11,
    "144+": 10,
  },

  FULL_BACK_LARGE: {
    "1-11": 22,
    "12-23": 20,
    "24-35": 18,
    "36-71": 16,
    "72-95": 15,
    "96-143": 14,
    "144+": 12,
  },

  OVERSIZED_BACK: {
    inquiry_only: true,
  },
};

/*
|--------------------------------------------------------------------------
| DTF
|--------------------------------------------------------------------------
*/

const DTF_PRICING = {
  "1-11": 15,
  "12-23": 12,
  "24-35": 10,
  "36-71": 9,
  "72-95": 7,
  "96-143": 5,
  "144+": 5,
};

/*
|--------------------------------------------------------------------------
| SCREEN PRINT
|--------------------------------------------------------------------------
*/

const SCREEN_PRINT_PRICING = {
  1: {
    "12-23": 11.19,
    "24-47": 7.46,
    "48-99": 4.85,
    "100-299": 3.36,
    "300-499": 2.24,
    "500+": 1.87,
  },

  2: {
    "12-23": 22.39,
    "24-47": 11.19,
    "48-99": 7.09,
    "100-299": 5.22,
    "300-499": 3.36,
    "500+": 3.21,
  },

  3: {
    "12-23": 37.31,
    "24-47": 14.93,
    "48-99": 9.33,
    "100-299": 7.46,
    "300-499": 4.48,
    "500+": 4.25,
  },

  4: {
    "12-23": 52.24,
    "24-47": 26.87,
    "48-99": 11.19,
    "100-299": 10.07,
    "300-499": 5.6,
    "500+": 5.37,
  },

  5: {
    "12-23": 67.16,
    "24-47": 32.84,
    "48-99": 14.93,
    "100-299": 11.57,
    "300-499": 6.72,
    "500+": 6.49,
  },

  6: {
    "12-23": 82.09,
    "24-47": 37.31,
    "48-99": 17.16,
    "100-299": 13.06,
    "300-499": 8.58,
    "500+": 7.61,
  },
};

/*
|--------------------------------------------------------------------------
| DTG
|--------------------------------------------------------------------------
*/

const DTG_PRICING = {
  FRONT_REGULAR: {
    "1-23": 15,
    "24-47": 12,
    "48-99": 11,
    "100+": 9,
  },

  OVERSIZED: {
    "1-23": 20,
    "24-47": 17,
    "48-99": 16,
    "100+": 14,
  },

  FRONT_AND_BACK_REGULAR: {
    "1-23": 30,
    "24-47": 24,
    "48-99": 22,
    "100+": 18,
  },

  FRONT_AND_BACK_OVERSIZED: {
    "1-23": 40,
    "24-47": 34,
    "48-99": 32,
    "100+": 28,
  },
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getEmbroideryPrice = (table, qty) => {
  if (!table) return 0;

  if (table.inquiry_only) {
    return "INQUIRY_ONLY";
  }

  if (qty >= 1 && qty <= 11) return table["1-11"];
  if (qty >= 12 && qty <= 23) return table["12-23"];
  if (qty >= 24 && qty <= 35) return table["24-35"];
  if (qty >= 36 && qty <= 71) return table["36-71"];
  if (qty >= 72 && qty <= 95) return table["72-95"];
  if (qty >= 96 && qty <= 143) return table["96-143"];

  return table["144+"];
};

const getDTFPrice = (qty) => {
  if (qty >= 1 && qty <= 11) return DTF_PRICING["1-11"];
  if (qty >= 12 && qty <= 23) return DTF_PRICING["12-23"];
  if (qty >= 24 && qty <= 35) return DTF_PRICING["24-35"];
  if (qty >= 36 && qty <= 71) return DTF_PRICING["36-71"];
  if (qty >= 72 && qty <= 95) return DTF_PRICING["72-95"];
  if (qty >= 96 && qty <= 143) return DTF_PRICING["96-143"];

  return DTF_PRICING["144+"];
};

const getScreenPrintPrice = (colors, qty) => {
  const table = SCREEN_PRINT_PRICING[colors];

  if (!table) return 0;

  if (qty >= 12 && qty <= 23) {
    return table["12-23"];
  }

  if (qty >= 24 && qty <= 47) {
    return table["24-47"];
  }

  if (qty >= 48 && qty <= 99) {
    return table["48-99"];
  }

  if (qty >= 100 && qty <= 299) {
    return table["100-299"];
  }

  if (qty >= 300 && qty <= 499) {
    return table["300-499"];
  }

  if (qty >= 500) {
    return table["500+"];
  }

  return "MINIMUM_12_REQUIRED";
};

const getDTGPrice = (style, qty) => {
  const table = DTG_PRICING[style];

  if (!table) return 0;

  if (qty >= 1 && qty <= 23) return table["1-23"];
  if (qty >= 24 && qty <= 47) return table["24-47"];
  if (qty >= 48 && qty <= 99) return table["48-99"];

  return table["100+"];
};

/*
|--------------------------------------------------------------------------
| MAIN FUNCTION
|--------------------------------------------------------------------------
*/

const buildPricingSnapshot = async ({
  variant,
  quantity = 1,
  customization = null,
}) => {
  /*
   |--------------------------------------------------------------------------
   | PRODUCT PRICE
   |--------------------------------------------------------------------------
   */

  const effectivePrice =
    variant.case_price && Number(variant.case_price) > 0
      ? Number(variant.case_price)
      : Number(variant.price);

  const productPricing = await calculatePricing(
    effectivePrice,
    variant.supplier,
  );

  const supplier_markup =
    Number(productPricing.final_price) - Number(productPricing.base_price);

  const base_price = Number(productPricing.final_price);

  /*
   |--------------------------------------------------------------------------
   | CUSTOMIZATION
   |--------------------------------------------------------------------------
   */

  let customization_total = 0;

  let setup_fee = 0;

  let inquiry_only = false;

  const pricing_table = [];

  if (customization) {
    const printMethod = customization.print_method;

    const locations = customization.locations || [];

    /*
     |--------------------------------------------------------------------------
     | EMBROIDERY
     |--------------------------------------------------------------------------
     */

    if (printMethod === "EMBROIDERY") {
      for (const location of locations) {
        const locationKey = location.location?.toUpperCase().replace(/-/g, "_");

        const table = EMBROIDERY_PRICING[locationKey];

        let locationPrice = getEmbroideryPrice(table, quantity);

        if (locationPrice === "INQUIRY_ONLY") {
          inquiry_only = true;

          pricing_table.push({
            type: "EMBROIDERY",
            location: location.location,
            message: "Request Quote",
          });

          continue;
        }

        customization_total += locationPrice;

        pricing_table.push({
          type: "EMBROIDERY",
          location: location.location,

          quantity,

          price_per_item: locationPrice,

          total: locationPrice * quantity,
        });
      }

      /*
       |--------------------------------------------------------------------------
       | DIGITIZING FEE
       |--------------------------------------------------------------------------
       */

      if (quantity <= 11) {
        setup_fee = 35;
      }
    }

    /*
     |--------------------------------------------------------------------------
     | DTF
     |--------------------------------------------------------------------------
     */

    if (printMethod === "DTF") {
      const dtfPrice = getDTFPrice(quantity);

      const locationCount = Math.max(locations.length, 1);

      customization_total += dtfPrice * locationCount;

      pricing_table.push({
        type: "DTF",

        quantity,

        locations: locationCount,

        price_per_item: dtfPrice,

        total: dtfPrice * locationCount * quantity,
      });
    }

    /*
     |--------------------------------------------------------------------------
     | SCREEN PRINT
     |--------------------------------------------------------------------------
     */

    if (printMethod === "SCREEN_PRINT") {
      const colors = Number(customization.colors) || 1;

      const screenPrice = getScreenPrintPrice(colors, quantity);

      if (screenPrice === "MINIMUM_12_REQUIRED") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Screen print requires minimum quantity of 12");
      }

      const locationCount = Math.max(locations.length, 1);

      customization_total += screenPrice * locationCount;

      pricing_table.push({
        type: "SCREEN_PRINT",

        colors,

        quantity,

        price_per_item: screenPrice,

        total: screenPrice * locationCount * quantity,
      });
    }

    /*
     |--------------------------------------------------------------------------
     | DTG
     |--------------------------------------------------------------------------
     */

    if (printMethod === "DTG") {
      const dtgStyle = customization.dtg_style;

      const dtgPrice = getDTGPrice(dtgStyle, quantity);

      const locationCount = Math.max(locations.length, 1);

      customization_total += dtgPrice * locationCount;

      pricing_table.push({
        type: "DTG",

        dtg_style: dtgStyle,

        quantity,

        price_per_item: dtgPrice,

        total: dtgPrice * locationCount * quantity,
      });
    }
  }

  /*
   |--------------------------------------------------------------------------
   | FINAL TOTALS
   |--------------------------------------------------------------------------
   */

  const final_price = Number((base_price + customization_total).toFixed(2));

  const total_price = Number((final_price * quantity + setup_fee).toFixed(2));

  return {
    supplier: variant.supplier,

    quantity,

    inquiry_only,

    /*
     |--------------------------------------------------------------------------
     | PRODUCT
     |--------------------------------------------------------------------------
     */

    product_price: {
      actual_price: Number(productPricing.base_price),

      supplier_markup,

      final_product_price: base_price,
    },

    /*
     |--------------------------------------------------------------------------
     | CUSTOMIZATION
     |--------------------------------------------------------------------------
     */

    customization_price: {
      total_customization_price: customization_total,

      setup_fee,
    },

    /*
     |--------------------------------------------------------------------------
     | FINAL
     |--------------------------------------------------------------------------
     */

    final_price_per_item: final_price,

    total_price,

    /*
     |--------------------------------------------------------------------------
     | BREAKDOWN
     |--------------------------------------------------------------------------
     */

    pricing_table,
  };
};

const buildSagePricingSnapshot = async ({
  variant,
  product = null,
  quantity = 1,
  customization = null,
}) => {
  let meta = variant.meta || {};

  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch (error) {
      meta = {};
    }
  }

  // Quantity and price tiers are kept as pairs: filtering the two lists separately
  // shifted prices onto the wrong quantity whenever a tier in the middle was empty.
  const rawNetTiers = meta.netTiers || [];
  const tiers = (meta.qtyTiers || [])
    .map((q, i) => ({ qty: Number(q), net: Number(rawNetTiers[i]) }))
    .filter((tier) => tier.qty > 0 && !isNaN(tier.net) && tier.net > 0);

  const qtyTiers = tiers.map((tier) => tier.qty);

  const netTiers = tiers.map((tier) => tier.net);

  if (!qtyTiers.length || !netTiers.length) {
    throw new ApiError(httpStatus.BAD_REQUEST,
      `SAGE net pricing tiers not found for variant ${variant.id}`,
    );
  }

  /*
   |--------------------------------------------------------------------------
   | MINIMUM QUANTITY CHECK
   |--------------------------------------------------------------------------
   */

  const minQty = Math.min(...qtyTiers);

  if (quantity < minQty) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Minimum quantity for this product is ${minQty}`);
  }

  /*
   |--------------------------------------------------------------------------
   | FIND MATCHING PRICE TIER
   |--------------------------------------------------------------------------
   */

  let supplierPrice = Number(netTiers[0]);
  let tierQuantity = Number(qtyTiers[0]);

  for (let i = 0; i < qtyTiers.length; i++) {
    if (
      quantity >= Number(qtyTiers[i]) &&
      netTiers[i] !== undefined &&
      !isNaN(Number(netTiers[i]))
    ) {
      supplierPrice = Number(netTiers[i]);
      tierQuantity = Number(qtyTiers[i]);
    }
  }

  /*
   |--------------------------------------------------------------------------
   | APPLY THE SAGE MARKUP (from the pricing settings)
   |--------------------------------------------------------------------------
   */

  const productPricing = await calculatePricing(supplierPrice, "SAGE");

  const supplier_markup =
    Number(productPricing.final_price) - Number(productPricing.base_price);

  const handlingChargeApplicable = isSageHandlingChargeApplicable(product);

  const handlingCharge = handlingChargeApplicable
    ? Number(SAGE_HANDLING_CHARGE.amount)
    : 0;

  /*
 |--------------------------------------------------------------------------
 | SAGE DRINKWARE PRINTING
 |--------------------------------------------------------------------------
 */

  let drinkwareCustomizationPrice = 0;
  let drinkwarePricingTable = [];

  const isDrinkware = (product?.categories || []).some((category) =>
    (category.parent_categories || []).some(
      (parentCategory) =>
        String(parentCategory.title || "")
          .trim()
          .toLowerCase() === "drinkware",
    ),
  );

  if (
    isDrinkware &&
    customization &&
    ["LASER_ENGRAVING", "COLOR_IMPRINT"].includes(
      String(customization.print_method || "")
        .trim()
        .toUpperCase(),
    )
  ) {
    const locations = customization.locations || [];

    const hasFrontAndBack = locations.some(
      (location) =>
        String(location.location || "")
          .trim()
          .toUpperCase() === "FRONT AND BACK",
    );

    const locationCount = hasFrontAndBack ? 2 : locations.length;

    if (locationCount >= 1) {
      drinkwareCustomizationPrice =
        locationCount >= 2 ? SAGE_DRINKWARE_SECOND_LOCATION_PRICE : 0;

      drinkwarePricingTable.push({
        type: "SAGE_DRINKWARE",
        print_method: customization.print_method,
        locations: locations.map((location) => location.location),
        quantity,
        second_location_price:
          locationCount >= 2 ? SAGE_DRINKWARE_SECOND_LOCATION_PRICE : 0,
        total: drinkwareCustomizationPrice * quantity,
      });
    }
  }

  const final_price_per_item = Number(
    (Number(productPricing.final_price) + drinkwareCustomizationPrice).toFixed(
      2,
    ),
  );

  const total_price = Number(
    (final_price_per_item * quantity + handlingCharge).toFixed(2),
  );

  return {
    supplier: "SAGE",

    quantity,

    inquiry_only: false,

    handling_charge: {
      applicable: handlingChargeApplicable,
      name: SAGE_HANDLING_CHARGE.name,
      amount: handlingCharge,
    },

    product_price: {
      actual_price: Number(productPricing.base_price),

      supplier_markup,

      final_product_price: Number(productPricing.final_price),
    },

    /*
     |--------------------------------------------------------------------------
     | CUSTOMIZATION
     |--------------------------------------------------------------------------
     */

    customization_price: {
      total_customization_price: drinkwareCustomizationPrice,

      setup_fee: 0,
    },

    /*
     |--------------------------------------------------------------------------
     | FINAL
     |--------------------------------------------------------------------------
     */

    final_price_per_item,

    total_price,

    /*
     |--------------------------------------------------------------------------
     | BREAKDOWN
     |--------------------------------------------------------------------------
     */

    pricing_table: [
      {
        type: "SAGE",

        quantity,

        tier_quantity: tierQuantity,

        supplier_price: supplierPrice,

        markup_percent: Number(productPricing.markup_percent),

        final_price_per_item,

        total: total_price,
      },

      ...drinkwarePricingTable,
    ],
  };
};

const isSageHandlingChargeApplicable = (product) => {
  if (!SAGE_HANDLING_CHARGE.enabled || !product) {
    return false;
  }

  if (product.supplier !== "SAGE") {
    return false;
  }

  if (String(product.supplier_id) !== SAGE_HANDLING_CHARGE.supplier_id) {
    return false;
  }

  let categories = product.categories || [];

  if (typeof categories === "string") {
    try {
      categories = JSON.parse(categories);
    } catch (error) {
      categories = [];
    }
  }

  return categories.some(
    (category) =>
      String(category.title).toLowerCase() ===
      SAGE_HANDLING_CHARGE.category.toLowerCase(),
  );
};

module.exports = { buildPricingSnapshot, buildSagePricingSnapshot };
