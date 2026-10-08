/** @format */

const Country = require("./country.model");
const State = require("./state.model");
const City = require("./city.model");
const Timezone = require("./timezone.model");

const Role = require("./role.model");
const Department = require("./departmenat.model");

const Admin = require("./admin.model");
const User = require("./user.model");
const Profile = require("./profile.model");
const UserToken = require("./userToken.model");
const UserAttachment = require("./userAttachment.model");
const userLoginTiming = require("./user_login_timings.model");

const ContactUs = require("./contactUs.model");
const Faq = require("./faq.model");
const OTP = require("./otp.model");

const Payment = require("./payment.model");

const Product = require("./product.model");
const ProductVariant = require("./productVariant.model");
const Brand = require("./brand.model");
const Size = require("./size.model");
const ProductAttachment = require("./productattachment.model");
const ProductCategory = require("./productCategory.model");
const ParentCategory = require("./parentCategory.model");
const ParentCategoryMapping = require("./parentCategoryMapping.model");
const ProductCategoryMapping = require("./productCategoryMapping.model");
const VariantAttachment = require("./variantAttachment.model");

const Cart = require("./cart.model");
const Wishlist = require("./wishlist.model");

const Address = require("./address.model");
const Order = require("./order.model");
const OrderItem = require("./orderItem.model");
const Carrier = require("./carrier.model");
const CarrierService = require("./carrierService.model");

const ImportBatch = require("./importBatch.model");
const SourceRawData = require("./sourceRawData.model");
const VariantWarehouse = require("./variantWarehouse.model");

const Sanmar = require("./sanmar.model");
const Ottocap = require("./ottocap.model");
const OttocapCatalog = require("./ottocapCatalog.model");

const PricingMarkup = require("./pricingMarkup.model");
const ColorMapping = require("./ColorMapping.model");
const GrandCategory = require("./grandCategory.model");
const GrandCategoryMapping = require("./grandCategoryMapping.model");

const Industry = require("./industry.model");
const UseCase = require("./useCase.model");
const UseCaseParentCategoryMapping = require("./useCaseParentCategoryMapping.model");

const SourcingRequest = require("./sourcingRequest.model");
const SourcingRequestAttachment = require("./sourcingRequestAttachment.model");
const UseCaseProductOverride = require("./useCaseProductOverride.model");

const ProductTier = require("./productTier.model");
const TierParentCategoryMapping = require("./tierParentCategoryMapping.model");
const ProductTierOverride = require("./productTierOverride.model");
const ProductAddOn = require("./productAddon.model");
const AddOnProduct = require("./addonProduct.model");
const CustomizationOptionValue = require("./customizationOptionValue.model");
const CustomizationOption = require("./customizationOption.model");
const ProductCustomization = require("./productCustomization.model");
const CustomizationOptionValuePricing = require("./customizationOptionValuePricing");
const ProductCustomizationValue = require("./productCustomizationValue.model");

module.exports = {
  Country,
  State,
  City,
  Timezone,

  Role,
  Department,

  Admin,
  User,
  Profile,
  UserToken,
  UserAttachment,
  userLoginTiming,

  ContactUs,
  Faq,
  OTP,

  Payment,

  Product,
  ProductVariant,
  Brand,
  Size,
  ProductAttachment,
  ProductCategory,
  ParentCategory,
  GrandCategory,
  GrandCategoryMapping,
  ParentCategoryMapping,
  ProductCategoryMapping,
  VariantAttachment,

  Cart,
  Wishlist,
  Address,
  Order,
  OrderItem,

  Carrier,
  CarrierService,

  ImportBatch,
  SourceRawData,
  VariantWarehouse,
  Sanmar,
  Ottocap,
  OttocapCatalog,

  PricingMarkup,
  ColorMapping,

  Industry,
  UseCase,
  UseCaseProductOverride,
  UseCaseParentCategoryMapping,
  SourcingRequest,
  SourcingRequestAttachment,

  ProductTier,
  TierParentCategoryMapping,
  ProductTierOverride,

  AddOnProduct,
  ProductAddOn,

  CustomizationOption,
  CustomizationOptionValue,
  ProductCustomization,
  CustomizationOptionValuePricing,
  ProductCustomizationValue
};

async function initTableRelation() {
  Country.hasMany(State, { foreignKey: "country_id", as: "all_state" });
  State.belongsTo(Country, { foreignKey: "country_id", as: "country" });

  Country.hasMany(City, { foreignKey: "country_id", as: "all_city" });
  City.belongsTo(Country, { foreignKey: "country_id", as: "country" });

  State.hasMany(City, { foreignKey: "state_id", as: "all_city" });
  City.belongsTo(State, { foreignKey: "state_id", as: "state" });

  Role.hasMany(Admin, { foreignKey: "role_id", as: "role_admins" });
  Admin.belongsTo(Role, { foreignKey: "role_id", as: "admin_role" });

  Department.hasMany(Admin, {
    foreignKey: "department_id",
    as: "department_admins",
  });
  Admin.belongsTo(Department, {
    foreignKey: "department_id",
    as: "admin_department",
  });

  User.hasOne(Profile, { foreignKey: "user_id", as: "user_profile" });
  Profile.belongsTo(User, { foreignKey: "user_id", as: "profile_user" });

  User.hasMany(UserAttachment, {
    foreignKey: "user_id",
    as: "user_attachments",
  });
  UserAttachment.belongsTo(User, {
    foreignKey: "user_id",
    as: "attachments_user",
  });

  User.hasMany(UserToken, { foreignKey: "user_id", as: "user_tokens" });
  UserToken.belongsTo(User, { foreignKey: "user_id", as: "token_user" });

  Role.hasMany(Admin, { foreignKey: "role_id", as: "role_users" });
  Admin.belongsTo(Role, { foreignKey: "role_id", as: "user_role" });

  // associations

  Product.hasMany(ProductVariant, {
    foreignKey: "product_id",
    as: "variants",
  });

  ProductVariant.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });

  Product.hasMany(ProductAttachment, {
    foreignKey: "product_id",
    as: "attachments",
  });

  ProductAttachment.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });

  Product.belongsTo(Brand, {
    foreignKey: "brand_id",
    as: "brand",
  });

  Brand.hasMany(Product, {
    foreignKey: "brand_id",
    as: "products",
  });

  // Product → Sizes
  Product.hasMany(Size, {
    foreignKey: "product_id",
    as: "sizes",
  });

  Size.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });

  // Variant → Size

  ProductVariant.belongsTo(Size, {
    foreignKey: "size_id",
    as: "size_details",
  });

  Size.hasMany(ProductVariant, {
    foreignKey: "size_id",
    as: "variants",
  });

  ProductVariant.hasMany(VariantWarehouse, {
    foreignKey: "variant_id",
    as: "variant_warehouse",
  });

  VariantWarehouse.belongsTo(ProductVariant, {
    foreignKey: "variant_id",
    as: "variant",
  });

  // Product ↔ Category (Many-to-Many)

  Product.belongsToMany(ProductCategory, {
    through: ProductCategoryMapping,
    foreignKey: "product_id",
    otherKey: "product_category_id",
    as: "categories",
  });

  ProductCategory.belongsToMany(Product, {
    through: ProductCategoryMapping,
    foreignKey: "product_category_id",
    otherKey: "product_id",
    as: "products",
  });

  ProductCategory.belongsToMany(ParentCategory, {
    through: ParentCategoryMapping,
    foreignKey: "product_category_id",
    otherKey: "parent_category_id",
    as: "parent_categories",
  });

  ParentCategory.belongsToMany(ProductCategory, {
    through: ParentCategoryMapping,
    foreignKey: "parent_category_id",
    otherKey: "product_category_id",
    as: "categories",
  });

  GrandCategory.belongsToMany(ParentCategory, {
    through: GrandCategoryMapping,
    foreignKey: "grand_category_id",
    otherKey: "parent_category_id",
    as: "parent_categories",
  });

  ParentCategory.belongsToMany(GrandCategory, {
    through: GrandCategoryMapping,
    foreignKey: "parent_category_id",
    otherKey: "grand_category_id",
    as: "grand_categories",
  });

  // Variant → Images
  ProductVariant.hasMany(VariantAttachment, {
    foreignKey: "variant_id",
    as: "images",
  });

  VariantAttachment.belongsTo(ProductVariant, {
    foreignKey: "variant_id",
    as: "variant",
  });

  ProductVariant.hasMany(Wishlist, {
    foreignKey: "variant_id",
    as: "wishlist_items",
  });

  Wishlist.belongsTo(ProductVariant, {
    foreignKey: "variant_id",
    as: "variant",
  });

  ProductVariant.hasMany(Cart, {
    foreignKey: "variant_id",
    as: "cart_items",
  });

  Cart.belongsTo(ProductVariant, {
    foreignKey: "variant_id",
    as: "variant",
  });

  // Order ↔ OrderItems
  Order.hasMany(OrderItem, { foreignKey: "order_id", as: "items" });
  OrderItem.belongsTo(Order, { foreignKey: "order_id" });

  // OrderItem ↔ Product
  OrderItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });

  // OrderItem ↔ Variant
  OrderItem.belongsTo(ProductVariant, {
    foreignKey: "variant_id",
    as: "variant",
  });

  Carrier.hasMany(CarrierService, {
    foreignKey: "carrier_id",
    as: "services",
  });

  CarrierService.belongsTo(Carrier, {
    foreignKey: "carrier_id",
    as: "carrier",
  });

  Order.belongsTo(Address, {
    foreignKey: "address_id",
    as: "address",
  });

  Address.hasMany(Order, {
    foreignKey: "address_id",
    as: "orders",
  });

  Payment.belongsTo(Order, {
    foreignKey: "order_id",
    as: "order",
  });

  Payment.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  // Order belongs to User
  Order.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  // User has many orders
  User.hasMany(Order, {
    foreignKey: "user_id",
    as: "orders",
  });

  Industry.hasMany(UseCase, {
    foreignKey: "industry_id",
    as: "use_cases",
  });

  UseCase.belongsTo(Industry, {
    foreignKey: "industry_id",
    as: "industry",
  });

  UseCase.belongsToMany(ParentCategory, {
    through: UseCaseParentCategoryMapping,
    foreignKey: "use_case_id",
    otherKey: "parent_category_id",
    as: "parent_categories",
  });

  ParentCategory.belongsToMany(UseCase, {
    through: UseCaseParentCategoryMapping,
    foreignKey: "parent_category_id",
    otherKey: "use_case_id",
    as: "use_cases",
  });

  SourcingRequest.hasMany(SourcingRequestAttachment, {
    foreignKey: "sourcing_request_id",
    as: "attachments",
  });

  SourcingRequestAttachment.belongsTo(SourcingRequest, {
    foreignKey: "sourcing_request_id",
    as: "sourcing_request",
  });

  UseCaseProductOverride.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });
  UseCaseProductOverride.belongsTo(UseCase, {
    foreignKey: "use_case_id",
    as: "use_case",
  });

  Product.hasMany(UseCaseProductOverride, {
    foreignKey: "product_id",
    as: "use_case_overrides",
  });
  UseCase.hasMany(UseCaseProductOverride, {
    foreignKey: "use_case_id",
    as: "product_overrides",
  });

  ProductTier.belongsToMany(ParentCategory, {
    through: TierParentCategoryMapping,
    foreignKey: "tier_id",
    otherKey: "parent_category_id",
    as: "parent_categories",
  });

  ParentCategory.belongsToMany(ProductTier, {
    through: TierParentCategoryMapping,
    foreignKey: "parent_category_id",
    otherKey: "tier_id",
    as: "product_tiers",
  });

  ProductTierOverride.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });
  ProductTierOverride.belongsTo(ProductTier, {
    foreignKey: "tier_id",
    as: "tier",
  });

  Product.hasMany(ProductTierOverride, {
    foreignKey: "product_id",
    as: "tier_overrides",
  });
  ProductTier.hasMany(ProductTierOverride, {
    foreignKey: "tier_id",
    as: "product_overrides",
  });

  Product.hasMany(ProductAddOn, {
    foreignKey: "product_id",
    as: "productAddons",
  });

  ProductAddOn.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });

  ProductAddOn.belongsTo(AddOnProduct, {
    foreignKey: "addon_product_id",
    as: "addon",
  });

  AddOnProduct.hasMany(ProductAddOn, {
    foreignKey: "addon_product_id",
    as: "productAddons",
  });

  CustomizationOption.hasMany(CustomizationOptionValue, {
    foreignKey: "customization_option_id",
    as: "values",
  });

  CustomizationOptionValue.belongsTo(CustomizationOption, {
    foreignKey: "customization_option_id",
    as: "option",
  });

  ProductCustomization.belongsTo(CustomizationOption, {
    foreignKey: "customization_option_id",
    as: "option",
  });

  CustomizationOption.hasMany(ProductCustomization, {
    foreignKey: "customization_option_id",
    as: "productCustomizations",
  });

  CustomizationOptionValue.hasMany(CustomizationOptionValuePricing, {
    foreignKey: "customization_option_value_id",
    as: "pricing",
  });

  CustomizationOptionValuePricing.belongsTo(CustomizationOptionValue, {
    foreignKey: "customization_option_value_id",
    as: "value",
  });

  ProductCustomization.belongsTo(Product, {
    foreignKey: "product_id",
    as: "product",
  });

  Product.hasMany(ProductCustomization, {
    foreignKey: "product_id",
    as: "customizations",
  });

  ProductCustomization.hasMany(ProductCustomizationValue, {
    foreignKey: "product_customization_id",
    as: "values",
  });

  ProductCustomizationValue.belongsTo(ProductCustomization, {
    foreignKey: "product_customization_id",
    as: "productCustomization",
  });

  ProductCustomizationValue.belongsTo(CustomizationOptionValue, {
    foreignKey: "customization_option_value_id",
    as: "value",
  });

  CustomizationOptionValue.hasMany(ProductCustomizationValue, {
    foreignKey: "customization_option_value_id",
    as: "productCustomizations",
  });
}

/* Only Uncomment when data migration will complete */
initTableRelation();

// make sure to comment sanmar when migrate
