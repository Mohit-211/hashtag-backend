// What a cart line costs, from its saved pricing snapshot.
//
// SAGE lines added before the go-live release carried the tumbler handling charge inside their
// total, once per line (snapshot.handling_charge.amount). The fee is now charged once per order
// (handlingFee.service.js), so that old charge is taken back out here; otherwise an order made
// from an older cart would pay it twice. New snapshots have no handling_charge.

const legacyHandlingCharge = (snapshot) => Number(snapshot?.handling_charge?.amount || 0);

const cartLineTotal = (snapshot) => {
  const total = Number(snapshot?.total_price || 0) - legacyHandlingCharge(snapshot);
  return Number(Math.max(0, total).toFixed(2));
};

module.exports = { cartLineTotal, legacyHandlingCharge };
