# Backend changes for the admin panel (Hashtag-Billionaire-Admin)

What each backend release changes for the admin panel, and what the panel has to do. Newest first. Paths are relative to `/api/v1`. Questions the panel raised are answered in its own `BACKEND_QUESTIONS.md`.

| Release | Backend commit | Panel action |
|---|---|---|
| [2026-11-13: payments go-live](#2026-11-13-go-live) | not deployed yet | Done in Hashtag-Billionaire-Admin in the same release (see the section) |
| [2026-11-12: pricing templates](#2026-11-12-templates) | `adeb71f`, live | None: the panel's F29 code already calls them this way |
| [2026-11-12: the website's category list leaves out empty categories](#2026-11-12-categories) | `64c340f`, live | None: the panel's admin token gets every category, as before |
| [2026-11-12: "No Parent Category only" across the catalog](#2026-11-12) | `20ebba1`, live | None: the panel's `fe828f9` already sends it (F28) |
| [2026-11-06: `FIXED_QUANTITY` customization pricing](#2026-11-06) | `a8cb702`, live | None: `22d03d2` already sends it. Add it to products only after the shop's release |
| [2026-11-04: ShipStation after payment](#2026-11-04-shipping) | `4b5729f`, live | **Recommended**: the failure reason and a "Try again" button on the order's Shipping tab |
| [2026-11-04: customers' real graphics on orders](#2026-11-04) | `4b5729f`, live | **Recommended**: a download link per graphic on the order screen |
| [2026-10-26: client decisions, first backend changes](#2026-10-26) | `8f53487` to `27de06f`, live | Read the notes; the Settings page, Q31, Q42, Q44, Q45 and Q56 in the to-do list |
| [2026-10-16: status markers, SAGE stock, supplier pricing](#2026-10-16) | `aba0065` | **Recommended**: show variant status, add a status filter |
| [2026-10-15: bug sweep](#2026-10-15) | `44141b0` | Optional: new endpoints and fields |
| [2026-10-14: security release](#2026-10-14) | `335d27b` | Done |

The client's answers of 26 and 27 October, and what they mean for the panel, are in [Client decisions](#client-decisions) below.

---

<a id="client-decisions"></a>
## Client decisions (26–27 Oct 2026): the panel's to-do list

The client answered the questions in `client-questions.md` on 26 October and the follow-ups on 27 October; Q numbers are that document's.

### Can start now

| Q | Decision | What the panel does |
|---|---|---|
| — | The 15 Oct bug sweep is live (checked 26 Oct) | The switches promised in `BACKEND_QUESTIONS.md` E2: Contact Us with `page`, `limit`, `search` and `status`; the variant detail page loading `GET product/admin/variant/:id`; sourcing requests with server paging and search; the Remove button on a saved add-on image. |
| — | The 16 Oct release is live | Variant status badges, the `?status=` filter, product `restored_at` and the SAGE stock display ([2026-10-16](#2026-10-16)). |
| 11 | Markups: SAGE 49.25%; SanMar, S&S and OttoCap 66.67% | Nothing to build: the Pricing page shows the rates once the backend has set them. |

### Backend side is live

These go with the backend changes listed under [2026-10-26](#2026-10-26).

| Q | Decision | What the panel does |
|---|---|---|
| 42 | One password rule everywhere: 8+ characters with an uppercase letter, a number and a special character | Update the form check, which mirrors the old backend rule (2 digits, no spaces). |
| 44 | Every admin has full access; Super Admins can add more Super Admins | Offer the Super Admin role when a Super Admin creates or edits an admin, and allow deleting another Super Admin (never yourself or the last one). |
| — | — | Everything the server's `.env` held (API keys, mail server, shipping sender, payment credentials, links) moves to the admin panel, protected by a settings key | Build the Settings page (`/settings`). Everything it needs is in [admin-settings.md](admin-settings.md). |
| 31 | Admins can set a product's weight; supplier weights stay where there's no admin weight | A weight field (lb) on product and variant edit, saved with `PUT product/admin/weight`, not with the product update, which would stop supplier updates for that product. |
| 56 | The team manages the gallery | A gallery screen: list, add, edit the caption, reorder, hide and delete photos. The shop's current photos have to be added here once. |
| 45 | Admins can set a password and share it; viewing a password isn't possible, since passwords are stored one-way, and the client agreed | A "Set password" action on customers and on admins. |

### After later backend work

| Q | Decision | What the panel will do |
|---|---|---|
| 4, 10 | Decoration price tables editable in the admin; choices outside them are refused | Price-table screens. |
| 16 | The team sets the minimum for promo products the supplier gives none for (100 today) | A field for it. |
| 23 | The team manages the fonts for custom text (which other settings is being confirmed) | A fonts screen. |
| 34 | Cancellation within 2 hours; refunds by hand | A "refund done" action on cancelled orders. |
| 39 | Per order: ShipStation tracking or manual updates | A tracking-mode switch and a status form on the order. |

### Answers to `BACKEND_QUESTIONS.md` E3

1. **`payment_status=ALL`:** coming in the next release: `GET order/admin?payment_status=ALL` lists orders of every payment status. Without the parameter it still lists paid orders only.
2. **The 2 unpaid orders the panel doesn't show:** when a customer's cart changes, the backend soft-deletes their latest unpaid order (`invalidatePendingOrder` in `cartWishlist.service.js`), and orders are paranoid, so those two are hidden from every list. Nothing is missing on the panel's side; the behaviour itself is on the payments list (audit H8).

---

<a id="2026-11-13-go-live"></a>
## 2026-11-13: payments go-live (not deployed yet)

The panel's side was changed in the same release. Run `migrations/2026-11-13_payments_go_live_before_deploy.sql` before deploying the backend.

### Orders: `GET order/admin`
- `payment_status` filter: `SUCCESS` (the default), `PENDING` (unpaid), `REJECTED` (payment failed) or `ALL`.
- Each order adds `handling_amount`, `tax_rate`, `tax_amount`, `attention_note`, `cancelled_at`, `cancel_reason`, and `actions: { can_buy_label, can_cancel, can_delete }`. The flags are the only rule the panel uses for its buttons; the endpoints check the same rules.
- `attention_note` is something the team must deal with: stock that ran out between checkout and payment, a payment that arrived for a cancelled order, or a second payment for a paid order (refund one).
- Statuses mean the same everywhere (order, payment, shipment); the list is in [the shop's notes](frontend-changes.md#2026-11-13-go-live).

### Order actions
| Button | Endpoint | Allowed when | What it does |
|---|---|---|---|
| Buy label / Try again | `POST order/admin/:id/label` | Paid, not cancelled, no label, shipment `PENDING` or `FAILED` | Buys the label now; works whether automatic labels are on or off. `502` carries ShipStation's reason, `409` means one is already being bought. |
| Cancel order | `POST order/admin/:id/cancel` `{ reason? }` | Not cancelled and not yet with the carrier | Voids an unused label, takes the order off ShipStation, puts stock back if it was paid, sets `CANCELLED`. **Doesn't refund** (question 34): refund in Square or PayPal. Answers `{ order, warnings }`; `409` when ShipStation won't void the label, and then nothing changed. |
| Delete order | `DELETE order/admin/:id` | Unpaid (no payment still processing, no label), or cancelled | Hides the order (soft delete) from the panel and the customer's account. |

### Settings
- **Shipping → "Buy shipping labels automatically"** (`SHIPSTATION_AUTO_LABELS`, on by default). Off: paid orders wait with shipment `PENDING`, nothing goes to ShipStation, and the admin presses Buy label. Turn it off while payments are in sandbox: ShipStation labels are always real.
- **Order fees → "Handling fee"** (`HANDLING_FEE_RULE`, new type `handling_fee`, JSON text `{ amount, label, category_ids, suppliers }`). It's charged once per order when any product is in one of the categories **and** from one of the suppliers; an empty list matches any. Amount 0, or both lists empty, means no fee. Suppliers are `SS`, `SANMAR`, `OTTOCAP`, `MANUAL`, `SAGE`, or `SAGE:<number>`. The migration sets today's rule: $35, Tumblers, SAGE:51093.
- `GET admin/settings/handling-fee-options` → `{ categories: [{ id, title, supplier }], suppliers: [{ value, label }] }` for the pickers.

### Payments: `GET payment/admin/all`
Now admin-only, as are `payment/count` and `payment/sum`. `order.shipping_amount` is what the customer paid; the label's cost is the new `order.actual_shipping_cost`. New: `order.handling_amount`, `order.tax_amount`.

<a id="2026-11-12-templates"></a>
## 2026-11-12: pricing templates (live)

Live since 12 November (`adeb71f`). Four admin-only endpoints for the Pricing Templates page and the Save and Load dialogs (`BACKEND_QUESTIONS.md` F29). The panel's code calls them as built, so it needs no change: once it's deployed, the page and dialogs work instead of saying templates aren't available yet.

| Endpoint | Body | Answer |
|---|---|---|
| `GET pricing-template` | | `200 { data: [template, ...] }`: every template that isn't deleted, newest `updated_at` first, then highest `id`. No paging. |
| `POST pricing-template` | `{ name, pricing_mode, bulk_pricing, quantity_pricing }` | `201 { data: template }` |
| `PUT pricing-template/:id` | the same | `200 { data: template }`. Replaces the name and rows, and moves `updated_at` even when nothing changed. `404` for an unknown or deleted id. |
| `DELETE pricing-template/:id` | | `200`. Soft delete. `404` for an unknown or deleted id. |

- **A template** is `{ id, name, pricing_mode, bulk_pricing, quantity_pricing, created_at, updated_at }`. `pricing_mode` is `"tiered"` with `bulk_pricing: [{ min_qty, max_qty, price }]` and `quantity_pricing: null`, or `"quantity_fixed"` with `quantity_pricing: [{ quantity, price }]` and `bulk_pricing: null`. The other mode's list is ignored on POST and PUT.
- **Checks**, answered with `400` and a `message` to show as it is:
  - `name`: trimmed, 1 to 100 characters.
  - `pricing_mode`: `"tiered"` or `"quantity_fixed"`. `"fixed"` is refused.
  - 1 to 50 rows.
  - Tiered: `min_qty` a whole number above 0, `price` above 0, `max_qty` null on the last row only and otherwise a whole number above `min_qty`. Each `min_qty` must be above the previous row's `max_qty`; gaps are fine.
  - Fixed quantities: each `quantity` a whole number above 0 and listed once, `price` above 0. Saved smallest quantity first.
  - Numbers sent as strings are saved as numbers, and any other field in a row is dropped.
- **`409`** when another template that isn't deleted has the name, compared without case or accents: `A template called "Bulk tiers" already exists. Use another name.` Renaming a template to its own name in other capitals is fine, and a deleted template's name can be used again.
- **`401`** without a valid admin token, as on the other admin routes.
- Templates aren't linked to products: loading one copies its rows, so editing or deleting a template changes no product.

---

<a id="2026-11-12-categories"></a>
## 2026-11-12: the website's category list leaves out empty categories (live)

Live since 12 November (`64c340f`). `GET product-category/get-grand-categories` now gives the website only the grand and parent categories that have products to show. The panel needs no change: it sends its admin token on every request, and a valid admin token gets the full list exactly as before, empty categories included.

- If the panel calls it without a valid token, as when a session has just expired, it gets the website's shorter list rather than an error. Its other calls answer `401` then, which signs the admin out.
- The rule, and what it hides today, are in [frontend-changes.md](frontend-changes.md#2026-11-12).

---

<a id="2026-11-12"></a>
## 2026-11-12: "No Parent Category only" across the catalog (live)

Live since 12 November (`20ebba1`). `GET product/admin/get/all` takes `no_parent_category=true` (`BACKEND_QUESTIONS.md` F28). The panel's `fe828f9` already sends it, so it needs no change: the filter now covers the whole catalog instead of the page that's loaded.

- **Which products:** those with no category, or none of whose categories is linked to a parent category. It's the rule that fills `categories[].parent_categories` in this response, with deleted links, categories and parent categories skipped, so a returned row never shows a parent. A link or parent category that's only inactive still counts, as it does in `parent_categories`.
- **Count and pages:** `total` and `totalPages` count only matching products.
- **With other filters:** it combines with `search`, `source`, `sync_locked`, `min_price`/`max_price` and `use_case_id`/`tier`. With `parent_category_id` or `grand_category_id` nothing can match, so the answer is an empty page: `{ data: [], total: 0, page, totalPages: 0 }`.
- **Any other value**, `false` and `TRUE` included, means no filter. Answers without the parameter don't change.

---

<a id="2026-11-06"></a>
## 2026-11-06: `FIXED_QUANTITY` customization pricing (live)

Live since 6 November (`a8cb702`). The backend now supports the panel's **Fixed quantity** choice (`BACKEND_QUESTIONS.md` F26), with its `fixed_price` charged once per cart line. The panel's `22d03d2` is live too, and the type was tested from it on 6 November. `FIXED` (**One price**) is still charged per item.

- **`POST customization-option/:optionId/value`** takes `pricing_type: "FIXED_QUANTITY"` and requires a `fixed_price` of 0 or more, as for `FIXED`. A value of this type has no pricing rows. The `400` for an unknown type now lists all four.
- **`PUT customization-option/customization-option-value/:id`** takes the type and saves `fixed_price`. Switching a `TIERED` or `QUANTITY_BASED` value to it switches off the old pricing rows.
  - `400` when the amount is missing, null or empty and there's no saved amount to keep, as when switching a `TIERED` value. This goes for `FIXED` too, which used to save 0 there, so the cart charged nothing. An amount of 0 sent on purpose still saves.
  - A refused change now leaves the value and its pricing rows as they were, for every type. Before, a refused amount switched the rows off anyway.
- **`POST customization-option/value/:valueId/pricing`** and **`PUT customization-option/value/pricing/:pricingId`** answer `400` for this type, as for `FIXED`.
- **Reads need no change:** `GET customization-option`, `GET customization-option/:id` and `GET customization-option/product/:productId/customizations` return the type with `fixed_price` and an empty `pricing`.
- **Order lines** in `GET order/admin` have `pricing_type: "FIXED_QUANTITY"`, `unit_price: null`, `quantity` and `total`, with no `pricing_tier`. `OrdersPage.tsx` already reads `total` for this type.
- **Once per cart line** answers F26's question. The cart makes one line per variant, so three colours at $100.00 add $300.00.
- **Before adding it to a real product:** wait for the shop's release ([frontend-changes.md](frontend-changes.md#2026-11-06)). Until then the shop shows the value as "N/A for N pcs" and won't add it to the cart. The product named `test` (id 105857) already has a value of this type for the shop to test with.

---

<a id="2026-11-04-shipping"></a>
## 2026-11-04: ShipStation after payment (live)

Live since 4 November (`4b5729f`). Once an order is paid, the backend creates it in ShipStation and buys its label by itself. The order's Shipping tab already shows the status, the tracking number and the label link, so paid orders show up with no change to the panel. What's new is for when a label fails:

- **`shipment_error`** on orders in `GET order/admin`: ShipStation's reason when `shipment_status` is `FAILED`, for example a carrier account with too little balance. Show it on the Shipping tab.
- **`POST order/admin/:id/label`** tries again, for a paid order with no label. Show a "Try again" button when `shipment_status` is `FAILED`.
  - Answers `{ id, order_number, shipment_status, carrier, tracking_number, tracking_url, label_url, actual_shipping_cost, shipping_profit }`.
  - `502` with ShipStation's reason when it fails again, `409` when a label is being bought right now, `400` when the order is unpaid, cancelled or already has a label, `404` for an unknown order.
- **`shipping_amount`** in `GET order/admin` is now always what the customer paid. It used to switch to the label's cost, so subtotal, tax and shipping didn't add up to the total. The label's cost is the new `actual_shipping_cost`, and `shipping_profit` is the difference, which can be negative. Show them on the Shipping tab if the team wants them.
- **`service_code`** is new on the same orders.
- **Settings page:** nothing to build. The ShipStation key's description now says which key to use. After a new key is saved, someone has to run the [setup](deployment.md#shipstation) on the server.

---

<a id="2026-11-04"></a>
## 2026-11-04: customers' real graphics on orders (live)

Live since 4 November (`4b5729f`). Customers can now upload their real graphic in any format, and the $35 is charged per new graphic on clothing instead of per cart line. The rule is in [frontend-changes.md](frontend-changes.md#2026-11-04).

- **Original files:** items in `GET order/admin` gain `graphics: [{ id, original_name, file_url }]`, the files production needs. Add a download link for each to the order screen (`OrdersPage.tsx`). `file_url` always downloads, in the format the customer uploaded, so don't put it in the image gallery: AI, EPS, PSD and CDR won't display. Items that were ordered before this release have an empty list.
- **`customized_image`** stays the preview. A line can have `graphics` and no preview, so treat either as artwork in `missingArtworkCaution`.
- **`setup_fee`** on an item is now the graphic fee. It sits on the first line with that graphic: 0, 35, or 70 for two new graphics, and 0 on the graphic's other lines.
- **Pre-made products:** `customization_config.customization[].logo_image` can now be any format, under `/graphics/` instead of `/images/`.
- **`GET payment/admin/all`** doesn't list `graphics`: it has no sign-in until the payments release (C1). Use `GET order/admin` for the files.

---

<a id="2026-10-26"></a>
## 2026-10-26: client decisions, first backend changes (live)

Commits `8f53487` to `27de06f`.

- **Markups** (Q11): once `migrations/2026-10-26_supplier_markups.sql` has run, `GET product/pricing/markup` lists SAGE at 49.25% and SANMAR, SS and OTTOCAP at 66.67%. Any of the four rows that didn't exist is created, so each one can be edited from the Pricing page.
- **Supplier syncs** (Q51): all four run on the 1st of each month at 2 AM New York time, one after another, instead of the 5th, 10th, 15th and 25th. The SAGE stock change from [2026-10-16](#2026-10-16) lands on the first 1st after this release.
- **Password rule** (Q42): the reset and set-password page and `POST admin/auth/change-password` now check: 8 to 128 characters, with an uppercase letter, a number and a special character (anything that isn't a letter or a digit, so a space counts). It replaces "8 to 100 characters, 2 digits, no spaces, not `Passw0rd` or `Password123`", which the panel's form mirrors today. A password that fails gets `400` with *"Password must be 8 to 128 characters long and include an uppercase letter, a number and a special character."* Existing passwords keep working.
- **Super Admins** (Q44): `POST admin/auth/register` and `PUT admin/auth/updateAdmin/:id` accept the Super Admin role (until now they answered `403`), and `POST admin/auth/deleteAdmin` can delete another Super Admin. Still refused with `400`: changing your own role and deleting yourself, so the Super Admin doing it always remains. These routes stay Super Admin only.
- **Set a password** (Q45). Both take `{ password, confirm_password }` and the password rule above:
  - `PUT admin/user/setPassword/:id`, any admin: a customer's password. The customer is signed out everywhere, and any emailed reset or set-password link stops working. A customer who hasn't verified their email yet still has to.
  - `PUT admin/auth/setAdminPassword/:id`, Super Admin only: another admin's password. Their sessions end (`401`, then they sign in with the new password). For your own password use `change-password`; this one answers `400`.
  - `200` on success, `400` for the rule or a mismatch, `404` for an unknown or deleted account. The password isn't returned or emailed, so show the admin what they typed (or generated) before sending, for them to share.
- **Closed customer accounts** (Q46): a customer who closes their account can restore it by signing in within 30 days; after that it's deleted, but its orders and payments stay. `GET order/admin` and the payments list now show the email and name on those orders and payments (until now they came back without a customer). Closed accounts stay out of the customer list, as before.
- **Settings page:** `GET admin/settings`, `POST admin/settings/unlock`, `PUT admin/settings` and `POST admin/settings/test-email` manage what used to be in the server's `.env`. Secrets show only their first and last 5 characters until the settings key is entered, and saving takes the key again. The full contract and the page's behaviour: [admin-settings.md](admin-settings.md).
- **Weights** (Q31): `PUT product/admin/weight` sets the shipping weight in pounds, for a whole product or for chosen variants:
  - Body: `{ "product_id": 12, "weight_lb": 0.75 }` or `{ "variant_ids": [3, 4], "weight_lb": 0.75 }`; `"weight_lb": null` clears it, back to the supplier's weight or the default of 1 lb.
  - Answers `{ "variants": 6, "weight_lb": 0.75 }`; `400` for a weight outside 0 to 150 lb or for both or neither target, `404` when no variant matches.
  - Variants carry `admin_weight_lb` (the admin's) beside `unit_weight` (the supplier's); shipping uses the admin's first. Supplier syncs never change `admin_weight_lb`, and unlike `POST product/update` this doesn't stop supplier updates for the product.
- **Gallery** (Q56): the team manages the shop's gallery photos.
  - `GET gallery/admin` lists every photo: `{ id, image_url, caption, sort_order, is_active, created_at, updated_at }`, ordered by `sort_order`, newest first within the same order.
  - `POST gallery` (multipart) adds one: an image in the field `images` (JPG, PNG, WebP, AVIF or GIF, up to 20 MB), plus optional `caption` (up to 255 characters), `sort_order` (a whole number, lowest first) and `is_active`. `201` with the photo.
  - `PUT gallery/:id` changes any of those; a new `images` file replaces the photo.
  - `DELETE gallery/:id` removes it.
  - `400` for a file that isn't an image, more than one image, or a caption over 255 characters; `404` for an unknown id. The shop shows only active photos, through `GET gallery`.
- **Products out of stock** (Q49): the shop's product lists now leave out products with nothing in stock. The panel's lists are unchanged, including the use-case product list (`industry/use-case/:id/products`), which still shows every product.
- **Every order** (`BACKEND_QUESTIONS.md` E3): `GET order/admin?payment_status=ALL` lists orders of every payment status. Without the parameter it still lists paid orders only.

---

<a id="2026-10-16"></a>
## 2026-10-16: status markers, SAGE stock, supplier pricing

### Variant and product status

Supplier syncs now record what happened to a variant, and the admin endpoints return it.

| Field | Meaning |
|---|---|
| `status` | `active` (on sale), `inactive` (switched off), `discontinued` (the supplier marks it discontinued), `removed` (deleted, by an admin or because the supplier stopped listing it) |
| `is_discontinued`, `discontinued_at` | the supplier's discontinued flag and when it was set |
| `restored_at` | when a sync brought the variant back after it had been removed |
| product `restored_at` | when a sync brought the product back after it had been removed |

**Where they appear:**
- **`status`:** on every row of `GET product/get/variant`, in `GET product/admin/variant/:id`, and on the variants in `GET product/admin/:id`.
- **The other three fields:** wherever variant rows are returned.
- **Removed variants:** `GET product/admin/variant/:id` now returns them too, with `status: "removed"`.

**How the syncs behave:**
- **SAGE and SanMar:** variants the supplier marks discontinued stay on sale, but carry `status: "discontinued"`.
- **Removed variants listed again:** a removed variant that SAGE, SanMar, S&S or OttoCap lists again comes back, with `restored_at` set.
- **Colours SAGE stops listing:** the variant is marked discontinued and removed. It returns if SAGE lists the colour again.

The backfill marks 2,121 SanMar and 75 SAGE variants as discontinued straight away.

**New filter on `GET product/get/variant`:** `?status=` takes one of:

| `status` | Lists |
|---|---|
| (not sent) | as before: variants on sale, of products that aren't discontinued |
| `active` | on sale and not discontinued |
| `inactive` | switched off |
| `discontinued` | marked discontinued by the supplier, on sale or not |
| `restored` | brought back by a sync at some point |
| `removed` | deleted variants |

Any other value gets a 400.

### SAGE stock

| `stock` | `track_inventory` | Show |
|---|---|---|
| a number (0 or more) | `true` | the number; 0 is out of stock |
| `null` | `false` | "Not reported by supplier"; orders aren't limited |

Until the next SAGE sync (the 5th of the month) or a re-import, existing SAGE variants still show the old `999999`.

### Supplier pricing

Admin responses are unchanged: supplier cost, markup and supplier tiers are still there. Shopper responses no longer carry any of them; see [frontend-changes.md](frontend-changes.md).

The panel's calls to shared (non-admin) endpoints, such as add-ons, customization options, categories and industries, carry no cost fields, so nothing changes for them. If a page ever reads cost from a shopper endpoint (`product/guest/:id`, `product/variant/:id`), use the admin endpoint instead.

### What the panel should do

- **Badges:** show `status` on variant lists and details, with a "Restored on …" note when `restored_at` is set.
- **Filter:** add a status filter to the Variants page using `?status=`.
- **Product badge:** show product `restored_at` on product details.
- **Stock:** show SAGE stock as in the table above.

---

<a id="2026-10-15"></a>
## 2026-10-15: bug sweep

Details are in the answers in `BACKEND_QUESTIONS.md` (A1 to B11).

**Fixed:**
- **Variants page:** `GET product/get/variant` works again.
- **Orders page:** `GET order/admin` pages count orders, so each order comes with all its items.
- **Sourcing requests:** `GET sourcing-requests/admin?search=` works and also matches the request text.

**New:**
- **Single variant:** `GET product/admin/variant/:id` returns one variant in the same shape as a list row.
- **Add-ons:** `remove_image="true"` on update clears the image. Admin add-on responses always send `features` as an array.
- **Contact Us:** `GET contactUs?page=&limit=&search=&status=` returns `{ data[], pagination }`. Without `page`, it still returns the plain array.

**Behavior changes:**
- **Errors:** deliberate errors are 400 or 404 with their message; a real 500 in production reads "Something went wrong on our side. Please try again (reference …)".
- **Markup:** `PUT product/pricing/:id` accepts 0 to 1000 and answers 400 for anything else, including negative values. A 0% markup now really is 0%.
- **Field allow-lists:** brand, industry, use-case and size create/update only accept their own fields.

  | Record | Accepted fields |
  |---|---|
  | Brands | `name`, `slug`, `description`, `show_on_website`, `is_active` |
  | Industries | `title`, `slug`, `description`, `sort_order`, `is_active` |
  | Use cases | the industry fields plus `industry_id` |
  | Sizes | `product_id`, `name`, `type`, `display_style`, `measurements`, `is_active` |

  Images still come from the upload.
- **Sizes:** `PUT size/:id` updates the size in the URL, not `body.id`.
- **Grand categories:** `GET product/grand-category-products` accepts `brand_id` as an extra filter.
- **Carrier sync:** `POST carrier/sync` and `POST carrier/sync/services` work, and services are updated in place instead of duplicated.

---

<a id="2026-10-14"></a>
## 2026-10-14: security release

Admin tokens on every admin endpoint, Super Admin rules, emailed set-password and reset links, 401/403 handling and rate limits. Full details: [admin-panel-security-changes.md](admin-panel-security-changes.md).
