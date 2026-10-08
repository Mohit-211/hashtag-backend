/** @format */

const sequelize = require("../../config/central.db");
const { calculatePricing } = require("../../config/pricing");
const {
  createShipmentForOrder,
  getShippingRates,
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

    console.log("🚀 START ORDER FLOW");

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
      throw new Error("Invalid address");
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
      throw new Error("Cart is empty");
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
        throw new Error(`Insufficient stock for ${variant.sku}`);
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

    throw new ApiError(500, err.message);
  }
};

const getCustomizationArtwork = (customization) => {
  if (!customization?.customization?.length) {
    return null;
  }

  const artwork = customization.customization.find((item) => item?.logo_image);

  return artwork?.logo_image || null;
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

    const firstItem = data.items?.[0];

    // ---------------------------------------------------------------------
    // ORIGINAL PRODUCT IMAGE
    //
    // Priority:
    // 1. Variant primary image
    // 2. First variant image
    // 3. Product attachment
    // 4. First product attachment
    // ---------------------------------------------------------------------

    const originalImage =
      firstItem?.variant?.images?.find(
        (img) => img?.is_primary && img?.file_uri,
      )?.file_uri ||
      firstItem?.variant?.images?.find(
        (img) => img?.file_uri,
      )?.file_uri ||
      firstItem?.product?.attachments?.find(
        (img) => img?.file_uri && img?.is_primary,
      )?.file_uri ||
      firstItem?.product?.attachments?.find(
        (img) => img?.file_uri,
      )?.file_uri ||
      null;

    // ---------------------------------------------------------------------
    // TOTAL QUANTITY
    // ---------------------------------------------------------------------

    const totalQuantity = (data.items || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    // ---------------------------------------------------------------------
    // CUSTOMIZATION
    // ---------------------------------------------------------------------

    let customization = firstItem?.customization_config;

    let pricingSnapshot = firstItem?.pricing_snapshot;

    if (customization && typeof customization === "string") {
      try {
        customization = JSON.parse(customization);
      } catch (error) {
        customization = null;
      }
    }

    if (pricingSnapshot && typeof pricingSnapshot === "string") {
      try {
        pricingSnapshot = JSON.parse(pricingSnapshot);
      } catch (error) {
        pricingSnapshot = null;
      }
    }

    // ---------------------------------------------------------------------
    // CUSTOMIZED IMAGE
    //
    // First check OrderItem.logo_image.
    // If not present, check customization_config.customization[].logo_image
    // ---------------------------------------------------------------------

    const customizedImage =
      firstItem?.logo_image ||
      getCustomizationArtwork(customization);

    return {
      id: data.id,

      order_number: data.order_number,

      total_amount: data.total_amount,

      subtotal_amount: data.subtotal_amount,

      shipping_amount: data.shipping_amount,

      tax_rate: Number(data.tax_rate || 0),

      tax_amount: Number(data.tax_amount || 0),

      pricing_breakdown: {
        subtotal: Number(data.subtotal_amount || 0),

        tax: Number(data.tax_amount || 0),

        shipping: Number(data.shipping_amount || 0),

        total: Number(data.total_amount || 0),
      },

      payment_status: data.payment_status,

      shipment_status: data.shipment_status,

      tracking_number: data.tracking_number,

      tracking_url: data.tracking_url,

      created_at: data.created_at,

      // -------------------------------------------------------------------
      // PREVIEW
      // -------------------------------------------------------------------

      preview: {
        product_name: decodeHtmlEntities(
          firstItem?.product?.name || null,
        ),

        original_image: originalImage,

        customized_image: customizedImage
          ? customizedImage.startsWith("http")
            ? customizedImage
            : `${process.env.IMAGE_BASE_URL}${customizedImage}`
          : null,

        total_items: totalQuantity,

        customization_type:
          customization?.type || null,

        print_method:
          customization?.print_method || null,

        custom_text:
          customization?.custom_text || null,

        customization_summary: (
          pricingSnapshot?.pricing_table || []
        ).map((row) => ({
          ...row,

          customization_type:
            customization?.type || null,

          print_method:
            customization?.print_method || null,

          custom_text:
            customization?.custom_text || null,
        })),
      },

      // -------------------------------------------------------------------
      // ITEMS
      // -------------------------------------------------------------------

      items: (data.items || []).map((item) => {
        const variant = item.variant || {};

        const product = item.product || {};

        // ---------------------------------------------------------------
        // ITEM ORIGINAL IMAGE
        // ---------------------------------------------------------------

        const itemOriginalImage =
          variant?.images?.find(
            (img) => img?.is_primary && img?.file_uri,
          )?.file_uri ||
          variant?.images?.find(
            (img) => img?.file_uri,
          )?.file_uri ||
          product?.attachments?.find(
            (img) => img?.file_uri && img?.is_primary,
          )?.file_uri ||
          product?.attachments?.find(
            (img) => img?.file_uri,
          )?.file_uri ||
          null;

        // ---------------------------------------------------------------
        // ITEM CUSTOMIZATION
        // ---------------------------------------------------------------

        let itemCustomization = item.customization_config;

        let itemPricing = item.pricing_snapshot;

        if (
          itemCustomization &&
          typeof itemCustomization === "string"
        ) {
          try {
            itemCustomization = JSON.parse(
              itemCustomization,
            );
          } catch (error) {
            itemCustomization = null;
          }
        }

        if (
          itemPricing &&
          typeof itemPricing === "string"
        ) {
          try {
            itemPricing = JSON.parse(itemPricing);
          } catch (error) {
            itemPricing = null;
          }
        }

        // ---------------------------------------------------------------
        // ITEM CUSTOMIZED IMAGE
        // ---------------------------------------------------------------

        const itemCustomizedImage =
          item.logo_image ||
          getCustomizationArtwork(itemCustomization);

        return {
          product_id: product.id,

          product_name: decodeHtmlEntities(
            product.name,
          ),

          variant_id: variant.id,

          sku: variant.sku,

          original_image: itemOriginalImage,

          customized_image: itemCustomizedImage
            ? itemCustomizedImage.startsWith("http")
              ? itemCustomizedImage
              : `${process.env.IMAGE_BASE_URL}${itemCustomizedImage}`
            : null,

          price: Number(item.price || 0),

          quantity: Number(item.quantity || 0),

          total: Number(item.total_price || 0),

          customization_config:
            itemCustomization,

          pricing_snapshot:
            itemPricing,
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
      throw new Error("Order not found");
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

        /*
        |--------------------------------------------------------------------------
        | ORIGINAL IMAGE
        |--------------------------------------------------------------------------
        */

        const originalImage =
          variant.images?.find(
            (img) => img?.is_primary && img?.file_uri,
          )?.file_uri ||
          variant.images?.find(
            (img) => img?.file_uri,
          )?.file_uri ||
          product.attachments?.find(
            (img) => img?.is_primary && img?.file_uri,
          )?.file_uri ||
          product.attachments?.find(
            (img) => img?.file_uri,
          )?.file_uri ||
          null;

        /*
        |--------------------------------------------------------------------------
        | PARSE JSON
        |--------------------------------------------------------------------------
        */

        let customization = i.customization_config;

        let pricingSnapshot = i.pricing_snapshot;

        if (
          customization &&
          typeof customization === "string"
        ) {
          customization = JSON.parse(customization);
        }

        if (
          pricingSnapshot &&
          typeof pricingSnapshot === "string"
        ) {
          pricingSnapshot = JSON.parse(pricingSnapshot);
        }

        /*
        |--------------------------------------------------------------------------
        | CUSTOMIZED IMAGE
        |--------------------------------------------------------------------------
        */

        const customizedImage =
          i.logo_image ||
          getCustomizationArtwork(customization);

        /*
        |--------------------------------------------------------------------------
        | MANUAL PRODUCT CHECK
        |--------------------------------------------------------------------------
        */

        const isManual =
          i.supplier === "MANUAL" ||
          variant.supplier === "MANUAL" ||
          customization?.type === "MANUAL" ||
          pricingSnapshot?.supplier === "MANUAL";

        /*
        |--------------------------------------------------------------------------
        | PRICING BREAKDOWN
        |--------------------------------------------------------------------------
        */

        let pricingBreakdown = null;

        if (pricingSnapshot) {
          if (isManual) {
            pricingBreakdown = {
              actual_product_price: Number(
                pricingSnapshot?.product_price?.base_price || 0,
              ),

              supplier_markup: 0,

              final_product_price: Number(
                pricingSnapshot?.product_price
                  ?.final_product_price || 0,
              ),

              product_total: Number(
                pricingSnapshot?.totals?.product_total ||
                  pricingSnapshot?.product_price?.total ||
                  0,
              ),

              customization_price: Number(
                pricingSnapshot?.totals?.customization_total ||
                  pricingSnapshot?.customization?.total ||
                  0,
              ),

              addon_price: Number(
                pricingSnapshot?.totals?.addon_total ||
                  pricingSnapshot?.addon_total ||
                  0,
              ),

              final_price_per_item: Number(
                pricingSnapshot?.final_price_per_item || 0,
              ),

              final_total: Number(
                pricingSnapshot?.total_price ||
                  pricingSnapshot?.totals?.grand_total ||
                  0,
              ),

              customization:
                pricingSnapshot?.customization || null,

              addons: pricingSnapshot?.addons || [],

              pricing_table: [],
            };
          } else {
            /*
            |--------------------------------------------------------------------------
            | EXISTING SUPPLIER PRICING
            | DO NOT CHANGE
            |--------------------------------------------------------------------------
            */

            pricingBreakdown = {
              actual_product_price:
                pricingSnapshot?.product_price?.actual_price,

              supplier_markup:
                pricingSnapshot?.product_price?.supplier_markup,

              final_product_price:
                pricingSnapshot?.product_price
                  ?.final_product_price,

              customization_price:
                pricingSnapshot?.customization_price
                  ?.total_customization_price,

              setup_fee:
                pricingSnapshot?.customization_price?.setup_fee,

              final_price_per_item:
                pricingSnapshot?.final_price_per_item,

              final_total:
                pricingSnapshot?.total_price,

              pricing_table:
                pricingSnapshot?.pricing_table || [],
            };
          }
        }

        /*
        |--------------------------------------------------------------------------
        | RETURN ITEM
        |--------------------------------------------------------------------------
        */

        return {
          /*
          |--------------------------------------------------------------------------
          | PRODUCT
          |--------------------------------------------------------------------------
          */

          product_id: product.id,

          product_name: decodeHtmlEntities(product.name),

          variant_id: variant.id,

          sku: variant.sku,

          color: variant.color,

          size: variant.size_details?.name || null,

          /*
          |--------------------------------------------------------------------------
          | IMAGES
          |--------------------------------------------------------------------------
          */

          original_image: originalImage,

          customized_image: customizedImage
            ? customizedImage.startsWith("http")
              ? customizedImage
              : `${process.env.IMAGE_BASE_URL}${customizedImage}`
            : null,

          /*
          |--------------------------------------------------------------------------
          | PRICING
          |--------------------------------------------------------------------------
          */

          price: Number(i.price),

          quantity: Number(i.quantity),

          total: Number(i.total_price),

          /*
          |--------------------------------------------------------------------------
          | CUSTOMIZATION
          |--------------------------------------------------------------------------
          */

          customization_config: customization,

          pricing_snapshot: pricingSnapshot,

          /*
          |--------------------------------------------------------------------------
          | BREAKDOWN
          |--------------------------------------------------------------------------
          */

          pricing_breakdown: pricingBreakdown,
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
      throw new Error("Order not found");
    }

    // ==================================================
    // BLOCKED STATUSES
    // ==================================================

    const blockedStatuses = ["DELIVERED", "CANCELLED", "SHIPPED"];

    if (blockedStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel ${order.status} order`);
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

    throw new ApiError(500, err.message);
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

  if (payment_status) {
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

  const { rows, count } =
    await Order.findAndCountAll({
      where,

      include: [
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
      ],

      limit,
      offset,

      order: [
        [
          "created_at",
          "DESC",
        ],
      ],

      distinct: true,
      subQuery: false,
    });

  /*
   * |--------------------------------------------------------------------------
   * | IMAGE HELPERS
   * |--------------------------------------------------------------------------
   */

  /*
   * ---------------------------------------------------------
   * Get product image
   * ---------------------------------------------------------
   *
   * Priority:
   *
   * 1. Variant primary image
   * 2. Variant first image
   * 3. Product primary attachment
   * 4. Product first attachment
   */

  const getProductImage = (
    item,
  ) => {
    if (!item) {
      return null;
    }

    /*
     * Variant images
     */

    const variantImages =
      item?.variant?.images || [];

    if (variantImages.length) {
      const primaryImage =
        variantImages.find(
          (img) =>
            img?.is_primary,
        );

      return (
        primaryImage?.file_uri ||
        variantImages[0]?.file_uri ||
        null
      );
    }

    /*
     * Product attachments
     */

    const productAttachments =
      item?.product?.attachments || [];

    if (productAttachments.length) {
      const primaryAttachment =
        productAttachments.find(
          (attachment) =>
            attachment?.is_primary,
        );

      return (
        primaryAttachment?.file_uri ||
        productAttachments[0]?.file_uri ||
        null
      );
    }

    return null;
  };

  /*
   * ---------------------------------------------------------
   * Build full customization image URL
   * ---------------------------------------------------------
   *
   * Supports:
   *
   * /images/file.png
   *
   * and
   *
   * https://domain.com/images/file.png
   */

  const getFullImageUrl = (
    image,
  ) => {
    if (!image) {
      return null;
    }

    if (
      typeof image === "string" &&
      /^https?:\/\//i.test(image)
    ) {
      return image;
    }

    return `${process.env.IMAGE_BASE_URL}${image}`;
  };

  /*
   * |--------------------------------------------------------------------------
   * | FORMAT ORDERS
   * |--------------------------------------------------------------------------
   */

  const formatted = rows.map(
    (order) => {
      const data =
        order.toJSON();

      const firstItem =
        data.items?.[0];

      /*
       * ---------------------------------------------------------
       * ORIGINAL PRODUCT IMAGE
       * ---------------------------------------------------------
       */

      let originalImage = null;

      /*
       * Try each order item until
       * we find an image.
       *
       * This is important because the first
       * item may not have an image.
       */

      for (const item of
        data.items || []) {
        const image =
          getProductImage(item);

        if (image) {
          originalImage = image;
          break;
        }
      }

      /*
       * ---------------------------------------------------------
       * TOTAL ITEMS
       * ---------------------------------------------------------
       */

      const totalQuantity =
        (data.items || []).reduce(
          (sum, item) =>
            sum +
            Number(
              item.quantity || 0,
            ),
          0,
        );

      /*
       * ---------------------------------------------------------
       * CUSTOMIZATION
       * ---------------------------------------------------------
       */

      let customization =
        firstItem?.customization_config;

      let pricingSnapshot =
        firstItem?.pricing_snapshot;

      /*
       * Parse customization JSON
       */

      if (
        customization &&
        typeof customization ===
          "string"
      ) {
        customization =
          JSON.parse(
            customization,
          );
      }

      /*
       * Parse pricing snapshot JSON
       */

      if (
        pricingSnapshot &&
        typeof pricingSnapshot ===
          "string"
      ) {
        pricingSnapshot =
          JSON.parse(
            pricingSnapshot,
          );
      }

      /*
       * ---------------------------------------------------------
       * CUSTOMIZED IMAGE
       * ---------------------------------------------------------
       *
       * Priority:
       *
       * 1. OrderItem.logo_image
       * 2. customization_config.customization[].logo_image
       */

      let customizedImage =
        firstItem?.logo_image ||
        getCustomizationArtwork(
          customization,
        );

      /*
       * ---------------------------------------------------------
       * RETURN ORDER
       * ---------------------------------------------------------
       */

      return {
        /*
         * -------------------------------------------------------
         * ORDER
         * -------------------------------------------------------
         */

        id: data.id,

        order_number:
          data.order_number,

        created_at:
          data.created_at,

        /*
         * -------------------------------------------------------
         * AMOUNTS
         * -------------------------------------------------------
         */

        subtotal_amount:
          Number(
            data.subtotal_amount ||
              0,
          ),

        shipping_amount:
          Number(
            data.actual_shipping_cost ||
              data.shipping_amount ||
              0,
          ),

        total_amount:
          Number(
            data.total_amount || 0,
          ),

        /*
         * -------------------------------------------------------
         * STATUS
         * -------------------------------------------------------
         */

        status:
          data.status,

        payment_status:
          data.payment_status,

        shipment_status:
          data.shipment_status,

        payment_method:
          data.payment_method,

        /*
         * -------------------------------------------------------
         * SHIPPING
         * -------------------------------------------------------
         */

        carrier:
          data.carrier,

        tracking_number:
          data.tracking_number,

        tracking_url:
          data.tracking_url,

        label_url:
          data.label_url,

        /*
         * -------------------------------------------------------
         * USER
         * -------------------------------------------------------
         */

        user: data.user
          ? {
              id:
                data.user.id,

              name:
                data.user
                  ?.user_profile
                  ?.name ||
                null,

              email:
                data.user?.email ||
                null,
            }
          : null,

        /*
         * -------------------------------------------------------
         * PREVIEW
         * -------------------------------------------------------
         */

        preview: {
          product_name:
            firstItem?.product
              ?.name || null,

          /*
           * Product image
           *
           * Works for:
           * SUPPLIER
           * MANUAL
           */

          original_image:
            originalImage,

          /*
           * Customization artwork
           */

          customized_image:
            getFullImageUrl(
              customizedImage,
            ),

          total_items:
            totalQuantity,

          customization_type:
            customization?.type ||
            (
              pricingSnapshot
                ?.supplier ===
              "MANUAL"
                ? "MANUAL"
                : null
            ),

          print_method:
            customization
              ?.print_method ||
            null,

          custom_text:
            customization
              ?.custom_text ||
            null,

          /*
           * -----------------------------------------------------
           * CUSTOMIZATION SUMMARY
           * -----------------------------------------------------
           *
           * MANUAL:
           * pricingSnapshot.customization.items
           *
           * SUPPLIER:
           * pricingSnapshot.pricing_table
           */

          customization_summary:
            pricingSnapshot
              ?.pricing_table ||
            pricingSnapshot
              ?.customization
              ?.items ||
            [],
        },

        /*
         * -------------------------------------------------------
         * ITEMS
         * -------------------------------------------------------
         */

        items: (
          data.items || []
        ).map((i) => {
          const variant =
            i.variant || {};

          const product =
            i.product || {};

          /*
           * -----------------------------------------------------
           * IMAGE
           * -----------------------------------------------------
           */

          const itemImage =
            getProductImage(i);

          /*
           * -----------------------------------------------------
           * CUSTOMIZATION
           * -----------------------------------------------------
           */

          let itemCustomization =
            i.customization_config;

          let itemPricing =
            i.pricing_snapshot;

          /*
           * Parse customization
           */

          if (
            itemCustomization &&
            typeof itemCustomization ===
              "string"
          ) {
            itemCustomization =
              JSON.parse(
                itemCustomization,
              );
          }

          /*
           * Parse pricing
           */

          if (
            itemPricing &&
            typeof itemPricing ===
              "string"
          ) {
            itemPricing =
              JSON.parse(
                itemPricing,
              );
          }

          /*
           * -----------------------------------------------------
           * CUSTOMIZED IMAGE
           * -----------------------------------------------------
           */

          const itemCustomizedImage =
            i.logo_image ||
            getCustomizationArtwork(
              itemCustomization,
            );

          /*
           * -----------------------------------------------------
           * MANUAL PRODUCT CHECK
           * -----------------------------------------------------
           */

          const isManual =
            i.supplier === "MANUAL" ||
            variant.supplier ===
              "MANUAL" ||
            itemCustomization
              ?.type === "MANUAL" ||
            itemPricing?.supplier ===
              "MANUAL";

          /*
           * -----------------------------------------------------
           * PRICING BREAKDOWN
           * -----------------------------------------------------
           */

          let pricingBreakdown =
            null;

          if (itemPricing) {
            if (isManual) {
              /*
               * -------------------------------------------------
               * MANUAL PRODUCT PRICING
               * -------------------------------------------------
               */

              pricingBreakdown = {
                actual_product_price:
                  Number(
                    itemPricing
                      ?.product_price
                      ?.base_price || 0,
                  ),

                supplier_markup: 0,

                final_product_price:
                  Number(
                    itemPricing
                      ?.product_price
                      ?.final_product_price ||
                      0,
                  ),

                product_total:
                  Number(
                    itemPricing
                      ?.totals
                      ?.product_total ||
                      itemPricing
                        ?.product_price
                        ?.total ||
                      0,
                  ),

                customization_price:
                  Number(
                    itemPricing
                      ?.totals
                      ?.customization_total ||
                      itemPricing
                        ?.customization
                        ?.total ||
                      0,
                  ),

                addon_price:
                  Number(
                    itemPricing
                      ?.totals
                      ?.addon_total ||
                      itemPricing
                        ?.addon_total ||
                      0,
                  ),

                final_price_per_item:
                  Number(
                    itemPricing
                      ?.final_price_per_item ||
                      0,
                  ),

                final_total:
                  Number(
                    itemPricing
                      ?.total_price ||
                      itemPricing
                        ?.totals
                        ?.grand_total ||
                      0,
                  ),

                customization:
                  itemPricing
                    ?.customization ||
                  null,

                addons:
                  itemPricing
                    ?.addons || [],

                pricing_table: [],
              };
            } else {
              /*
               * -------------------------------------------------
               * EXISTING SUPPLIER PRICING
               * -------------------------------------------------
               *
               * DO NOT CHANGE
               * -------------------------------------------------
               */

              pricingBreakdown = {
                actual_product_price:
                  itemPricing
                    ?.product_price
                    ?.actual_price,

                supplier_markup:
                  itemPricing
                    ?.product_price
                    ?.supplier_markup,

                final_product_price:
                  itemPricing
                    ?.product_price
                    ?.final_product_price,

                customization_price:
                  itemPricing
                    ?.customization_price
                    ?.total_customization_price,

                setup_fee:
                  itemPricing
                    ?.customization_price
                    ?.setup_fee,

                final_price_per_item:
                  itemPricing
                    ?.final_price_per_item,

                final_total:
                  itemPricing
                    ?.total_price,

                pricing_table:
                  itemPricing
                    ?.pricing_table || [],
              };
            }
          }

          /*
           * -----------------------------------------------------
           * RETURN ITEM
           * -----------------------------------------------------
           */

          return {
            /*
             * ---------------------------------------------------
             * PRODUCT
             * ---------------------------------------------------
             */

            product_id:
              product.id,

            product_name:
              decodeHtmlEntities(
                product.name,
              ),

            variant_id:
              variant.id,

            sku:
              variant.sku,

            color:
              variant.color,

            size:
              variant
                .size_details
                ?.name || null,

            /*
             * ---------------------------------------------------
             * IMAGES
             * ---------------------------------------------------
             */

            original_image:
              itemImage,

            customized_image:
              getFullImageUrl(
                itemCustomizedImage,
              ),

            /*
             * ---------------------------------------------------
             * PRICE
             * ---------------------------------------------------
             */

            price:
              Number(
                i.price || 0,
              ),

            quantity:
              Number(
                i.quantity || 0,
              ),

            total:
              Number(
                i.total_price || 0,
              ),

            /*
             * ---------------------------------------------------
             * CUSTOMIZATION
             * ---------------------------------------------------
             */

            customization_config:
              itemCustomization,

            pricing_snapshot:
              itemPricing,

            /*
             * ---------------------------------------------------
             * BREAKDOWN
             * ---------------------------------------------------
             */

            pricing_breakdown:
              pricingBreakdown,
          };
        }),
      };
    },
  );

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
