// Which print methods a product can be ordered with, from its categories (audit F04, F05 and
// DEC-32). The website decides the same way (hashtag-next src/lib/productFamily.ts, and
// Productcustomizationpage.tsx from grandCategoryTitle to decorationKind):
// - the grand category "Apparel & Uniforms" means clothing: embroidery, DTF, screen print, DTG;
// - a parent category with "drinkware" in its title means drinkware: Color Imprint or Laser
//   Engraving, whatever the supplier (F04);
// - a parent category with "bag" in its title means a bag: embroidery, DTF or screen print, on
//   the front only (decided 26 Nov 2026; on the catalog of that day only "Bags", id 139, under
//   Promo Products, with its subcategories Bags, Tote Bags and Duffel Bags);
// - every other product (pre-made and other promo products) takes no print method.
//
// The website looks only at the first grand and the first parent category it finds, so its answer
// can depend on the order the categories come in. Here a product filed under several of these takes
// the methods of each, so whatever the website offers is accepted in any order. On the catalog of
// 24 Nov 2026 the two differ on two products, both ones the website offers no printing for: the 50L
// Utility Duffel Bag (also under Workwear) and the Campfire Kit (also under Drinkware).
//
// It also gives the garments the shop can show a clothing product as (garmentsFor, audit F08), from
// its parent categories' titles, the website's garmentType rule; buildPricingSnapshot.js lists the
// print locations of each.
//
// `categories`: product categories with their `parent_categories` and those parents'
// `grand_categories`, as getProductCategories and the product pages load them (model instances or
// plain objects).

const APPAREL_PRINT_METHODS = ["EMBROIDERY", "DTF", "SCREEN_PRINT", "DTG"];
const DRINKWARE_PRINT_METHODS = ["COLOR_IMPRINT", "LASER_ENGRAVING"];
const BAG_PRINT_METHODS = ["EMBROIDERY", "DTF", "SCREEN_PRINT"];

// Compared like the website's isGrandCategory: case and spacing don't matter.
const normalizeTitle = (title) => String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const parentCategoriesOf = (categories) =>
  (Array.isArray(categories) ? categories : []).flatMap((category) => category?.parent_categories || []);

const isApparelProduct = (categories) =>
  parentCategoriesOf(categories)
    .flatMap((parent) => parent?.grand_categories || [])
    .some((grand) => normalizeTitle(grand?.title) === "apparel & uniforms");

const isDrinkwareProduct = (categories) =>
  parentCategoriesOf(categories).some((parent) => normalizeTitle(parent?.title).includes("drinkware"));

const isBagProduct = (categories) =>
  parentCategoriesOf(categories).some((parent) => normalizeTitle(parent?.title).includes("bag"));

// Each method once: a bag that is also clothing (the 50L Utility Duffel Bag, under Workwear too)
// takes the four clothing methods.
const printMethodsFor = (categories) => [
  ...new Set([
    ...(isApparelProduct(categories) ? APPAREL_PRINT_METHODS : []),
    ...(isBagProduct(categories) ? BAG_PRINT_METHODS : []),
    ...(isDrinkwareProduct(categories) ? DRINKWARE_PRINT_METHODS : []),
  ]),
];

// The garment the shop shows a clothing product as, from a parent category's title (audit F08):
// the website's own rule, word for word (Productcustomizationpage.tsx, garmentType). Every other
// title, clothing or not (outerwear, workwear, patches, bags), means a T-shirt.
const garmentOfParent = (title) => {
  const parent = String(title ?? "").toLowerCase().trim();
  if (parent.includes("hoodie") || parent.includes("sweatshirt")) return "hoodie";
  if (parent.includes("hat") || parent.includes("cap") || parent.includes("headwear")) return "hat";
  if (parent.includes("polo")) return "polo";
  return "tshirt";
};

// The garments the shop can show a clothing product as. The website takes the garment from the
// first parent category it finds, so, as with the print methods, every parent category counts here
// and whatever the shop offers is accepted in any order. On the catalog of 24 Nov 2026 these are
// exactly the garments the shop can show, for every product; 92 S&S products filed under Workwear
// and under Polos or Sweatshirt & Fleece are shown as a T-shirt, a polo or a hoodie, depending on
// that order.
const garmentsFor = (categories) => [
  ...new Set(parentCategoriesOf(categories).map((parent) => garmentOfParent(parent?.title))),
];

module.exports = {
  APPAREL_PRINT_METHODS,
  DRINKWARE_PRINT_METHODS,
  BAG_PRINT_METHODS,
  isApparelProduct,
  isDrinkwareProduct,
  isBagProduct,
  printMethodsFor,
  garmentOfParent,
  garmentsFor,
};
