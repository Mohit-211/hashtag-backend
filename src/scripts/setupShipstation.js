// Run after saving a ShipStation key on the Settings page, and any time the carriers connected
// in ShipStation change:
//
//   npm run shipstation:setup
//
// It loads the account's carriers (each key's account has its own carrier ids, and rates fail
// on ids from another account), registers the tracking webhook, which ShipStation only accepts
// through the API, and asks for sample rates to prove the key works. Rates are free, and nothing
// here creates an order or buys a label.

const settings = require("../config/settings");
const sequelize = require("../config/central.db");
const { shipstationApiClient, shipstationMessage, getShippingRates } = require("../config/shipstation");
const { syncCarriers, syncServices } = require("../services/Common/carrier.service");

const TRACKING_EVENT = "track_event_v2";

const registerTrackingWebhook = async () => {
  const url = `${settings.getRequired("IMAGE_BASE_URL")}/api/v1/order/shipstation`;

  const { data } = await shipstationApiClient.get("/v2/environment/webhooks");

  if (data.some((webhook) => webhook.event === TRACKING_EVENT && webhook.url === url)) {
    console.log(`Tracking webhook already registered: ${url}`);
    return;
  }

  await shipstationApiClient.post("/v2/environment/webhooks", {
    name: "Order tracking",
    event: TRACKING_EVENT,
    url,
  });

  console.log(`Tracking webhook registered: ${url}`);
};

const printSampleRates = async () => {
  // To the sender's own address: any real address proves the key and the carriers work.
  const rates = await getShippingRates({
    address: {
      name: settings.getRequired("SHIP_FROM_NAME"),
      phone: settings.getRequired("SHIP_FROM_PHONE"),
      address_line1: settings.getRequired("SHIP_FROM_ADDRESS_LINE1"),
      city: settings.getRequired("SHIP_FROM_CITY"),
      state: settings.getRequired("SHIP_FROM_STATE"),
      postal_code: settings.getRequired("SHIP_FROM_POSTAL_CODE"),
      country_code: settings.get("SHIP_FROM_COUNTRY"),
    },
    items: [],
  });

  if (!rates.length) {
    console.warn("No rates for the services the shop offers. Check the carriers connected in ShipStation.");
    return;
  }

  console.log("Sample rates for a 1 lb box:");
  for (const rate of rates) {
    console.log(`  ${rate.label}: $${rate.price.toFixed(2)} (${rate.carrier_code}, ${rate.carrier_id})`);
  }
};

const run = async () => {
  await settings.load();

  const carriers = await syncCarriers();

  console.log(`Carriers loaded: ${carriers.map((carrier) => carrier.friendly_name).join(", ") || "none"}`);

  await registerTrackingWebhook();
  await printSampleRates();

  // Last: checkout doesn't need the list of each carrier's services.
  await syncServices();
};

run()
  .catch((error) => {
    console.error(`ShipStation setup failed: ${shipstationMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
