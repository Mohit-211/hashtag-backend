// A customer's unpaid orders. Checkout makes an order from the cart; the customer pays it, goes
// back (which makes a new one), or a payment is declined. Only the order made from the cart as it
// is now may be paid (audit F10), so every other unpaid order is retired when the cart changes or
// a new order is made. An order whose payment is still going through is never retired (audit
// F01): the money would arrive for an order that's gone. The change is refused instead.
//
// Retiring depends on whether the customer tried to pay:
// - No payment at all (made at checkout, then the customer went back): the order and its items
//   are removed. No history shows such an order.
// - A payment was tried and failed: the order stays, so My Orders and Payment History keep showing
//   it, with its items, as "Payment failed". It's closed (is_active false), so it can't be paid
//   any more (utils/closedOrder.js).

const httpStatus = require("http-status");

const sequelize = require("../../config/central.db");
const { cancelShipstationShipment } = require("../../config/shipstation");
const { Order, OrderItem, Payment } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { settlePendingSquarePayments, unsettledPayments } = require("./checkout.service");
const { isClosedOrder: isClosed } = require("../../utils/closedOrder");

// Not paid and not cancelled: waiting for payment (PENDING is the old name), or a declined payment.
const UNPAID = {
  payment_status: ["PENDING", "REJECTED"],
  status: ["PENDING", "PENDING_PAYMENT", "FAILED"],
};

const isUnpaid = (order) =>
  UNPAID.payment_status.includes(order.payment_status) && UNPAID.status.includes(order.status);

const paymentInProgress = (order, refused) =>
  new ApiError(
    httpStatus.CONFLICT,
    `Your payment for order ${order.order_number} is still going through, so ${refused}. Check My Orders in a minute, then try again.`,
  );

// Removes the customer's unpaid orders and their items. `refused` finishes the sentence the
// customer sees when an order is being paid: "Your payment for order HB-… is still going through,
// so your cart can't change yet."
const retireUnpaidOrders = async (userId, refused = "your cart can't change yet") => {
  const unpaid = await Order.findAll({
    where: { user_id: userId, ...UNPAID },
    order: [["id", "DESC"]],
  });

  for (const found of unpaid) {
    // Closed earlier: nothing more to do.
    if (isClosed(found)) continue;

    // A payment was sent and hasn't finished: ask Square what happened to it first, so one that
    // has completed or failed doesn't hold anything up. PayPal's webhook settles its own.
    if (await Payment.findOne({ where: unsettledPayments(found.id), attributes: ["id"] })) {
      try {
        await settlePendingSquarePayments(found);
      } catch (error) {
        // Square can't say: the payment may still be going through, so the order stays.
        console.error(`⚠️ Square status check for ${found.order_number} failed:`, error.message);
        throw paymentInProgress(found, refused);
      }

      const settled = await Order.findByPk(found.id);
      if (settled?.payment_status === "SUCCESS") {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Your order ${found.order_number} has just been paid, and your cart was emptied. You'll find the order in My Orders.`,
        );
      }
    }

    // The order row is locked while it's checked and removed, so a payment can't start for it
    // meanwhile (the payment endpoints lock it too), and one that started first is seen here.
    await sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(found.id, { transaction, lock: transaction.LOCK.UPDATE });

      if (!order || !isUnpaid(order) || isClosed(order)) return;

      const charging = await Payment.findOne({
        where: unsettledPayments(order.id),
        attributes: ["id"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (charging) throw paymentInProgress(order, refused);

      if (order.label_id) {
        try {
          await cancelShipstationShipment(order);
        } catch (error) {
          console.error("⚠️ Failed to cancel ShipStation shipment:", error.message);
        }
      }

      const tried =
        order.payment_status === "REJECTED" ||
        (await Payment.count({ where: { order_id: order.id }, transaction })) > 0;

      if (tried) {
        await order.update({ is_active: false }, { transaction });
        console.log(`🔒 Unpaid order closed (its payment failed; kept for the customer's history): ${order.order_number}`);
        return;
      }

      await OrderItem.destroy({ where: { order_id: order.id }, transaction });
      await order.destroy({ transaction });

      console.log(`🗑 Unpaid order removed: ${order.order_number}`);
    });
  }
};

module.exports = { retireUnpaidOrders };
