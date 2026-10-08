const he = require("he");

const decodeHtmlEntities = (text = "") => {
  if (!text || typeof text !== "string") {
    return text;
  }

  return he
    .decode(text)
    .replace(/[™®©]/g, "")
    // Remove trailing SKU/style codes (K864, W963, TW100, PC54, etc.)
    .replace(/[.,]?\s+[A-Z]{1,4}\d{2,6}$/i, "")
    .replace(/\s+/g, " ")
    .trim();
};

module.exports = decodeHtmlEntities;