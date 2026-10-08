const { PricingMarkup } = require("../models");

const DEFAULT_MARKUP = 66.67;

const MARKUP_BY_SUPPLIER = {
  SS: 66.67,
  SANMAR: 66.67,
  OTTOCAP: 66.67,
  SAGE: 49.25,
};

const getMarkupPercent = async (supplier) => {
  // ✅ Manual products don't use markup
  if (supplier === "MANUAL") {
    return 0;
  }
  const pricing = await PricingMarkup.findOne({
    where: {
      supplier,
      is_active: true,
    },
  });

  return pricing?.markup_percent || 66.67;
};

const calculatePricing = async (basePrice, supplier, markupPercent = null) => {
  const price = Number(basePrice) || 0;

  // Manual products: entered price is the selling price
  if (supplier === "MANUAL") {
    return {
      base_price: +price.toFixed(2),
      markup_percent: 0,
      markup_amount: 0,
      final_price: +price.toFixed(2),
    };
  }

  // Existing behaviour
  if (markupPercent === null) {
    markupPercent = await getMarkupPercent(supplier);
  }

  const markupAmount = price * (markupPercent / 100);

  const finalPrice = price + markupAmount;

  return {
    base_price: +price.toFixed(2),
    markup_percent: +markupPercent,
    markup_amount: +markupAmount.toFixed(2),
    final_price: +finalPrice.toFixed(2),
  };
};

module.exports = {
  calculatePricing,
  getMarkupPercent,
};
