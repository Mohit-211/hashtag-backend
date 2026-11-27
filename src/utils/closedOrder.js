// An unpaid order closed by a cart change after its payment failed (unpaidOrders.service.js). It
// stays in the customer's order and payment history, but it can't be paid: only the order for the
// cart as it is now can be (audit F10). Orders from before have is_active true, or null.
const isClosedOrder = (order) => order?.is_active === false || order?.is_active === 0;

// The same answer as for an order removed by a cart change (checkout.service.js orderGone).
const CLOSED_ORDER_MESSAGE =
  "Your cart changed after this order was made, so it can't be paid. Please go back and check out again.";

module.exports = { isClosedOrder, CLOSED_ORDER_MESSAGE };
