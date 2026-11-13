// The admin panel's Cancel order and Delete order. The rules for when each is allowed are in
// orderActions.js, the same ones GET order/admin sends to the panel as buttons.

const httpStatus = require("http-status");
const { Op } = require("sequelize");

const sequelize = require("../../config/central.db");
const logger = require("../../config/logger");
const { Order, OrderItem, ProductVariant } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { voidLabel, cancelShipment } = require("../../config/shipstation");
const { releaseOrderGraphics } = require("./graphic.service");
const { orderActions, ordersWithPaymentInProgress } = require("./orderActions");
const { CLAIM_TIMEOUT_MINUTES } = require("./shipment.service");
const { getAdminOrders } = require("./order.service");

const adminView = async (orderId) => (await getAdminOrders({ order_id: orderId })).data[0] || null;

const findOrder = async (orderId) => {
  const order = await Order.findByPk(orderId);
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  return order;
};

// Why an order can't be cancelled, in the admin's words.
const whyNotCancellable = (order) => {
  if (order.status === "CANCELLED") return "This order is already cancelled.";
  if (["SHIPPED", "DELIVERED"].includes(order.status) || ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "EXCEPTION"].includes(order.shipment_status)) {
    return "The carrier already has this parcel, so the order can't be cancelled here.";
  }
  return "A label is being bought for this order right now. Try again in a minute.";
};

// Takes the label claim so no label purchase can start while the order is cancelled; returns
// false when a purchase is running. An order that already has a label can't be having one bought,
// so it needs no claim. The claim only moves from empty or stale to now: MariaDB counts changed
// rows, so an update that wrote the same value would read as "not claimed".
const claimForCancel = async (order) => {
  if (order.label_id) return true;

  const [claimed] = await Order.update(
    { label_claimed_at: new Date() },
    {
      where: {
        id: order.id,
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

const releaseClaim = (orderId) => Order.update({ label_claimed_at: null }, { where: { id: orderId } });

// Voids an unused label and takes the order off ShipStation, puts stock back if it was paid, and
// marks the order cancelled. It doesn't refund: the team refunds in Square or PayPal (client
// question 34). Returns { order, warnings }.
const adminCancelOrder = async (orderId, { reason, adminId } = {}) => {
  const order = await findOrder(orderId);
  const cleanReason = reason ? String(reason).trim().slice(0, 255) : null;

  if (!orderActions(order).can_cancel) {
    throw new ApiError(httpStatus.BAD_REQUEST, whyNotCancellable(order));
  }

  if (!(await claimForCancel(order))) {
    throw new ApiError(httpStatus.CONFLICT, "A label is being bought for this order right now. Try again in a minute.");
  }

  const warnings = [];

  try {
    // A label that can't be voided may already be with the carrier: stop, change nothing. Once
    // voided, the shipment is marked CANCELLED straight away, so a retry after a later failure
    // doesn't try to void it again.
    if (order.label_id && order.shipment_status !== "CANCELLED") {
      const result = await voidLabel(order.label_id);
      if (!result.approved) {
        await releaseClaim(order.id);
        throw new ApiError(
          httpStatus.CONFLICT,
          `ShipStation didn't void the label, so the order wasn't cancelled: ${result.message || "no reason given"}`,
        );
      }
      await Order.update({ shipment_status: "CANCELLED" }, { where: { id: order.id } });
    }

    if (order.shipment_id) {
      const result = await cancelShipment(order.shipment_id);
      if (!result.cancelled) {
        warnings.push(
          `The order is cancelled here, but ShipStation still lists it. Cancel ${order.order_number} in ShipStation by hand. ShipStation said: ${result.message || "no reason given"}`,
        );
      }
    }

    await sequelize.transaction(async (transaction) => {
      const current = await Order.findByPk(order.id, {
        include: [{ model: OrderItem, as: "items" }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // Paid by now (a payment can land while this runs): its stock was taken, so it goes back.
      if (current.payment_status === "SUCCESS") {
        for (const item of current.items) {
          const variant = await ProductVariant.findByPk(item.variant_id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
            paranoid: false,
          });
          if (variant?.track_inventory) {
            await variant.increment("stock", { by: item.quantity, transaction });
          }
        }
        warnings.push(
          `The customer paid $${Number(current.total_amount).toFixed(2)} by ${current.payment_method || "card"}. Refund them in ${current.payment_method === "PAYPAL" ? "PayPal" : "Square"}: cancelling doesn't refund.`,
        );
      }

      await current.update(
        {
          status: "CANCELLED",
          shipment_status: "CANCELLED",
          cancelled_at: new Date(),
          cancelled_by: adminId || null,
          cancel_reason: cleanReason,
          label_claimed_at: null,
        },
        { transaction },
      );

      await OrderItem.update({ shipment_status: "CANCELLED" }, { where: { order_id: current.id }, transaction });

      // Its graphics count as new again for the $35 fee.
      await releaseOrderGraphics(current, transaction);
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      await releaseClaim(order.id).catch(() => {});
      logger.error(`Cancelling order ${order.order_number} failed: ${error.message}`);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "The order couldn't be cancelled. Nothing was changed; try again.");
    }
    throw error;
  }

  logger.info(`Admin ${adminId} cancelled order ${order.order_number}${cleanReason ? `: ${cleanReason}` : ""}`);

  return { order: await adminView(order.id), warnings };
};

// Hides an order (soft delete): unpaid ones, or cancelled ones. Returns { id, order_number }.
const adminDeleteOrder = async (orderId, { adminId } = {}) => {
  const order = await findOrder(orderId);
  const inProgress = await ordersWithPaymentInProgress([Number(order.id)]);

  if (!orderActions(order, { paymentInProgress: inProgress.has(Number(order.id)) }).can_delete) {
    let message = "Only unpaid or cancelled orders can be deleted. Cancel this order first.";
    if (inProgress.has(Number(order.id))) message = "A payment for this order is still being processed, so it can't be deleted yet.";
    else if (order.label_id && order.status !== "CANCELLED") message = "This order has a shipping label. Cancel it first, which voids the label.";
    throw new ApiError(httpStatus.BAD_REQUEST, message);
  }

  await sequelize.transaction(async (transaction) => {
    const current = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });

    // Paid while the admin was looking: refuse rather than hide a paid order.
    if (current.payment_status === "SUCCESS" && current.status !== "CANCELLED") {
      throw new ApiError(httpStatus.BAD_REQUEST, "This order has just been paid, so it can't be deleted. Refresh the page.");
    }

    await releaseOrderGraphics(current, transaction);
    await OrderItem.destroy({ where: { order_id: current.id }, transaction });
    await current.destroy({ transaction });
  });

  logger.info(`Admin ${adminId} deleted order ${order.order_number}`);

  return { id: Number(order.id), order_number: order.order_number };
};

module.exports = { adminCancelOrder, adminDeleteOrder };
