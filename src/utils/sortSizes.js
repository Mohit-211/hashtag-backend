/** @format */

const SIZE_ORDER = [
  "XXXS",
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
];

// Other spellings suppliers use for the same sizes.
const SIZE_ALIASES = {
  "3XS": "XXXS",
  "2XS": "XXS",
  XXL: "2XL",
  XXXL: "3XL",
  XXXXL: "4XL",
  XXXXXL: "5XL",
};

const sizeKey = (item) => {
  const size = String(item.name || item.size || "").trim().toUpperCase();
  return SIZE_ALIASES[size] || size;
};

// Returns a sorted copy; the input array is left as it was.
const sortSizes = (sizes = []) => {
  return [...sizes].sort((a, b) => {
    const sizeA = sizeKey(a);

    const sizeB = sizeKey(b);

    const indexA = SIZE_ORDER.indexOf(sizeA);

    const indexB = SIZE_ORDER.indexOf(sizeB);

    // ✅ UNKNOWN SIZES GO LAST
    if (indexA === -1 && indexB === -1) {
      return sizeA.localeCompare(sizeB);
    }

    if (indexA === -1) return 1;

    if (indexB === -1) return -1;

    return indexA - indexB;
  });
};

module.exports = sortSizes;