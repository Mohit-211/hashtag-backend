// Where orders ship (client decision Q32): the US mainland, meaning the 48 contiguous states
// and Washington DC. Alaska, Hawaii, Puerto Rico, the other territories and military (APO/FPO)
// addresses are refused.

const SHIPPING_COUNTRY = "US";

const SHIPPING_STATES = {
  AL: "Alabama",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const STATE_NAMES = new Set(Object.values(SHIPPING_STATES).map((name) => name.toLowerCase()));
const COUNTRY_NAMES = new Set([SHIPPING_COUNTRY, "USA", "UNITED STATES"]);

const NOT_SHIPPED_MESSAGE = "We only ship to the 48 contiguous US states and Washington DC.";

// A state matches by its two-letter code or by its name; older addresses hold either.
const isShippingState = (state) => {
  const value = String(state ?? "").trim();
  return Object.hasOwn(SHIPPING_STATES, value.toUpperCase()) || STATE_NAMES.has(value.toLowerCase());
};

const shipsTo = (country, state) =>
  COUNTRY_NAMES.has(String(country ?? "").trim().toUpperCase()) && isShippingState(state);

module.exports = {
  SHIPPING_COUNTRY,
  NOT_SHIPPED_MESSAGE,
  isShippingState,
  shipsTo,
};
