const mapSageToDB = (product) => {
  return {
    style_id: product.prodEId,

    raw: product,

    product: {
      name: product.prName,
      description: product.description,
      brand: product.supplier?.coName || "SAGE",

      categories: [product.category],

      product_images: (product.pics || []).map((p) => p.url),
    },

    variants: (product.skus || []).map((sku) => {
      const attributes = {};
      sku.attributes?.forEach((a) => {
        attributes[a.name] = a.value;
      });

      return {
        sku: `${product.prodEId}-${Math.random()}`,

        variant_name: Object.values(attributes).join(" - "),

        size: { name: attributes.Size || null },
        color: { name: attributes.Color || null, hex: null },

        pricing: {
          retail: product.prc?.[0] || 0,
        },

        stock: sku.onHand || 0,

        images: (product.pics || []).map((p) => p.url),

        warehouses: [
          {
            code: "SAGE",
            stock: sku.onHand || 0,
          },
        ],
      };
    }),
  };
};

module.exports={
    mapSageToDB
}