# hashtag-backend: Full Code Audit

**Date:** 2026-10-08 | **Commit audited:** `268b548` | **Scope:** all 239 tracked files (~43,000 lines): `app.js`, `index.js`, everything under `src/`, `package.json`, the PM2 configs.

> This file describes working exploit paths against a live store. Keep it out of any shared or public remote until the critical items are fixed.

---

## How the audit was done

- **Read every source file end to end**: all routes, controllers, services, models, middleware, config, and utils.
- **Static analysis:** ESLint correctness rules (`no-undef`, `no-unused-vars`, `no-labels`, `no-dupe-keys`, …), run from a scratch directory. Nothing was installed into the project.
- **Dependency scan:** `npm audit` against `package-lock.json`.
- **Runtime probes:** small scripts against the project's *own* installed libraries and model files. They used no database and made no calls to your services. Covered: booting `app.js`, the global error handler, JWT key derivation, Sequelize SQL generation and validation, and the real pricing functions with edge-case inputs. Findings backed by a probe are marked **✔ verified**.
- **Not available to the audit:** `.env`, the database (schema, foreign keys, data), the `public/` folder, and the production server. Findings that depend on these are marked **(conditional)**.

---

## Executive summary

Five problems outweigh everything else:

1. **Almost the entire admin API is unauthenticated.** Anyone on the internet can create, edit, and delete products, brands, and categories. They can change markup percentages, delete customers, read every order, payment, and contact form, trigger supplier imports and mass deletes, and edit roles. A role-based middleware exists ([role.middleware.js](src/middlewares/role.middleware.js)) but is never mounted, and it is itself broken.
2. **Anyone can become Super Admin.** `POST /api/v1/admin/auth/register` is open and trusts `role_id` from the body. `GET /api/v1/admin/auth/findAdminById/:id` is also open and returns password hashes, live OTPs, and reset tokens.
3. **Orders can be obtained without paying the right amount, or at all.** The Square, PayPal, and ShipStation webhooks have no signature checks and are trusted. Checkout uses a client-supplied `shipping_amount`. Supplier cart lines accept negative and fractional quantities.
4. **Unauthenticated SSRF / open proxy.** `GET /api/v1/ottocap/otto-image?url=<anything>` makes the server fetch any URL (internal network, cloud metadata) and returns the body.
5. **The repository cannot run as committed, and core features are broken.**
   - Email templates and three npm packages are missing (✔ verified boot failure).
   - Order cancellation always throws; carrier sync always throws.
   - Several admin endpoints always error.
   - 54 known-vulnerable packages are installed (3 critical), many only through dependencies the code never uses.

| Severity | Count | Meaning |
|---|---|---|
| Critical | 11 | Exploitable now by anonymous users or any customer, or the system/features cannot work |
| High | 26 | Serious security, money, or data-integrity defects |
| Medium | 41 | Real bugs and risks with narrower impact |
| Low | 20+ | Code quality, typos, leftovers |

---

## 1. Critical: security

### C1. No authentication on the admin API, and the RBAC middleware is never used
- **Where:** every router under [src/routes/v1/Common/](src/routes/v1/Common/) except cart, wishlist, address, customer orders, and checkout. Also [Admin/user.route.js:9-10](src/routes/v1/Admin/user.route.js#L9-L10). `roleMiddleware` is exported from [middlewares/index.js](src/middlewares/index.js) and referenced nowhere.
- **Open endpoints include:**
  - Products: create, update, delete, duplicate, brand assignment, S&S sync and delete, admin stats and listings ([product.route.js:8-40](src/routes/v1/Common/product.route.js#L8-L40)).
  - **`PUT /product/pricing/:id`** ([product.route.js:39](src/routes/v1/Common/product.route.js#L39)). It writes `markup_percent` with no validation ([pricing.service.js:37-39](src/services/Common/pricing.service.js#L37-L39)). Setting `-100` makes every product of that supplier cost $0.
  - Brands, product/parent/grand categories, industries and use cases, tiers, customization options **and their prices**, add-ons, sizes, FAQs.
  - Roles and departments: anyone can rename or delete roles.
  - SAGE, SanMar, and OttoCap search, import, and delete. These run on your SAGE/S&S credentials.
  - Carrier sync.
  - Admin views of orders ([order.route.js:8](src/routes/v1/Common/order.route.js#L8)), payments ([payment.route.js:22](src/routes/v1/Common/payment.route.js#L22)), today's payment count and sum ([payment.route.js:12-13](src/routes/v1/Common/payment.route.js#L12-L13)), contact-us inquiries ([contactUs.route.js:7-9](src/routes/v1/Common/contactUs.route.js#L7-L9)), and sourcing requests ([sourcingRequest.route.js:6-7](src/routes/v1/Common/sourcingRequest.route.js#L6-L7)).
  - `GET /admin/user/getUserById` returns the full user row, including the bcrypt hash. `POST /admin/user/deleteUser` deactivates any list of users.
- **Fix:** add an admin-auth middleware at the router level for every admin router (`router.use(...)`), then a working role check. Treat "public" as an explicit allow-list (catalog reads, contact form, sourcing create, auth) rather than the default.

### C2. Admin account takeover (several independent paths)
1. **Open registration with arbitrary role.**
   - `POST /admin/auth/register` has no middleware at all ([adminAuth.route.js:7](src/routes/v1/Admin/adminAuth.route.js#L7)).
   - `createAdminUser` copies `role_id` from the request ([adminAuth.service.js:13-24](src/services/Admin/adminAuth.service.js#L13-L24)) and emails the generated password to the address supplied.
   - The validator that blocks Super Admin creation (`validateCreateAdminBody`) is never attached. It would also fail anyway, because it compares a number to an env string with `===` ([adminAuth.middleware.js:23](src/middlewares/adminAuth.middleware.js#L23)).
2. **Unauthenticated secrets dump.**
   - `GET /admin/auth/findAdminById/:id` has no auth ([adminAuth.route.js:17](src/routes/v1/Admin/adminAuth.route.js#L17)).
   - It returns every column ([adminAuth.service.js:294-305](src/services/Admin/adminAuth.service.js#L294-L305)): `password` hash, plaintext `otp`, and `remember_token`.
   - Chain: request an OTP for an admin email (`POST /admin/auth/otp`), read it from this endpoint, then call `verify-otp` with `otp_type=forgot_password`. The result is a JWT ([adminAuth.service.js:193-204](src/services/Admin/adminAuth.service.js#L193-L204)) with the same payload as a login token, which `validateJWTtoken` accepts.
3. **Admin OTP never expires and has no attempt limit** ([adminAuth.service.js:151-215](src/services/Admin/adminAuth.service.js#L151-L215)). The rate limiter is not active (H1).
4. **Admin tokens can't be revoked.** `validateJWTtoken` only checks the signature, never the DB ([adminAuth.middleware.js:67-83](src/middlewares/adminAuth.middleware.js#L67-L83)). Deleted or demoted admins keep access for 5 days. The `is_backlisted` flag is baked into the token, so it can never change.
5. **Weak-key risk (conditional on `JWT_SECRET`).**
   - Admin tokens are signed with `Buffer.from(JWT_SECRET, "hex")` ([adminAuth.service.js:93](src/services/Admin/adminAuth.service.js#L93), [adminAuth.middleware.js:73](src/middlewares/adminAuth.middleware.js#L73)).
   - **✔ verified:** a non-hex secret such as `mysupersecretkey` produces a **0-byte key**, and a token forged with an empty key is accepted. A partly hex secret yields a 3-byte key.
6. **Any admin can do anything to any admin.**
   - `getAllAdmins` returns hashes and OTPs ([adminAuth.service.js:358-381](src/services/Admin/adminAuth.service.js#L358-L381)).
   - `updateAdmin` changes anyone's `role_id` or email ([adminAuth.service.js:307-339](src/services/Admin/adminAuth.service.js#L307-L339)).
   - `deleteAdmin` deletes anyone, Super Admin included ([adminAuth.service.js:341-356](src/services/Admin/adminAuth.service.js#L341-L356)).
- **Fix:**
  - Remove public registration.
  - Never return `password`, `otp`, or `remember_token`: use a Sequelize `defaultScope` that excludes them.
  - Give OTPs a TTL and attempt counter, and hash them.
  - Use a separate short-lived reset token type that `validateJWTtoken` rejects.
  - Check the admin row (`is_active`, current role) on every request.
  - Use one key derivation, from a ≥32-byte random secret validated at startup.

### C3. Payment bypass via unauthenticated webhooks
- **Square** `POST /payment/webhook/square` ([payment.route.js:20](src/routes/v1/Common/payment.route.js#L20) → [checkout.service.js:311-518](src/services/Common/checkout.service.js#L311-L518)).
  - There is no `x-square-hmacsha256-signature` check.
  - A forged `payment.updated` / `COMPLETED` event for a known `transaction_id` marks the order paid, confirms it, decrements stock, and clears the cart.
  - Transaction IDs are returned to customers and listed publicly by `/payment/admin/all`.
- **PayPal** `POST /payment/paypal/webhook` ([checkout.service.js:1836-2075](src/services/Common/checkout.service.js#L1836-L2075)).
  - There is no `verify-webhook-signature` call.
  - The code trusts `resource.amount` and `resource.id` from the body. It only uses the PayPal API to map `order_id → referenceId` and never checks capture status.
  - A customer can create a PayPal order (`/paypal/create-order`, never approve it), then forge `PAYMENT.CAPTURE.COMPLETED` with the right amount. The order becomes `SUCCESS`/`CONFIRMED`.
- **ShipStation** `POST /order/shipstation` ([order.controller.js:71-315](src/controllers/Common/order.controller.js#L71-L315)).
  - There is no authentication.
  - Any status containing `"LABEL"` flips a `PENDING_PAYMENT` order to `CONFIRMED` ([lines 201-207](src/controllers/Common/order.controller.js#L201-L207)).
  - It also accepts attacker-chosen `tracking_url` and `label_url`, which are later shown to customers and admins.
  - Order numbers are `ORD-${Date.now()}` ([order.service.js:170](src/services/Common/order.service.js#L170)), so they are guessable.
- **Fix:** verify signatures (Square HMAC with the raw body, PayPal `verify-webhook-signature`), or re-fetch the payment from the provider and trust only that. Add a secret token to the ShipStation webhook URL and look up the shipment via the API.

### C4. Customer-controlled prices
1. **Shipping amount from the request body.** `createOrder` uses `body.shipping_amount` directly ([order.service.js:40](src/services/Common/order.service.js#L40), [160-166](src/services/Common/order.service.js#L160-L166)). A client can send `0` or a negative number. Carrier and service codes are not validated against a quote either.
2. **Negative and fractional quantities.**
   - The supplier cart path only rejects `0`/`NaN` ([cartWishlist.service.js:1900-1908](src/services/Common/cartWishlist.service.js#L1900-L1908)), and `buildPricingSnapshot` never validates quantity.
   - **✔ verified with the real function:** qty `-9` → `total_price = -450`; qty `0.01` → `0.50`.
   - `createOrder` sums these into the subtotal, so one negative line discounts the rest of the cart.
   - On payment, `variant.decrement("stock", { by: -9 })` *increases* stock.
3. **Customization prices come from free-text strings.** Unknown values price at $0. **✔ verified:**
   - Embroidery location `"Left Chest"` → $0, but `"left-chest"` → $10/item, because only hyphens are normalized ([buildPricingSnapshot.js:368](src/utils/pricing/buildPricingSnapshot.js#L368)).
   - A 7-color screen print → $0.
   - An unknown DTG style → $0.
4. **Markup is editable by anyone** (C1).
- **Fix:**
  - Compute shipping server-side from a stored quote id.
  - Require positive integer quantities everywhere and enforce `min_order_quantity`.
  - Validate print methods, locations, colors, and styles against an allow-list, and reject unknown values instead of pricing them at 0.

### C5. Unauthenticated SSRF and open proxy
- **Where:** `GET /api/v1/ottocap/otto-image?url=` ([ottocap.route.js:16](src/routes/v1/Common/ottocap.route.js#L16) → [image.controller.js:3-25](src/controllers/Common/image.controller.js#L3-L25)).
- **What:**
  - The server fetches any URL, including `http://169.254.169.254/...` (cloud credentials), internal hosts, and `localhost` admin ports.
  - It streams the response back with the upstream `Content-Type`.
  - Because the content is served from your API origin, it can host attacker JavaScript that passes Helmet's `script-src 'self'`.
  - There is no timeout and no size cap.
- **Note:** the frontend uses this route for OttoCap images ([ottoCap.service.js:227](src/services/Common/ottoCap.service.js#L227)).
- **Fix:** allow-list OttoCap's image host, force an image `Content-Type`, add timeout and size limits, and block private IP ranges after DNS resolution. Better still, use the images already downloaded locally.

### C6. Unauthenticated exposure of customer PII and business data
- All orders with customer names and emails: `GET /order/admin`.
- All payments with user email, name, and mobile: `GET /payment/admin/all`. `limit` is unbounded ([checkout.service.js:964-1642](src/services/Common/checkout.service.js#L964-L1642)).
- All contact-us messages, all sourcing requests, and daily revenue.
- `getUserById` returns the full user row with password hash ([Admin/user.service.js:85-109](src/services/Admin/user.service.js#L85-L109)).
- **Supplier cost and markup leak to shoppers:**
  - Public product endpoints return `original_price`, `base_price`, `markup_percent`, and raw `meta`, which includes SAGE `netTiers` (distributor cost) ([product.service.js:2077-2088](src/services/Common/product.service.js#L2077-L2088), [3139-3166](src/services/Common/product.service.js#L3139-L3166)).
  - `POST /product/get-variant` returns the raw supplier price with no markup ([product.service.js:3184-3231](src/services/Common/product.service.js#L3184-L3231)).
  - `GET /sage/product/:id` returns SAGE's raw product with `includeSuppInfo: true` ([sage.service.js:433-486](src/services/Common/sage.service.js#L433-L486)). That covers supplier identity and net pricing, which SAGE's terms normally prohibit showing to end buyers.

### C7. Unauthenticated destructive operations
- `POST /sage/delete` with `{ batchId }` or `{ supplierId }` deletes products **of any supplier** ([sage.service.js:1286-1409](src/services/Common/sage.service.js#L1286-L1409)): there's no `supplier: "SAGE"` filter. Batch UUIDs are exposed by the public `GET /product/admin/get/all`, so a full sync's worth of products can be wiped.
- `POST /product/delete`, `DELETE /product/ss/delete/:styleId`, brand and category deletes, and `POST /admin/user/deleteUser` are all open.
- `POST /ottocap/import-inventory` and `/import-catalog` `TRUNCATE` their tables and then re-insert without a transaction ([ottoCap.service.js:45-48](src/services/Common/ottoCap.service.js#L45-L48), [107-110](src/services/Common/ottoCap.service.js#L107-L110)).

### C8. IDOR: any logged-in customer can modify other customers' data
- **Cart:** `incrementCart`, `decrementCart`, `updateCartQuantity`, and `removeFromCart` look rows up with `Cart.findByPk(cart_id)` and never check the owner ([cartWishlist.service.js:2718](src/services/Common/cartWishlist.service.js#L2718), [3017](src/services/Common/cartWishlist.service.js#L3017), [3278](src/services/Common/cartWishlist.service.js#L3278), [3513](src/services/Common/cartWishlist.service.js#L3513)). Each one also calls `invalidatePendingOrder(cart.user_id)`, which **deletes the victim's pending order**.
- **Wishlist:** `removeFromWishlist` has the same problem ([cartWishlist.service.js:194-209](src/services/Common/cartWishlist.service.js#L194-L209)).
- **Shipping labels:** `POST /order/create-shipment-label` lets a customer buy real ShipStation labels for their own **unpaid** order, repeatedly ([order.controller.js:317-431](src/controllers/Common/order.controller.js#L317-L431)). That's direct cost to the business.
- **Fix:** add `user_id: user.id` to every lookup. Restrict label purchase to admins and to paid orders without an existing label.

---

## 2. Critical: the system or features don't work

### C9. The repository cannot boot as committed (✔ verified)
- Loading `app.js` fails with `Cannot find module '../../../public/Email_Template'` ([email.service.js:4](src/services/Common/email.service.js#L4), [6](src/services/Common/email.service.js#L6)). There is no `public/` folder in the repo.
- Next in line, all required on the startup path and none in `package.json` or installed:
  - `@paypal/paypal-server-sdk` ([checkout.service.js:28](src/services/Common/checkout.service.js#L28), [config/paypal.js:4](src/config/paypal.js#L4))
  - `node-cache` and `openai` ([colorService.js:1-2](src/services/Common/colorService.js#L1-L2))
- Production must therefore be running with untracked files and packages installed outside `package.json`. A fresh deploy or `npm ci` will not start.
- **Fix:** commit the templates outside `public/` (also see M3), and add the three packages to `package.json`.

### C10. Order cancellation always fails, after voiding the shipping label
- `cancelOrder` calls `Payment.update(...)`, but `Payment` is never imported ([order.service.js:1244](src/services/Common/order.service.js#L1244)), so every cancel throws `ReferenceError`.
- By then it has already voided the ShipStation label ([lines 1207-1219](src/services/Common/order.service.js#L1207-L1219)). That external side effect isn't rolled back.
- Cancelling a paid order also never refunds anyone (H8).

### C11. Legitimate PayPal payments probably can't be recorded (conditional on MySQL strict mode, which is the default)
- `Payment.payment_mode`'s ENUM uses `paymentModeTypes.PAYPAL`, which doesn't exist in [types.js](src/config/types.js#L9-L20). It evaluates to `undefined` ([payment.model.js:83](src/models/payment.model.js#L83)), so the ENUM contains `null` (✔ verified).
- The webhook writes `payment_mode: "PAYPAL"` ([checkout.service.js:2026](src/services/Common/checkout.service.js#L2026)) **after** decrementing stock ([1993-2001](src/services/Common/checkout.service.js#L1993-L2001)). Sequelize doesn't validate ENUMs (✔ verified), so MySQL rejects the insert ("Data truncated").
- Result: the order is never marked paid, and every PayPal retry decrements stock again.
- The same class of bug hits the Square failure path, `status: "PAYMENT_FAILED"` ([checkout.service.js:492](src/services/Common/checkout.service.js#L492)), and `ImportBatch.status: "partial_success"` (M14).

---

## 3. High

**H1. The rate limiter never runs.**
- It's mounted on `/v1/auth`, but routes live under `/api/v1`, and it only runs when `env === "production"` ([app.js:221-223](app.js#L221-L223)).
- The production PM2 file sets `NODE_ENV=development` ([ecosystem.config.json:12](ecosystem.config.json#L12)).
- With no limiter, the customer OTP (4 digits, [auth.service.js:45](src/services/User/auth.service.js#L45)) and the admin OTP (6 digits, no expiry) can be brute-forced. That's an account takeover path.

**H2. Production runs as `development`.**
- Both PM2 files set `NODE_ENV=development`.
- Effects: every SQL statement is logged ([central.db.js:15](src/config/central.db.js#L15)), log level is debug, and the production-only limiter is skipped.
- The `npm run staging` script points to `ecosystem.staging-config.json`, but the file is named `ecosystem.stagging-config.json` ([package.json:17](package.json#L17)).

**H3. File uploads are accepted on every route, unauthenticated, with no size limit.**
- Multer is mounted globally *before* any auth ([app.js:237](app.js#L237)), with no `limits` ([multer.js:127-144](src/config/multer.js#L127-L144)). Anyone can write up to 70 files of any size to disk on any `/api/v1/*` request, and they are publicly served.
- Filenames are `${fieldname}-${Date.now()}.${ext}` ([multer.js:36](src/config/multer.js#L36)). Two files in the same millisecond **overwrite each other**.
- `video/mov` isn't a real MIME type, so `.mov` uploads are saved as `.txt` ([multer.js:116](src/config/multer.js#L116)).
- `customization_images` accepts any bytes named `.ai`.
- Upload directories aren't created automatically.

**H4. The access token and password hash are stored in, and returned from, the addresses table.**
- `addAddress` stores `raw_input: body` ([address.service.js:133](src/services/Common/address.service.js#L133)). `body.user` is the full User instance, including the bcrypt hash, and `body.tokenDoc` is the live access token.
- `getAddresses` returns every column ([address.service.js:149-152](src/services/Common/address.service.js#L149-L152)).

**H5. Customer password reset is weak.**
- The OTP is 4 digits with unlimited attempts.
- The post-OTP reset token never expires ([userAuth.middleware.js:138](src/middlewares/userAuth.middleware.js#L138)).
- The new password isn't checked against the policy ([auth.service.js:336-366](src/services/User/auth.service.js#L336-L366)).
- Other sessions aren't revoked after a reset or password change.

**H6. Login leaks account state and can be used to spam inboxes.**
- It returns different messages for unknown, pending, rejected, and wrong-password accounts.
- For a `PENDING` user it emails a new OTP **before** checking the password ([auth.service.js:233-264](src/services/User/auth.service.js#L233-L264)).

**H7. Payment flow integrity.**
- `createPayment` uses a random idempotency key per call ([checkout.service.js:145](src/services/Common/checkout.service.js#L145)), so a double-click or retry charges twice. The only guard is `payment_status === "SUCCESS"`, which stays `PENDING` until the webhook arrives.
- Payment rows are saved as `PENDING` even when Square returns `COMPLETED` ([checkout.service.js:196](src/services/Common/checkout.service.js#L196)).
- Cancelled orders can still be paid.
- Stock is checked *after* the money is captured, with no refund path ([checkout.service.js:392-402](src/services/Common/checkout.service.js#L392-L402)).
- The Square webhook swallows all errors and returns 200, so Square never retries.
- All errors return HTTP 500.

**H8. Orders, shipments, and refunds don't line up.**
- A ShipStation shipment is created for **every order before payment** ([order.service.js:354-370](src/services/Common/order.service.js#L354-L370)), and it is never cancelled when the order is abandoned or invalidated.
- `invalidatePendingOrder` soft-deletes the pending order whenever the cart changes, even mid-payment ([cartWishlist.service.js:3561-3611](src/services/Common/cartWishlist.service.js#L3561-L3611)). The webhook then can't find it (paranoid), so the customer is charged with no order.
- Cancelling a paid order restores stock but never refunds.
- `Cart.destroy({ user_id })` on payment clears items added *after* checkout.

**H9. Several product admin endpoints always fail.**
- `updateProduct` builds `Size.findAll({ where: { product_id, paranoid: false } })` ([product.service.js:3475-3480](src/services/Common/product.service.js#L3475-L3480)). **✔ verified SQL:** `` `Size`.`paranoid` = false ``, which MySQL rejects. It fails *after* the product, categories, and images were already modified.
- `getProductVariantByAdmin` filters on `ProductVariant.is_discontinued`, a column that doesn't exist ([product.service.js:4556-4559](src/services/Common/product.service.js#L4556-L4559)).
- `getAllProductsAdmin` with `use_case_id` and no `tier` calls `getProductIdsForUseCase`, which isn't imported ([product.service.js:5060](src/services/Common/product.service.js#L5060)).

**H10. Undefined identifiers (✔ ESLint `no-undef`): each throws `ReferenceError` on its path.**

| File:line | Identifier | Effect |
|---|---|---|
| [Admin/user.controller.js:15](src/controllers/Admin/user.controller.js#L15) | `config` | admin user list fails whenever `limit` is omitted |
| [order.service.js:1244](src/services/Common/order.service.js#L1244) | `Payment` | all cancellations fail (C10) |
| [product.service.js:5060](src/services/Common/product.service.js#L5060) | `getProductIdsForUseCase` | admin product filter fails |
| [checkout.service.js:1000-1008](src/services/Common/checkout.service.js#L1000-L1008) | `Op` | payment search fails |
| [sourcingRequest.service.js:115-133](src/services/Common/sourcingRequest.service.js#L115-L133) | `Op` | sourcing-request search fails |
| [token.service.js:25,41,67,74,96](src/services/Common/token.service.js#L25) | `httpStatus` | real auth errors replaced by ReferenceError |
| [email.service.js:25,48,71,84](src/services/Common/email.service.js#L25) | `httpStatus` | same for email errors |
| [sage.service.js:246-255](src/services/Common/sage.service.js#L246), [ottoCap.service.js:239-240](src/services/Common/ottoCap.service.js#L239) | `ApiError`, `httpStatus` | error paths crash |
| [sanmar.controller.js:33,50](src/controllers/Common/sanmar.controller.js#L33), [industry.controller.js:98](src/controllers/Common/industry.controller.js#L98) | `ApiError` | 400 validation becomes 500 |
| [brand.service.js:154-161](src/services/Common/brand.service.js#L154) | `path`, `fs` | unpublished logos never deleted |
| [User/user.controller.js:23](src/controllers/User/user.controller.js#L23), [payment.controller.js:146](src/controllers/Common/payment.controller.js#L146) | implicit globals | shared mutable globals across requests |

**H11. The error handler breaks keep-alive and floods logs.**
- It calls `next(err)` before sending its own response ([errorHandler.js:5](src/utils/errorHandler.js#L5)).
- **✔ verified:**
  - Express's default handler then prints a full stack trace for every 4xx (including 404s).
  - It **destroys the client socket after every error response** (3 of 3 keep-alive connections closed).
  - Clients still receive the JSON.

**H12. Hard-coded personal data and environment values.**
- A person's name, phone, and home address are the ship-from address ([shipstation.js:32-40](src/config/shipstation.js#L32-L40)).
- A personal employee inbox receives all contact notifications ([email.service.js:135](src/services/Common/email.service.js#L135)).
- `support@glamlink.net`, another brand, appears in the welcome email ([email.service.js:118](src/services/Common/email.service.js#L118)).
- The production domain is hard-coded in several places ([supplierImage.service.js:15](src/services/Common/supplierImage.service.js#L15), [ottoCap.service.js:227](src/services/Common/ottoCap.service.js#L227)).
- PayPal return URLs point to `http://localhost:3000` ([checkout.service.js:1694-1696](src/services/Common/checkout.service.js#L1694-L1696)).

**H13. The SAGE $35 handling charge and drinkware second-location fee never apply when a customer adds to cart.**
- `addToCart` passes `categories` where `buildSagePricingSnapshot` expects `product` ([cartWishlist.service.js:1933-1942](src/services/Common/cartWishlist.service.js#L1933-L1942)).
- **✔ verified:** the charge is $0 at add time. It appears when the customer increments the quantity, so the price jumps.
- The SAGE breakdown also prints `markup_percent: 49.25` while 66.67% is actually applied when no DB row exists ([buildPricingSnapshot.js:799](src/utils/pricing/buildPricingSnapshot.js#L799), [config/pricing.js:24](src/config/pricing.js#L24)).

**H14. Tax is hard-coded at 8.25% for every destination** ([order.service.js:162](src/services/Common/order.service.js#L162)).

**H15. Decoration pricing is computed per size, not per design.**
- Each size of a design is priced and fee'd as its own cart row. Tier breaks use the per-size quantity.
- The $35 digitizing fee is charged once per size.
- The 12-piece screen-print minimum applies per size: 6 S + 6 M is rejected.

**H16. `create-shipment-label` overwrites `total_amount`** with subtotal + tax + actual label cost ([order.controller.js:347-375](src/controllers/Common/order.controller.js#L347-L375)). It drops anything else in the total, and it changes the amount owed after the fact.

**H17. Webhook status mapping uses substring matching.**
- `"UNDELIVERED"` becomes DELIVERED, and `"LABEL_VOIDED"` confirms an order.
- `delivered_at` is set, but there's no such column, so it's silently dropped ([order.controller.js:187-268](src/controllers/Common/order.controller.js#L187-L268)).

**H18. Token lifetime config is mislabeled.**
- `jwt.accessExpirationMinutes` reads `JWT_ACCESS_EXPIRATION_DAYS` ([config.js:119](src/config/config.js#L119)), which isn't in the Joi schema. It's then used as **days** ([token.service.js:77](src/services/Common/token.service.js#L77)).
- **✔ verified:** if that variable is unset, tokens expire the instant they're issued.

**H19. Raw SQL string interpolation** in `saveToken` ([token.service.js:31-32](src/services/Common/token.service.js#L31-L32)). The inputs aren't attacker-controlled today, but the pattern is one change away from SQL injection.

**H20. Mass assignment: request bodies are written straight into models.**
- `createProduct` ([product.service.js:89-153](src/services/Common/product.service.js#L89-L153)) and `updateProduct`, including variants ([3339-3344](src/services/Common/product.service.js#L3339-L3344), [3585](src/services/Common/product.service.js#L3585), [3598](src/services/Common/product.service.js#L3598)).
- `updateAddress` (a customer can set `user_id`, `is_verified`, etc.) ([address.service.js:163](src/services/Common/address.service.js#L163), [225-246](src/services/Common/address.service.js#L225-L246)).
- `createBrand` and `updateBrand` ([brand.service.js:9](src/services/Common/brand.service.js#L9), [120](src/services/Common/brand.service.js#L120)).
- Industries and use cases ([industry.service.js:22](src/services/Common/industry.service.js#L22), [142](src/services/Common/industry.service.js#L142), [211](src/services/Common/industry.service.js#L211), [362](src/services/Common/industry.service.js#L362)).
- Sizes ([size.service.js:12](src/services/Common/size.service.js#L12), [29](src/services/Common/size.service.js#L29)).

**H21. The company mail server can be used for phishing and spam.**
- Contact-us and sourcing-request creation email any address supplied, with no CAPTCHA or limit ([contactUs.service.js:30-43](src/services/Common/contactUs.service.js#L30-L43)).
- The unauthenticated `PUT /sourcing-requests/:id` sends a status email containing attacker-written `admin_notes` to the requester ([sourcingRequest.service.js:304-319](src/services/Common/sourcingRequest.service.js#L304-L319)). Create a request with a victim's email, then update it, and your SMTP sends the attacker's text.
- The email templates may not escape HTML (conditional: the templates aren't in the repo).

**H22. Supplier syncs corrupt or desync data.**
- **SAGE**
  - Stale variants are **hard-deleted** ([sage.service.js:1073-1083](src/services/Common/sage.service.js#L1073-L1083)). **✔ verified FK rules:** `order_items.variant_id` is `ON DELETE NO ACTION`, so once a variant has been ordered, that product's sync fails on every run. Cart and wishlist rows are `CASCADE`, so customers' carts silently lose items.
  - `stock: Number(onHand) || 999999` turns SAGE stock 0 into 999,999 ([sage.service.js:997](src/services/Common/sage.service.js#L997)).
  - Discontinued products and variants are re-activated right after being flagged ([sage.service.js:750-764](src/services/Common/sage.service.js#L750-L764), [829-842](src/services/Common/sage.service.js#L829-L842), [1101-1114](src/services/Common/sage.service.js#L1101-L1114)).
  - The monthly sync's change detection compares `Product.price/case_price/retail_price`, columns that don't exist, so every product is re-saved every month ([sageSync.service.js:105-111](src/services/Common/sageSync.service.js#L105-L111)).
- **SanMar:** discontinued SanMar variants are re-activated ([sanmar.service.js:826](src/services/Common/sanmar.service.js#L826) vs [887-899](src/services/Common/sanmar.service.js#L887-L899)).
- **All suppliers**
  - SKUs the supplier drops are never deactivated (SS, SanMar, OttoCap).
  - The "missing from supplier" branches check for an axios 404 that their data sources never produce, so nothing is auto-discontinued.
  - `ProductVariant.update({ deleted_at: null })` is a no-op, because the attribute is `deletedAt` (✔ verified) ([sage.service.js:1101](src/services/Common/sage.service.js#L1101), [ottoCap.service.js:395](src/services/Common/ottoCap.service.js#L395), [sanmar.service.js:887](src/services/Common/sanmar.service.js#L887)).
- **Brands and categories**
  - Brand upserts collide on the global `slug` across suppliers. SanMar "Gildan" overwrites the S&S "Gildan" row ([sanmar.service.js:41-46](src/services/Common/sanmar.service.js#L41-L46), [brand.service.js:310-316](src/services/Common/brand.service.js#L310-L316)).
  - Failure handlers then delete every row with that `import_batch_id`, including pre-existing rows the upsert touched ([brand.service.js:336-341](src/services/Common/brand.service.js#L336-L341), [productCategory.service.js:268-272](src/services/Common/productCategory.service.js#L268-L272), [sanmar.service.js:64-69](src/services/Common/sanmar.service.js#L64-L69)).
- **OttoCap**
  - Images download *inside* DB transactions.
  - `colorService` updates the same variant rows from outside the open transaction ([colorService.js:474-484](src/services/Common/colorService.js#L474-L484)), which risks lock waits.
  - Category id `1461` is hard-coded ([ottoCap.service.js:643](src/services/Common/ottoCap.service.js#L643)).
  - `weight` and `quantity` are written to columns that don't exist, so OttoCap shipping weight falls back to 0.5 lb ([ottoCap.service.js:807-809](src/services/Common/ottoCap.service.js#L807-L809)).

**H23. Carrier sync can never work.**
- It imports `shipstationClient`, but `config/shipstation.js` exports `shipstationApiClient` ([carrier.service.js:3](src/services/Common/carrier.service.js#L3)).
- If fixed, `Carrier.upsert` and `CarrierService.upsert` have no unique key, so every run would insert duplicates.

**H24. Every address is validated as a US address.**
- The caller sends `country_code` ([address.service.js:49](src/services/Common/address.service.js#L49)), but `mapAddress` reads `.country` ([shipstation.js:29](src/config/shipstation.js#L29)), so it always falls back to `"US"`.
- `state.code` doesn't exist ([address.service.js:47](src/services/Common/address.service.js#L47)), so full state names are sent.

**H25. Auth is fragile on required headers.**
- `verifyAuthJWTToken` needs a `role_id` header. Routers without `setRoleIdIfNotPresent` (cart, wishlist, orders, address, product detail) return 500 when it's missing. **✔ verified:** Sequelize throws on `role_id: undefined`.
- nginx drops headers with underscores by default.
- Login needs a valid `timezone` header, or it fails with 500 *after* the token was saved ([auth.service.js:395-406](src/services/User/auth.service.js#L395-L406)).
- Local login time uses `hh` (12-hour, no AM/PM) ([auth.service.js:403](src/services/User/auth.service.js#L403)).

**H26. Public endpoints that are easy to DoS.**
- Catalog filters load **every** matching variant site-wide into memory and price them in a JS loop ([product.service.js:1666-1710](src/services/Common/product.service.js#L1666-L1710)).
- Search runs about 8 leading-wildcard `LIKE` passes per term.
- `GET /product-category/unassigned` loads the entire catalog with categories and brands ([productCategory.service.js:282-384](src/services/Common/productCategory.service.js#L282-L384)).
- `POST /sage/import` runs up to 1,000 API calls and downloads inside one HTTP request.

---

## 4. Medium

| # | Finding | Where |
|---|---|---|
| M1 | `ProductAttachment`'s unique index is written as a JS *label statement* outside the options object, so the index never exists (✔ verified `indexes: []`) | [productattachment.model.js:77-88](src/models/productattachment.model.js#L77-L88) |
| M2 | Unique index on a TEXT column (`variant_attachments.source_url`) can't be created in MySQL (error 1170). An index on the non-existent `request_type` column (error 1072). Both break `sync({ alter: true })` | [variantAttachment.model.js:76-81](src/models/variantAttachment.model.js#L76-L81), [sourcingRequest.model.js:108-110](src/models/sourcingRequest.model.js#L108-L110) |
| M3 | Email templates live under `public/`, which is statically served, so template source would be downloadable at `/Email_Template/...`. The whole `public/` is served at the site root | [app.js:189-196](app.js#L189-L196) |
| M4 | `UseCaseProductOverride` has no unique `(use_case_id, product_id)`, so the `updateOnDuplicate` upserts always insert. A "moved" product stays included in the old use case | [industry.service.js:1117-1190](src/services/Common/industry.service.js#L1117-L1190) |
| M5 | No unique index on `users.email` or `admins.email`. Check-then-insert races allow duplicates. Admin create doesn't even check | models |
| M6 | OTP `beforeValidate` resets expiry to now + 5 min on **every** save, not just create | [otp.model.js:94-98](src/models/otp.model.js#L94-L98) |
| M7 | DB port from config is never passed to Sequelize (always 3306). `collate` and `supportBigNumbers` are in the wrong place and ignored | [central.db.js:5-24](src/config/central.db.js#L5-L24) |
| M8 | Money stored as DOUBLE/FLOAT (`subtotal_amount`, `tax_amount`, `markup_percent`) | [order.model.js:146-159](src/models/order.model.js#L146-L159), [pricingMarkup.model.js:22-26](src/models/pricingMarkup.model.js#L22-L26) |
| M9 | `REFUNDED` exists in `paymentStatusTypes` but not in either status ENUM, so refunds can't be recorded | [order.model.js:84-91](src/models/order.model.js#L84-L91), [payment.model.js:62-70](src/models/payment.model.js#L62-L70) |
| M10 | `migrate` script runs `sync({ alter: true })`. That can drop or alter columns, accumulates duplicate indexes, and fails on M2 | [migrateTable.js](src/config/migrateTable.js) |
| M11 | The role middleware checks `findRoleById(req.user.id)` (the user id, not the role id), and `isEngineer`'s logic is inverted. Dormant but wrong | [role.middleware.js:13-63](src/middlewares/role.middleware.js#L13-L63) |
| M12 | Three overlapping CORS layers: a wildcard `*`, a manual reflect, and the `cors` package. A disallowed origin gets a 500. `ACCESSDOMAINS` is unchecked (crash if missing) and untrimmed | [app.js:200-208](app.js#L200-L208), [credentials.js](src/middlewares/credentials.js), [accessDomains.js:2](src/helpers/accessDomains.js#L2) |
| M13 | No `unhandledRejection`/`uncaughtException` handlers. `syncSingleStyle` is an async handler outside `catchAsync` (an early throw is an unhandled rejection). SIGTERM exits with code 1. No SIGINT handling, no DB close | [index.js](index.js), [product.controller.js:146-188](src/controllers/Common/product.controller.js#L146-L188) |
| M14 | `ImportBatch.status: "partial_success"` isn't in the ENUM, and `notes` isn't a column. The OttoCap selective import then fails *after* commit, and its rollback throws, so a successful import returns 500 | [ottoCap.service.js:1122-1131](src/services/Common/ottoCap.service.js#L1122-L1131), [sage.service.js:1256](src/services/Common/sage.service.js#L1256), [sanmarSync.service.js:142](src/services/Common/sanmarSync.service.js#L142) |
| M15 | Cron jobs run inside the web process with no lock (duplicate runs if scaled). A "Hello, I am still Running" line is logged every minute. SanMar cron logs say "SS" | [app.js:43-136](app.js#L43-L136) |
| M16 | Secrets and PII in logs: Super Admin password printed; whole request bodies including the User instance; ShipStation payloads with addresses; Square customer responses; webhook bodies | [createSuperAdmin.js:14](src/config/createSuperAdmin.js#L14), [cartWishlist.service.js:1179](src/services/Common/cartWishlist.service.js#L1179), [shipstation.js:172](src/config/shipstation.js#L172), [checkout.service.js:78](src/services/Common/checkout.service.js#L78) |
| M17 | Expired or invalid JWTs return **500** instead of 401. Missing token returns 400 | [adminAuth.middleware.js:80-82](src/middlewares/adminAuth.middleware.js#L80-L82), [userAuth.middleware.js:101-103](src/middlewares/userAuth.middleware.js#L101-L103) |
| M18 | `jwt.verify(..., { algorithm })` is misspelled (should be `algorithms`), so the option is ignored (✔ verified: an HS512 token is accepted) | [adminAuth.middleware.js:73-75](src/middlewares/adminAuth.middleware.js#L73-L75) |
| M19 | Generated passwords use `Math.random()`, and plaintext passwords are emailed. `adminAddUser` hard-codes `role_id: 6` | [adminAuth.service.js:15](src/services/Admin/adminAuth.service.js#L15), [Admin/user.service.js:178-185](src/services/Admin/user.service.js#L178-L185) |
| M20 | Admin `verifyOTP` controller is missing a `return` after the error response (double send) | [adminAuth.controller.js:34-37](src/controllers/Admin/adminAuth.controller.js#L34-L37) |
| M21 | Stripe webhook never sends a response (the request hangs). It can't verify signatures anyway, because the body is already JSON-parsed | [payment.controller.js:142-266](src/controllers/Common/payment.controller.js#L142-L266) |
| M22 | `getNewPaymentTotal` concatenates DECIMAL strings (`0 + "10.00" + "25.50"` → `"010.0025.50"`) | [payment.controller.js:291](src/controllers/Common/payment.controller.js#L291) |
| M23 | Payment history and admin payment list return `status`/`payment_method`, which aren't columns (always undefined). `orderPricingBreakdown` is computed and discarded | [checkout.service.js:822-825](src/services/Common/checkout.service.js#L822-L825), [1208-1291](src/services/Common/checkout.service.js#L1208-L1291) |
| M24 | Admin order list: `subQuery: false` + `limit` with hasMany includes paginates joined rows, so pages show fewer orders | [order.service.js:1519-1530](src/services/Common/order.service.js#L1519-L1530) |
| M25 | `GET /country/:id` ignores the id and always returns country 233 | [country.service.js:44](src/services/Common/country.service.js#L44) |
| M26 | `PUT /size/:id` ignores `:id` and uses `body.id` | [size.controller.js:22](src/controllers/Common/size.controller.js#L22) |
| M27 | `getAllProductsByGrandCategory` throws when `brand_id` is passed with the required `grand_category_id`, so the brand branch is unreachable | [product.service.js:2131-2136](src/services/Common/product.service.js#L2131-L2136) |
| M28 | QUANTITY_BASED customization uses the highest tier ≤ qty as a *total*: 49 units are charged the 25-unit price | [cartWishlist.service.js:841-872](src/services/Common/cartWishlist.service.js#L841-L872) |
| M29 | SAGE `qtyTiers` and `netTiers` are filtered independently, which misaligns tier indexes when there are gaps | [buildPricingSnapshot.js:585-591](src/utils/pricing/buildPricingSnapshot.js#L585-L591) |
| M30 | `getMarkupPercent` returns 66.67 when markup is `0` (falsy). The SAGE 49.25 fallback constant is unused | [config/pricing.js:3-24](src/config/pricing.js#L3-L24) |
| M31 | `updateManualProductFull`, `createProduct`, `assignProductCustomizations`, and `mapCategoriesToParent` run many destructive steps with no transaction | [product.service.js:495-1117](src/services/Common/product.service.js#L495-L1117) |
| M32 | Deleted products vanish from customers' order history (paranoid includes give null name and images) | order and payment listings |
| M33 | Brand slugs are unstable: two different slugify implementations, and hooks regenerate the slug on every save. Duplicate-named brands then fail any update | [brand.model.js:102-125](src/models/brand.model.js#L102-L125), [brand.service.js:352-388](src/services/Common/brand.service.js#L352-L388) |
| M34 | Image downloader writes relative to `process.cwd()` while the app serves from `__dirname`. It never refreshes changed images. Hard-coded production URL | [supplierImage.service.js:8-15](src/services/Common/supplierImage.service.js#L8-L15) |
| M35 | Verification and OTP emails use callback-style `sendMail`, so failures are ignored and the user is told it was sent | [email.service.js:38-45](src/services/Common/email.service.js#L38-L45) |
| M36 | `ShipStation` order-creation errors are swallowed (`return null`). `getShippingRates` returns `[]` on any error | [shipstation.js:185-199](src/config/shipstation.js#L185-L199), [455-461](src/config/shipstation.js#L455-L461) |
| M37 | `SourceRawData` gets a new full-JSON row on every sync, with no unique key (upsert behaves as insert) and some writes outside the transaction. Unbounded growth | product, SAGE, OttoCap, SanMar services |
| M38 | Order number collisions under concurrency (`ORD-${Date.now()}` with a UNIQUE constraint) | [order.service.js:170](src/services/Common/order.service.js#L170) |
| M39 | `JSON.parse` without try/catch in listings. One bad row returns 500 for the whole list | [order.service.js:1708-1731](src/services/Common/order.service.js#L1708-L1731), [cartWishlist.service.js:130-139](src/services/Common/cartWishlist.service.js#L130-L139) |
| M40 | `process.env.TZ` is set after `app.js` (models, cron) has already loaded | [index.js:6](index.js#L6) |
| M41 | `db_backup.js` puts the DB password on the shell command line and writes to a CWD-relative path | [db_backup.js:12](src/config/db_backup.js#L12) |

---

## 5. Low / code quality

- **Excessive debug logging:** hundreds of `console.log` calls with emoji in request paths and sync loops. Use the existing winston logger with levels.
- **Duplicated logic:**
  - The pricing-breakdown formatter is copy-pasted 5 times across checkout and order services.
  - `getProductById`, `getGuestProductById`, and `getProductByIdAdmin` are near-identical.
  - Search-term expansion is duplicated 4 times.
  - The brand logo map exists twice: [utils/brand.js](src/utils/brand.js), which doesn't even export, and [config/sanmarBrand.js](src/config/sanmarBrand.js).
- **Redundant model hooks:** every model sets `updated_at`/`deleted_at` to UTC strings in hooks. Sequelize already manages these, and the strings are wrong if `DEFAULT_TIMEZONE` isn't UTC.
- **Inconsistent API shapes:** `getGuestProductById` returns `base_price` as a string; others return numbers. Error codes vary: `throw new ApiError(500, ...)` is used for validation errors in orders and payments.
- **Typos that leak into code and DB:** `stagging`, `departmenat.model.js`, `randomStringGenrate`, `currancyTypes`, `email_varification`, `is_backlisted`, `validateResetPassordBody`, `getAllDeparments`, `notificationToogle`, `reffral_id`, `schedular/`.
- **Template leftovers from other projects:** `STORY_VALIDATION_TIME_SPAN_HOURS`, Packages/Videos/UserPackages (CAD currency, `allow_stream`), Stripe code with `post_id`, `socket_id`/`fcm_token`, Engineer/Editor roles, `bookingTypes`, `/videos` `/gifs` `/docs` `/songs` static routes (and `audios` uploads go to a folder that isn't routed).
- **Admin-only debug strings:** for example `console.log("LOGIN API HIT - NEW CODE")` ([auth.service.js:291](src/services/User/auth.service.js#L291)).
- **ESLint:** 150 unused variables or imports across 49 files. One unused `eslint-disable` directive.
- **Duplicate export key:** `addCategoryToParent` ([parentCategory.service.js:408-410](src/services/Common/parentCategory.service.js#L408-L410)).
- **Duplicate associations:** `Role↔Admin` is declared twice under different aliases ([models/index.js:169-170](src/models/index.js#L169-L170), [196-197](src/models/index.js#L196-L197)).
- **`sortSizes`:** sorts in place and doesn't know `XXL`/`XXXL`/`2XS`.
- **`decodeHtmlEntities`:** strips any trailing "letters+digits" word from names (`Model X100` → `Model`).

---

## 6. Dead and unused code

| File / symbol | Status |
|---|---|
| [config/redis.js](src/config/redis.js) | Never required; requires `ioredis`, which isn't installed |
| [config/firebaseAdmin.js](src/config/firebaseAdmin.js) | Empty file |
| [config/db_backup.js](src/config/db_backup.js) | Never required; no npm script |
| [config/testing_shipstation.js](src/config/testing_shipstation.js) | Never required; also broken (calls async `calculatePricing` without `await`) |
| [config/sage.mapper.js](src/config/sage.mapper.js) | Never required; would generate random SKUs |
| [config/ss.adapter.js](src/config/ss.adapter.js) | Imported but `mapSSProduct` never used |
| [models/SSStyle.model.js](src/models/SSStyle.model.js) | Not registered, never used |
| `Category` model ([category.model.js](src/models/category.model.js)), `DEFAULT_CATEGORY_ID` | Only an unused import |
| `Package`, `UserPackage`, `Video` models; [package.controller.js](src/controllers/Common/package.controller.js), [package.service.js](src/services/Common/package.service.js), [video.controller.js](src/controllers/Common/video.controller.js), [video.service.js](src/services/Common/video.service.js) | Not exported or routed; template leftovers |
| [schedular/scheduler.js](src/schedular/scheduler.js) | Never required; body commented out |
| [middlewares/middlewares.js](src/middlewares/middlewares.js), [socketiomw.js](src/middlewares/socketiomw.js) | Never required; no socket server exists |
| [middlewares/common.middleware.js](src/middlewares/common.middleware.js) | Exports `{}` |
| [middlewares/role.middleware.js](src/middlewares/role.middleware.js) | Exported, never mounted (and broken, M11) |
| [utils/brand.js](src/utils/brand.js) | No `module.exports` |
| [utils/sanmarColor.util.js](src/utils/sanmarColor.util.js), [ottoColor.util.js](src/utils/ottoColor.util.js), [sageColor.util.js](src/utils/sageColor.util.js), `updateBrandSlugs` | One-off backfills, referenced only in commented-out code. `updateSanmarColors` and `getSanmarColorCodes` are imported but don't exist |
| [seeders/execution.js](src/seeders/execution.js) | Call commented out; `./dumps/*.sql` don't exist in the repo |
| `token.service.verifyToken`, `email.service.sendResetPasswordConfirmationMail`, `sendOTPMails` (imported, doesn't exist), `faq.service.createTimezone/main` | Never called |
| Stripe controller ([payment.controller.js](src/controllers/Common/payment.controller.js)) | Routes are live but not wired to orders. Treat as dead and remove the routes |
| Refresh tokens | Always empty strings ([token.service.js:88-92](src/services/Common/token.service.js#L88-L92)) |
| `user_login_timings`, `user_attachments` | Written, never read |
| Large commented-out blocks | Old `addProductVariants` ([product.service.js:1381-1514](src/services/Common/product.service.js#L1381-L1514)), cron blocks in `app.js`, brand auto-creation in sourcing |

---

## 7. Dependencies

**Missing** (required in code, absent from `package.json` and `node_modules`): `@paypal/paypal-server-sdk`, `node-cache`, `openai` (all on the startup path), and `ioredis` (dead file only).

**Declared but never imported by the code:**
- `firebase-admin`, `socket.io`, `passport`, `express-jwt`, `swagger-jsdoc`, `swagger-ui-express`, `cookie-parser`, `rootpath`, `body-parser` (Express bundles it).
- `moment-timezone`: never required directly. `moment.tz` only works because Sequelize loads it (✔ verified), which is fragile.
- `stripe` is only used by the dead Stripe controller. `uuid` is only an unused import.

**Misplaced:**
- `pm2` and `cross-env` are production dependencies.
- `p-limit@7` is ESM-only and loaded with `require()`. That only works on Node ≥ 20.19 / 22.12, while `engines` says `>=16.20.1`, and the `limit` it creates is never used ([product.service.js:28,41](src/services/Common/product.service.js#L28)).

**`npm audit`: 54 vulnerable packages: 3 critical, 36 high, 13 moderate, 2 low.**
- 2 of the 3 criticals (`protobufjs`, `websocket-driver`) come **only** from the unused `firebase-admin`. About 23 vulnerable packages are reachable only through unused or dev-tooling deps (firebase-admin, socket.io, pm2, nodemon). Removing those deps is the cheapest fix.
- Direct, used packages with high-severity advisories: `axios` (SSRF and NO_PROXY bypass, prototype-pollution gadget), `nodemailer` (SMTP command injection; major upgrade), `mysql2` (auth downgrade leaks plaintext password, zlib bomb), `joi`, `compression`, `xlsx` (prototype pollution and ReDoS; **no npm fix**, SheetJS moved to its own CDN), `path-to-regexp` / `proxy-addr` via Express.
- `pm2` pulls in `systeminformation` (OS command injection).

---

## 8. Feature inventory

**Used and working (as far as code review can tell):**
- Customer auth: register, OTP verify, login, logout, profile, change password.
- Catalog browse, search, filters, product pages (logged-in and guest).
- Wishlist and cart (manual and supplier products, customization, add-ons).
- Addresses with ShipStation validation and Google geocoding.
- Shipping rates.
- Order create and list.
- Square payments.
- ShipStation shipments, labels, and tracking webhook.
- Admin catalog management: manual products and variants with three pricing modes, duplication, brands, three-level categories, industries and use cases, Primary/Secondary/Budget tiers, customization options and pricing, add-ons, markups.
- Supplier imports: S&S (API), SanMar (from a `sanmar` DB table filled outside this repo), OttoCap (from server-side Excel files), SAGE (API).
- AI color-hex mapping (OpenAI).
- Monthly sync crons; contact-us; sourcing requests; FAQs.

**Used but broken:**
- Order cancellation (C10), and PayPal payment recording (C11, conditional).
- Carrier/service sync (H23).
- `updateProduct` with sizes, admin variant list, admin product filter by use case (H9).
- Payment and sourcing-request search, admin user list without `limit` (H10).
- `country/:id` (M25), daily payment total (M22).
- SAGE handling charge at add-to-cart (H13).
- Discontinuation in all syncs (H22).
- Rate limiting (H1).
- The `staging` npm script (H2).

**Present but unused / dead:** Stripe, Socket.IO, Firebase, Redis, Swagger, Passport/express-jwt, packages/videos/subscriptions, refresh tokens, RBAC (role middleware), `Category`/`SSStyle` models, login-timing analytics (write-only), DB backup and seed scripts, the scheduler file.

---

## 9. Recommended fix order

1. **Today (stop the bleeding):**
   - Put authentication and an admin check in front of every admin router, `admin/auth/register`, `findAdminById`, and `admin/user/*` (C1, C2).
   - Rotate `JWT_SECRET` to a long random **hex** value. Invalidate all admin and user tokens.
   - Lock down `otto-image` to the OttoCap host (C5).
   - Disable or verify the three webhooks (C3).
   - Compute shipping server-side and reject non-positive or non-integer quantities (C4).
   - Remove `raw_input` from addresses and purge existing rows (H4).
2. **This week:**
   - Fix the cart and wishlist IDORs (C8) and label purchase (C8).
   - Fix rate limiting, `NODE_ENV`, and OTP TTL/attempts (H1, H2, H5).
   - Fix the global multer: per-route, with size limits and unique names (H3).
   - Add `Payment` to `order.service.js` (C10) and fix the PayPal ENUM (C11).
   - Restore a clean boot: commit the templates, add the missing packages (C9).
   - Fix the `no-undef` list (H10) and the error handler (H11).
3. **Next:**
   - Payment idempotency, refunds, and shipment lifecycle (H7, H8, H16).
   - Remove PII from code and logs (H12, M16).
   - Pricing correctness: SAGE charge, per-design tiers, tax (H13–H15).
   - Supplier-sync integrity (H22), address country (H24).
   - Mass assignment allow-lists (H20).
   - Then the schema fixes in section 4 and the dependency cleanup in section 7: remove the unused deps, `npm audit fix`, replace `xlsx`.
4. **Ongoing:**
   - Add ESLint to the repo and CI.
   - Add tests around checkout, pricing, and webhooks.
   - Replace `sync({ alter: true })` with versioned migrations.

---

## Appendix: probes run (all read-only, against the project's installed libraries)

| Probe | Result |
|---|---|
| `require('./app.js')` with dummy env | `MODULE_NOT_FOUND ../../../public/Email_Template` |
| Missing-module scan of every `require()` | `@paypal/paypal-server-sdk`, `node-cache`, `openai`, 2 template paths, `ioredis` unresolvable |
| Project `errorHandler` on a bare Express app | JSON sent; stack trace logged per 4xx; 3/3 keep-alive sockets destroyed |
| `Buffer.from(secret,'hex')` + jsonwebtoken | Non-hex secret → 0-byte key; empty-key forged token accepted |
| `jwt.verify` with `{ algorithm: 'HS256' }` | HS512 token accepted (option ignored) |
| `moment().add(undefined,'days')` | Adds 0 ms → token expires immediately |
| Sequelize `where: { role_id: undefined }` | Throws → 500 |
| Sequelize ORDER BY with injected direction | Quoted as identifier → SQL error, not injection |
| `Size.findAll({ where: { paranoid:false } })` SQL | `` `Size`.`paranoid` = false `` |
| Model `.validate()` on invalid ENUM values | Passes (Sequelize doesn't check ENUM membership) |
| `ProductAttachment.options.indexes` | `[]` |
| FK rules from associations | `order_items.variant_id` NO ACTION; cart/wishlist/warehouse/attachments CASCADE |
| Real `buildPricingSnapshot` (DB markup stubbed) | qty −9 → −450; qty 0.01 → 0.50; "Left Chest" → $0; 7 colors → $0; unknown DTG → $0 |
| Real `buildSagePricingSnapshot` as `addToCart` calls it | Handling charge $0 (vs $35 when `product` passed) |
| ESLint correctness pass | 41 problems (35 `no-undef`), 150 unused vars |
| `npm audit` | 54 vulnerable packages (3 critical, 36 high) |
