# Client questions: internal notes (not for the client)

Companion to [client-questions.md](client-questions.md). Same question numbers.

It merges two sources, checked against the code:
- The website's list (`hashtag-next/docs/client-confirmation-questions.md`, items A1–A46 and B1–B9, written against frontend commit `5ea83e3`).
- The backend's list. That was `docs/CLIENT_CONFIRMATIONS.md`, now folded into this one.

Backend findings refer to the backend working tree on branch `fix/security` (October 14, 2026). Items marked **(branch)** describe changes on that branch that aren't deployed yet.

Terms ("cart line", "decoration", "artwork", the meanings A–D of "design") are as defined in the client document's "Words we use" section. Use them the same way in code and tickets.

Contents:
1. Where the website and the order system disagree today (fix regardless of answers)
2. Answers to the website's backend checks (B1–B9)
3. Per-question backend findings and what each answer changes
4. Website changes required by the backend security branch
5. Proposed architecture direction

---

## 1. Website vs. order system mismatches

These are wrong today whatever the client answers. The cart and order totals always come from the server's `pricing_snapshot`, so the customer is charged the server's number. Each mismatch means the product page shows one price and the cart shows another.

| # | Mismatch | Website | Order system | Ref |
|---|---|---|---|---|
| M1 | DTG with several locations | style price once | style price × number of locations ([buildPricingSnapshot.js:470-490](../src/utils/pricing/buildPricingSnapshot.js#L470-L490)) | Q8 |
| M2 | SAGE markup | hard-coded × 1.4925 | `calculatePricing(net, "SAGE")`: the `pricing_markups` row for SAGE, or 66.67% if none ([buildPricingSnapshot.js:624](../src/utils/pricing/buildPricingSnapshot.js#L624)); breakdown label hard-codes 49.25 ([:758](../src/utils/pricing/buildPricingSnapshot.js#L758)) | Q11 |
| M3 | SAGE handling charge and drinkware 2nd-location fee on first add | n/a | `addToCart` passes `categories` where `buildSagePricingSnapshot` expects `product` ([cartWishlist.service.js:1903-1911](../src/services/Common/cartWishlist.service.js#L1903-L1911)), so both fees are $0 at add time and appear after any quantity change (repricing passes `product`, [:2548-2553](../src/services/Common/cartWishlist.service.js#L2548)) | Q14, Q15 |
| M4 | Promo minimum fallback | 100 when no tier/minimum | no fallback; min = lowest SAGE qty tier, and it throws if the variant has no tiers ([:580-596](../src/utils/pricing/buildPricingSnapshot.js#L580-L596)) | Q16 |
| M5 | Add-on quantity | forced = product qty | independent quantity supported and validated ([cartWishlist.service.js:1034](../src/services/Common/cartWishlist.service.js#L1034)) | Q25 |
| M6 | Low-stock message | ≤ 5 | `FEW_LEFT` when stock < 10 (getCart, getWishlist) | Q49 |
| M7 | Password rules | 8+, upper, number, special | 8+, ≥2 digits, no spaces ([validatePassword.js](../src/helpers/validatePassword.js)); on the branch this rule is now also enforced on reset | Q42 |
| M8 | Upload size | "max 10 MB" (not enforced); manual products 5 MB × 5 files | (branch) 20 MB per file, 40 files per request; `customization_images` max 10 | Q21 |
| M9 | Mobile at sign-up | exactly 10 digits | required, no format check | Q43 |
| M10 | Google Pay / Cash App request | fixed `amount: "1.00"` | charges `order.total_amount` ([checkout.service.js:137](../src/services/Common/checkout.service.js#L137)) | Q37, payments phase |

Also found:

- **Order items store the browser's own price fields.** `customization_config` saved on cart and order items is the whole object the browser sent, including its `product_price`, `decoration_price`, `digitizing_fee` and `total_price` ([cartWishlist.service.js:1940](../src/services/Common/cartWishlist.service.js#L1940)). Those values are not used for charging, but the admin order view shows `customization_config`, so admins can see the browser's numbers next to the real `pricing_breakdown`. Strip these before saving.

---

## 2. Answers to the website's backend checks (B1–B9)

| | Question | Answer | Status |
|---|---|---|---|
| B1 | Does the API recalculate prices? | **Yes.** Every cart line is repriced server-side (`buildPricingSnapshot`, `buildSagePricingSnapshot`, `buildManualPricingSnapshot`) and the order uses the stored snapshot ([order.service.js createOrder](../src/services/Common/order.service.js)). The browser's price fields are ignored for charging but stored (see section 1). Negative and fractional quantities were accepted and priced negative; (branch) now refused. | OK; strip stored browser prices |
| B2 | Is `shipping_amount` from the browser trusted? | **Yes, it is trusted** ([order.service.js:167](../src/services/Common/order.service.js#L167)). It's then overwritten by the actual label cost when the label is bought ([order.controller.js:368](../src/controllers/Common/order.controller.js#L368)). | Payments phase |
| B3 | What does the server charge for Google Pay / Cash App tokens? | `order.total_amount`, not $1.00 (M10). The website needs the final total before building the payment request. Note `total_amount` changes when the label is bought. | Payments phase |
| B4 | Same password rules? | No (M7). Waiting on Q42. | Decide, then align both |
| B5 | "Not verified" right after verifying | Moot: the OTP flow is gone (branch). Verification is now one call, `POST /user/auth/verify-email`, and its success response means the status is already updated. Remove the retry loop. | Website change |
| B6 | Reset token in the URL | (branch) Emailed link token: 32 random bytes, stored as SHA-256, single use, 60 min, older tokens invalidated on reissue, every session revoked on reset. Putting it in the link URL is the design. | Done on branch |
| B7 | Upload limits server-side | (branch) Yes: files only accepted on routes that need them, after auth; 20 MB per file, 40 files per request; type checks per field (`customization_images`: SVG/AI only; `images`/`variant_images`: images, video, PDF, audio, doc). The customizer's "image only" rule should also be enforced: today `images` accepts PDF, audio and doc too. | Done on branch; tighten per Q21 |
| B8 | Login fails without `timezone` | (branch) Fixed: falls back to `DEFAULT_TIMEZONE`, and login history is best effort. Raw DB errors in 5xx responses remain in some services (many wrap any error into `ApiError(500, error.message)`). | Done on branch; error messages later |
| B9 | Address validation | Validated through ShipStation when the address is created/updated, not at rate or label time. Bugs (audit H24): the country is dropped, so every address is validated as US ([shipstation.js:28](../src/config/shipstation.js#L28)); full state names are sent; a missing phone becomes `9999999999` ([:22](../src/config/shipstation.js#L22)). | Fix with shipping work |

---

## 3. Per-question findings and impact

"Website ref" is the item in the website's list; "BE" is the old backend list. "Impact" is what changes depending on the client's answer.

### Prices and fees

| Q | Website ref | Backend today | Impact / work by answer |
|---|---|---|---|
| 1 | A1 | Per cart row: `buildPricingSnapshot` gets one row's quantity; digitizing $35 if row qty ≤ 11 ([:401-403](../src/utils/pricing/buildPricingSnapshot.js#L401-L403)). No design identifier on cart rows. | The grouping key depends on the meaning chosen: **A** artwork (file hash); **B** artwork + location + size; **C** B + thread/ink colors; **D** the full decoration set of a cart line. Store that key on cart and order items. Fee (and tier/minimum, if (b)/(c) say so) computed per group across the cart; reprice every line of a group when any of them changes. Answer (d) decides whether grouping spans separate add-to-cart steps (cart-wide) or one submission. The fee becomes a group-level charge, not per line. Needs Q19/Q20 (artwork, size and colors stored per location) for B and C. |
| 2 | A2 | Once per cart line regardless of location count. | Follows Q1: meaning B or C → one fee per distinct artwork/location (and size). Needs Q20 (per-location artwork). |
| 3 | A3 | Only embroidery fee; DTF, screen and DTG have none. | Add setup-fee config per method (and per color for screen) to the pricing tables (Q4). |
| 4 | A4 | Second copy of every table in [buildPricingSnapshot.js:26-224](../src/utils/pricing/buildPricingSnapshot.js#L26-L224); values match the website's. | Recommended: move to DB tables (method, location, tier min/max, price, setup fee), admin CRUD, public read endpoint; website renders from it. Removes the duplicate. |
| 5 | A5 | Unknown embroidery location key → no table → $0 ([:232-233](../src/utils/pricing/buildPricingSnapshot.js#L232-L233)). `FULL_FRONT` has no table. | Add the locations with prices, or remove them from the hoodie offer. |
| 6 | A6 | No `FULL_FRONT` table. | Add the price row if enabled. |
| 7 | A7 | No per-product method or location data. | Add allowed methods/locations to product or category (or a garment-type table); validate server-side in `addToCart`; website reads it. Also covers Q22 (garment type for mockups). |
| 8 | A8 | See M1. | Pick a rule, then align. If DTG is style-based only, reject multiple locations for DTG. |
| 9 | A9 | One `customization.colors` for all locations; colors > 6 → $0 ([:260-263](../src/utils/pricing/buildPricingSnapshot.js#L260-L263)). | Per-location colors → change the payload to colors per location. Reject > 6 or mark inquiry. |
| 10 | (BE 2.6) | Unknown location, color count or DTG style → $0; location normalization only maps `-` → `_`, so "Left Chest" = $0. | Validate every choice against an allow-list and reject unknowns (400). Covered by the Q4 data model. |
| 11 | A11 | See M2. Admin markup endpoints exist (`GET /product/pricing/markup`, `PUT /product/pricing/:id`, now admin-only on the branch). The fallback when no DB row exists is 66.67 ([config/pricing.js](../src/config/pricing.js)). | Single source: DB markup per supplier, validated range (no negatives), shown to the website only through final prices. Remove the website's × 1.4925 and the hard-coded 49.25 label. |
| 12 | A12 | SAGE `setup_fee` is always 0; the supplier setup charge isn't read. | If charged: read the supplier setup charge from SAGE product data (meta), apply markup per answer, add it as a line-level fee. |
| 13 | A13 | Only the drinkware 2nd location is priced. | Add an imprint pricing model for promo products if needed. |
| 14 | A14 | $8 constant ([:18](../src/utils/pricing/buildPricingSnapshot.js#L18)); "drinkware" detected from parent-category title; laser = color imprint. Bug M3. | Fix M3 regardless. Move the price to config. |
| 15 | A32, BE 2.2 | $35 per cart line for SAGE supplier 51093 with category title "Tumblers" ([:9-16](../src/utils/pricing/buildPricingSnapshot.js#L9-L16), [:770-798](../src/utils/pricing/buildPricingSnapshot.js#L770-L798)). Bug M3. | Per order / line / item changes where it's computed: per order means an order-level fee in `createOrder`. Move to config. |
| 16 | A15, BE 2.5 | See M4. Screen print min 12 per row ([:443-445](../src/utils/pricing/buildPricingSnapshot.js#L443-L445)). Manual variants: `min_order_quantity` checked on add only. | Each product carries its minimum; enforce on add **and** on cart quantity changes; group-level minimum if Q1 (c) says minimums count across cart lines. |
| 17 | A16 | No print-product model; such products are SAGE/supplier or manual. | If options: set them up as MANUAL products with customization options (exists). If print-ready upload: add a file-upload customization type (exists: `allow_image_upload`, but SVG/AI only, see Q21). |
| 18 | BE 2.7 (audit C6) | Public product list/detail return `original_price`, `base_price`, `markup_percent`, `markup_amount`, `case_price`, raw `meta` (SAGE `netTiers`), `pricing_tiers` built from net prices; `POST /product/get-variant` returns the raw supplier price. | Customer-facing serializers that only send selling prices. Check what the website displays from these fields first (strikethrough "original price"?). |

### Artwork and production

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 19 | A17 | Apparel/promo path stores one file: `files.images[0]` → `logo_image` ([cartWishlist.service.js:1826](../src/services/Common/cartWishlist.service.js#L1826)), shared by every row of that add. Text, font and placement are only stored if the browser includes them in `customization`; it doesn't today. Manual products store per-option artwork (`customization_images` by `image_index`). | Artwork model: per order item and location, the original file + placement (x, y, width, rotation, units) + text/font/color, plus the preview image. Admin/production view showing it, with download. |
| 20 | A18 | One `logo_image` per cart row. | If per location: artwork per location (Q19 model). |
| 21 | A19, BE 6 | See M8 and B7. Manual: SVG/AI only (`multer.js` and `addToCart` re-check). Customizer `images`: any image, plus PDF/audio/doc by the shared filter. | Per-method allowed types in config; enforce per field server-side; website reads limits from the API. SVG served from the API origin is a stored-XSS vector (mitigated by Helmet CSP); serve uploads with `Content-Disposition`/separate domain if SVG stays. |
| 22 | A20 | No garment type or per-side images. | Add `garment_type` (and optional mockup images) to product or category; see Q7. |
| 23 | A21 | Not stored (see Q19). | Store font name with text. |

### Product options

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 24 | A22 | `CustomizationOption` has `allow_text_input`, `allow_image_upload`, no `is_required`; `addToCart` doesn't check that any customization option was chosen. Size/color is whatever variant the website sends; nothing checks the shopper actually picked one. | Add `is_required` to `product_customizations` (per product) or `customization_options`; validate in `addToCart`; website reads it. |
| 25 | A23 | See M5. Repricing keeps the stored add-on quantity when product quantity changes. | If "per order" add-ons: an add-on type flag (per item / per order). |
| 26 | A24 | n/a | Website only. |

### Shipping, tax and checkout

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 27 | A25, BE 3.4 | `createOrder` creates a ShipStation shipment before payment; `POST /order/create-shipment-label` (customer-callable) buys the label for an unpaid order, repeatedly (audit C8/H8). Labels are voided only by `invalidatePendingOrder` on cart change. | Move label purchase to an admin action (or to a webhook after payment). Restrict the endpoint to admins and paid orders without a label. Void labels of abandoned orders. **Payments phase.** |
| 28 | A26 | Label purchase overwrites `shipping_amount` and `total_amount` with the actual cost ([order.controller.js:310-368](../src/controllers/Common/order.controller.js#L310-L368)), even after payment (audit H16). | If the quote stands: never change `total_amount` after the order is created; keep `actual_shipping_cost` and `shipping_profit` for reporting. Server-side quote id instead of the browser's amount (B2). |
| 29 | A27, BE 3.1 | `TAX_RATE = 8.25` on subtotal only ([order.service.js:169](../src/services/Common/order.service.js#L169)); `orders.tax_rate` default 8.25. | Tax by destination: tax table per state or a tax API (TaxJar/Avalara/Stripe Tax), computed at order creation; exemption flag on user. Website shows only the API's tax. |
| 30 | BE 3.2 | Hard-coded individual's name, phone, home address ([shipstation.js:31-39](../src/config/shipstation.js#L31-L39)). | Move to config/DB (warehouse table if several origins or drop-ship). |
| 31 | BE 3.3 | `unit_weight || 0.5` in three places ([shipstation.js](../src/config/shipstation.js)). OttoCap writes weight to a non-existent column (audit H22). | Weight per product/variant or per category default. |
| 32 | A36 | States list = `states` rows with `is_active = 1`; shipping is restricted by data, not code. | Deactivate unshippable regions in the DB (data change); optional `shippable` flag. |
| 33 | A28 | Cart, wishlist, address and order require a customer token. | Large: guest cart (session token), guest order with email, order lookup (Q39). |
| 34 | A29, BE 7 | `PATCH /order/:id` (customer) cancels unless SHIPPED/DELIVERED/CANCELLED; voids the label first; restores stock if paid; never refunds; **crashes** on `Payment.update` (`Payment` not imported, [order.service.js:897](../src/services/Common/order.service.js#L897), audit C10). | Cancellation rules by status; refunds through Square/PayPal API; record REFUNDED (needs ENUM change, audit M9). **Payments phase.** |
| 35 | A30, BE 4.4 | Each `createOrder` creates a new order; no reuse. `invalidatePendingOrder` soft-deletes only the latest pending order on any cart change, even mid-payment (audit H8), so a webhook for it then can't find the order. | Expiry job for unpaid orders; reuse or rebuild the pending order from the cart; never delete an order with a payment in progress. **Payments phase.** |
| 36 | A31, BE 4.3 | Quantity changes reprice (snapshot rebuilt: tier, digitizing fee, SAGE min, screen-print min 12). Not checked: manual `min_order_quantity` on increase/update; decrement removes the line below the variant minimum; a screen-print row decremented below 12 errors (500 with message) instead of removing. | Per answer: lock customized lines (only delete/re-add), or enforce all minimums on every change. |
| 37 | A33 | Square (card, Google Pay, Cash App) + PayPal; `paymentModeTypes` lacks `PAYPAL` (audit C11). Apple Pay needs Square domain verification. | Payments phase. |
| 38 | A34 | No order, payment, shipping or cancellation emails are sent anywhere. | Order email service: confirmation (on payment success), shipped (tracking webhook), cancelled/refunded; optional admin new-order notification. |
| 39 | A35 | `GET /order/:id` requires the owner's token. | Public lookup by order number + email (rate-limited). |

### Accounts and admin

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 40 | A38, BE 1.1 | (branch) Cron every 15 min soft-deletes `PENDING` users older than 2 h ([jobs/accountCleanup.js](../src/jobs/accountCleanup.js)). Existing never-verified accounts are removed on the first run (the before-deploy SQL prints the count). | Hard delete: also remove profile/tokens; check FKs first. One-off reminder email: script before go-live. |
| 41 | BE 1.2 | (branch) [config/accountPolicy.js](../src/config/accountPolicy.js). | Constants only. |
| 42 | B4, BE 1.4 | See M7. | One rule in [helpers/validatePassword.js](../src/helpers/validatePassword.js); expose it (or its description) to the website. |
| 43 | A37 | See M9. | Validation in `validateRegisterUserBody` and address endpoints. |
| 44 | BE 1.5 | (branch) `requireAdmin` on every admin route; `requireSuperAdmin` on admin, role and department management. No finer permissions. | Permission matrix: `role_permissions` table or a static map; `requirePermission("pricing.write")` middleware on routes. |
| 45 | BE 1.3 | (branch) Admin-created users: `ACCEPTED`, `ACCOUNT_SETUP` link (72 h). | — |
| 46 | BE 1.6 | `DELETE /user/deactivate` soft-deletes the user; orders keep `user_id`. | — |
| 47 | BE 1.7 | Two code paths: `getProductById` uses `calculatePricing`, `getGuestProductById` computes inline (guest `base_price` is a string). | Use one pricing path for both. |

### Stock and catalog

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 48 | BE 4.1 | `stock: Number(onHand) \|\| 999999` in the SAGE import ([sage.service.js:964](../src/services/Common/sage.service.js#L964)). | If zero stops orders: store 0 and set `track_inventory` correctly. |
| 49 | A44 | See M6. | Pick one threshold; serve it from the API. |
| 50 | BE 4.5 | `product_category_id: 1461` hard-coded twice ([ottoCap.service.js:627](../src/services/Common/ottoCap.service.js#L627), [:657](../src/services/Common/ottoCap.service.js#L657)). | Config, or map from OttoCap data. |
| 51 | BE 4.6 | Crons in [app.js](../app.js) (monthly, in the web process). | Daily stock sync job; move crons to a worker. |
| 52 | BE 4.7 | `colorService` calls OpenAI `gpt-4o-mini` for unknown colors (results cached in `color_mappings`). | Feature flag. |
| 53 | A41 | — | Website only. |
| 54 | A42 | `getAllProducts` accepts `min_price`/`max_price` but doesn't return a price range. | Return min/max for the current filter (cheap if computed from the cheapest-variant map). |
| 55 | A43 | Tiers are admin-managed data (`/tiers`, keys primary/secondary/budget). | Labels from tier data. |
| 56 | A45 | No gallery model. | Gallery table + admin CRUD + public endpoint, if wanted. |
| 57 | A46 | — | Website only. |

### Contact, email and legal

| Q | Website ref | Backend today | Impact |
|---|---|---|---|
| 58 | A39, BE 5.1 | Contact notifications hard-coded to `anshita.varyani@mypageseo.com` ([email.service.js:55](../src/services/Common/email.service.js#L55)). | `CONTACT_INBOX` env var. Website addresses: website only. |
| 59 | BE 5.2 | (branch) [templates/authEmails.js](../src/templates/authEmails.js). Contact/sourcing templates are still missing from the repo (`public/Email_Template`, audit C9). | Shared email layout once branding arrives; bring the missing templates into the repo. |
| 60 | BE 5.3 | (branch) `publicFormLimiter` 10/hour/IP on contact and sourcing create. | CAPTCHA verification middleware if wanted. |
| 61 | A40 | — | If admin-editable: CMS-style `pages` table + endpoint. |

---

## 4. Website changes required by the backend security branch

These must ship together with `fix/security`.

1. **Email verification by link** replaces the 4-digit code.
   - Remove `POST /user/auth/otp` and `/user/auth/verify-otp`.
   - New page `/verify-email?token=…` → `POST /api/v1/user/auth/verify-email` `{ token }`.
   - Resend: `POST /api/v1/user/auth/verify-email/resend` `{ email }` (generic answer, max one email per minute per account).
   - Login of an unverified account now answers **403** with a message; show a "resend link" option.
2. **Forgot password by link** (customer and admin):
   - `POST /api/v1/user/auth/forgot-password` `{ email }` (or `/admin/auth/forgot-password`). Generic answer.
   - New page `/reset-password?token=…` (on both the customer site and the admin panel) → `POST …/forgot-password/reset` `{ token, password, confirm_password }`.
   - Remove the base64 token-in-URL OTP flow.
3. **Admin-created accounts** receive a "set your password" email that opens the same `/reset-password` page.
4. **Admin panel:**
   - Send `x-access-token` on **every** admin call. Most catalog and admin endpoints used to be open and may have been called without it.
   - 401 means sign in again; 403 means not allowed.
   - All admins must sign in again after deploy.
   - Admin creation no longer takes or returns a password.
5. **Customers:** everyone signs in again after deploy. A password reset or change signs out other sessions. Error status codes for bad or expired tokens are now 401 (were 400/404/500).
6. **Uploads:**
   - Files are refused (400) on endpoints that don't take them.
   - Limit is 20 MB per file and 40 per request.
   - Customer artwork upload (`POST /product/cart`) requires sign-in before the file is accepted.
7. **Rate limits** (HTTP 429):
   - Sign-in: 10 failed attempts / 15 min per IP.
   - Email-sending endpoints: 5 / hour per IP.
   - Link submissions: 20 / 15 min.
   - Contact and sourcing forms: 10 / hour.
8. **Remove the login retry loop** (B5) and the `timezone` header workaround if any (B8).

---

## 5. Proposed architecture direction

Most high-priority questions point the same way. Recommended regardless of individual answers:

1. **Pricing is computed in exactly one place: the order system.**
   - Decoration tables, setup fees, markups, handling charges and minimums move into DB-backed configuration with admin screens (Q3, Q4, Q11, Q14, Q15, Q16).
   - The website gets a read-only pricing endpoint to display prices and a "quote" endpoint to price a configuration before adding to cart.
   - Removes the duplicated tables and every mismatch in section 1.
2. **Product capability data:**
   - Per product or category: allowed methods, locations, garment type, required options, minimums, weights (Q5–Q7, Q16, Q22, Q24, Q31).
   - The website only offers what the data allows; `addToCart` validates against the same data and rejects unknown values (Q10).
3. **Decorations as data:**
   - Store each decoration explicitly (artwork, location, size, placement, thread/ink colors, text/font) on cart and order items (Q19, Q20).
   - Derive the grouping key for fees, tiers and minimums from the meaning of "design" the client picks (Q1, Q2). Production view built on the stored decorations.
4. **Order lifecycle** (payments phase):
   - Server-side shipping quote; tax by destination.
   - Labels bought by staff when ready to ship.
   - Unpaid-order expiry, refunds, order emails (Q27–Q29, Q34, Q35, Q38).
5. **Customer-facing serializers:** shoppers never receive cost, markup or supplier net data (Q18).
