// Which print methods a product can be ordered with, from its categories (audit F04, F05 and
// DEC-32). The website decides the same way (hashtag-next src/lib/productFamily.ts, and
// Productcustomizationpage.tsx from grandCategoryTitle to decorationKind):
// - the grand category "Apparel & Uniforms" means clothing: embroidery, DTF, screen print, DTG;
// - a parent category with "drinkware" in its title means drinkware: Color Imprint or Laser
//   Engraving, whatever the supplier (F04);
// - every other product (pre-made and other promo products) takes no print method.
//
// The website looks only at the first grand and the first parent category it finds, so its answer
// can depend on the order the categories come in. Here a product filed under several of these takes
// the methods of each, so whatever the website offers is accepted in any order. On the catalog of
// 24 Nov 2026 the two differ on two products, both ones the website offers no printing for: the 50L
// Utility Duffel Bag (also under Workwear) and the Campfire Kit (also under Drinkware).
//
// `categories`: product categories with their `parent_categories` and those parents'
// `grand_categories`, as getProductCategories and the product pages load them (model instances or
// plain objects).

const APPAREL_PRINT_METHODS = ["EMBROIDERY", "DTF", "SCREEN_PRINT", "DTG"];
const DRINKWARE_PRINT_METHODS = ["COLOR_IMPRINT", "LASER_ENGRAVING"];

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

const printMethodsFor = (categories) => [
  ...(isApparelProduct(categories) ? APPAREL_PRINT_METHODS : []),
  ...(isDrinkwareProduct(categories) ? DRINKWARE_PRINT_METHODS : []),
];

module.exports = {
  APPAREL_PRINT_METHODS,
  DRINKWARE_PRINT_METHODS,
  isApparelProduct,
  isDrinkwareProduct,
  printMethodsFor,
};
