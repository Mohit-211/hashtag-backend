/** @format */

const contactUsRoute = require("./contactUs.route");
const faqRoute = require("./faq.route");
const roleRoute = require("./role.route");
const departmentRoute = require("./department.route");
const countryRoute = require("./country.route");
const stateRoute = require("./state.route");
const cityRoute = require("./city.route");
const paymentRoute = require("./payment.route");
const productRoute = require("./product.route");
const brandRoute = require("./brand.route");
const sizeRoute = require("./size.route");
const productCategoryRoute = require("./productCategory.route");
const cartWishlistRoute = require("./cartWishlist.route");
const addressRoute = require("./address.route");
const orderRoute = require("./order.route");
const carrierRoute = require("./carrier.route");
const sageRoute = require("./sage.routes");
const sanmarRoute = require("./sanmar.route");
const ottoCapRoute = require("./ottocap.route");
const industryRoute = require("./industry.route");
const sourcingRequestRoute = require("./sourcingRequest.route");
const tierRoute = require("./tier.route");
const addOnRoute = require("./addonProduct.route");
const customizationRoute = require('./customization.route')
const galleryRoute = require("./gallery.route");

const commonRoutes = [
  {
    path: "/contactUs",
    route: contactUsRoute,
  },
  {
    path: "/faq",
    route: faqRoute,
  },
  {
    path: "/role",
    route: roleRoute,
  },
  {
    path: "/department",
    route: departmentRoute,
  },
  {
    path: "/country",
    route: countryRoute,
  },
  {
    path: "/state",
    route: stateRoute,
  },
  {
    path: "/city",
    route: cityRoute,
  },
  {
    path: "/payment",
    route: paymentRoute,
  },
  {
    path: "/product",
    route: productRoute,
  },
  {
    path: "/brand",
    route: brandRoute,
  },
  {
    path: "/size",
    route: sizeRoute,
  },
  {
    path: "/product-category",
    route: productCategoryRoute,
  },
  {
    path: "/product",
    route: cartWishlistRoute,
  },
  {
    path: "/order",
    route: orderRoute,
  },
  {
    path: "/address",
    route: addressRoute,
  },
  {
    path: "/carrier",
    route: carrierRoute,
  },
  {
    path: "/sage",
    route: sageRoute,
  },
  {
    path: "/sanmar",
    route: sanmarRoute,
  },
  {
    path: "/ottocap",
    route: ottoCapRoute,
  },
  {
    path: "/industry",
    route: industryRoute,
  },

  {
    path: "/sourcing-requests",
    route: sourcingRequestRoute,
  },
  {
    path: "/tiers",
    route: tierRoute,
  },
  {
    path: "/add-on",
    route: addOnRoute,
  },
  {
    path: "/customization-option",
    route: customizationRoute,
  },
  {
    path: "/gallery",
    route: galleryRoute,
  },
];

module.exports = commonRoutes;
