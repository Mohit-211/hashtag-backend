/** @format */

const sequelize = require("../../config/central.db");
const { calculatePricing } = require("../../config/pricing");
const {
  createShipmentForOrder,
  cancelShipstationShipment,
} = require("../../config/shipstation");
const {
  Order,
  ProductVariant,
  OrderItem,
  Address,
  Cart,
  VariantAttachment,
  Product,
  Size,
  User,
  Profile,
  ProductAttachment,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const { Op } = require("sequelize");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const { NOT_SHIPPED_MESSAGE } = require("../../config/shippingRegions");
const { canShipTo } = require("./address.service");
const {
  parseJson,
  getCustomizationArtwork,
  toFullImageUrl,
  getItemImage,
  isManualItem,
  buildPricingBreakdown,
  buildOrderTotals,
  sumQuantity,
} = require("../../utils/orderFormat");
const { paymentStatusTypes } = require("../../config/types");

const createOrder = async (body) => {
  const t = await sequelize.transaction();

  try {
    const {
      user,
      address_id,

      selected_service_code,
      selected_carrier_code,

      shipping_amount,
    } = body;

    /*
     |--------------------------------------------------------------------------
     | ADDRESS
     |--------------------------------------------------------------------------
     */

    const address = await Address.findOne({
      where: {
        id: address_id,
        user_id: user.id,
      },

      transaction: t,
    });

    if (!address) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid address");
    }

    if (!(await canShipTo(address))) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${NOT_SHIPPED_MESSAGE} Please choose another address.`);
    }

    /*
     |--------------------------------------------------------------------------
     | CART
     |--------------------------------------------------------------------------
     */

    const cartItems = await Cart.findAll({
      where: {
        user_id: user.id,
        is_active: true,
      },

      include: [
        {
          model: ProductVariant,

          as: "variant",

          required: true,
        },
      ],

      transaction: t,

      lock: t.LOCK.UPDATE,
    });

    if (!cartItems.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cart is empty");
    }

    /*
     |--------------------------------------------------------------------------
     | SUBTOTAL
     |--------------------------------------------------------------------------
     */

    let subtotal = 0;

    for (let item of cartItems) {
      const variant = item.variant;

      /*
       |--------------------------------------------------------------------------
       | STOCK
       |--------------------------------------------------------------------------
       */

      if (variant.track_inventory && item.quantity > variant.stock) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for ${variant.sku}`);
      }

      /*
       |--------------------------------------------------------------------------
       | PARSE SNAPSHOT
       |--------------------------------------------------------------------------
       */

      let pricingSnapshot = item.pricing_snapshot;

      if (pricingSnapshot && typeof pricingSnapshot === "string") {
        pricingSnapshot = JSON.parse(pricingSnapshot);
      }

      /*
       |--------------------------------------------------------------------------
       | USE SAVED SNAPSHOT
       |--------------------------------------------------------------------------
       */

      let itemTotal = 0;

      if (pricingSnapshot) {
        itemTotal = Number(pricingSnapshot.total_price || 0);
      } else {
        /*
       |--------------------------------------------------------------------------
       | FALLBACK NORMAL PRODUCT
       |--------------------------------------------------------------------------
       */
        const effectivePrice =
          variant.case_price && Number(variant.case_price) > 0
            ? variant.case_price
            : variant.price;

        const pricing = await calculatePricing(
          effectivePrice,
          variant.supplier,
        );

        itemTotal = pricing.final_price * item.quantity;
      }

      subtotal += itemTotal;
    }

    const quotedShippingAmount = Number(shipping_amount || 0);

    const TAX_RATE = 8.25;

    const taxAmount = Number(((subtotal * TAX_RATE) / 100).toFixed(2));

    const finalTotal = subtotal + taxAmount + quotedShippingAmount;

    const order = await Order.create(
      {
        order_number: `ORD-${Date.now()}`,

        user_id: user.id,

        address_id,

        currency: "USD",

        service_code: selected_service_code,

        carrier_code: selected_carrier_code,

        shipping_amount: quotedShippingAmount,

        quoted_shipping_amount: quotedShippingAmount,

        actual_shipping_cost: 0,

        shipping_profit: 0,

        subtotal_amount: Number(subtotal.toFixed(2)),

        tax_rate: TAX_RATE,

        tax_amount: taxAmount,

        total_amount: Number(finalTotal.toFixed(2)),

        status: "PENDING_PAYMENT",

        payment_status: "PENDING",

        shipment_status: "PENDING",
      },
      {
        transaction: t,
      },
    );

    /*
     |--------------------------------------------------------------------------
     | ORDER ITEMS
     |--------------------------------------------------------------------------
     */

    for (let item of cartItems) {
      const variant = item.variant;

      /*
       |--------------------------------------------------------------------------
       | PARSE JSON
       |--------------------------------------------------------------------------
       */

      let pricingSnapshot = item.pricing_snapshot;

      let customizationConfig = item.customization_config;

      if (pricingSnapshot && typeof pricingSnapshot === "string") {
        pricingSnapshot = JSON.parse(pricingSnapshot);
      }

      if (customizationConfig && typeof customizationConfig === "string") {
        customizationConfig = JSON.parse(customizationConfig);
      }

      /*
       |--------------------------------------------------------------------------
       | USE SAVED CART PRICES
       |--------------------------------------------------------------------------
       */

      let itemPrice = 0;

      let itemCostPrice = 0;

      let itemTotal = 0;

      if (pricingSnapshot) {
        itemPrice = Number(pricingSnapshot.final_price_per_item || 0);

        itemCostPrice = Number(
          pricingSnapshot?.product_price?.final_product_price || 0,
        );

        itemTotal = Number(pricingSnapshot.total_price || 0);
      } else {
        /*
       |--------------------------------------------------------------------------
       | FALLBACK NORMAL PRODUCT
       |--------------------------------------------------------------------------
       */
        const effectivePrice =
          variant.case_price && Number(variant.case_price) > 0
            ? variant.case_price
            : variant.price;

        const pricing = await calculatePricing(
          effectivePrice,
          variant.supplier,
        );

        itemPrice = pricing.final_price;

        itemCostPrice = pricing.base_price;

        itemTotal = pricing.final_price * item.quantity;
      }

      /*
       |--------------------------------------------------------------------------
       | CREATE ORDER ITEM
       |--------------------------------------------------------------------------
       */

      await OrderItem.create(
        {
          order_id: order.id,

          product_id: item.product_id,

          variant_id: item.variant_id,

          sku: variant.sku,

          name: variant.sku,

          quantity: item.quantity,

          /*
           |--------------------------------------------------------------------------
           | PRICE
           |--------------------------------------------------------------------------
           */

          price: Number(itemPrice.toFixed(2)),

          cost_price: Number(itemCostPrice.toFixed(2)),

          total_price: Number(itemTotal.toFixed(2)),

          /*
           |--------------------------------------------------------------------------
           | CUSTOMIZATION
           |--------------------------------------------------------------------------
           */

          customization_config: customizationConfig,

          pricing_snapshot: pricingSnapshot,

          logo_image: item.logo_image,

          /*
           |--------------------------------------------------------------------------
           | META
           |--------------------------------------------------------------------------
           */

          supplier: variant.supplier || "SS",

          shipment_status: "PENDING",
        },
        {
          transaction: t,
        },
      );
    }

    /*
     |--------------------------------------------------------------------------
     | COMMIT DB FIRST
     |--------------------------------------------------------------------------
     */

    await t.commit();

    console.log(`🧾 Pending Order Created: ${order.order_number}`);
    /*
|--------------------------------------------------------------------------
| CREATE SHIPMENT IN DASHBOARD ONLY
|--------------------------------------------------------------------------
*/

    try {
      await createShipmentForOrder(order);

      await order.update({
        shipment_status: "PENDING",
      });

      console.log(`✅ SHIPMENT CREATED: ${order.order_number}`);
    } catch (shipmentError) {
      console.error("🚨 Shipment Error:", shipmentError.message);

      await order.update({
        shipment_status: "PENDING",

        shipment_error: shipmentError.message.substring(0, 500),
      });
    }

    /*
     |--------------------------------------------------------------------------
     | RETURN
     |--------------------------------------------------------------------------
     */

    const updatedOrder = await Order.findByPk(order.id);

    return updatedOrder;
  } catch (err) {
    await t.rollback();

    console.error("❌ ORDER FLOW FAILED:", err.message);

    throw new ApiError(err.statusCode || 500, err.message);
  }
};

const getOrders = async ({ user, page = 1, limit = 10 }) => {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;

  const offset = (page - 1) * limit;

  const { rows, count } = await Order.findAndCountAll({
    where: {
      user_id: user.id,
      payment_status: {
        [Op.ne]: paymentStatusTypes.PENDING,
      },
    },

    include: [
      {
        model: OrderItem,
        as: "items",

        include: [
          // ---------------------------------------------------------------
          // PRODUCT
          // ---------------------------------------------------------------
          {
            model: Product,
            as: "product",
            // Deleted products still belong in order history.
            paranoid: false,
            attributes: ["id", "name"],

            include: [
              {
                model: ProductAttachment,
                as: "attachments",
                required: false,
              },
            ],
          },

          // ---------------------------------------------------------------
          // VARIANT
          // ---------------------------------------------------------------
          {
            model: ProductVariant,
            as: "variant",
            // Deleted products still belong in order history.
            paranoid: false,
            attributes: ["id", "sku"],

            include: [
              {
                model: VariantAttachment,
                as: "images",
                attributes: ["file_uri", "is_primary"],
                required: false,
              },
            ],
          },
        ],
      },
    ],

    limit,
    offset,

    order: [["created_at", "DESC"]],

    distinct: true,
  });

  // -----------------------------------------------------------------------
  // FORMAT ORDERS
  // -----------------------------------------------------------------------

  const formatted = rows.map((order) => {
    const data = order.toJSON();

    // The preview uses the first item.
    const firstItem = data.items?.[0];

    const customization = parseJson(firstItem?.customization_config);

    const pricingSnapshot = parseJson(firstItem?.pricing_snapshot);

    // OrderItem.logo_image first, then artwork uploaded through customization_config.
    const customizedImage =
      firstItem?.logo_image || getCustomizationArtwork(customization);

    return {
      id: data.id,

      order_number: data.order_number,

      total_amount: data.total_amount,

      subtotal_amount: data.subtotal_amount,

      shipping_amount: data.shipping_amount,

      tax_rate: Number(data.tax_rate || 0),

      tax_amount: Number(data.tax_amount || 0),

      pricing_breakdown: buildOrderTotals(data),

      payment_status: data.payment_status,

      shipment_status: data.shipment_status,

      tracking_number: data.tracking_number,

      tracking_url: data.tracking_url,

      created_at: data.created_at,

      preview: {
        product_name: decodeHtmlEntities(firstItem?.product?.name || null),

        original_image: getItemImage(firstItem),

        customized_image: toFullImageUrl(customizedImage),

        total_items: sumQuantity(data.items),

        customization_type: customization?.type || null,

        print_method: customization?.print_method || null,

        custom_text: customization?.custom_text || null,

        customization_summary: (pricingSnapshot?.pricing_table || []).map(
          (row) => ({
            ...row,

            customization_type: customization?.type || null,

            print_method: customization?.print_method || null,

            custom_text: customization?.custom_text || null,
          }),
        ),
      },

      items: (data.items || []).map((item) => {
        const variant = item.variant || {};

        const product = item.product || {};

        const itemCustomization = parseJson(item.customization_config);

        return {
          product_id: product.id,

          product_name: decodeHtmlEntities(product.name),

          variant_id: variant.id,

          sku: variant.sku,

          original_image: getItemImage(item),

          customized_image: toFullImageUrl(
            item.logo_image || getCustomizationArtwork(itemCustomization),
          ),

          price: Number(item.price || 0),

          quantity: Number(item.quantity || 0),

          total: Number(item.total_price || 0),

          customization_config: itemCustomization,

          pricing_snapshot: parseJson(item.pricing_snapshot),
        };
      }),
    };
  });

  return {
    data: formatted,

    pagination: {
      total: count,

      page,

      limit,

      totalPages: Math.ceil(count / limit),
    },
  };
};

const getOrderById = async (body, order_id) => {
  try {
    const { user } = body;

    const order = await Order.findOne({
      where: {
        id: order_id,
        user_id: user.id,
      },

      include: [
        {
          model: OrderItem,
          as: "items",

          include: [
            {
              model: Product,
              as: "product",
              // Deleted products still belong in order history.
              paranoid: false,

              attributes: ["id", "name"],

              include: [
                {
                  model: ProductAttachment,
                  as: "attachments",
                  required: false,
                },
              ],
            },

            {
              model: ProductVariant,
              as: "variant",
              // Deleted products still belong in order history.
              paranoid: false,

              attributes: ["id", "sku", "color"],

              include: [
                {
                  model: VariantAttachment,
                  as: "images",

                  attributes: ["file_uri", "is_primary"],

                  required: false,
                },

                {
                  model: Size,
                  as: "size_details",

                  attributes: ["name"],

                  required: false,
                },
              ],
            },
          ],
        },

        {
          model: Address,
          as: "address",

          required: false,
        },
      ],
    });

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    const data = order.toJSON();

    return {
      id: data.id,

      order_number: data.order_number,

      /*
      |--------------------------------------------------------------------------
      | AMOUNTS
      |--------------------------------------------------------------------------
      */

      subtotal_amount: data.subtotal_amount,

      shipping_amount: data.shipping_amount,

      total_amount: data.total_amount,

      currency: data.currency,

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      status: data.status,

      payment_status: data.payment_status,

      shipment_status: data.shipment_status,

      /*
      |--------------------------------------------------------------------------
      | SHIPPING
      |--------------------------------------------------------------------------
      */

      carrier: data.carrier,

      service_code: data.service_code,

      tracking_number: data.tracking_number,

      tracking_url: data.tracking_url,

      shipped_at: data.shipped_at,

      /*
      |--------------------------------------------------------------------------
      | ADDRESS
      |--------------------------------------------------------------------------
      */

      address: data.address
        ? {
            name: data.address.name,

            phone: data.address.phone,

            address_line1: data.address.address_line1,

            city: data.address.city,

            state: data.address.state,

            postal_code: data.address.postal_code,

            country: data.address.country,
          }
        : null,

      /*
      |--------------------------------------------------------------------------
      | ITEMS
      |--------------------------------------------------------------------------
      */

      items: data.items.map((i) => {
        const variant = i.variant || {};

        const product = i.product || {};

        const customization = parseJson(i.customization_config);

        const pricingSnapshot = parseJson(i.pricing_snapshot);

        return {
          product_id: product.id,

          product_name: decodeHtmlEntities(product.name),

          variant_id: variant.id,

          sku: variant.sku,

          color: variant.color,

          size: variant.size_details?.name || null,

          original_image: getItemImage(i),

          customized_image: toFullImageUrl(
            i.logo_image || getCustomizationArtwork(customization),
          ),

          price: Number(i.price),

          quantity: Number(i.quantity),

          total: Number(i.total_price),

          customization_config: customization,

          pricing_snapshot: pricingSnapshot,

          pricing_breakdown: buildPricingBreakdown(
            pricingSnapshot,
            isManualItem(i, customization, pricingSnapshot),
          ),
        };
      }),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const cancelOrder = async (body, order_id) => {
  const t = await sequelize.transaction();

  try {
    const { user } = body;

    // ==================================================
    // FIND ORDER
    // ==================================================

    const order = await Order.findOne({
      where: {
        id: order_id,
        user_id: user.id,
      },

      include: [
        {
          model: OrderItem,
          as: "items",
        },
      ],

      transaction: t,

      lock: t.LOCK.UPDATE,
    });

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // ==================================================
    // BLOCKED STATUSES
    // ==================================================

    const blockedStatuses = ["DELIVERED", "CANCELLED", "SHIPPED"];

    if (blockedStatuses.includes(order.status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Cannot cancel ${order.status} order`);
    }

    // ==================================================
    // RESTORE STOCK ONLY IF PAYMENT SUCCESS
    // ==================================================

    if (order.payment_status === "SUCCESS") {
      for (let item of order.items) {
        const variant = await ProductVariant.findByPk(item.variant_id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (variant?.track_inventory) {
          await variant.increment("stock", {
            by: item.quantity,
            transaction: t,
          });
        }
      }
    }

    // ==================================================
    // VOID SHIPSTATION LABEL
    // ==================================================

    let shipmentError = null;

    try {
      if (order.label_id) {
        await cancelShipstationShipment(order);

        shipmentError = "Shipment cancelled and label voided";

        console.log(`🚫 Label voided for ${order.order_number}`);
      }
    } catch (e) {
      shipmentError = e.message?.substring(0, 500);

      console.error("🚨 ShipStation Cancel Failed:", e.message);
    }

    // ==================================================
    // UPDATE ORDER
    // ==================================================

    await order.update(
      {
        status: "CANCELLED",

        shipment_status: "CANCELLED",

        shipment_error: shipmentError,

        is_active: false,
      },
      {
        transaction: t,
      },
    );

    // ==================================================
    // UPDATE PAYMENT
    // ==================================================

    await Payment.update(
      {
        payment_status:
          order.payment_status === "SUCCESS" ? "SUCCESS" : "REJECTED",
      },
      {
        where: {
          order_id: order.id,
        },

        transaction: t,
      },
    );

    // ==================================================
    // UPDATE ORDER ITEMS
    // ==================================================

    await OrderItem.update(
      {
        shipment_status: "CANCELLED",

        is_active: false,
      },
      {
        where: {
          order_id: order.id,
        },

        transaction: t,
      },
    );

    // ==================================================
    // COMMIT
    // ==================================================

    await t.commit();

    console.log(`✅ Order Cancelled: ${order.order_number}`);

    return {
      success: true,

      message: "Order cancelled successfully",
    };
  } catch (err) {
    await t.rollback();

    console.error("🚨 Cancel Order Error:", err.message);

    throw new ApiError(err.statusCode || 500, err.message);
  }
};

const getAdminOrders = async ({
  page = 1,
  limit = 10,
  search = "",
  status,
  payment_status,
}) => {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;

  const offset = (page - 1) * limit;

  /*
   * |--------------------------------------------------------------------------
   * | WHERE
   * |--------------------------------------------------------------------------
   */

  const where = {
    payment_status: "SUCCESS",
  };

  /*
   * |--------------------------------------------------------------------------
   * | FILTERS
   * |--------------------------------------------------------------------------
   */

  if (status) {
    where.status = status;
  }

  // Paid orders by default; "ALL" lists every payment status.
  if (payment_status === "ALL") {
    delete where.payment_status;
  } else if (payment_status) {
    where.payment_status = payment_status;
  }

  /*
   * |--------------------------------------------------------------------------
   * | SEARCH
   * |--------------------------------------------------------------------------
   */

  if (search) {
    where[Op.or] = [
      {
        order_number: {
          [Op.like]: `%${search}%`,
        },
      },

      {
        tracking_number: {
          [Op.like]: `%${search}%`,
        },
      },

      {
        "$user.email$": {
          [Op.like]: `%${search}%`,
        },
      },

      {
        "$user.user_profile.name$": {
          [Op.like]: `%${search}%`,
        },
      },

      {
        "$items.product.name$": {
          [Op.like]: `%${search}%`,
        },
      },
    ];
  }

  /*
   * |--------------------------------------------------------------------------
   * | GET ORDERS
   * |--------------------------------------------------------------------------
   */

  const include = [
    /*
     * ---------------------------------------------------------
     * USER
     * ---------------------------------------------------------
     */

    {
      model: User,
      as: "user",

      attributes: [
        "id",
        "email",
      ],

      required: false,

      include: [
        {
          model: Profile,
          as: "user_profile",

          attributes: [
            "name",
          ],

          required: false,
        },
      ],
    },

    /*
     * ---------------------------------------------------------
     * ORDER ITEMS
     * ---------------------------------------------------------
     */

    {
      model: OrderItem,
      as: "items",

      required: false,

      include: [
        /*
         * -----------------------------------------------------
         * PRODUCT
         * -----------------------------------------------------
         *
         * IMPORTANT:
         *
         * Product attachments are included here because
         * MANUAL products may not have VariantAttachment.
         * -----------------------------------------------------
         */

        {
          model: Product,
          as: "product",

          // Deleted products still belong in order history.
          paranoid: false,

          attributes: [
            "id",
            "name",
          ],

          include: [
            {
              model: ProductAttachment,
              as: "attachments",

              attributes: [
                "file_uri",
                "is_primary",
              ],

              required: false,
            },
          ],
        },

        /*
         * -----------------------------------------------------
         * VARIANT
         * -----------------------------------------------------
         */

        {
          model: ProductVariant,
          as: "variant",

          paranoid: false,

          attributes: [
            "id",
            "sku",
            "color",
          ],

          include: [
            /*
             * Variant images
             */

            {
              model: VariantAttachment,
              as: "images",

              attributes: [
                "file_uri",
                "is_primary",
              ],

              required: false,
            },

            /*
             * Size
             */

            {
              model: Size,
              as: "size_details",

              attributes: [
                "name",
              ],

              required: false,
            },
          ],
        },
      ],
    },
  ];

  // Pick the page of order ids first. Paging the joined query counted item rows, not
  // orders, so pages came back short and cut off some orders' items.
  const searchInclude = search
    ? [
        {
          model: User,
          as: "user",
          attributes: [],
          required: false,
          include: [{ model: Profile, as: "user_profile", attributes: [], required: false }],
        },
        {
          model: OrderItem,
          as: "items",
          attributes: [],
          required: false,
          include: [{ model: Product, as: "product", attributes: [], required: false, paranoid: false }],
        },
      ]
    : [];

  const count = await Order.count({
    where,
    include: searchInclude,
    distinct: true,
    col: "id",
  });

  const pageIds = await Order.findAll({
    where,
    include: searchInclude,
    attributes: ["id", "created_at"],
    group: ["Order.id", "Order.created_at"],
    order: [["created_at", "DESC"], ["id", "DESC"]],
    limit,
    offset,
    subQuery: false,
    raw: true,
  });

  const ids = pageIds.map((row) => row.id);

  const rows = ids.length
    ? await Order.findAll({
        where: { id: ids },
        include,
        order: [["created_at", "DESC"], ["id", "DESC"]],
      })
    : [];

  const formatted = rows.map((order) => {
    const data = order.toJSON();

    const firstItem = data.items?.[0];

    const customization = parseJson(firstItem?.customization_config);

    const pricingSnapshot = parseJson(firstItem?.pricing_snapshot);

    return {
      id: data.id,

      order_number: data.order_number,

      created_at: data.created_at,

      subtotal_amount: Number(data.subtotal_amount || 0),

      shipping_amount: Number(
        data.actual_shipping_cost || data.shipping_amount || 0,
      ),

      total_amount: Number(data.total_amount || 0),

      status: data.status,

      payment_status: data.payment_status,

      shipment_status: data.shipment_status,

      payment_method: data.payment_method,

      carrier: data.carrier,

      tracking_number: data.tracking_number,

      tracking_url: data.tracking_url,

      label_url: data.label_url,

      user: data.user
        ? {
            id: data.user.id,

            name: data.user?.user_profile?.name || null,

            email: data.user?.email || null,
          }
        : null,

      preview: {
        product_name: firstItem?.product?.name || null,

        // The first item that has an image. The first item may not have one.
        original_image: (data.items || []).map(getItemImage).find(Boolean) || null,

        customized_image: toFullImageUrl(
          firstItem?.logo_image || getCustomizationArtwork(customization),
        ),

        total_items: sumQuantity(data.items),

        customization_type:
          customization?.type ||
          (pricingSnapshot?.supplier === "MANUAL" ? "MANUAL" : null),

        print_method: customization?.print_method || null,

        custom_text: customization?.custom_text || null,

        // Supplier items keep their summary in pricing_table, MANUAL items in customization.items.
        customization_summary:
          pricingSnapshot?.pricing_table ||
          pricingSnapshot?.customization?.items ||
          [],
      },

      items: (data.items || []).map((i) => {
        const variant = i.variant || {};

        const product = i.product || {};

        const itemCustomization = parseJson(i.customization_config);

        const itemPricing = parseJson(i.pricing_snapshot);

        return {
          product_id: product.id,

          product_name: decodeHtmlEntities(product.name),

          variant_id: variant.id,

          sku: variant.sku,

          color: variant.color,

          size: variant.size_details?.name || null,

          original_image: getItemImage(i),

          customized_image: toFullImageUrl(
            i.logo_image || getCustomizationArtwork(itemCustomization),
          ),

          price: Number(i.price || 0),

          quantity: Number(i.quantity || 0),

          total: Number(i.total_price || 0),

          customization_config: itemCustomization,

          pricing_snapshot: itemPricing,

          pricing_breakdown: buildPricingBreakdown(
            itemPricing,
            isManualItem(i, itemCustomization, itemPricing),
          ),
        };
      }),
    };
  });

  /*
   * |--------------------------------------------------------------------------
   * | RESPONSE
   * |--------------------------------------------------------------------------
   */

  return {
    data: formatted,

    pagination: {
      total: count,

      page,

      limit,

      totalPages:
        Math.ceil(
          count / limit,
        ),
    },
  };
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,

  getAdminOrders,
};
