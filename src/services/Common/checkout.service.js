const crypto = require("crypto");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const {
  User,
  ProductVariant,
  Payment,
  Order,
  OrderItem,
  Profile,
  VariantAttachment,
  Product,
  Size,
  ProductAttachment,
} = require("../../models");

const { SquareClient, SquareEnvironment } = require("square");
const decodeHtmlEntities = require("../../utils/decodeHtmlEntities");
const {
  parseJson,
  getCustomizationArtwork,
  getLineGraphics,
  withoutGraphics,
  toFullImageUrl,
  getItemImage,
  isManualItem,
  buildPricingBreakdown,
  buildOrderTotals,
  sumQuantity,
} = require("../../utils/orderFormat");

const { OrdersController, PaymentsController } = require("@paypal/paypal-server-sdk");
const { Op } = require("sequelize");
const sequelize = require("../../config/central.db");
const logger = require("../../config/logger");
const { getPaypalClient } = require("../../config/paypal");
const settings = require("../../config/settings");
const { paymentStatusTypes, orderStatusTypes, paymentModeTypes } = require("../../config/types");
const { completeOrderPayment, failOrderPayment } = require("./paymentCompletion.service");

// Built from the Settings page values (Payments), and again when they change.
let square = { signature: null, client: null };

const squareClient = () => {
  const token = settings.getRequired("SQUARE_ACCESS_TOKEN");
  const environment = settings.getRequired("SQUARE_ENVIRONMENT");

  const signature = `${environment}\n${token}`;
  if (square.signature !== signature) {
    square = {
      signature,
      client: new SquareClient({
        token,
        environment:
          environment === "production"
            ? SquareEnvironment.Production
            : SquareEnvironment.Sandbox,
      }),
    };
  }
  return square.client;
};

const getSquareConfig = async () => {
  return {
    applicationId: settings.getRequired("SQUARE_APP_ID"),

    locationId: settings.getRequired("SQUARE_LOCATION_ID"),
  };
};

// Square payment ids and the mode we store for them.
const SQUARE_SOURCE_MODES = ["CARD", "GOOGLE_PAY", "APPLE_PAY", "CASH_APP", "AFTERPAY", "ACH"];

// A Square charge that hasn't settled blocks a second charge for this long; after that it's
// checked with Square again (settlePendingSquarePayments) before anything else happens.
const SQUARE_PENDING_HOURS = 24;

// The order's payments that were sent and haven't completed or failed yet: a Square charge (Cash
// App and Google Pay can take a moment) or a PayPal capture that PayPal is still reviewing. Only
// one may be going through at a time, whatever the provider (audit F10), and the cart mustn't
// remove an order while one is (audit F01, unpaidOrders.service.js).
const unsettledPayments = (orderId) => ({
  order_id: orderId,
  payment_provider: ["SQUARE", "PAYPAL"],
  payment_status: "PENDING",
  transaction_id: { [Op.ne]: null },
  created_at: { [Op.gt]: new Date(Date.now() - SQUARE_PENDING_HOURS * 60 * 60 * 1000) },
});

const ALREADY_GOING_THROUGH = "A payment for this order is already being processed. Check My Orders in a minute.";

// The order to pay isn't there: removed because the cart changed after it was made (only the
// order for the cart as it is now can be paid, audit F10), or it isn't this customer's.
const orderGone = async (user, orderId) => {
  const removed = await Order.findOne({
    where: { id: orderId, user_id: user.id },
    paranoid: false,
    attributes: ["id"],
  });

  return removed
    ? new ApiError(httpStatus.CONFLICT, "Your cart changed after this order was made, so it can't be paid. Please go back and check out again.")
    : new ApiError(httpStatus.NOT_FOUND, "Order not found.");
};

const squareErrorOf = (error) => error?.errors?.[0] || error?.body?.errors?.[0] || null;

// What to tell the customer when Square refuses a charge.
const DECLINE_MESSAGES = {
  CARD_DECLINED: "Your card was declined. Please use another card or another way to pay.",
  GENERIC_DECLINE: "Your card was declined. Please use another card or another way to pay.",
  INSUFFICIENT_FUNDS: "The card doesn't have enough funds. Please use another card.",
  CVV_FAILURE: "The card's security code didn't match. Please check it and try again.",
  ADDRESS_VERIFICATION_FAILURE: "The billing ZIP code didn't match the card. Please check it and try again.",
  INVALID_EXPIRATION: "The card's expiry date isn't valid. Please check it and try again.",
  INVALID_CARD: "The card number isn't valid. Please check it and try again.",
  INVALID_ACCOUNT: "The card can't be used. Please use another card.",
  CARD_EXPIRED: "The card has expired. Please use another card.",
  CARD_NOT_SUPPORTED: "This card type isn't accepted. Please use another card.",
  TRANSACTION_LIMIT: "The card's limit was reached. Please use another card.",
  PAYMENT_LIMIT_EXCEEDED: "The payment limit was reached. Please use another way to pay.",
  VOICE_FAILURE: "Your bank needs to approve this payment. Please call them, or use another card.",
  CARD_DECLINED_VERIFICATION_REQUIRED: "Your bank needs to verify this payment. Please try again or use another card.",
  GIFT_CARD_AVAILABLE_AMOUNT: "The gift card doesn't cover the total. Please use another card.",
};

// Cash App has no card to talk about, so any decline from it gets this instead.
const CASH_APP_DECLINE = "Cash App declined this payment. Please try again in Cash App or use another way to pay.";

const declineMessage = (error, requested) => {
  const detail = squareErrorOf(error);
  if (requested === "CASH_APP" && DECLINE_MESSAGES[detail?.code]) return CASH_APP_DECLINE;
  return DECLINE_MESSAGES[detail?.code] || detail?.detail || "The payment didn't go through. Please try again or use another way to pay.";
};

// What payments.payment_mode records for a Square payment. Google Pay and Apple Pay reach Square
// as cards, so the method the customer chose wins for those.
const squareModeOf = (payment, requested) => {
  if (requested === "GOOGLE_PAY" || requested === "APPLE_PAY") return requested;
  if (payment?.sourceType === "WALLET" && payment.walletDetails?.brand === "CASH_APP") return "CASH_APP";
  if (payment?.sourceType === "CASH_APP" || requested === "CASH_APP") return "CASH_APP";
  if (payment?.sourceType === "BUY_NOW_PAY_LATER") return "AFTERPAY";
  if (payment?.sourceType === "BANK_ACCOUNT") return "ACH";
  if (payment?.sourceType === "CARD") {
    return payment.cardDetails?.card?.cardType === "DEBIT" ? "DEBIT_CARD" : "CREDIT_CARD";
  }
  return requested && requested !== "CARD" ? requested : "CARD";
};

const squareAmount = (payment) => Number(payment?.amountMoney?.amount ?? 0) / 100;

// The Square customer to attach payments to. A saved id from the other Square mode (sandbox
// vs production) doesn't exist there, so it's checked and replaced when Square doesn't know it.
const getOrCreateSquareCustomer = async (user) => {
  const client = squareClient();

  if (user.square_customer_id) {
    try {
      await client.customers.get({ customerId: user.square_customer_id });
      return user.square_customer_id;
    } catch (error) {
      if (error?.statusCode !== 404) {
        logger.error(`Square customer check failed for user ${user.id}: ${squareErrorOf(error)?.detail || error.message}`);
        // Not knowing is no reason to block the payment: pay without a customer.
        return undefined;
      }
    }
  }

  try {
    const response = await client.customers.create({
      givenName: user.user_profile?.name || "Customer",
      emailAddress: user.email,
      referenceId: String(user.id),
    });

    await user.update({ square_customer_id: response.customer.id });
    return response.customer.id;
  } catch (error) {
    logger.error(`Square customer create failed for user ${user.id}: ${squareErrorOf(error)?.detail || error.message}`);
    return undefined;
  }
};

// Asks Square about this order's unsettled charges and records what it says. Returns true if the
// order is paid afterwards. Square's word is final; our PENDING row only says we asked.
const settlePendingSquarePayments = async (order) => {
  const pending = await Payment.findAll({
    where: { order_id: order.id, payment_provider: "SQUARE", payment_status: "PENDING" },
  });

  for (const row of pending) {
    let payment;
    try {
      ({ payment } = await squareClient().payments.get({ paymentId: row.transaction_id }));
    } catch (error) {
      if (error?.statusCode === 404) {
        await row.update({ payment_status: "REJECTED" });
        continue;
      }
      throw error;
    }

    if (payment?.status === "COMPLETED") {
      await completeOrderPayment({
        orderId: order.id,
        provider: "SQUARE",
        transactionId: payment.id,
        amount: squareAmount(payment),
        currency: payment.amountMoney?.currency,
        mode: row.payment_mode,
        squareCustomerId: payment.customerId || row.square_customer_id,
      });
    } else if (["FAILED", "CANCELED"].includes(payment?.status)) {
      await failOrderPayment({ orderId: order.id, provider: "SQUARE", transactionId: payment.id });
    }
  }

  await order.reload();
  return order.payment_status === "SUCCESS";
};

const paymentResult = (order, payment, mode) => ({
  order_id: order.id,
  order_number: order.order_number,
  payment_id: payment?.id || null,
  payment_status: order.payment_status,
  payment_mode: mode,
  total: Number(order.total_amount),
});

// Charges the order's total with a Square token (card, Google Pay or Cash App). The order is
// paid as soon as Square says COMPLETED; the webhook only fills in what this missed.
const createPayment = async (body) => {
  const { user, sourceId, order_id } = body;
  const requested = String(body.payment_mode || "CARD").toUpperCase();

  if (!SQUARE_SOURCE_MODES.includes(requested)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid payment mode");
  }

  if (!sourceId || typeof sourceId !== "string") {
    throw new ApiError(httpStatus.BAD_REQUEST, "The payment details are missing. Please try again.");
  }

  const found = await Order.findOne({ where: { id: order_id, user_id: user.id } });
  if (!found) throw await orderGone(user, order_id);

  // An earlier charge that hasn't settled is checked with Square first.
  if (await settlePendingSquarePayments(found)) {
    throw new ApiError(httpStatus.CONFLICT, "This order is already paid.");
  }

  const idempotencyKey = `${found.id}-${crypto.createHash("sha256").update(`${found.id}:${sourceId}`).digest("hex").slice(0, 32)}`;
  const squareCustomerId = await getOrCreateSquareCustomer(user);

  let payment;
  let order;
  let declineText = null;

  // One charge at a time per order: the order row stays locked until the charge is recorded.
  await sequelize.transaction(async (transaction) => {
    order = await Order.findOne({
      where: { id: order_id, user_id: user.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    // Removed by a cart change (in another tab) while this request waited for the lock: nothing
    // has been charged.
    if (!order) {
      throw await orderGone(user, order_id);
    }

    if (order.payment_status === "SUCCESS") {
      throw new ApiError(httpStatus.CONFLICT, "This order is already paid.");
    }

    if (order.status === "CANCELLED") {
      throw new ApiError(httpStatus.CONFLICT, "This order was cancelled. Please place a new order.");
    }

    const total = Number(order.total_amount);
    if (!(total > 0)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This order has nothing to pay.");
    }

    // Any provider: a PayPal capture that's still being reviewed blocks a card charge too.
    const inProgress = await Payment.findOne({
      where: unsettledPayments(order.id),
      transaction,
    });

    if (inProgress) {
      throw new ApiError(httpStatus.CONFLICT, ALREADY_GOING_THROUGH);
    }

    try {
      ({ payment } = await squareClient().payments.create({
        sourceId,
        idempotencyKey,
        amountMoney: {
          amount: BigInt(Math.round(total * 100)),
          currency: order.currency || "USD",
        },
        autocomplete: true,
        customerId: squareCustomerId,
        locationId: settings.get("SQUARE_LOCATION_ID") || undefined,
        // Shown in Square's dashboard, and how the webhook finds the order if our row is missing.
        referenceId: order.order_number,
        note: `Order ${order.order_number}`,
      }));
    } catch (error) {
      const detail = squareErrorOf(error);
      logger.error(`Square charge for ${order.order_number} refused: ${detail?.code || error.statusCode} ${detail?.detail || error.message}`);

      // A decline: Square's payment, when it sends one, is recorded as failed below.
      const declined = error?.body?.payment || error?.payment;
      if (declined?.id) {
        payment = declined;
        declineText = declineMessage(error, requested);
      } else {
        throw new ApiError(
          error?.statusCode >= 500 || !error?.statusCode ? httpStatus.BAD_GATEWAY : httpStatus.BAD_REQUEST,
          declineMessage(error, requested),
        );
      }
    }

    await Payment.findOrCreate({
      where: { transaction_id: payment.id, payment_provider: "SQUARE" },
      defaults: {
        order_id: order.id,
        user_id: user.id,
        amount: total,
        currency: order.currency || "USD",
        payment_status: "PENDING",
        payment_mode: squareModeOf(payment, requested),
        square_customer_id: squareCustomerId || null,
        description: `Square payment for order ${order.order_number}`,
      },
      transaction,
    });

    // A new attempt after a failed one: the order is unpaid again, not failed, while this one
    // settles. A completed or failed charge moves it on below.
    if (order.payment_status === "REJECTED") {
      await order.update({ payment_status: "PENDING", status: "PENDING_PAYMENT" }, { transaction });
    }
  });

  const mode = squareModeOf(payment, requested);

  if (payment.status === "COMPLETED") {
    await completeOrderPayment({
      orderId: order.id,
      provider: "SQUARE",
      transactionId: payment.id,
      amount: squareAmount(payment),
      currency: payment.amountMoney?.currency,
      mode,
      squareCustomerId: payment.customerId || squareCustomerId || null,
    });
  } else if (["FAILED", "CANCELED"].includes(payment.status)) {
    await failOrderPayment({ orderId: order.id, provider: "SQUARE", transactionId: payment.id, mode });
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      declineText || "The payment didn't go through. Please try again or use another way to pay.",
    );
  }

  await order.reload();
  return paymentResult(order, payment, mode);
};

// The website polls this while a payment settles. A charge still PENDING is checked with Square.
const getSquarePaymentStatus = async (body) => {
  const { user, order_id } = body;

  if (!order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
  }

  const order = await Order.findOne({ where: { id: order_id, user_id: user.id } });

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found.");
  }

  if (order.payment_status !== "SUCCESS") {
    try {
      await settlePendingSquarePayments(order);
    } catch (error) {
      logger.error(`Square status check for ${order.order_number} failed: ${error.message}`);
    }
  }

  const payment = await Payment.findOne({
    where: { order_id: order.id },
    order: [["id", "DESC"]],
    attributes: ["id", "transaction_id", "payment_status", "payment_mode", "payment_provider", "amount", "currency"],
  });

  return {
    order_id: order.id,
    order_number: order.order_number,
    // PENDING, SUCCESS or REJECTED: the one the website goes by.
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
};

// Square's payment.created / payment.updated events. The event itself isn't trusted (audit C3):
// the payment is read back from Square with our own key, and only that is acted on, so a forged
// or replayed event changes nothing. Throws on our errors, so Square retries.
const squareWebhook = async (body) => {
  if (!["payment.created", "payment.updated"].includes(body?.type)) return { ignored: true };

  const paymentId = body?.data?.object?.payment?.id || body?.data?.id;
  if (!paymentId || typeof paymentId !== "string") return { ignored: true };

  let payment;
  try {
    ({ payment } = await squareClient().payments.get({ paymentId }));
  } catch (error) {
    // Not a payment of this Square account (for example, sandbox while production is set).
    if (error?.statusCode === 404) return { ignored: true };
    throw error;
  }

  if (!payment) return { ignored: true };

  const row = await Payment.findOne({ where: { transaction_id: payment.id, payment_provider: "SQUARE" } });

  let orderId = row?.order_id;
  if (!orderId && payment.referenceId) {
    // A removed order too: a completed payment brings it back (paymentCompletion.service.js).
    const order = await Order.findOne({ where: { order_number: payment.referenceId }, paranoid: false });
    orderId = order?.id;
  }

  if (!orderId) return { ignored: true };

  if (payment.status === "COMPLETED") {
    await completeOrderPayment({
      orderId,
      provider: "SQUARE",
      transactionId: payment.id,
      amount: squareAmount(payment),
      currency: payment.amountMoney?.currency,
      mode: row?.payment_mode || squareModeOf(payment),
      squareCustomerId: payment.customerId || row?.square_customer_id || null,
    });
  } else if (["FAILED", "CANCELED"].includes(payment.status)) {
    await failOrderPayment({ orderId, provider: "SQUARE", transactionId: payment.id, mode: row?.payment_mode });
  }

  return { handled: true };
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

      // The preview card uses the first item.
      const firstItem = order?.items?.[0];

      const customization = parseJson(firstItem?.customization_config);

      const customizedImage =
        firstItem?.logo_image || getCustomizationArtwork(customization);

      const items =
        order?.items?.map((item) => {
          const variant = item.variant || {};

          const product = item.product || {};

          const itemCustomization = parseJson(item.customization_config);

          return {
            product_id: product.id,

            product_name: decodeHtmlEntities(product.name || null),

            variant_id: variant.id,

            sku: variant.sku || null,

            original_image: getItemImage(item),

            customized_image: toFullImageUrl(
              item.logo_image || getCustomizationArtwork(itemCustomization),
            ),

            graphics: getLineGraphics(itemCustomization),

            price: Number(item.price || 0),

            quantity: Number(item.quantity || 0),

            total: Number(item.total_price || 0),

            customization_config: itemCustomization,

            pricing_snapshot: parseJson(item.pricing_snapshot),
          };
        }) || [];

      return {
        payment_id: p.id,

        transaction_id: p.transaction_id,

        amount: Number(p.amount || 0),

        currency: p.currency,

        status: p.status,

        payment_method: p.payment_method,

        created_at: p.created_at,

        order: order
          ? {
              order_id: order.id,

              order_number: order.order_number,

              total_amount: Number(order.total_amount || 0),

              subtotal_amount: Number(order.subtotal_amount || 0),

              handling_amount: Number(order.handling_amount || 0),

              shipping_amount: Number(order.shipping_amount || 0),

              tax_rate: Number(order.tax_rate || 0),

              tax_amount: Number(order.tax_amount || 0),

              pricing_breakdown: buildOrderTotals(order),

              payment_status: order.payment_status,

              shipment_status: order.shipment_status,

              tracking_number: order.tracking_number,

              tracking_url: order.tracking_url,

              preview: {
                product_name: decodeHtmlEntities(firstItem?.product?.name || null),

                original_image: getItemImage(firstItem),

                customized_image: toFullImageUrl(customizedImage),

                total_items: sumQuantity(order.items),

                print_method: customization?.print_method || null,

                type: customization?.type || null,

                custom_text: customization?.custom_text || null,
              },

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

    // No upper limit: until it pages again, the panel asks for every payment at once (F30).
    const positive = (value, fallback) => {
      const number = Number.parseInt(value, 10);
      return number > 0 ? number : fallback;
    };
    const page = positive(query.page, 1);
    const limit = positive(query.limit, 10);
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

    // Matches the customer's email or name. Only the page of ids below needs these joins.
    const searchInclude = search
      ? [
          {
            model: User,
            as: "user",
            attributes: [],
            required: false,
            paranoid: false,
            include: [{ model: Profile, as: "user_profile", attributes: [], required: false }],
          },
        ]
      : [];

    if (search) {
      where[Op.or] = [
        { "$user.email$": { [Op.like]: `%${search}%` } },
        { "$user.user_profile.name$": { [Op.like]: `%${search}%` } },
      ];
    }

    /*
     |--------------------------------------------------------------------------
     | GET PAYMENTS
     |--------------------------------------------------------------------------
     */

    // Pick the page of payment ids first, then load those payments with their orders and
    // items (F30). Paging the joined query counted item rows, not payments, so a page of 10
    // held as few as 2 payments, pages overlapped and a payment could lose items.
    const count = await Payment.count({
      where,
      include: searchInclude,
      distinct: true,
      col: "id",
    });

    const pageIds = await Payment.findAll({
      where,
      include: searchInclude,
      attributes: ["id"],
      group: ["Payment.id"],
      order: [["id", "DESC"]],
      limit,
      offset,
      subQuery: false,
      raw: true,
    });

    const ids = pageIds.map((row) => row.id);

    const rows = !ids.length ? [] : await Payment.findAll({
      where: { id: ids },

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

          // A closed account's payments keep showing who made them.
          paranoid: false,

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
    });

    /*
     |--------------------------------------------------------------------------
     | FORMAT RESPONSE
     |--------------------------------------------------------------------------
     */

    const payments = rows.map((payment) => {
      const data = payment.toJSON();

      const order = data.order;

      // The preview uses the first item.
      const firstItem = order?.items?.[0];

      const customization = parseJson(firstItem?.customization_config);

      const pricingSnapshot = parseJson(firstItem?.pricing_snapshot);

      const isManual = isManualItem(firstItem, customization, pricingSnapshot);

      return {
        payment_id: data.id,

        transaction_id: data.transaction_id,

        amount: Number(data.amount || 0),

        currency: data.currency,

        payment_status: data.payment_status,

        // The column is payment_mode; payment_method was always undefined (panel question F4).
        payment_method: data.payment_mode,

        payment_mode: data.payment_mode,

        payment_provider: data.payment_provider,

        created_at: data.created_at,

        user: data.user
          ? {
              id: data.user.id,

              name: data.user?.user_profile?.name || null,

              email: data.user?.email || null,

              mobile: data.user?.user_profile?.mobile || null,

              dialing_code: data.user?.user_profile?.dialing_code || null,
            }
          : null,

        order: order
          ? {
              order_id: order.id,

              order_number: order.order_number,

              subtotal_amount: Number(order.subtotal_amount || 0),

              handling_amount: Number(order.handling_amount || 0),

              tax_amount: Number(order.tax_amount || 0),

              // What the customer paid; the label's cost is actual_shipping_cost.
              shipping_amount: Number(order.shipping_amount || 0),

              actual_shipping_cost: Number(order.actual_shipping_cost || 0),

              total_amount: Number(order.total_amount || 0),

              payment_status: order.payment_status,

              shipment_status: order.shipment_status,

              tracking_number: order.tracking_number,

              tracking_url: order.tracking_url,

              carrier: order.carrier,

              created_at: order.created_at,

              preview: {
                product_name: decodeHtmlEntities(firstItem?.product?.name || null),

                original_image: getItemImage(firstItem),

                customized_image: toFullImageUrl(firstItem?.logo_image),

                total_items: sumQuantity(order.items),

                customization_type:
                  customization?.type || (isManual ? "MANUAL" : null),

                print_method: customization?.print_method || null,

                custom_text: customization?.custom_text || null,

                customization_summary: isManual
                  ? pricingSnapshot?.customization?.items || []
                  : pricingSnapshot?.pricing_table || [],
              },

              items: order.items.map((item) => {
                const variant = item.variant || {};

                const product = item.product || {};

                const itemCustomization = parseJson(item.customization_config);

                const itemPricing = parseJson(item.pricing_snapshot);

                return {
                  product_id: product.id,

                  product_name: decodeHtmlEntities(product.name),

                  variant_id: variant.id,

                  sku: variant.sku,

                  color: variant.color,

                  size: variant?.size_details?.name || null,

                  original_image: getItemImage(item),

                  customized_image: toFullImageUrl(item.logo_image),

                  quantity: Number(item.quantity || 0),

                  price: Number(item.price || 0),

                  total: Number(item.total_price || 0),

                  // Customers' original graphic files stay out of this list; the Orders page,
                  // which production works from, has them.
                  customization_config: withoutGraphics(itemCustomization),

                  pricing_snapshot: itemPricing,

                  pricing_breakdown: buildPricingBreakdown(
                    itemPricing,
                    isManualItem(item, itemCustomization, itemPricing),
                  ),
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

// ====================== PAYPAL ======================

// PayPal's own reason from an SDK error: { status, issue, description }.
const paypalErrorOf = (error) => {
  let result = error?.result;
  if (!result && typeof error?.body === "string") {
    try {
      result = JSON.parse(error.body);
    } catch {
      result = null;
    }
  }
  return {
    status: error?.statusCode || null,
    issue: result?.details?.[0]?.issue || result?.name || null,
    description: result?.details?.[0]?.description || result?.message || error?.message || null,
  };
};

const PAYPAL_MESSAGES = {
  INSTRUMENT_DECLINED: "PayPal declined this payment method. Please choose another one in PayPal, or another way to pay.",
  PAYER_ACTION_REQUIRED: "PayPal needs you to finish the payment there first. Please try PayPal again.",
  ORDER_NOT_APPROVED: "The PayPal payment wasn't approved. Please try PayPal again.",
  TRANSACTION_REFUSED: "PayPal refused this payment. Please use another way to pay.",
  MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED: "Too many PayPal attempts for this order. Please use another way to pay.",
};

const paypalAmount = (money) => Number(money?.value || 0);

// Refuses (409) while another payment for the order is going through. Square is asked first, so a
// charge that has finished or failed doesn't count; if Square can't be reached, it still does.
const refuseWhilePaying = async (order) => {
  if (!(await Payment.findOne({ where: unsettledPayments(order.id), attributes: ["id"] }))) return;

  let paid = false;
  try {
    paid = await settlePendingSquarePayments(order);
  } catch (error) {
    logger.error(`Square status check for ${order.order_number} failed: ${error.message}`);
  }

  if (paid) throw new ApiError(httpStatus.CONFLICT, "This order is already paid.");

  if (await Payment.findOne({ where: unsettledPayments(order.id), attributes: ["id"] })) {
    throw new ApiError(httpStatus.CONFLICT, ALREADY_GOING_THROUGH);
  }
};

// Starts a PayPal checkout for the order's total. The website sends the customer to approval_url.
const createPayPalOrder = async (body) => {
  const { user, order_id } = body;

  if (!order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
  }

  const order = await Order.findOne({ where: { id: order_id, user_id: user.id } });

  if (!order) {
    throw await orderGone(user, order_id);
  }

  if (order.payment_status === paymentStatusTypes.SUCCESS) {
    throw new ApiError(httpStatus.CONFLICT, "This order is already paid.");
  }

  if (order.status === orderStatusTypes.CANCELLED) {
    throw new ApiError(httpStatus.CONFLICT, "This order was cancelled. Please place a new order.");
  }

  const amount = Number(order.total_amount);

  if (!(amount > 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This order has nothing to pay.");
  }

  // One payment at a time (audit F10): not while a Cash App or Google Pay charge is going through.
  await refuseWhilePaying(order);

  const website = settings.getRequired("FRONTEND_URL");

  let paypalOrder;
  try {
    const response = await new OrdersController(getPaypalClient()).createOrder({
      body: {
        intent: "CAPTURE",
        purchaseUnits: [
          {
            // How the capture and the webhook find the order.
            referenceId: String(order.id),
            customId: order.order_number,
            description: `HashtagBillionaire order ${order.order_number}`,
            amount: {
              currencyCode: order.currency || "USD",
              value: amount.toFixed(2),
            },
          },
        ],
        applicationContext: {
          returnUrl: `${website}/checkout/paypal/success`,
          cancelUrl: `${website}/checkout/paypal/cancel`,
        },
      },
    });
    paypalOrder = response.result;
  } catch (error) {
    const detail = paypalErrorOf(error);
    logger.error(`PayPal order for ${order.order_number} failed: ${detail.status} ${detail.issue} ${detail.description}`);
    throw new ApiError(httpStatus.BAD_GATEWAY, "PayPal couldn't start the payment. Please try again or use another way to pay.");
  }

  const approvalLink = paypalOrder.links?.find((link) => link.rel === "approve" || link.rel === "payer-action");

  return {
    order_id: order.id,
    paypal_order_id: paypalOrder.id,
    approval_url: approvalLink?.href || null,
    status: paypalOrder.status,
  };
};

// After the customer approves in PayPal: takes the money and marks the order paid straight away.
// Safe to repeat (a refresh of the return page): an order already captured is read, not captured
// again.
const capturePayPalOrder = async (body) => {
  const { user, order_id, paypal_order_id } = body;

  if (!order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "order_id is required.");
  }

  if (!paypal_order_id || typeof paypal_order_id !== "string") {
    throw new ApiError(httpStatus.BAD_REQUEST, "paypal_order_id is required.");
  }

  const order = await Order.findOne({ where: { id: order_id, user_id: user.id } });

  if (!order) {
    throw await orderGone(user, order_id);
  }

  const result = (status, capture) => ({
    order_id: order.id,
    order_number: order.order_number,
    paypal_order_id,
    paypal_capture_id: capture?.id || null,
    status,
    payment_status: order.payment_status,
    amount: capture?.amount || null,
  });

  if (order.payment_status === paymentStatusTypes.SUCCESS) {
    return result("COMPLETED", null);
  }

  if (order.status === orderStatusTypes.CANCELLED) {
    throw new ApiError(httpStatus.CONFLICT, "This order was cancelled, so the PayPal payment wasn't taken.");
  }

  // One payment at a time (audit F10): a Cash App or Google Pay charge still going through is
  // checked with Square first. If it has just paid the order, PayPal takes nothing.
  try {
    await refuseWhilePaying(order);
  } catch (error) {
    await order.reload();
    if (order.payment_status === paymentStatusTypes.SUCCESS) return result("COMPLETED", null);
    throw error;
  }

  let paypalOrder;
  let capture;
  let paidMeanwhile = false;

  // As for a Square charge: the order row stays locked while PayPal takes the money and the
  // capture is recorded, so a card charge or a cart change can't happen at the same moment.
  await sequelize.transaction(async (transaction) => {
    const locked = await Order.findOne({
      where: { id: order_id, user_id: user.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!locked) throw await orderGone(user, order_id);

    if (locked.payment_status === paymentStatusTypes.SUCCESS) {
      paidMeanwhile = true;
      return;
    }

    if (locked.status === orderStatusTypes.CANCELLED) {
      throw new ApiError(httpStatus.CONFLICT, "This order was cancelled, so the PayPal payment wasn't taken.");
    }

    if (await Payment.findOne({ where: unsettledPayments(locked.id), attributes: ["id"], transaction })) {
      throw new ApiError(httpStatus.CONFLICT, ALREADY_GOING_THROUGH);
    }

    const orders = new OrdersController(getPaypalClient());

    try {
      paypalOrder = (await orders.captureOrder({ id: paypal_order_id })).result;
    } catch (error) {
      const detail = paypalErrorOf(error);

      if (detail.issue === "ORDER_ALREADY_CAPTURED") {
        paypalOrder = (await orders.getOrder({ id: paypal_order_id })).result;
      } else {
        logger.error(`PayPal capture for ${locked.order_number} failed: ${detail.status} ${detail.issue} ${detail.description}`);
        throw new ApiError(
          detail.status && detail.status < 500 ? httpStatus.BAD_REQUEST : httpStatus.BAD_GATEWAY,
          PAYPAL_MESSAGES[detail.issue] || "PayPal didn't complete the payment. Please try again or use another way to pay.",
        );
      }
    }

    const unit = paypalOrder?.purchaseUnits?.[0];

    // The PayPal order must be the one made for this order.
    if (String(unit?.referenceId) !== String(locked.id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "This PayPal payment doesn't belong to this order.");
    }

    capture = unit?.payments?.captures?.[0];

    if (!capture) {
      throw new ApiError(httpStatus.BAD_REQUEST, "PayPal didn't complete the payment. Please try again.");
    }

    // Recorded before the lock is released, so the other payment endpoints and the cart see it.
    // A completed one becomes SUCCESS below; one PayPal is still reviewing stays PENDING until its
    // webhook arrives.
    if (["COMPLETED", "PENDING"].includes(capture.status)) {
      await Payment.findOrCreate({
        where: { transaction_id: capture.id, payment_provider: "PAYPAL" },
        defaults: {
          order_id: locked.id,
          user_id: locked.user_id,
          amount: paypalAmount(capture.amount),
          currency: capture.amount?.currencyCode || locked.currency || "USD",
          payment_status: paymentStatusTypes.PENDING,
          payment_mode: paymentModeTypes.PAYPAL,
          description: `PayPal payment for order ${locked.order_number}`,
        },
        transaction,
      });
    }

    // Still being reviewed after an earlier failed attempt: the order is unpaid again, not failed.
    if (capture.status === "PENDING" && locked.payment_status === paymentStatusTypes.REJECTED) {
      await locked.update(
        { payment_status: paymentStatusTypes.PENDING, status: orderStatusTypes.PENDING_PAYMENT },
        { transaction },
      );
    }
  });

  if (paidMeanwhile) {
    await order.reload();
    return result("COMPLETED", null);
  }

  if (capture.status === "COMPLETED") {
    await completeOrderPayment({
      orderId: order.id,
      provider: "PAYPAL",
      transactionId: capture.id,
      amount: paypalAmount(capture.amount),
      currency: capture.amount?.currencyCode || order.currency,
      mode: paymentModeTypes.PAYPAL,
    });
    await order.reload();
    return result("COMPLETED", capture);
  }

  if (capture.status === "PENDING") {
    // PayPal is still reviewing it; its webhook completes the order.
    await order.reload();
    return result("PENDING", capture);
  }

  await failOrderPayment({
    orderId: order.id,
    provider: "PAYPAL",
    transactionId: capture.id,
    amount: paypalAmount(capture.amount),
    mode: paymentModeTypes.PAYPAL,
  });
  throw new ApiError(httpStatus.BAD_REQUEST, "PayPal declined the payment. Please use another way to pay.");
};

// PayPal's PAYMENT.CAPTURE.* events. The event itself isn't trusted (audit C3): the capture and its
// order are read back from PayPal with our own credentials, and only that is acted on. Throws on
// our errors, so PayPal retries.
const paypalWebhook = async (body) => {
  const eventType = body?.event_type;

  if (!["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(eventType)) {
    return { ignored: true };
  }

  const captureId = body?.resource?.id;
  if (!captureId || typeof captureId !== "string") return { ignored: true };

  let capture;
  try {
    capture = (await new PaymentsController(getPaypalClient()).getCapturedPayment({ captureId })).result;
  } catch (error) {
    // Not a capture of this PayPal account (for example, sandbox while live is set).
    if (paypalErrorOf(error).status === 404) return { ignored: true };
    throw error;
  }

  const paypalOrderId = capture?.supplementaryData?.relatedIds?.orderId;
  if (!paypalOrderId) return { ignored: true };

  const paypalOrder = (await new OrdersController(getPaypalClient()).getOrder({ id: paypalOrderId })).result;
  const orderId = paypalOrder?.purchaseUnits?.[0]?.referenceId;
  if (!orderId) return { ignored: true };

  // A removed order too: a completed payment brings it back (paymentCompletion.service.js).
  const order = await Order.findByPk(orderId, { paranoid: false });
  if (!order) return { ignored: true };

  if (capture.status === "COMPLETED") {
    await completeOrderPayment({
      orderId: order.id,
      provider: "PAYPAL",
      transactionId: capture.id,
      amount: paypalAmount(capture.amount),
      currency: capture.amount?.currencyCode || order.currency,
      mode: paymentModeTypes.PAYPAL,
    });
  } else if (["DECLINED", "FAILED"].includes(capture.status)) {
    await failOrderPayment({
      orderId: order.id,
      provider: "PAYPAL",
      transactionId: capture.id,
      amount: paypalAmount(capture.amount),
      mode: paymentModeTypes.PAYPAL,
    });
  }

  return { handled: true };
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

  // For unpaidOrders.service.js: an order mustn't be removed while it's being paid.
  settlePendingSquarePayments,
  unsettledPayments,
};
