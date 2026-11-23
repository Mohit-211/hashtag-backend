// Order emails to the customer, from the order address (order@, email.service.js): confirmed
// when paid, cancelled, shipped and delivered. Each is sent after the change is saved and is never
// awaited by it: a mail problem is logged, and never fails or undoes a payment, a cancellation or
// a tracking update. Artwork approval emails are sent from the admin panel's Artwork approval
// page instead (orderApproval.service.js), which shows whether they went. Reprints have no emails
// yet.

const settings = require("../../config/settings");
const logger = require("../../config/logger");
const { Order, OrderItem, Product, ProductVariant, Size, Address, User, Profile } = require("../../models");
const { parseJson } = require("../../utils/orderFormat");
const {
  sendOrderConfirmedEmail,
  sendOrderCancelledEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
} = require("./email.service");

// Dates as the store reads them (the 8.25% Texas tax; dashboard.service.js uses the same).
const STORE_TIMEZONE = "America/Chicago";

const money = (amount) => `$${Number(amount || 0).toFixed(2)}`;

const PAYMENT_LABELS = {
  CREDIT_CARD: "card",
  DEBIT_CARD: "debit card",
  CARD: "card",
  APPLE_PAY: "Apple Pay",
  GOOGLE_PAY: "Google Pay",
  CASH_APP: "Cash App",
  AFTERPAY: "Afterpay",
  BANK_ACCOUNT: "bank account",
  ACH: "bank account",
  PAYPAL: "PayPal",
};

const loadOrder = (orderId) =>
  Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [
          // Deleted products still belong in order history.
          { model: Product, as: "product", paranoid: false, attributes: ["id", "name"] },
          {
            model: ProductVariant,
            as: "variant",
            paranoid: false,
            attributes: ["id", "color", "meta"],
            include: [{ model: Size, as: "size_details", attributes: ["name"], required: false }],
          },
        ],
      },
      { model: Address, as: "address", paranoid: false, required: false },
      {
        model: User,
        as: "user",
        attributes: ["id", "email"],
        include: [{ model: Profile, as: "user_profile", attributes: ["name"], required: false }],
      },
    ],
  });

// "Black · L", or "Black · Paper: Matte · Finish: Gloss": the options the customer picked. A
// variant made in the admin panel keeps its full selection in meta.option_values (its size column
// is only the first of them, product.service.js); a supplier's variant has a colour and a size.
const optionsOf = (item) => {
  const variant = item.variant;
  let meta = parseJson(variant?.meta);
  if (typeof meta === "string") meta = parseJson(meta); // saved as text inside the JSON column
  const stored = meta?.option_values;
  const values = Array.isArray(stored) ? stored.filter((o) => o?.value) : [];
  if (values.length) {
    return values.map((o) => (o.type === "color" || !o.name ? String(o.value) : `${o.name}: ${o.value}`)).join(" · ");
  }
  return [variant?.color, variant?.size_details?.name].filter(Boolean).join(" · ");
};

const shipToOf = (address) =>
  address
    ? [
        address.name,
        address.address_line1,
        address.address_line2,
        [address.city, [address.state, address.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        address.country && address.country !== "US" ? address.country : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

// What the order templates need (templates/templates/orders.js), and who to send it to.
const describeOrder = (order) => {
  const site = settings.get("FRONTEND_URL");
  const paid = PAYMENT_LABELS[order.payment_method] || null;
  const totals = [
    ["Items", money(order.subtotal_amount)],
    ...(Number(order.handling_amount) > 0 ? [["Handling", money(order.handling_amount)]] : []),
    ["Shipping", money(order.shipping_amount)],
    ...(Number(order.tax_amount) > 0 ? [["Tax", money(order.tax_amount)]] : []),
    ["Total", money(order.total_amount), true],
  ];

  return {
    to: order.user?.email || null,
    order: {
      name: order.user?.user_profile?.name || order.address?.name || null,
      orderNumber: order.order_number,
      orderDate: new Date(order.created_at).toLocaleDateString("en-US", {
        timeZone: STORE_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      paidWith: paid ? paid.charAt(0).toUpperCase() + paid.slice(1) : null,
      paidWithLower: paid,
      shipTo: shipToOf(order.address),
      total: money(order.total_amount),
      items: (order.items || []).map((item) => ({
        name: item.product?.name || item.name,
        detail: optionsOf(item),
        quantity: item.quantity,
        amount: money(item.total_price),
      })),
      totals,
      carrier: order.carrier_code ? String(order.carrier_code).replace(/_/g, " ").toUpperCase() : null,
      trackingNumber: order.tracking_number || null,
      trackingUrl: order.tracking_url || null,
      ordersLink: site ? `${site}/orders` : null,
    },
  };
};

// Sends one order email; never throws. `send` returns false when this order gets no email.
// Returns true when it was sent.
const notify = async (what, orderId, send) => {
  let label = `#${orderId}`;
  try {
    const order = await loadOrder(orderId);
    if (!order) return false;
    label = order.order_number;

    const { to, order: details } = describeOrder(order);
    if (!to) {
      logger.warn(`Order ${order.order_number}: no customer email, so no "${what}" email.`);
      return false;
    }

    if ((await send(to, details, order)) === false) return false;
    logger.info(`Order ${order.order_number}: "${what}" email sent.`);
    return true;
  } catch (error) {
    logger.error(`Order ${label}: the "${what}" email failed: ${error.message}`);
    return false;
  }
};

// Paid: the order is confirmed.
const notifyOrderConfirmed = (orderId) => notify("order confirmed", orderId, (to, order) => sendOrderConfirmedEmail(to, order));

// Cancelled by the team. Only a paid order: the customer never placed an unpaid one, as far as
// they know. The refund is the amount paid (the team refunds it in Square or PayPal).
const notifyOrderCancelled = (orderId) =>
  notify("order cancelled", orderId, async (to, order, row) => {
    if (row.payment_status !== "SUCCESS") return false;
    await sendOrderCancelledEmail(to, { ...order, paidWith: order.paidWithLower }, { refund: order.total });
  });

const notifyOrderShipped = (orderId) => notify("order shipped", orderId, (to, order) => sendOrderShippedEmail(to, order));

const notifyOrderDelivered = (orderId) => notify("order delivered", orderId, (to, order) => sendOrderDeliveredEmail(to, order));

module.exports = {
  notifyOrderConfirmed,
  notifyOrderCancelled,
  notifyOrderShipped,
  notifyOrderDelivered,
};
