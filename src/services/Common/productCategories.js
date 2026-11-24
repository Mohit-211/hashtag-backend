// A product's categories with their parent and grand categories: what decides which print methods
// it takes (utils/productFamily.js). Used by the cart and by POST order.

const { Product, ProductCategory, ParentCategory, GrandCategory } = require("../../models");

const getProductCategories = async (productId, { transaction } = {}) => {
  return await ProductCategory.findAll({
    attributes: ["id", "title", "supplier"],

    include: [
      {
        model: Product,
        as: "products",
        where: {
          id: productId,
        },
        attributes: [],
        through: {
          attributes: [],
        },
      },

      {
        model: ParentCategory,
        as: "parent_categories",
        attributes: ["id", "title"],
        through: {
          attributes: [],
        },
        required: false,

        include: [
          {
            model: GrandCategory,
            as: "grand_categories",
            attributes: ["id", "title"],
            through: {
              attributes: [],
            },
            required: false,
          },
        ],
      },
    ],

    transaction,
  });
};

module.exports = { getProductCategories };
