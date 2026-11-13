// Colours and sizes for product cards in the shop's lists (GET product, GET
// industry/use-case/products): one entry per colour with its front picture, and the sizes as one
// short text such as "XS - 3XL". Pure functions; product.service.js loads the pictures.

// ---------------------------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------------------------

const LETTER_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL", "9XL", "10XL"];

// Other spellings suppliers and admins use for the same sizes.
const LETTER_ALIASES = {
  "3XS": "XXXS",
  "2XS": "XXS",
  XXL: "2XL",
  XXXL: "3XL",
  XXXXL: "4XL",
  XXXXXL: "5XL",
  "2X": "2XL",
  "3X": "3XL",
  "4X": "4XL",
  "5X": "5XL",
  "6X": "6XL",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "X-SMALL": "XS",
  "EXTRA SMALL": "XS",
  "XX-SMALL": "XXS",
  "X-LARGE": "XL",
  "EXTRA LARGE": "XL",
  "XX-LARGE": "2XL",
  "2X-LARGE": "2XL",
  "XXX-LARGE": "3XL",
  "3X-LARGE": "3XL",
};

const ONE_SIZE = new Set(["OSFA", "OSFM", "OS", "ONE SIZE", "ONE SIZE FITS ALL", "ONE SIZE FITS MOST", "ADJUSTABLE"]);

// Kinds of size, in the order the range lists them: "XS - 4XL, LT - 4XLT".
const FAMILIES = ["regular", "tall", "long", "short", "youth", "toddler", "infant", "one", "measure", "other"];

const letterRank = (token) => {
  const index = LETTER_SIZES.indexOf(LETTER_ALIASES[token] || token);
  return index === -1 ? null : index;
};

// "1 1/2" -> 1.5, "3/4" -> 0.75, then every number in the text: `4" × 6"` -> [4, 6].
const numbersIn = (text) =>
  (text
    .replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, whole, top, bottom) => String(Number(whole) + top / bottom))
    .replace(/(\d+)\/(\d+)/g, (_, top, bottom) => String(top / bottom))
    .match(/\d+(\.\d+)?/g) || []
  ).map(Number);

// The kind of a size and where it sorts within that kind.
const parseSize = (name) => {
  const key = name.toUpperCase().replace(/\s+/g, " ");

  if (ONE_SIZE.has(key)) return { family: "one", rank: [0] };

  const letter = letterRank(key);
  if (letter !== null) return { family: "regular", rank: [letter] };

  // S/M, L/XL, 2/3XL: sorts just after its first size.
  const halves = key.split("/");
  if (halves.length === 2) {
    const second = letterRank(halves[1]);
    const suffix = halves[1].replace(/^\d+/, "");
    const first = letterRank(halves[0]) ?? letterRank(`${halves[0]}${suffix}`);
    if (first !== null && second !== null) return { family: "regular", rank: [first + 0.5] };
  }

  // Tall (LT, XLT), regular length (SR, 2XLR), short (MS, XLS).
  const suffixFamily = { T: "tall", R: "long", S: "short" }[key.slice(-1)];
  const base = letterRank(key.slice(0, -1));
  if (suffixFamily && base !== null) return { family: suffixFamily, rank: [base] };

  const youth = key.match(/^Y(?:OUTH )?(.+)$/);
  if (youth && letterRank(youth[1]) !== null) return { family: "youth", rank: [letterRank(youth[1])] };

  const toddler = key.match(/^(\d+)T$/);
  if (toddler) return { family: "toddler", rank: [Number(toddler[1])] };

  if (key === "NB") return { family: "infant", rank: [0] };
  const infant = key.match(/^(\d+)(?:-(\d+))?\s?M(?:O|OS|ONTHS)?$/);
  if (infant) return { family: "infant", rank: [Number(infant[1])] };

  // Waist and inseam (3032), inches (1.5", 4" × 6"), ounces, pages: by their numbers.
  const numbers = numbersIn(key);
  if (numbers.length) return { family: "measure", rank: numbers };

  return { family: "other", rank: [] };
};

const compareRanks = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? -1) - (b[i] ?? -1);
    if (difference) return difference;
  }
  return 0;
};

// Sorts sizes the way a shopper reads them. Sizes nothing knows how to order ("Economy",
// "Premium") keep the order they were given in, which callers make the admin's order.
const compareSizes = (a, b) => {
  const left = parseSize(String(a ?? "").trim());
  const right = parseSize(String(b ?? "").trim());
  return FAMILIES.indexOf(left.family) - FAMILIES.indexOf(right.family) || compareRanks(left.rank, right.rank);
};

// The sizes as one text: "XS - 3XL", "LT - 4XLT", "XS - 4XL, LT - 4XLT", "OSFA", `1.5" - 4"`.
// Unordered words are listed: "Economy, Premium". null when there are no sizes.
const sizeRange = (sizes) => {
  const unique = new Map();

  for (const size of sizes) {
    const name = String(size ?? "").trim();
    const key = name.toUpperCase();
    if (name && !unique.has(key)) unique.set(key, { name, order: unique.size, ...parseSize(name) });
  }

  if (!unique.size) return null;

  const families = new Map();
  for (const size of unique.values()) {
    if (!families.has(size.family)) families.set(size.family, []);
    families.get(size.family).push(size);
  }

  return FAMILIES.filter((family) => families.has(family))
    .map((family) => {
      const list = families.get(family).sort((a, b) => compareRanks(a.rank, b.rank) || a.order - b.order);
      if (family === "other") return list.map((size) => size.name).join(", ");
      return list.length === 1 ? list[0].name : `${list[0].name} - ${list[list.length - 1].name}`;
    })
    .join(", ");
};

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

// Names suppliers use when a product has no colour to choose (SAGE: "Various").
const NO_COLOUR = new Set(["various", "assorted", "n/a", "na", "none", "default", "as shown"]);

const colourKey = (colour) => String(colour ?? "").trim().toLowerCase();

// The product's colours in the supplier's order (by variant id), each with its variants
// smallest size first: the first of them that has a picture stands for the colour.
const groupColours = (variants) => {
  const colours = new Map();

  for (const variant of [...variants].sort((a, b) => Number(a.id) - Number(b.id))) {
    const key = colourKey(variant.color);
    if (!key || NO_COLOUR.has(key)) continue;

    if (!colours.has(key)) {
      colours.set(key, {
        color_name: String(variant.color).trim(),
        color_code: variant.color_code || null,
        variants: [],
      });
    }

    colours.get(key).variants.push(variant);
  }

  for (const colour of colours.values()) {
    colour.variants.sort((a, b) => compareSizes(a.size, b.size) || Number(a.id) - Number(b.id));
    colour.variant_ids = colour.variants.map((variant) => Number(variant.id));
    delete colour.variants;
  }

  return [...colours.values()];
};

// ---------------------------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------------------------

// SanMar and S&S save the front picture first ("…-variant-0.jpg"); OttoCap and the admin mark
// the main one is_primary; otherwise the lowest number, then the oldest.
const imageNumber = (image) => Number(image.file_name?.match(/variant-(\d+)/)?.[1] ?? 999);
const isFront = (image) => /-variant-0\.|front/i.test(image.file_name || "");

const pickFrontImage = (images = []) =>
  [...images].sort(
    (a, b) =>
      Number(isFront(b)) - Number(isFront(a)) ||
      Number(!!b.is_primary) - Number(!!a.is_primary) ||
      imageNumber(a) - imageNumber(b) ||
      Number(a.id) - Number(b.id),
  )[0] || null;

module.exports = { sizeRange, compareSizes, groupColours, pickFrontImage };
