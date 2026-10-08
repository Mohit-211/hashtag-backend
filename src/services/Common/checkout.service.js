const crypto = require("crypto");
const config = require("../../config/config");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const {
  User,
  Cart,
  ProductVariant,
  Payment,
  Order,
  OrderItem,
  Address,
  Profile,
  VariantAttachment,
  Product,
  Size,
  ProductAttachment,
} = require("../../models");
const { calculatePricing } = require("../../config/pricing");
const {
  createShipmentForOrder,
  cancelShipstationShipment,
} = require("../../config/shipstation");

const { SquareClient, SquareEnvironment } = require("square");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");

const { OrdersController } = require("@paypal/paypal-server-sdk");
const paypalClient = require("../../config/paypal");
const { paymentStatusTypes, orderStatusTypes } = require("../../config/types");

// Get uploaded artwork/logo from customization config
const getCustomizationArtwork = (customization) => {
  if (!customization?.customization?.length) {
    return null;
  }

  const artwork = customization.customization.find(
    (item) => item?.logo_image,
  );

  return artwork?.logo_image || null;
};

const client = new SquareClient({
  token: config.SQUARE_ACCESS_TOKEN,

  environment:
    config.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
});

const getSquareConfig = async () => {
  return {
    applicationId: config.SQUARE_APP_ID,

    locationId: config.SQUARE_LOCATION_ID,
  };
};

const getOrCreateSquareCustomer = async (user) => {
  try {
    // EXISTING
    if (user.square_customer_id) {
      return user.square_customer_id;
    }

    // CREATE
    const response = await client.customers.create({
      givenName: user.user_profile?.name || "Customer",

      emailAddress: user.email,

      phoneNumber: user.user_profile?.mobile || undefined,
    });

    console.log("CUSTOMER RESPONSE", response);

    const customer = response.customer;

    await user.update({
      square_customer_id: customer.id,
    });

    return customer.id;
  } catch (error) {
    console.error("🚨 Square Customer Error:", error);

    const squareMessage =
      error?.errors?.[0]?.detail ||
      error?.body?.errors?.[0]?.detail ||
      error.message;

    throw new ApiError(400, squareMessage);
  }
};

const createPayment = async (body) => {
  try {
    const { user, sourceId, order_id, payment_mode } = body;

    // ==================================================
    // ALLOWED PAYMENT MODES
    // ==================================================

    const allowedModes = [
      "CARD",
      "GOOGLE_PAY",
      "APPLE_PAY",
      "CASH_APP",
      "AFTERPAY",
      "BANK_ACCOUNT",
      "ACH",
    ];

    if (payment_mode && !allowedModes.includes(payment_mode)) {
      throw new Error("Invalid payment mode");
    }

    // ==================================================
    // ORDER
    // ==================================================

    const order = await Order.findOne({
      where: {
        id: order_id,

        user_id: user.id,
      },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.payment_status === "SUCCESS") {
      throw new Error("Order already paid");
    }

    const squareCustomerId = await getOrCreateSquareCustomer(user);

    const response = await client.payments.create({
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(Number(order.total_amount) * 100)),
        currency: order.currency,
      },
      autocomplete: true,
      customerId: squareCustomerId,
      note: `Payment for Order ${order.order_number}`,
      metadata: {
        order_id: order.id.toString(),
        payment_mode: payment_mode || "CARD",
      },
    });

    const payment = response.payment;

    // ==================================================
    // DETECT ACTUAL PAYMENT TYPE
    // ==================================================

    let actualPaymentMode = payment_mode || "CARD";
    // CARD
    if (payment.sourceType === "CARD") {
      const brand = payment.cardDetails?.card?.cardBrand;
      const cardType = payment.cardDetails?.card?.cardType;

      if (actualPaymentMode === "CARD") {
        actualPaymentMode = cardType === "DEBIT" ? "DEBIT_CARD" : "CREDIT_CARD";
      }
    }

    // CASH APP
    if (payment.sourceType === "CASH_APP") {
      actualPaymentMode = "CASH_APP";
    }

    // AFTERPAY
    if (payment.sourceType === "BUY_NOW_PAY_LATER") {
      actualPaymentMode = "AFTERPAY";
    }

    // ==================================================
    // SAVE PAYMENT
    // ==================================================

    await Payment.create({
      square_customer_id: squareCustomerId,
      transaction_id: payment.id,
      order_id: order.id,
      amount: order.total_amount,
      currency: order.currency,
      payment_status: "PENDING",
      user_id: user.id,
      payment_mode: actualPaymentMode,
      description: `Payment for Order ${order.order_number}`,
    });

    return {
      payment_id: payment.id,

      order_id: order.id,

      status: payment.status,

      payment_mode: actualPaymentMode,

      total: order.total_amount,
    };
  } catch (error) {
    console.error("🚨 Create Payment Error:", error);

    throw new ApiError(500, error.message);
  }
};

const getSquarePaymentStatus = async (body) => {
  try {
    const { user, order_id } = body;

    if (!order_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
    }

    // ==================================================
    // FIND ORDER
    // ==================================================

    const order = await Order.findOne({
      where: {
        id: order_id,
        user_id: user.id,
      },
      attributes: [
        "id",
        "order_number",
        "payment_status",
        "payment_method",
        "status",
      ],
    });

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found.");
    }

    // ==================================================
    // FIND PAYMENT
    // ==================================================

    const payment = await Payment.findOne({
      where: {
        order_id: order.id,
      },
      order: [["id", "DESC"]],
      attributes: [
        "id",
        "transaction_id",
        "payment_status",
        "payment_mode",
        "payment_provider",
        "amount",
        "currency",
      ],
    });

    // ==================================================
    // RESPONSE
    // ==================================================

    return {
      order_id: order.id,
      order_number: order.order_number,

      // This is the important status for frontend
      payment_status: order.payment_status,

      order_status: order.status,

      payment_method: order.payment_method,

      payment: payment
        ? {
            payment_id: payment.id,
            transaction_id: payment.transaction_id,
            payment_status: payment.payment_status,
            payment_mode: payment.payment_mode,
            payment_provider: payment.payment_provider,
            amount: payment.amount,
            currency: payment.currency,
          }
        : null,
    };
  } catch (error) {
    console.error("🚨 Get Square Payment Status Error:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to get payment status.",
    );
  }
};

const squareWebhook = async (body) => {
  try {
    console.log("📩 Square Webhook:", JSON.stringify(body, null, 2));

    // ==================================================
    // EVENT TYPE
    // ==================================================

    const eventType = body.type;

    if (eventType !== "payment.updated") {
      return;
    }

    // ==================================================
    // PAYMENT OBJECT
    // ==================================================

    const paymentObject = body.data?.object?.payment;

    if (!paymentObject) {
      console.log("❌ Payment object missing");
      return;
    }

    const paymentId = paymentObject.id;

    console.log(`💳 Processing Payment: ${paymentId}`);

    // ==================================================
    // PAYMENT RECORD
    // ==================================================

    const paymentRecord = await Payment.findOne({
      where: {
        transaction_id: paymentId,
      },
    });

    if (!paymentRecord) {
      console.log("❌ Payment record not found");
      return;
    }

    // ==================================================
    // ORDER
    // ==================================================

    const order = await Order.findByPk(paymentRecord.order_id, {
      include: [
        {
          model: OrderItem,
          as: "items",
        },
      ],
    });

    if (!order) {
      console.log("❌ Order not found");
      return;
    }

    // ==================================================
    // SUCCESS PAYMENT
    // ==================================================

    if (paymentObject.status === "COMPLETED") {
      // ================================================
      // AVOID DUPLICATE WEBHOOKS
      // ================================================

      if (paymentRecord.payment_status === "SUCCESS") {
        console.log("⚠️ Payment already processed");

        return;
      }

      // ================================================
      // VALIDATE STOCK
      // ================================================

      for (let item of order.items) {
        const variant = await ProductVariant.findByPk(item.variant_id);

        if (!variant) {
          throw new Error(`Variant not found: ${item.variant_id}`);
        }

        if (variant.track_inventory && variant.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${variant.sku}`);
        }
      }

      // ================================================
      // REDUCE STOCK
      // ================================================

      for (let item of order.items) {
        const variant = await ProductVariant.findByPk(item.variant_id);

        if (variant?.track_inventory) {
          await variant.decrement("stock", {
            by: item.quantity,
          });
        }
      }

      // ================================================
      // UPDATE ORDER
      // ================================================

      await order.update({
        payment_status: "SUCCESS",

        status: order.label_id ? "SHIPPED" : "CONFIRMED",

        shipment_status: order.label_id ? "SUCCESS" : "PENDING",

        payment_method: paymentRecord.payment_mode,
      });

      // ================================================
      // UPDATE PAYMENT
      // ================================================

      await paymentRecord.update({
        payment_status: "SUCCESS",
      });

      // ================================================
      // UPDATE ORDER ITEMS
      // ================================================

      await OrderItem.update(
        {
          shipment_status: "LABEL_CREATED",
        },
        {
          where: {
            order_id: order.id,
          },
        },
      );

      // ================================================
      // CLEAR CART
      // ================================================

      await Cart.destroy({
        where: {
          user_id: order.user_id,
        },
      });

      console.log(`✅ PAYMENT SUCCESS: ${order.order_number}`);

      return;
    }

    // ==================================================
    // FAILED / CANCELED PAYMENT
    // ==================================================

    if (["FAILED", "CANCELED"].includes(paymentObject.status)) {
      console.log(`🚫 PAYMENT FAILED: ${order.order_number}`);

      // ================================================
      // UPDATE PAYMENT
      // ================================================

      await paymentRecord.update({
        payment_status: "REJECTED",
      });

      // ================================================
      // UPDATE ORDER
      // ================================================

      await order.update({
        payment_status: "REJECTED",

        status: "PAYMENT_FAILED",
      });

      // ================================================
      // VOID LABEL
      // ================================================

      try {
        await cancelShipstationShipment(order);

        console.log(`🚫 Label voided for ${order.order_number}`);
      } catch (voidError) {
        console.error("🚨 Void Label Error:", voidError.message);
      }

      return;
    }

    // ==================================================
    // PENDING / AUTHORIZED
    // ==================================================

    console.log(`ℹ️ Payment status ignored: ${paymentObject.status}`);
  } catch (error) {
    console.error("🚨 Square Webhook Error:", error);
  }
};

const getPaymentHistory = async (body, query) => {
  try {
    const { user } = body;

    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);

    const offset = (page - 1) * limit;

    const { count, rows } = await Payment.findAndCountAll({
      where: {
        user_id: user.id,
      },

      distinct: true,

      include: [
        {
          model: Order,
          as: "order",

          required: false,

          include: [
            {
              model: OrderItem,
              as: "items",

              required: false,

              include: [
                // ---------------------------------------------------------
                // PRODUCT
                // ---------------------------------------------------------
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

                // ---------------------------------------------------------
                // VARIANT
                // ---------------------------------------------------------
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
        },
      ],

      order: [["id", "DESC"]],

      limit,
      offset,
    });

    // ---------------------------------------------------------------------
    // FORMAT PAYMENTS
    // ---------------------------------------------------------------------

    const payments = rows.map((payment) => {
      const p = payment.toJSON();

      const order = p.order || null;

      const firstItem = order?.items?.[0];

      // -------------------------------------------------------------------
      // TOTAL ITEMS
      // -------------------------------------------------------------------

      const totalItems =
        order?.items?.reduce(
          (sum, item) =>
            sum + Number(item.quantity || 0),
          0,
        ) || 0;

      // -------------------------------------------------------------------
      // PREVIEW IMAGE
      //
      // Preview still uses the first item.
      //
      // Priority:
      // 1. Variant primary image
      // 2. First variant image
      // 3. Product primary attachment
      // 4. First product attachment
      // -------------------------------------------------------------------

      const originalImage =
        firstItem?.variant?.images?.find(
          (img) => img?.is_primary && img?.file_uri,
        )?.file_uri ||
        firstItem?.variant?.images?.find(
          (img) => img?.file_uri,
        )?.file_uri ||
        firstItem?.product?.attachments?.find(
          (img) => img?.is_primary && img?.file_uri,
        )?.file_uri ||
        firstItem?.product?.attachments?.find(
          (img) => img?.file_uri,
        )?.file_uri ||
        null;

      // -------------------------------------------------------------------
      // PREVIEW CUSTOMIZATION
      // -------------------------------------------------------------------

      let customization =
        firstItem?.customization_config;

      if (
        customization &&
        typeof customization === "string"
      ) {
        try {
          customization = JSON.parse(
            customization,
          );
        } catch (error) {
          customization = null;
        }
      }

      const customizedImage =
        firstItem?.logo_image ||
        getCustomizationArtwork(customization);

      // -------------------------------------------------------------------
      // ALL ORDER ITEMS
      //
      // Every OrderItem belonging to this Order is returned here.
      // -------------------------------------------------------------------

      const items =
        order?.items?.map((item) => {
          const variant = item.variant || {};

          const product = item.product || {};

          // ---------------------------------------------------------------
          // ORIGINAL IMAGE
          // ---------------------------------------------------------------

          const itemOriginalImage =
            variant.images?.find(
              (img) =>
                img?.is_primary &&
                img?.file_uri,
            )?.file_uri ||
            variant.images?.find(
              (img) => img?.file_uri,
            )?.file_uri ||
            product.attachments?.find(
              (img) =>
                img?.is_primary &&
                img?.file_uri,
            )?.file_uri ||
            product.attachments?.find(
              (img) => img?.file_uri,
            )?.file_uri ||
            null;

          // ---------------------------------------------------------------
          // CUSTOMIZATION
          // ---------------------------------------------------------------

          let itemCustomization =
            item.customization_config;

          if (
            itemCustomization &&
            typeof itemCustomization === "string"
          ) {
            try {
              itemCustomization =
                JSON.parse(
                  itemCustomization,
                );
            } catch (error) {
              itemCustomization = null;
            }
          }

          // ---------------------------------------------------------------
          // PRICING SNAPSHOT
          // ---------------------------------------------------------------

          let itemPricingSnapshot =
            item.pricing_snapshot;

          if (
            itemPricingSnapshot &&
            typeof itemPricingSnapshot === "string"
          ) {
            try {
              itemPricingSnapshot =
                JSON.parse(
                  itemPricingSnapshot,
                );
            } catch (error) {
              itemPricingSnapshot = null;
            }
          }

          // ---------------------------------------------------------------
          // CUSTOMIZED IMAGE
          // ---------------------------------------------------------------

          const itemCustomizedImage =
            item.logo_image ||
            getCustomizationArtwork(
              itemCustomization,
            );

          // ---------------------------------------------------------------
          // RETURN ITEM
          // ---------------------------------------------------------------

          return {
            product_id: product.id,

            product_name:
              decodeHtmlEntities(
                product.name || null,
              ),

            variant_id: variant.id,

            sku: variant.sku || null,

            original_image:
              itemOriginalImage,

            customized_image:
              itemCustomizedImage
                ? itemCustomizedImage.startsWith(
                    "http",
                  )
                  ? itemCustomizedImage
                  : `${process.env.IMAGE_BASE_URL}${itemCustomizedImage}`
                : null,

            price: Number(
              item.price || 0,
            ),

            quantity: Number(
              item.quantity || 0,
            ),

            total: Number(
              item.total_price || 0,
            ),

            customization_config:
              itemCustomization,

            pricing_snapshot:
              itemPricingSnapshot,
          };
        }) || [];

      return {
        payment_id: p.id,

        transaction_id:
          p.transaction_id,

        amount: Number(
          p.amount || 0,
        ),

        currency: p.currency,

        status: p.status,

        payment_method:
          p.payment_method,

        created_at:
          p.created_at,

        order: order
          ? {
              order_id: order.id,

              order_number:
                order.order_number,

              total_amount: Number(
                order.total_amount || 0,
              ),

              subtotal_amount: Number(
                order.subtotal_amount || 0,
              ),

              shipping_amount: Number(
                order.shipping_amount || 0,
              ),

              tax_rate: Number(
                order.tax_rate || 0,
              ),

              tax_amount: Number(
                order.tax_amount || 0,
              ),

              pricing_breakdown: {
                subtotal: Number(
                  order.subtotal_amount || 0,
                ),

                tax: Number(
                  order.tax_amount || 0,
                ),

                shipping: Number(
                  order.shipping_amount || 0,
                ),

                total: Number(
                  order.total_amount || 0,
                ),
              },

              payment_status:
                order.payment_status,

              shipment_status:
                order.shipment_status,

              tracking_number:
                order.tracking_number,

              tracking_url:
                order.tracking_url,

              // -----------------------------------------------------------
              // PREVIEW
              //
              // This remains the first item only for the payment-list
              // preview/card.
              // -----------------------------------------------------------

              preview: {
                product_name:
                  decodeHtmlEntities(
                    firstItem?.product?.name ||
                      null,
                  ),

                original_image:
                  originalImage,

                customized_image:
                  customizedImage
                    ? customizedImage.startsWith(
                        "http",
                      )
                      ? customizedImage
                      : `${process.env.IMAGE_BASE_URL}${customizedImage}`
                    : null,

                total_items:
                  totalItems,

                print_method:
                  customization?.print_method ||
                  null,

                type:
                  customization?.type ||
                  null,

                custom_text:
                  customization?.custom_text ||
                  null,
              },

              // -----------------------------------------------------------
              // ALL ITEMS
              // -----------------------------------------------------------

              items,
            }
          : null,
      };
    });

    // -----------------------------------------------------------------------
    // RESPONSE
    // -----------------------------------------------------------------------

    return {
      total: count,

      current_page: page,

      total_pages: Math.ceil(
        count / limit,
      ),

      payments,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

const getAllPayments = async (query) => {
  try {
    /*
     |--------------------------------------------------------------------------
     | PAGINATION
     |--------------------------------------------------------------------------
     */

    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const offset = (page - 1) * limit;

    /*
     |--------------------------------------------------------------------------
     | FILTERS
     |--------------------------------------------------------------------------
     */

    const search = query.search || "";
    const payment_status = query.payment_status;

    const where = {};

    if (payment_status) {
      where.payment_status = payment_status;
    }

    /*
     |--------------------------------------------------------------------------
     | USER SEARCH
     |--------------------------------------------------------------------------
     */

    const userWhere = {};

    if (search) {
      userWhere[Op.or] = [
        {
          email: {
            [Op.like]: `%${search}%`,
          },
        },
        {
          "$user.user_profile.name$": {
            [Op.like]: `%${search}%`,
          },
        },
      ];
    }

    /*
     |--------------------------------------------------------------------------
     | GET PAYMENTS
     |--------------------------------------------------------------------------
     */

    const { count, rows } = await Payment.findAndCountAll({
      where,

      include: [
        /*
         |--------------------------------------------------------------------------
         | USER
         |--------------------------------------------------------------------------
         */

        {
          model: User,
          as: "user",

          required: false,

          where: userWhere,

          attributes: ["id", "email"],

          include: [
            {
              model: Profile,
              as: "user_profile",

              attributes: [
                "name",
                "dialing_code",
                "mobile",
                "is_active",
                "created_at",
              ],

              required: false,
            },
          ],
        },

        /*
         |--------------------------------------------------------------------------
         | ORDER
         |--------------------------------------------------------------------------
         */

        {
          model: Order,
          as: "order",

          required: false,

          include: [
            {
              model: OrderItem,
              as: "items",

              required: false,

              include: [
                {
                  model: Product,
                  as: "product",

                  attributes: ["id", "name"],
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
          ],
        },
      ],

      order: [["id", "DESC"]],

      limit,
      offset,

      distinct: true,

      subQuery: false,
    });

    /*
     |--------------------------------------------------------------------------
     | FORMAT RESPONSE
     |--------------------------------------------------------------------------
     */

    const payments = rows.map((payment) => {
      const data = payment.toJSON();

      const order = data.order;

      const firstItem = order?.items?.[0];

      /*
       |--------------------------------------------------------------------------
       | IMAGE
       |--------------------------------------------------------------------------
       */

      const originalImage =
        firstItem?.variant?.images?.find((img) => img.is_primary)
          ?.file_uri ||
        firstItem?.variant?.images?.[0]?.file_uri ||
        null;

      /*
       |--------------------------------------------------------------------------
       | TOTAL ITEMS
       |--------------------------------------------------------------------------
       */

      const totalItems =
        order?.items?.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0,
        ) || 0;

      /*
       |--------------------------------------------------------------------------
       | CUSTOMIZATION
       |--------------------------------------------------------------------------
       */

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

      /*
       |--------------------------------------------------------------------------
       | MANUAL PRODUCT CHECK
       |--------------------------------------------------------------------------
       */

      const isManual =
        firstItem?.supplier === "MANUAL" ||
        firstItem?.variant?.supplier === "MANUAL" ||
        customization?.type === "MANUAL" ||
        pricingSnapshot?.supplier === "MANUAL";

      /*
       |--------------------------------------------------------------------------
       | ORDER PRICING BREAKDOWN
       |--------------------------------------------------------------------------
       */

      let orderPricingBreakdown = null;

      if (pricingSnapshot) {
        if (isManual) {
          orderPricingBreakdown = {
            actual_product_price: Number(
              pricingSnapshot?.product_price?.base_price || 0,
            ),

            supplier_markup: 0,

            final_product_price: Number(
              pricingSnapshot?.product_price?.final_product_price || 0,
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

            customization: pricingSnapshot?.customization || null,

            addons: pricingSnapshot?.addons || [],

            pricing_table: [],
          };
        } else {
          /*
           |--------------------------------------------------------------------------
           | EXISTING SUPPLIER PRICING
           |--------------------------------------------------------------------------
           */

          orderPricingBreakdown = {
            actual_product_price:
              pricingSnapshot?.product_price?.actual_price,

            supplier_markup:
              pricingSnapshot?.product_price?.supplier_markup,

            final_product_price:
              pricingSnapshot?.product_price?.final_product_price,

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
       | RESPONSE
       |--------------------------------------------------------------------------
       */

      return {
        /*
         |--------------------------------------------------------------------------
         | PAYMENT
         |--------------------------------------------------------------------------
         */

        payment_id: data.id,

        transaction_id: data.transaction_id,

        amount: Number(data.amount || 0),

        currency: data.currency,

        payment_status: data.payment_status,

        payment_method: data.payment_method,

        created_at: data.created_at,

        /*
         |--------------------------------------------------------------------------
         | USER
         |--------------------------------------------------------------------------
         */

        user: data.user
          ? {
              id: data.user.id,

              name: data.user?.user_profile?.name || null,

              email: data.user?.email || null,

              mobile: data.user?.user_profile?.mobile || null,

              dialing_code:
                data.user?.user_profile?.dialing_code || null,
            }
          : null,

        /*
         |--------------------------------------------------------------------------
         | ORDER
         |--------------------------------------------------------------------------
         */

        order: order
          ? {
              order_id: order.id,

              order_number: order.order_number,

              subtotal_amount: Number(order.subtotal_amount || 0),

              shipping_amount: Number(
                order.actual_shipping_cost ||
                  order.shipping_amount ||
                  0,
              ),

              total_amount: Number(order.total_amount || 0),

              payment_status: order.payment_status,

              shipment_status: order.shipment_status,

              tracking_number: order.tracking_number,

              tracking_url: order.tracking_url,

              carrier: order.carrier,

              created_at: order.created_at,

              /*
               |--------------------------------------------------------------------------
               | PREVIEW
               |--------------------------------------------------------------------------
               */

              preview: {
                product_name: decodeHtmlEntities(
                  firstItem?.product?.name || null,
                ),

                original_image: originalImage,

                customized_image: firstItem?.logo_image
                  ? `${process.env.IMAGE_BASE_URL}${firstItem.logo_image}`
                  : null,

                total_items: totalItems,

                customization_type:
                  customization?.type ||
                  (isManual ? "MANUAL" : null),

                print_method:
                  customization?.print_method || null,

                custom_text:
                  customization?.custom_text || null,

                customization_summary: isManual
                  ? pricingSnapshot?.customization?.items || []
                  : pricingSnapshot?.pricing_table || [],
              },

              /*
               |--------------------------------------------------------------------------
               | ITEMS
               |--------------------------------------------------------------------------
               */

              items: order.items.map((item) => {
                const variant = item.variant || {};

                const product = item.product || {};

                /*
                 |--------------------------------------------------------------------------
                 | ITEM IMAGE
                 |--------------------------------------------------------------------------
                 */

                const itemImage =
                  variant.images?.find((img) => img.is_primary)
                    ?.file_uri ||
                  variant.images?.[0]?.file_uri ||
                  null;

                /*
                 |--------------------------------------------------------------------------
                 | CUSTOMIZATION
                 |--------------------------------------------------------------------------
                 */

                let itemCustomization =
                  item.customization_config;

                let itemPricing = item.pricing_snapshot;

                if (
                  itemCustomization &&
                  typeof itemCustomization === "string"
                ) {
                  try {
                    itemCustomization =
                      JSON.parse(itemCustomization);
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

                /*
                 |--------------------------------------------------------------------------
                 | ITEM MANUAL CHECK
                 |--------------------------------------------------------------------------
                 */

                const itemIsManual =
                  item.supplier === "MANUAL" ||
                  variant.supplier === "MANUAL" ||
                  itemCustomization?.type === "MANUAL" ||
                  itemPricing?.supplier === "MANUAL";

                /*
                 |--------------------------------------------------------------------------
                 | ITEM PRICING BREAKDOWN
                 |--------------------------------------------------------------------------
                 */

                let itemPricingBreakdown = null;

                if (itemPricing) {
                  if (itemIsManual) {
                    itemPricingBreakdown = {
                      actual_product_price: Number(
                        itemPricing?.product_price
                          ?.base_price || 0,
                      ),

                      supplier_markup: 0,

                      final_product_price: Number(
                        itemPricing?.product_price
                          ?.final_product_price || 0,
                      ),

                      product_total: Number(
                        itemPricing?.totals?.product_total ||
                          itemPricing?.product_price?.total ||
                          0,
                      ),

                      customization_price: Number(
                        itemPricing?.totals
                          ?.customization_total ||
                          itemPricing?.customization?.total ||
                          0,
                      ),

                      addon_price: Number(
                        itemPricing?.totals?.addon_total ||
                          itemPricing?.addon_total ||
                          0,
                      ),

                      final_price_per_item: Number(
                        itemPricing?.final_price_per_item || 0,
                      ),

                      final_total: Number(
                        itemPricing?.total_price ||
                          itemPricing?.totals?.grand_total ||
                          0,
                      ),

                      customization:
                        itemPricing?.customization || null,

                      addons: itemPricing?.addons || [],

                      pricing_table: [],
                    };
                  } else {
                    /*
                     |--------------------------------------------------------------------------
                     | EXISTING SUPPLIER PRICING
                     |--------------------------------------------------------------------------
                     */

                    itemPricingBreakdown = {
                      actual_product_price:
                        itemPricing?.product_price
                          ?.actual_price,

                      supplier_markup:
                        itemPricing?.product_price
                          ?.supplier_markup,

                      final_product_price:
                        itemPricing?.product_price
                          ?.final_product_price,

                      customization_price:
                        itemPricing?.customization_price
                          ?.total_customization_price,

                      setup_fee:
                        itemPricing?.customization_price
                          ?.setup_fee,

                      final_price_per_item:
                        itemPricing?.final_price_per_item,

                      final_total:
                        itemPricing?.total_price,

                      pricing_table:
                        itemPricing?.pricing_table || [],
                    };
                  }
                }

                return {
                  product_id: product.id,

                  product_name: decodeHtmlEntities(
                    product.name,
                  ),

                  variant_id: variant.id,

                  sku: variant.sku,

                  color: variant.color,

                  size:
                    variant?.size_details?.name || null,

                  original_image: itemImage,

                  customized_image: item.logo_image
                    ? `${process.env.IMAGE_BASE_URL}${item.logo_image}`
                    : null,

                  quantity: Number(item.quantity || 0),

                  price: Number(item.price || 0),

                  total: Number(item.total_price || 0),

                  customization_config:
                    itemCustomization,

                  pricing_snapshot: itemPricing,

                  pricing_breakdown:
                    itemPricingBreakdown,
                };
              }),
            }
          : null,
      };
    });

    /*
     |--------------------------------------------------------------------------
     | RESPONSE
     |--------------------------------------------------------------------------
     */

    return {
      total: count,

      current_page: page,

      total_pages: Math.ceil(count / limit),

      payments,
    };
  } catch (error) {
    console.log("❌ GET ALL PAYMENTS ERROR:", error);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// paypal service functions

const createPayPalOrder = async (body) => {
  try {
    const { user, order_id } = body;

    if (!order_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
    }

    const order = await Order.findOne({
      where: {
        id: order_id,
        user_id: user.id,
      },
    });

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found.");
    }

    if (order.payment_status === paymentStatusTypes.SUCCESS) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Order is already paid.");
    }

    const amount = Number(order.total_amount);

    if (!amount || amount <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order amount.");
    }

    const ordersController = new OrdersController(paypalClient);

    const request = {
      body: {
        intent: "CAPTURE",

        purchaseUnits: [
          {
            referenceId: String(order.id),

            amount: {
              currencyCode: order.currency || "USD",

              value: amount.toFixed(2),
            },
          },
        ],

        applicationContext: {
          returnUrl: "http://localhost:3000/checkout/paypal/success",

          cancelUrl: "http://localhost:3000/checkout/paypal/cancel",
        },
      },
    };

    const response = await ordersController.createOrder(request);

    const paypalOrder = response.result;

    const approvalLink = paypalOrder.links?.find(
      (link) => link.rel === "approve",
    );

    console.log("🔗 PayPal Approval URL:", approvalLink?.href);

    return {
      order_id: order.id,
      paypal_order_id: paypalOrder.id,

      approval_url: approvalLink?.href || null,

      status: paypalOrder.status,
    };
  } catch (error) {
    console.error("PayPal create order error:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create PayPal order.",
    );
  }
};

const capturePayPalOrder = async (body) => {
  try {
    const { user, order_id, paypal_order_id } = body;

    if (!order_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
    }

    if (!paypal_order_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "paypal_order_id is required.",
      );
    }

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
    });

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found.");
    }

    if (order.payment_status === paymentStatusTypes.SUCCESS) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Order is already paid.");
    }

    const ordersController = new OrdersController(paypalClient);

    const response = await ordersController.captureOrder({
      id: paypal_order_id,
    });

    const paypalOrder = response.result;

    if (!paypalOrder) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid PayPal capture response.",
      );
    }

    if (paypalOrder.status !== "COMPLETED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `PayPal payment was not completed. Status: ${paypalOrder.status}`,
      );
    }

    const capture = paypalOrder.purchaseUnits?.[0]?.payments?.captures?.[0];

    if (!capture || capture.status !== "COMPLETED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "PayPal payment capture was not completed.",
      );
    }

    /*
     * Make sure the PayPal amount matches our Order amount.
     * This prevents capturing a different amount against the order.
     */
    const capturedAmount = Number(capture.amount?.value || 0);
    const orderAmount = Number(order.total_amount);

    if (capturedAmount.toFixed(2) !== orderAmount.toFixed(2)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "PayPal payment amount does not match the order amount.",
      );
    }

    return {
      paypal_order_id: paypalOrder.id,
      paypal_capture_id: capture.id,
      status: capture.status,
      amount: capture.amount,
      order_id: order.id,
      order_number: order.order_number,
    };
  } catch (error) {
    console.error("PayPal capture order error:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to capture PayPal payment.",
    );
  }
};

const paypalWebhook = async (body) => {
  try {
    console.log("📩 PayPal Webhook:", JSON.stringify(body, null, 2));

    // ==================================================
    // EVENT TYPE
    // ==================================================

    const eventType = body.event_type;

    console.log(`🔔 PayPal Event: ${eventType}`);

    // ==================================================
    // PAYMENT CAPTURE COMPLETED
    // ==================================================

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = body.resource;

      if (!resource) {
        console.log("❌ PayPal resource missing");
        return;
      }

      // ==================================================
      // PAYPAL CAPTURE
      // ==================================================

      const captureId = resource.id;

      console.log(`💳 Processing PayPal Capture: ${captureId}`);

      // ==================================================
      // PAYPAL ORDER ID
      // ==================================================

      const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;

      if (!paypalOrderId) {
        console.log("❌ PayPal Order ID missing");
        return;
      }

      console.log(`🅿️ PayPal Order: ${paypalOrderId}`);

      // ==================================================
      // GET OUR ORDER ID
      // ==================================================

      /*
       * We stored our internal order.id in PayPal:
       *
       * purchaseUnits[0].referenceId = order.id
       *
       * The capture webhook itself may not contain
       * purchase_units/reference_id directly, so we need
       * the PayPal order details.
       */

      const ordersController = new OrdersController(paypalClient);

      const paypalOrderResponse = await ordersController.getOrder({
        id: paypalOrderId,
      });

      const paypalOrder = paypalOrderResponse.result;

      if (!paypalOrder) {
        console.log("❌ PayPal Order not found");
        return;
      }

      const purchaseUnit = paypalOrder.purchaseUnits?.[0];

      if (!purchaseUnit) {
        console.log("❌ PayPal Purchase Unit missing");
        return;
      }

      const orderId = purchaseUnit.referenceId;

      if (!orderId) {
        console.log("❌ Internal Order ID missing from PayPal referenceId");
        return;
      }

      console.log(`🛒 Internal Order ID: ${orderId}`);

      // ==================================================
      // ORDER
      // ==================================================

      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: "items",
          },
        ],
      });

      if (!order) {
        console.log(`❌ Order not found: ${orderId}`);
        return;
      }

      // ==================================================
      // DUPLICATE PAYMENT CHECK
      // ==================================================

      const existingPayment = await Payment.findOne({
        where: {
          transaction_id: captureId,
          payment_provider: "PAYPAL",
        },
      });

      if (existingPayment) {
        console.log("⚠️ PayPal payment already processed");
        return;
      }

      // ==================================================
      // VALIDATE PAYMENT AMOUNT
      // ==================================================

      const capturedAmount = Number(resource.amount?.value || 0);
      const orderAmount = Number(order.total_amount);

      if (capturedAmount.toFixed(2) !== orderAmount.toFixed(2)) {
        console.log(
          `❌ Amount mismatch. PayPal: ${capturedAmount}, Order: ${orderAmount}`,
        );

        return;
      }

      // ==================================================
      // VALIDATE STOCK
      // ==================================================

      for (const item of order.items) {
        const variant = await ProductVariant.findByPk(item.variant_id);

        if (!variant) {
          throw new Error(`Variant not found: ${item.variant_id}`);
        }

        if (variant.track_inventory && variant.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${variant.sku}`);
        }
      }

      // ==================================================
      // REDUCE STOCK
      // ==================================================

      for (const item of order.items) {
        const variant = await ProductVariant.findByPk(item.variant_id);

        if (variant?.track_inventory) {
          await variant.decrement("stock", {
            by: item.quantity,
          });
        }
      }

      // ==================================================
      // CREATE PAYMENT RECORD
      // ==================================================

      const payment = await Payment.create({
        transaction_id: captureId,

        payment_provider: "PAYPAL",

        currency: resource.amount?.currency_code || order.currency || "USD",

        user_id: order.user_id,

        order_id: order.id,

        amount: capturedAmount,

        square_customer_id: null,

        description: `PayPal Payment - ${order.order_number}`,

        payment_status: paymentStatusTypes.SUCCESS,

        payment_mode: "PAYPAL",

        is_active: true,
      });

      // ==================================================
      // UPDATE ORDER
      // ==================================================

      await order.update({
        payment_status: paymentStatusTypes.SUCCESS,

        status: order.label_id
          ? orderStatusTypes.SHIPPED
          : orderStatusTypes.CONFIRMED,

        shipment_status: order.label_id ? "SUCCESS" : "PENDING",

        payment_method: "PAYPAL",
      });

      // ==================================================
      // UPDATE ORDER ITEMS
      // ==================================================

      await OrderItem.update(
        {
          shipment_status: "LABEL_CREATED",
        },
        {
          where: {
            order_id: order.id,
          },
        },
      );

      // ==================================================
      // CLEAR CART
      // ==================================================

      await Cart.destroy({
        where: {
          user_id: order.user_id,
        },
      });

      console.log(`✅ PAYPAL PAYMENT SUCCESS: ${order.order_number}`);

      return;
    }

    // ==================================================
    // PAYMENT DENIED
    // ==================================================

    if (eventType === "PAYMENT.CAPTURE.DENIED") {
      const resource = body.resource;

      if (!resource) {
        console.log("❌ PayPal resource missing");
        return;
      }

      const captureId = resource.id;

      console.log(`🚫 PayPal Capture Denied: ${captureId}`);

      const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;

      if (!paypalOrderId) {
        console.log("❌ PayPal Order ID missing");
        return;
      }

      const ordersController = new OrdersController(paypalClient);

      const paypalOrderResponse = await ordersController.getOrder({
        id: paypalOrderId,
      });

      const paypalOrder = paypalOrderResponse.result;

      const orderId = paypalOrder?.purchaseUnits?.[0]?.referenceId;

      if (!orderId) {
        console.log("❌ Internal Order ID missing");
        return;
      }

      const order = await Order.findByPk(orderId);

      if (!order) {
        console.log("❌ Order not found");
        return;
      }

      // Find existing payment if one exists
      const paymentRecord = await Payment.findOne({
        where: {
          transaction_id: captureId,
          payment_provider: "PAYPAL",
        },
      });

      if (paymentRecord) {
        await paymentRecord.update({
          payment_status: paymentStatusTypes.REJECTED,
        });
      }

      await order.update({
        payment_status: paymentStatusTypes.REJECTED,
        status: orderStatusTypes.FAILED,
      });

      // ==================================================
      // VOID LABEL
      // ==================================================

      try {
        await cancelShipstationShipment(order);

        console.log(`🚫 Label voided for ${order.order_number}`);
      } catch (voidError) {
        console.error("🚨 Void Label Error:", voidError.message);
      }

      return;
    }

    // ==================================================
    // OTHER EVENTS
    // ==================================================

    console.log(`ℹ️ PayPal event ignored: ${eventType}`);

    return;
  } catch (error) {
    console.error("🚨 PayPal Webhook Error:", error);

    throw error;
  }
};

module.exports = {
  getSquareConfig,
  createPayment,
  getSquarePaymentStatus,
  squareWebhook,
  getPaymentHistory,
  getAllPayments,

  createPayPalOrder,
  capturePayPalOrder,
  paypalWebhook,
};
