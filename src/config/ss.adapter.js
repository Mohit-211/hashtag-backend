// adapters/ss.adapter.js

const BASE_IMAGE_URL = "https://api.ssactivewear.com/";

const mapSSProduct = (items, style) => {
  const first = items[0];

  // ✅ PRODUCT
  const product = {
    name: style?.styleName || first.styleName,
    description: style?.description || "",
    external_style_id: String(first.styleID),
    supplier: "SS",
  };

  // ✅ CATEGORIES
  const categories = style?.categories
    ? style.categories.split(",")
    : first.baseCategoryID
    ? [String(first.baseCategoryID)]
    : [];

  // ✅ UNIQUE SIZES
  const sizes = [...new Set(items.map((i) => i.sizeName))];

  // ✅ VARIANTS (FULLY MAPPED)
  const variants = items.map((p) => ({
    sku: p.sku,
    price: p.piecePrice || p.salePrice || p.retailPrice || 0,
   stock: p.qty ?? 0,
    size: p.sizeName,
    color: p.colorName,
    color_code: p.color1 || null,

    // 🔥 NEW FIELDS
    retail_price: p.retailPrice,
    sale_price: p.salePrice,
    map_price: p.mapPrice,
    unit_weight: p.unitWeight,
    case_qty: p.caseQty,
    case_weight: p.caseWeight,
    case_length: p.caseLength,
    case_width: p.caseWidth,
    case_height: p.caseHeight,
    country_of_origin: p.countryOfOrigin,

    // 🔥 IMAGES
    images: [
      p.colorFrontImage,
      p.colorSideImage,
      p.colorBackImage,
    ]
      .filter(Boolean)
      .map((img) => BASE_IMAGE_URL + img),

    // 🔥 WAREHOUSES
    warehouses: (p.warehouses || []).map((w) => ({
      warehouse_abbr: w.warehouseAbbr,
      external_warehouse_id: w.skuID,
      stock: w.qty,
      dropship: w.dropship,
      returnable: w.returnable,
      full_case_only: w.fullCaseOnly,
      closeout: w.closeout,
    })),
  }));

  // ✅ PRODUCT IMAGES
  const images = [
    first.colorFrontImage,
    first.colorSideImage,
    first.colorBackImage,
  ]
    .filter(Boolean)
    .map((img) => BASE_IMAGE_URL + img);

  return {
    product,
    categories,
    sizes,
    variants,
    images,
  };
};

module.exports = { mapSSProduct };