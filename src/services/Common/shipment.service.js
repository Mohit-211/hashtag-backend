const httpStatus = require("http-status");
const { Op } = require("sequelize");

const { Address, Carrier, Order, OrderItem, Product, ProductVariant } = require("../../models");
const ApiError = require("../../utils/ApiError");
const logger = require("../../config/logger");
const {
  createShipment,
  purchaseLabel,
  findLabel,
  shipstationMessage,
} = require("../../config/shipstation");

// What happens to an order in ShipStation once it's paid: it's created there, where it shows in
// the dashboard, and its label is bought for the customer's chosen service. The customer has
// already paid the quoted rate, and the label's real cost doesn't change that (Q28).

// A claim older than this was left by a crash, so the label can be tried again.
const CLAIM_TIMEOUT_MINUTES = 10;

// ShipStation's tracking status codes, as order statuses. The others (NY: not yet in the
// system, UN: unknown) say nothing new.
const TRACKING_STATUSES = {
  AC: "IN_TRANSIT",
  IT: "IN_TRANSIT",
  AT: "IN_TRANSIT",
  DE: "DELIVERED",
  SP: "DELIVERED",
  EX: "EXCEPTION",
};

// A label costs money and payment webhooks can repeat, so only the attempt that sets
// label_claimed_at goes on.
const claimLabel = async (orderId) => {
  const [claimed] = await Order.update(
    { label_claimed_at: new Date() },
    {
      where: {
        id: orderId,
        payment_status: "SUCCESS",
        label_id: null,
        status: { [Op.ne]: "CANCELLED" },
        [Op.or]: [
          { label_claimed_at: null },
          { label_claimed_at: { [Op.lt]: new Date(Date.now() - CLAIM_TIMEOUT_MINUTES * 60 * 1000) } },
        ],
      },
    },
  );

  return claimed === 1;
};

// Orders placed before carrier_id was saved have only the carrier's code.
const carrierIdFor = async (order) => {
  if (order.carrier_id) return order.carrier_id;

  const carrier = await Carrier.findOne({
    where: { carrier_code: order.carrier_code, is_active: true },
  });

  return carrier?.carrier_id;
};

const saveLabel = async (order, label) => {
  const actualCost = Number(label.shipment_cost?.amount || 0);

  await order.update({
    label_id: label.label_id,
    label_url: label.label_download?.pdf || label.label_download?.href || null,
    tracking_number: label.tracking_number || null,
    tracking_url: label.tracking_url || null,
    carrier: label.carrier_code || order.carrier_code,
    actual_shipping_cost: actualCost,
    shipping_profit: Number((Number(order.quoted_shipping_amount || 0) - actualCost).toFixed(2)),
    shipment_status: "LABEL_CREATED",
    shipment_error: null,
  });

  await OrderItem.update({ shipment_status: "LABEL_CREATED" }, { where: { order_id: order.id } });
};

// Puts a paid order in ShipStation and buys its label. A failure doesn't touch the payment: it's
// kept on the order for the admin, who can try again. Returns false if this attempt didn't run.
const shipPaidOrder = async (orderId) => {
  if (!(await claimLabel(orderId))) return false;

  const order = await Order.findByPk(orderId);

  try {
    const orderItems = await OrderItem.findAll({
      where: { order_id: order.id },
      include: [
        { model: ProductVariant, as: "variant" },
        { model: Product, as: "product", attributes: ["name"] },
      ],
    });

    // Kept even if the customer has since deleted the address.
    const address = await Address.findByPk(order.address_id, { paranoid: false });

    const carrierId = await carrierIdFor(order);
    const isRetry = Boolean(order.shipment_id);

    if (!isRetry) {
      const shipment = await createShipment({ order, orderItems, address, carrierId });

      await order.update({
        shipment_id: shipment.shipment_id,
        shipstation_order_id: shipment.external_order_id || null,
      });
    }

    // A crash can come after the purchase and before it's saved, so a retry looks first.
    const label =
      (isRetry && (await findLabel(order.shipment_id))) ||
      (await purchaseLabel({
        shipmentId: order.shipment_id,
        carrierId,
        serviceCode: order.service_code,
      }));

    await saveLabel(order, label);

    console.log(`✅ LABEL CREATED: ${order.order_number}`);
  } catch (error) {
    const message = shipstationMessage(error);

    logger.error(`Label for order ${order.order_number} failed: ${message}`);

    await order.update({
      shipment_status: "FAILED",
      shipment_error: String(message).slice(0, 500),
      label_claimed_at: null,
    });
  }

  return true;
};

// The admin's "try again" for a paid order whose label failed.
const retryOrderShipment = async (orderId) => {
  const order = await Order.findByPk(orderId);

  if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");

  if (order.payment_status !== "SUCCESS") {
    throw new ApiError(httpStatus.BAD_REQUEST, "This order hasn't been paid");
  }

  if (order.status === "CANCELLED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "This order is cancelled");
  }

  if (order.label_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "This order already has a label");
  }

  if (!(await shipPaidOrder(order.id))) {
    throw new ApiError(httpStatus.CONFLICT, "A label is already being bought for this order");
  }

  await order.reload();

  if (order.shipment_status === "FAILED") {
    throw new ApiError(httpStatus.BAD_GATEWAY, order.shipment_error);
  }

  return {
    id: order.id,
    order_number: order.order_number,
    shipment_status: order.shipment_status,
    carrier: order.carrier,
    tracking_number: order.tracking_number,
    tracking_url: order.tracking_url,
    label_url: order.label_url,
    actual_shipping_cost: Number(order.actual_shipping_cost || 0),
    shipping_profit: Number(order.shipping_profit || 0),
  };
};

// Applies a track_event_v2 webhook to the order with that tracking number.
const updateOrderTracking = async (event) => {
  if (event.resource_type !== "TRACK_EVENT_V2" || !event.data?.tracking_number) return;

  const { tracking_number, tracking_url, status_code, ship_date } = event.data;

  const order = await Order.findOne({ where: { tracking_number } });

  // Nothing moves a delivered or cancelled order.
  if (!order || ["DELIVERED", "CANCELLED"].includes(order.status)) return;

  const shipmentStatus = TRACKING_STATUSES[status_code];

  if (!shipmentStatus) return;

  const update = { shipment_status: shipmentStatus };

  if (tracking_url) update.tracking_url = tracking_url;

  if (shipmentStatus === "IN_TRANSIT") {
    update.status = "SHIPPED";
    update.shipped_at = order.shipped_at || ship_date || new Date();
  }

  if (shipmentStatus === "DELIVERED") {
    update.status = "DELIVERED";
    update.shipped_at = order.shipped_at || ship_date || new Date();
  }

  await order.update(update);

  if (update.status) {
    await OrderItem.update({ shipment_status: "SHIPPED" }, { where: { order_id: order.id } });
  }
};

module.exports = {
  shipPaidOrder,
  retryOrderShipment,
  updateOrderTracking,
};
