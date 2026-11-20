// Order emails to the customer: confirmed (paid), cancelled, shipped and delivered. They come
// from the order address (order@, email.service.js), and replies go back to it. Each returns
// { subject, text, html }.
//
// `order` is what orderEmails.service.js reads from the order:
//   name, orderNumber, orderDate, paidWith, shipTo (lines), total ("$12.50"),
//   items [{ name, detail, quantity, amount }], totals [[label, amount, bold]],
//   carrier, trackingNumber, trackingUrl, ordersLink, contact

const { brandName, greeting, renderEmail } = require("./layout");

const itemLines = (items) =>
  items.map((item) => `- ${item.quantity} × ${item.name}${item.detail ? ` (${item.detail})` : ""}: ${item.amount}`).join("\n");

const totalLines = (totals) => totals.map(([label, amount]) => `${label}: ${amount}`).join("\n");

const viewOrders = (order) => (order.ordersLink ? { text: "View your orders", link: order.ordersLink } : undefined);

// Paid: the order is confirmed.
const orderConfirmedEmail = (order) => {
  const intro = `we've received your payment for order ${order.orderNumber}. We're getting it ready and will email you when it ships.`;

  return {
    subject: `Order ${order.orderNumber} confirmed`,
    text: [
      `${greeting(order.name)} ${intro}`,
      itemLines(order.items),
      totalLines(order.totals),
      `Ship to:\n${order.shipTo || "—"}`,
      order.ordersLink ? `View your orders: ${order.ordersLink}` : "",
      "Questions about your order? Just reply to this email.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: renderEmail({
      heading: "Thanks for your order",
      paragraphs: [`${greeting(order.name)} ${intro}`],
      details: [
        ["Order", order.orderNumber],
        ["Placed", order.orderDate],
        ...(order.paidWith ? [["Paid with", order.paidWith]] : []),
        ["Ship to", order.shipTo],
      ],
      items: order.items,
      totals: order.totals,
      button: viewOrders(order),
      note: "Questions about your order? Just reply to this email.",
      contact: order.contact,
    }),
  };
};

// Cancelled by the team. refund: the amount paid, when the order was paid (the team refunds it in
// Square or PayPal; cancelling itself doesn't).
const orderCancelledEmail = (order, { refund } = {}) => {
  const paragraphs = [
    `${greeting(order.name)} we've cancelled your order ${order.orderNumber}.`,
    refund ? `We'll refund the ${refund} you paid${order.paidWith ? ` by ${order.paidWith}` : ""}.` : null,
  ].filter(Boolean);
  const note = "If you didn't expect this or have any questions, just reply to this email.";

  return {
    subject: `Order ${order.orderNumber} cancelled`,
    text: [...paragraphs, `Cancelled:\n${itemLines(order.items)}`, note].join("\n\n"),
    html: renderEmail({
      heading: "Your order was cancelled",
      paragraphs,
      details: [
        ["Order", order.orderNumber],
        ["Placed", order.orderDate],
      ],
      items: order.items,
      note,
      contact: order.contact,
    }),
  };
};

// The carrier has it.
const orderShippedEmail = (order) => {
  const intro = `good news: order ${order.orderNumber} is on its way.`;
  const button = order.trackingUrl ? { text: "Track your package", link: order.trackingUrl } : viewOrders(order);

  return {
    subject: `Your order ${order.orderNumber} has shipped`,
    text: [
      `${greeting(order.name)} ${intro}`,
      order.carrier ? `Carrier: ${order.carrier}` : "",
      order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : "",
      order.trackingUrl ? `Track it: ${order.trackingUrl}` : "",
      `Ship to:\n${order.shipTo || "—"}`,
      itemLines(order.items),
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: renderEmail({
      heading: "Your order is on its way",
      paragraphs: [`${greeting(order.name)} ${intro}`],
      details: [
        ["Order", order.orderNumber],
        ...(order.carrier ? [["Carrier", order.carrier]] : []),
        ...(order.trackingNumber ? [["Tracking number", order.trackingNumber]] : []),
        ["Ship to", order.shipTo],
      ],
      items: order.items,
      button,
      contact: order.contact,
    }),
  };
};

// The carrier delivered it.
const orderDeliveredEmail = (order) => {
  const paragraphs = [
    `${greeting(order.name)} order ${order.orderNumber} was delivered.`,
    `We hope you love it. If anything isn't right, just reply to this email and we'll help.`,
  ];

  return {
    subject: `Your order ${order.orderNumber} was delivered`,
    text: [...paragraphs, `Delivered to:\n${order.shipTo || "—"}`, `Thanks for shopping with ${brandName()}.`].join("\n\n"),
    html: renderEmail({
      heading: "Your order was delivered",
      paragraphs,
      details: [
        ["Order", order.orderNumber],
        ["Delivered to", order.shipTo],
      ],
      items: order.items,
      button: viewOrders(order),
      contact: order.contact,
    }),
  };
};

module.exports = {
  orderConfirmedEmail,
  orderCancelledEmail,
  orderShippedEmail,
  orderDeliveredEmail,
};
