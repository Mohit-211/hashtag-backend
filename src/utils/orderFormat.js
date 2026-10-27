// Formatting helpers shared by the order and payment listings
// (order.service.js and checkout.service.js).

const settings = require("../config/settings");

// customization_config and pricing_snapshot can come back as JSON strings.
// A value that doesn't parse is returned as null.
const parseJson = (value) => {
  if (!value || typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

// Artwork uploaded through customization_config.customization[].logo_image
const getCustomizationArtwork = (customization) => {
  if (!customization?.customization?.length) {
    return null;
  }

  const artwork = customization.customization.find((item) => item?.logo_image);

  return artwork?.logo_image || null;
};

// Upload paths are stored relative ("/images/x.png"); absolute URLs are left as they are.
const toFullImageUrl = (image) => {
  if (!image) {
    return null;
  }

  if (typeof image === "string" && /^https?:\/\//i.test(image)) {
    return image;
  }

  return `${settings.get("IMAGE_BASE_URL")}${image}`;
};

// Product image for an order item: the variant's primary image, any variant image,
// then the product's primary attachment, then any product attachment.
const getItemImage = (item) =>
  item?.variant?.images?.find((img) => img?.is_primary && img?.file_uri)?.file_uri ||
  item?.variant?.images?.find((img) => img?.file_uri)?.file_uri ||
  item?.product?.attachments?.find((img) => img?.is_primary && img?.file_uri)?.file_uri ||
  item?.product?.attachments?.find((img) => img?.file_uri)?.file_uri ||
  null;

const isManualItem = (item, customization, pricingSnapshot) =>
  item?.supplier === "MANUAL" ||
  item?.variant?.supplier === "MANUAL" ||
  customization?.type === "MANUAL" ||
  pricingSnapshot?.supplier === "MANUAL";

// Per-item price breakdown. MANUAL and supplier products store different snapshot shapes.
const buildPricingBreakdown = (pricingSnapshot, isManual) => {
  if (!pricingSnapshot) {
    return null;
  }

  if (isManual) {
    return {
      actual_product_price: Number(pricingSnapshot?.product_price?.base_price || 0),

      supplier_markup: 0,

      final_product_price: Number(pricingSnapshot?.product_price?.final_product_price || 0),

      product_total: Number(
        pricingSnapshot?.totals?.product_total ||
          pricingSnapshot?.product_price?.total ||
          0,
      ),

      customization_price: Number(
        pricingSnapshot?.totals?.customization_total ||
          pricingSnapshot?.customization?.total ||
          0,
      ),

      addon_price: Number(
        pricingSnapshot?.totals?.addon_total || pricingSnapshot?.addon_total || 0,
      ),

      final_price_per_item: Number(pricingSnapshot?.final_price_per_item || 0),

      final_total: Number(
        pricingSnapshot?.total_price || pricingSnapshot?.totals?.grand_total || 0,
      ),

      customization: pricingSnapshot?.customization || null,

      addons: pricingSnapshot?.addons || [],

      pricing_table: [],
    };
  }

  return {
    actual_product_price: pricingSnapshot?.product_price?.actual_price,

    supplier_markup: pricingSnapshot?.product_price?.supplier_markup,

    final_product_price: pricingSnapshot?.product_price?.final_product_price,

    customization_price: pricingSnapshot?.customization_price?.total_customization_price,

    setup_fee: pricingSnapshot?.customization_price?.setup_fee,

    final_price_per_item: pricingSnapshot?.final_price_per_item,

    final_total: pricingSnapshot?.total_price,

    pricing_table: pricingSnapshot?.pricing_table || [],
  };
};

// Order-level totals block.
const buildOrderTotals = (order) => ({
  subtotal: Number(order.subtotal_amount || 0),

  tax: Number(order.tax_amount || 0),

  shipping: Number(order.shipping_amount || 0),

  total: Number(order.total_amount || 0),
});

const sumQuantity = (items) =>
  (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

module.exports = {
  parseJson,
  getCustomizationArtwork,
  toFullImageUrl,
  getItemImage,
  isManualItem,
  buildPricingBreakdown,
  buildOrderTotals,
  sumQuantity,
};
