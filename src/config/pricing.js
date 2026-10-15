const { PricingMarkup } = require("../models");

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

  // 66.67% only when the supplier has no markup row; a markup of 0 is a real value.
  const markup = Number(pricing?.markup_percent);
  return pricing && pricing.markup_percent !== null && Number.isFinite(markup) ? markup : 66.67;
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
