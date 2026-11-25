const { calculatePricing } = require("../../config/pricing");
const httpStatus = require("http-status");
const ApiError = require("../ApiError");
const { netPriceTiers } = require("./pricing.util");
const { APPAREL_PRINT_METHODS, DRINKWARE_PRINT_METHODS, printMethodsFor } = require("../productFamily");

// The tumblers' $35 handling charge used to be added to each SAGE cart line here. It is now an
// order fee, charged once per order and set on the Settings page (handlingFee.service.js).

// Drinkware's second print location (front and back), a piece, on every supplier (audit F04).
const DRINKWARE_SECOND_LOCATION_PRICE = 8;

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
| WHAT CAN BE SOLD (audit F04, F05)
|--------------------------------------------------------------------------
*/

const DRINKWARE_LOCATIONS = ["FRONT", "BACK"];

// Embroidery prices each sleeve at the sleeve rate. The shop sends both as SLEEVE today; keeping
// them apart waits for the client (audit F08, question A10).
const EMBROIDERY_PRICE_ROW = { SLEEVE_LEFT: "SLEEVE", SLEEVE_RIGHT: "SLEEVE" };

// Embroidery quoted by the team, never added to a cart (client decisions Q5 and Q6, audit DEC-04
// and DEC-06). Under DTF, screen print and DTG these are priced like any other location until each
// garment's own locations are decided (audit F08).
const EMBROIDERY_QUOTE_ONLY = { FULL_FRONT: "Full Front", FULL_BACK: "Full Back", OVERSIZED_BACK: "Oversized Back" };

// What the customer reads when a decoration can't be sold (400). The shop never sends these
// requests; an old page or an edited request can.
const MESSAGES = {
  notAvailable: "This print option isn't available. Please choose another one.",
  methodApparel: "This print method isn't available for this product. Please choose embroidery, DTF, screen print or DTG.",
  methodDrinkware: "This print method isn't available for this product. Please choose Color Imprint or Laser Engraving.",
  methodOther: "This print method isn't available for this product. Please choose another one.",
  noPrinting: "Print methods can't be chosen for this product. Please add it without one.",
  noLocation: "Please choose at least one print location.",
  noMethod: "Please choose a print method for your print locations.",
  screenPrintColors: "Please choose between 1 and 6 colors for screen printing.",
  dtgStyle: "Please choose a print area for DTG printing.",
  embroideryQuote: (label) =>
    `${label} embroidery is by quote only. Please remove it, choose another print method, or contact us for a quote.`,
  embroideryLocation: "This print location isn't available for embroidery. Please choose another one.",
  drinkwareLocation: "This product can only be printed on the front, the back, or both. Please choose one of those.",
};

// Lines already in a cart that today's rules refuse (added before them, or the product has moved
// to other categories since).
const CART_LINE_OPTIONS_GONE =
  "This item's print options aren't available any more. Please remove it from your cart and add it again.";

// The same at checkout, naming the products: "A", "A and B", "A, B and C".
const orderLinesOptionsGone = (names, lineCount) => {
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const them = lineCount > 1 ? "them" : "it";
  return `The print options on ${list} aren't available any more. Please remove ${them} from your cart and add ${them} again.`;
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

// The print options are checked first (readPrintOptions), so a lookup never misses; if one ever
// does, it's refused instead of priced at $0.
const getEmbroideryPrice = (table, qty) => {
  if (!table) throw new ApiError(httpStatus.BAD_REQUEST, MESSAGES.notAvailable);

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

  if (!table) throw new ApiError(httpStatus.BAD_REQUEST, MESSAGES.notAvailable);

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

  if (!table) throw new ApiError(httpStatus.BAD_REQUEST, MESSAGES.notAvailable);

  if (qty >= 1 && qty <= 23) return table["1-23"];
  if (qty >= 24 && qty <= 47) return table["24-47"];
  if (qty >= 48 && qty <= 99) return table["48-99"];

  return table["100+"];
};

// "embroidery " → "EMBROIDERY"; "" for none. A value that isn't text is kept as it is, so it's refused.
const printMethodOf = (customization) => {
  const method = customization?.print_method;
  if (method === undefined || method === null) return "";
  return typeof method === "string" ? method.trim().toUpperCase() : method;
};

// "left-chest" → "LEFT_CHEST"; "" when it isn't text.
const locationCodeOf = (value) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";

const sentLocations = (locations) =>
  Array.isArray(locations) ? locations.length > 0 : locations !== undefined && locations !== null && locations !== "";

const methodProblem = (allowed) => {
  const apparel = allowed.some((method) => APPAREL_PRINT_METHODS.includes(method));
  const drinkware = allowed.some((method) => DRINKWARE_PRINT_METHODS.includes(method));
  if (apparel && drinkware) return MESSAGES.methodOther;
  if (apparel) return MESSAGES.methodApparel;
  if (drinkware) return MESSAGES.methodDrinkware;
  return MESSAGES.noPrinting;
};

// A cart line's decoration read the way it's priced (audit F04, F05): { customization }, a copy with
// print_method, the location codes, colors and dtg_style written as the price tables write them
// (colors only for screen print, dtg_style only for DTG), or { problem }: why it can't be sold. A
// line without a print method or locations is undecorated and taken as it is.
const readPrintOptions = (customization, categories) => {
  if (!customization || typeof customization !== "object" || Array.isArray(customization)) {
    return { customization };
  }

  const method = printMethodOf(customization);

  if (method === "") {
    return sentLocations(customization.locations)
      ? { problem: MESSAGES.noMethod }
      : { customization: { ...customization } };
  }

  const allowed = printMethodsFor(categories);
  if (!allowed.includes(method)) return { problem: methodProblem(allowed) };

  const entries = Array.isArray(customization.locations) ? customization.locations : [];
  const codes = entries.map((entry) =>
    entry && typeof entry === "object" ? locationCodeOf(entry.location) : "",
  );
  if (!codes.length || codes.includes("")) return { problem: MESSAGES.noLocation };

  const checked = {
    ...customization,
    print_method: method,
    locations: entries.map((entry, index) => ({ ...entry, location: codes[index] })),
  };
  if (method !== "SCREEN_PRINT") delete checked.colors;
  if (method !== "DTG") delete checked.dtg_style;

  if (DRINKWARE_PRINT_METHODS.includes(method)) {
    return codes.every((code) => DRINKWARE_LOCATIONS.includes(code))
      ? { customization: checked }
      : { problem: MESSAGES.drinkwareLocation };
  }

  if (method === "EMBROIDERY") {
    for (const code of codes) {
      if (Object.hasOwn(EMBROIDERY_PRICING, EMBROIDERY_PRICE_ROW[code] || code)) continue;
      return {
        problem: EMBROIDERY_QUOTE_ONLY[code]
          ? MESSAGES.embroideryQuote(EMBROIDERY_QUOTE_ONLY[code])
          : MESSAGES.embroideryLocation,
      };
    }
  }

  if (method === "SCREEN_PRINT") {
    const sent = customization.colors;
    const colors = typeof sent === "string" && sent.trim() !== "" ? Number(sent) : sent;
    if (typeof colors !== "number" || !Number.isInteger(colors) || !Object.hasOwn(SCREEN_PRINT_PRICING, colors)) {
      return { problem: MESSAGES.screenPrintColors };
    }
    checked.colors = colors;
  }

  if (method === "DTG") {
    const style = typeof customization.dtg_style === "string" ? customization.dtg_style.trim().toUpperCase() : "";
    if (!Object.hasOwn(DTG_PRICING, style)) return { problem: MESSAGES.dtgStyle };
    checked.dtg_style = style;
  }

  return { customization: checked };
};

// The same, refused with 400. Returns the checked copy (or the input when it isn't an object).
const checkPrintOptions = (customization, categories) => {
  const { customization: checked, problem } = readPrintOptions(customization, categories);
  if (problem) throw new ApiError(httpStatus.BAD_REQUEST, problem);
  return checked;
};

// A checked line's decoration at this quantity: its price a piece and its pricing_table rows (the
// rows the cart, the shop and the admin panel already read).
const decorationOf = (checked, quantity, supplier) => {
  const method = printMethodOf(checked);

  if (!method) {
    return { perPiece: 0, rows: [] };
  }

  const locations = checked.locations.map((entry) => entry.location);

  if (method === "EMBROIDERY") {
    const rows = locations.map((location) => {
      const price = getEmbroideryPrice(EMBROIDERY_PRICING[EMBROIDERY_PRICE_ROW[location] || location], quantity);

      return {
        type: "EMBROIDERY",
        location,

        quantity,

        price_per_item: price,

        total: price * quantity,
      };
    });

    return { perPiece: rows.reduce((sum, row) => sum + row.price_per_item, 0), rows };
  }

  if (method === "DTF") {
    const price = getDTFPrice(quantity);

    return {
      perPiece: price * locations.length,
      rows: [
        {
          type: "DTF",

          quantity,

          locations: locations.length,

          price_per_item: price,

          total: price * locations.length * quantity,
        },
      ],
    };
  }

  if (method === "SCREEN_PRINT") {
    const price = getScreenPrintPrice(checked.colors, quantity);

    if (price === "MINIMUM_12_REQUIRED") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Screen print requires minimum quantity of 12");
    }

    return {
      perPiece: price * locations.length,
      rows: [
        {
          type: "SCREEN_PRINT",

          colors: checked.colors,

          quantity,

          price_per_item: price,

          total: price * locations.length * quantity,
        },
      ],
    };
  }

  if (method === "DTG") {
    const price = getDTGPrice(checked.dtg_style, quantity);

    return {
      perPiece: price * locations.length,
      rows: [
        {
          type: "DTG",

          dtg_style: checked.dtg_style,

          quantity,

          price_per_item: price,

          total: price * locations.length * quantity,
        },
      ],
    };
  }

  if (!DRINKWARE_PRINT_METHODS.includes(method)) {
    throw new ApiError(httpStatus.BAD_REQUEST, MESSAGES.notAvailable);
  }

  // Color Imprint and Laser Engraving: the first location is free, a second one (front and back)
  // adds $8 a piece (client decision Q14), on every supplier (audit F04). SAGE's row keeps the
  // shape and name it has always had. The other suppliers' row also has price_per_item, which the
  // cart's breakdown and the admin panel's checks read.
  const fee = locations.length >= 2 ? DRINKWARE_SECOND_LOCATION_PRICE : 0;

  return {
    perPiece: fee,
    rows: [
      {
        type: supplier === "SAGE" ? "SAGE_DRINKWARE" : "DRINKWARE",
        print_method: method,
        locations,
        quantity,
        ...(supplier === "SAGE" ? {} : { price_per_item: fee }),
        second_location_price: fee,
        total: fee * quantity,
      },
    ],
  };
};

// Whether a line already in a cart can be ordered as it was saved (audit F04, F05): its print
// options pass today's rules with the product's categories now, it isn't a "request a quote" line,
// and, if it was priced before these rules (no print_options_checked), its decoration wasn't
// saved for less than it costs now.
const canOrderCartLine = ({ customization, snapshot, categories, quantity }) => {
  if (snapshot?.inquiry_only) return false;

  const { customization: checked, problem } = readPrintOptions(customization, categories);
  if (problem) return false;
  if (!printMethodOf(checked)) return true;
  if (snapshot?.print_options_checked) return true;
  // Customization is free on SAGE (25 Nov): there's no print price to compare.
  if (snapshot?.supplier === "SAGE") return true;

  let today;
  try {
    today = decorationOf(checked, Number(quantity)).perPiece;
  } catch (error) {
    if (error instanceof ApiError) return false;
    throw error;
  }

  const saved = Number(snapshot?.customization_price?.total_customization_price) || 0;
  return saved + 0.005 >= today;
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
  categories = [],
}) => {
  // Refused (400) when the product doesn't offer the decoration or it isn't on the price list.
  const checked = checkPrintOptions(customization, categories);

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

  const decoration = decorationOf(checked, quantity, variant.supplier);

  const customization_total = decoration.perPiece;

  const pricing_table = decoration.rows;

  /*
   |--------------------------------------------------------------------------
   | FINAL TOTALS
   |--------------------------------------------------------------------------
   */

  const final_price = Number((base_price + customization_total).toFixed(2));

  const total_price = Number((final_price * quantity).toFixed(2));

  return {
    supplier: variant.supplier,

    quantity,

    inquiry_only: false,

    // Priced with the print options checked (audit F04, F05); POST order reads it.
    print_options_checked: true,

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

      // The graphic fee depends on the whole cart: applyGraphicFees sets it.
      setup_fee: 0,
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

const SCREEN_PRINT_MINIMUM = 12;

// The fewest pieces a cart line can have (client decision Q36: "−" and typed quantities stop
// here instead of removing the line): the variant's own minimum, SAGE's first price tier, and
// 12 for screen print. The pricing below enforces the last two as well.
const lineMinimum = (variant, customization) => {
  let minimum = Number(variant.min_order_quantity) || 1;

  if (variant.supplier === "SAGE") {
    const tiers = netPriceTiers(variant.meta);
    if (tiers.length) minimum = Math.max(minimum, Math.min(...tiers.map((tier) => tier.qty)));
  }

  if (printMethodOf(customization) === "SCREEN_PRINT") {
    minimum = Math.max(minimum, SCREEN_PRINT_MINIMUM);
  }

  return minimum;
};

const buildSagePricingSnapshot = async ({
  variant,
  product = null,
  quantity = 1,
  customization = null,
}) => {
  // Refused (400) when the product doesn't offer the decoration or it isn't on the price list.
  // The options are still checked, because production reads them, but on SAGE they cost nothing
  // (decided 25 Nov, below).
  checkPrintOptions(customization, product?.categories);

  const tiers = netPriceTiers(variant.meta);

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

  /*
   |--------------------------------------------------------------------------
   | CUSTOMIZATION IS FREE ON SAGE (decided 25 Nov)
   |--------------------------------------------------------------------------
   | Whatever the category, apparel or drinkware: no print price, no drinkware
   | back-print $8, and no $35 graphic fee (graphicFees.js skips SAGE lines).
   | The line costs the product price only, and carries no pricing_table: the
   | shop showed its one "SAGE" row as "Sage +$0.00".
   */

  const final_price_per_item = Number(
    Number(productPricing.final_price).toFixed(2),
  );

  const total_price = Number((final_price_per_item * quantity).toFixed(2));

  return {
    supplier: "SAGE",

    quantity,

    inquiry_only: false,

    // Priced with the print options checked (audit F04, F05); POST order reads it.
    print_options_checked: true,

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
      total_customization_price: 0,

      setup_fee: 0,
    },

    /*
     |--------------------------------------------------------------------------
     | FINAL
     |--------------------------------------------------------------------------
     */

    final_price_per_item,

    total_price,

    // The SAGE tier this quantity is priced at (it was in the pricing_table row).
    tier_quantity: tierQuantity,
  };
};

/*
|--------------------------------------------------------------------------
| SAGE LINES PRICED BEFORE 25 NOV
|--------------------------------------------------------------------------
| A SAGE cart line saved earlier may still carry a customization price (the
| drinkware $8, or clothing print prices) and its pricing_table. Returns the
| snapshot as buildSagePricingSnapshot would price it now: the product price
| only, for the line's quantity, with no pricing_table. A line saved before
| the handling fee moved to the order also loses its old per-line
| handling_charge, which its new total doesn't include. Any other snapshot
| comes back as it is, and so does a SAGE one already priced this way.
*/

const withFreeSageCustomization = (snapshot, quantity) => {
  if (!snapshot || snapshot.supplier !== "SAGE") return snapshot;

  const perPiece = Number(snapshot.product_price?.final_product_price);
  const qty = Number(quantity ?? snapshot.quantity);

  if (!Number.isFinite(perPiece) || !(qty > 0)) return snapshot;

  const rest = { ...snapshot };
  delete rest.pricing_table;
  delete rest.handling_charge;
  const final_price_per_item = Number(perPiece.toFixed(2));

  return {
    ...rest,

    quantity: qty,

    customization_price: {
      ...(rest.customization_price || {}),

      total_customization_price: 0,

      setup_fee: 0,
    },

    final_price_per_item,

    total_price: Number((final_price_per_item * qty).toFixed(2)),
  };
};

module.exports = {
  buildPricingSnapshot,
  buildSagePricingSnapshot,
  withFreeSageCustomization,
  lineMinimum,
  readPrintOptions,
  checkPrintOptions,
  canOrderCartLine,
  CART_LINE_OPTIONS_GONE,
  orderLinesOptionsGone,
  DRINKWARE_SECOND_LOCATION_PRICE,
};
