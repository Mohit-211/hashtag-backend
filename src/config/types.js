const userStatusTypes = {
  ACCEPTED: "ACCEPTED",
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  REVIEWING: "REVIEWING",
  REVIEWED: "REVIEWED",
};

const paymentModeTypes = {
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "DEBIT_CARD",
  APPLE_PAY: "APPLE_PAY",
  GOOGLE_PAY: "GOOGLE_PAY",
  CASH_APP: "CASH_APP",
  AFTERPAY: "AFTERPAY",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  ACH: "ACH",
  CARD: "CARD",
  UNKNOWN: "UNKNOWN",
};

const accountTypes = {
  USER: "USER",
  ADMIN: "ADMIN",
};

const accountTokenPurposes = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
  // Admin-created accounts: the owner sets their first password from an emailed link.
  ACCOUNT_SETUP: "ACCOUNT_SETUP",
};

const paymentStatusTypes = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  REJECTED: "REJECTED",
  REFUNDED: "REFUNDED",
};

const rolesTypes = {
  ADM: "Admin",
  SUP_ADM: "Super Admin",
  SUB_ADM: "Sub Admin",
  ENG: "Engineer",
  EDTR: "Editor",
  CUSTOMER: "User",
};

const tokenTypes = {
  ACCESS: "access",
  REFRESH: "refresh",
  VERIFY_EMAIL: "email_varification",
  FORGOT_PASSWORD: "forgot_password",
  RESET_PASSWORD: "reset_password",
  SESSION: "session",
};

const currancyTypes = {
  USD: "USD",
  INR: "INR",
  EUR: "EUR",
  OMR: "OMR",
  CHF: "CHF",
  KYD: "KYD",
};

const orderStatusTypes = {
  PENDING: "PENDING",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

module.exports = {
  userStatusTypes,
  paymentModeTypes,
  accountTypes,
  accountTokenPurposes,
  paymentStatusTypes,
  rolesTypes,
  tokenTypes,
  currancyTypes,
  orderStatusTypes,
};
