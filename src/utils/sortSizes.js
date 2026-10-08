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

const sortSizes = (sizes = []) => {
  return sizes.sort((a, b) => {
    const sizeA = String(a.name || a.size || "").toUpperCase();

    const sizeB = String(b.name || b.size || "").toUpperCase();

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