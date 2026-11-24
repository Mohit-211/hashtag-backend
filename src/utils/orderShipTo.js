// Where an order ships (audit F02). POST order copies the saved address it prices the shipping
// for onto the order (orders.ship_to_*). The quote, the label, the order's pages and its emails
// use that copy, so editing or deleting a saved address on the Account page changes only later
// orders.
//
// The migration of 24 Nov 2026 gave a copy to every older order whose saved address row still
// existed. An order without a copy:
// - one the previous code made between the migration's first run and the deploy: it uses its
//   saved address, as before, when the query includes it as `address` (with paranoid: false, so
//   a deleted one still counts), until the migration's second run copies it;
// - one whose saved address row is gone: its pages show no address, and Buy label stops with
//   NO_SHIPPING_ADDRESS (shipment.service.js) unless its ShipStation shipment already exists.

// What ShipStation's ship_to (shipstation.js mapAddress), the order's pages and its emails use.
const SHIP_TO_FIELDS = ["name", "phone", "address_line1", "address_line2", "city", "state", "postal_code", "country"];

// The orders columns that hold the copy.
const SHIP_TO_COLUMNS = SHIP_TO_FIELDS.map((field) => `ship_to_${field}`);

const pickFields = (source, prefix = "") =>
  Object.fromEntries(SHIP_TO_FIELDS.map((field) => [field, source[`${prefix}${field}`] ?? null]));

// A saved address as an order's ship-to: { name, phone, address_line1, address_line2, city, state,
// postal_code, country }, or null.
const shipToFromAddress = (address) => (address ? pickFields(address) : null);

// The orders columns Order.create writes for a ship-to.
const shipToColumns = (shipTo) =>
  Object.fromEntries(SHIP_TO_FIELDS.map((field) => [`ship_to_${field}`, shipTo[field] ?? null]));

// A saved address always has address_line1 (it can be ""), so every copy has it.
const hasShipTo = (order) => (order?.ship_to_address_line1 ?? null) !== null;

// The order's ship-to: its copy, else its saved address (when the query included it), else null.
// Works on a model instance and on toJSON() output.
const orderShipTo = (order) =>
  hasShipTo(order) ? pickFields(order, "ship_to_") : shipToFromAddress(order?.address);

module.exports = { SHIP_TO_COLUMNS, shipToFromAddress, shipToColumns, orderShipTo };
