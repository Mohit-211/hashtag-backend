// Marking an order paid, or its payment failed, in one place. Square's charge, Square's webhook,
// PayPal's capture and PayPal's webhook all land here, in any order and possibly twice, so each
// step is safe to repeat: the order row is locked, and only the call that moves it to SUCCESS
// takes stock, clears the cart and buys the label.

const sequelize = require("../../config/central.db");
const logger = require("../../config/logger");
const { Order, OrderItem, Payment, ProductVariant, Cart } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const { markGraphicsOrdered } = require("./graphic.service");
const { shipPaidOrder } = require("./shipment.service");

const NOTE_LIMIT = 500;

const addNote = (existing, note) => {
  const text = [existing, note].filter(Boolean).join(" ");
  return text.length > NOTE_LIMIT ? `${text.slice(0, NOTE_LIMIT - 1)}…` : text;
};

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

const providerName = (provider) => (provider === "PAYPAL" ? "PayPal" : "Square");

// Not awaited: the caller answers the customer or the webhook quickly, and a failed label stays on
// the order for the admin. Respects "Buy shipping labels automatically" (shipment.service.js).
const shipInBackground = (order) => {
  shipPaidOrder(order.id).catch((error) => {
    logger.error(`Shipping ${order.order_number} failed: ${error.message}`);
  });
};

// Records a successful payment and confirms the order. Returns { order, newlyPaid }.
// amount is in dollars. mode is the payments.payment_mode value (CREDIT_CARD, CASH_APP, PAYPAL…).
const completeOrderPayment = async ({
  orderId,
  provider,
  transactionId,
  amount,
  currency = "USD",
  mode,
  squareCustomerId = null,
}) => {
  let outcome;

  await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: "items" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) throw new ApiError(httpStatus.NOT_FOUND, "Order not found");

    let payment = await Payment.findOne({
      where: { transaction_id: transactionId, payment_provider: provider },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    // The same payment again (its webhook after the direct answer, or a retried webhook).
    if (payment?.payment_status === "SUCCESS" && order.payment_status === "SUCCESS") {
      outcome = { order, newlyPaid: false };
      return;
    }

    const values = {
      order_id: order.id,
      user_id: order.user_id,
      payment_provider: provider,
      payment_status: "SUCCESS",
      payment_mode: mode,
      amount: Number(Number(amount).toFixed(2)),
      currency: currency || "USD",
      square_customer_id: squareCustomerId,
      description: `${providerName(provider)} payment for order ${order.order_number}`,
    };

    if (payment) await payment.update(values, { transaction });
    else payment = await Payment.create({ transaction_id: transactionId, ...values }, { transaction });

    // A second payment for an order that's already paid: keep it, and tell the team.
    if (order.payment_status === "SUCCESS") {
      await order.update(
        {
          attention_note: addNote(
            order.attention_note,
            `A second ${providerName(provider)} payment (${transactionId}, ${money(amount)}) arrived for this paid order. Refund one of them in ${providerName(provider)}.`,
          ),
        },
        { transaction },
      );
      logger.error(`Order ${order.order_number} was paid twice (${provider} ${transactionId}).`);
      outcome = { order, newlyPaid: false };
      return;
    }

    const notes = [];

    if (Math.abs(Number(amount) - Number(order.total_amount)) > 0.005) {
      notes.push(`${providerName(provider)} took ${money(amount)} but the order total is ${money(order.total_amount)}.`);
    }

    // Paid after an admin cancelled it: record the money, don't revive the order.
    if (order.status === "CANCELLED") {
      notes.push(`A ${providerName(provider)} payment (${transactionId}) arrived after the order was cancelled. Refund it in ${providerName(provider)}.`);
      await order.update(
        { payment_status: "SUCCESS", payment_method: mode, attention_note: addNote(order.attention_note, notes.join(" ")) },
        { transaction },
      );
      logger.error(`Order ${order.order_number} was paid after it was cancelled (${provider} ${transactionId}).`);
      outcome = { order, newlyPaid: false };
      return;
    }

    // Stock is taken once the order is paid. A shortfall (sold out between checkout and payment)
    // doesn't undo the payment: the order is confirmed and the team is told.
    const short = [];
    for (const item of order.items) {
      const variant = await ProductVariant.findByPk(item.variant_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
        paranoid: false,
      });

      if (!variant) {
        short.push(`variant ${item.variant_id} no longer exists`);
        continue;
      }

      if (!variant.track_inventory) continue;

      const stock = Number(variant.stock || 0);
      if (stock < item.quantity) short.push(`${variant.sku}: ${Math.max(stock, 0)} in stock for ${item.quantity} ordered`);

      const take = Math.min(item.quantity, Math.max(stock, 0));
      if (take > 0) await variant.decrement("stock", { by: take, transaction });
    }

    if (short.length) notes.push(`Stock ran short after payment: ${short.join("; ")}.`);

    await order.update(
      {
        payment_status: "SUCCESS",
        status: "CONFIRMED",
        payment_method: mode,
        // A label is only ever bought after payment, so a paid order starts without one.
        shipment_status: order.label_id ? "LABEL_CREATED" : order.shipment_status === "FAILED" ? "FAILED" : "PENDING",
        ...(notes.length && { attention_note: addNote(order.attention_note, notes.join(" ")) }),
      },
      { transaction },
    );

    if (notes.length) logger.error(`Order ${order.order_number} needs attention: ${notes.join(" ")}`);

    outcome = { order, newlyPaid: true };
  });

  if (outcome.newlyPaid) {
    const { order } = outcome;
    logger.info(`Order ${order.order_number} paid by ${provider} (${transactionId}).`);

    await Cart.destroy({ where: { user_id: order.user_id } });
    await markGraphicsOrdered(order);
    shipInBackground(order);
  }

  return outcome;
};

// Records a failed payment. The order can still be paid with another attempt, so only an unpaid
// order changes: payment_status REJECTED, status FAILED.
const failOrderPayment = async ({ orderId, provider, transactionId, amount = null, mode = null }) => {
  await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) return;

    if (transactionId) {
      const payment = await Payment.findOne({
        where: { transaction_id: transactionId, payment_provider: provider },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // A payment that succeeded stays a success: a late failure event doesn't undo it.
      if (payment && payment.payment_status !== "SUCCESS") {
        await payment.update({ payment_status: "REJECTED" }, { transaction });
      } else if (!payment) {
        await Payment.create(
          {
            transaction_id: transactionId,
            order_id: order.id,
            user_id: order.user_id,
            payment_provider: provider,
            payment_status: "REJECTED",
            payment_mode: mode || (provider === "PAYPAL" ? "PAYPAL" : "CARD"),
            amount: Number(amount ?? order.total_amount),
            currency: order.currency || "USD",
            description: `Failed ${providerName(provider)} payment for order ${order.order_number}`,
          },
          { transaction },
        );
      }
    }

    if (order.payment_status !== "SUCCESS" && order.status !== "CANCELLED") {
      await order.update({ payment_status: "REJECTED", status: "FAILED" }, { transaction });
    }
  });
};

module.exports = { completeOrderPayment, failOrderPayment };
