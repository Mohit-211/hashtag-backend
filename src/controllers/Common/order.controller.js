const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { orderService, addressService } = require("../../services");
const { getShippingRates } = require("../../config/shipstation");
const shipmentService = require("../../services/Common/shipment.service");
const { NOT_SHIPPED_MESSAGE } = require("../../config/shippingRegions");
const { Address, Cart, ProductVariant, Order } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createOrder = catchAsync(async (req, res) => {
  const data = await orderService.createOrder(req.body);
  return responseWrapper(res, data, "Order Created", httpStatus.CREATED);
});

const getShippingRatesController = catchAsync(async (req, res) => {
  const { address_id, user } = req.body;

  const address = await Address.findOne({
    where: { id: address_id, user_id: user.id },
  });

  if (!address) {
    throw new ApiError(400, "Invalid address");
  }

  if (!(await addressService.canShipTo(address))) {
    throw new ApiError(400, `${NOT_SHIPPED_MESSAGE} Please choose another address.`);
  }

  const cartItems = await Cart.findAll({
    where: { user_id: user.id, is_active: true },
    include: [{ model: ProductVariant, as: "variant", required: true }],
  });

  if (!cartItems.length) {
    throw new ApiError(400, "Cart is empty");
  }

  const rates = await getShippingRates({
    address,
    items: cartItems,
  });

  return responseWrapper(res, rates, "Shipping Rates", 200);
});

const getOrders = catchAsync(async (req, res) => {
  const data = await orderService.getOrders(req.body);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getOrderById = catchAsync(async (req, res) => {
  const data = await orderService.getOrderById(req.body, req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const cancelOrder = catchAsync(async (req, res) => {
  const data = await orderService.cancelOrder(req.body, req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

// Tracking updates from ShipStation, already checked by verifyShipstationWebhook. Answers 200
// even on an error of ours: ShipStation only retries twice, and the next event carries the
// latest status anyway.
const shipstationWebhook = async (req, res) => {
  try {
    await shipmentService.updateOrderTracking(req.body);
  } catch (error) {
    console.error("🚨 Webhook Processing Error:", error.message);
  }

  return res.status(200).json({ success: true });
};

// Labels are bought after payment now (shipment.service), never by a customer. The shop still
// calls this at "Continue to payment" until its release, so it answers as it did, with the
// order's own figures and without buying anything. Remove it after that release.
const createShipmentLabel = catchAsync(async (req, res) => {
  const order = await Order.findOne({
    where: {
      id: req.body.order_id,
      user_id: req.body.user.id,
    },
  });

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  const shipping = Number(order.quoted_shipping_amount || 0);

  return responseWrapper(
    res,
    {
      order_id: order.id,

      order_number: order.order_number,

      payment_status: order.payment_status,

      shipment_status: order.shipment_status,

      carrier: order.carrier_code,

      tracking_number: order.tracking_number,

      label_url: null,

      tracking_url: order.tracking_url,

      pricing_breakdown: {
        subtotal: Number(order.subtotal_amount || 0),

        tax: Number(order.tax_amount || 0),

        estimated_shipping: shipping,

        actual_shipping: shipping,

        shipping_difference: 0,

        final_total: Number(order.total_amount || 0),
      },

      explanation: "Shipping matched estimated rate",
    },
    "Shipment Label Created",
    httpStatus.OK,
  );
});

// The admin's "try again" when an order's label failed after payment.
const retryOrderShipment = catchAsync(async (req, res) => {
  const data = await shipmentService.retryOrderShipment(req.params.id);
  return responseWrapper(res, data, "Label created", httpStatus.OK);
});

const getAdminOrders = catchAsync(async (req, res) => {
  const data = await orderService.getAdminOrders(req.query);

  return responseWrapper(
    res,
    data,
    "Orders fetched successfully",
    httpStatus.OK,
  );
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  getShippingRatesController,
  createShipmentLabel,
  retryOrderShipment,

  shipstationWebhook,

  getAdminOrders,
};
