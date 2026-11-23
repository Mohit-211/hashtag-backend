// What an admin may do with an order, in one place: GET order/admin sends these flags for the
// panel's buttons, and the endpoints behind the buttons check the same rules.

const { Op } = require("sequelize");
const { Payment } = require("../../models");
const { labelBeingBought } = require("./shipment.service");

// A Square payment that hasn't settled (Cash App, for example, can stay PENDING for a while).
// Older than this, a PENDING row is an abandoned attempt and no longer blocks a delete.
const PAYMENT_IN_PROGRESS_HOURS = 24;

// The parcel is with the carrier, or was: too late to cancel.
const WITH_CARRIER_SHIPMENT = ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "EXCEPTION"];
const WITH_CARRIER_STATUS = ["SHIPPED", "DELIVERED"];

// The ids, among these orders, with a Square payment still being processed.
const ordersWithPaymentInProgress = async (orderIds) => {
  if (!orderIds.length) return new Set();

  const rows = await Payment.findAll({
    attributes: ["order_id"],
    where: {
      order_id: orderIds,
      payment_status: "PENDING",
      created_at: { [Op.gt]: new Date(Date.now() - PAYMENT_IN_PROGRESS_HOURS * 60 * 60 * 1000) },
    },
    raw: true,
  });

  return new Set(rows.map((row) => Number(row.order_id)));
};

const isWithCarrier = (order) =>
  WITH_CARRIER_STATUS.includes(order.status) || WITH_CARRIER_SHIPMENT.includes(order.shipment_status);

// hasApproval: the order has a proof approval (approvalStore.js approvalSummaries).
const orderActions = (order, { paymentInProgress = false, hasApproval = false } = {}) => {
  const paid = order.payment_status === "SUCCESS";
  const cancelled = order.status === "CANCELLED";
  const withCarrier = isWithCarrier(order);
  const busy = labelBeingBought(order);

  return {
    // Paid, not cancelled, no label yet: automatic labels are off, or buying it failed.
    can_buy_label:
      paid && !cancelled && !order.label_id && ["PENDING", "FAILED"].includes(order.shipment_status) && !busy,

    // Until the carrier has the parcel. A label that exists is voided first.
    can_cancel: !cancelled && !withCarrier && !busy,

    // Unpaid orders (no payment still processing, no label), or cancelled ones. A paid order has
    // to be cancelled first, so it can't disappear by mistake.
    can_delete: cancelled || (!paid && !paymentInProgress && !order.label_id),

    // The Approval page: a paid order that isn't cancelled, or one whose approval exists already.
    can_open_approval: (paid && !cancelled) || hasApproval,
  };
};

// Why the customer's approval page is read-only, or null while they can still act on it: the
// order was cancelled (CANCELLED), the carrier has it (SHIPPED), or the team locked it for
// production (LOCKED).
const approvalReadOnlyReason = (order, approval) => {
  if (order.status === "CANCELLED") return "CANCELLED";
  if (isWithCarrier(order)) return "SHIPPED";
  if (approval?.locked_at) return "LOCKED";
  return null;
};

module.exports = { orderActions, ordersWithPaymentInProgress, approvalReadOnlyReason };
