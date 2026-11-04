# Backend changes for the customer website (hashtag-next)

What each backend release changes for the shop, and what the shop has to do. Newest first. Paths are relative to `/api/v1`.

The client's answers of 26 and 27 October, and what they mean for the shop, are in [Client decisions](#client-decisions) below the releases list.

| Release | Backend commit | Shop action |
|---|---|---|
| [2026-11-04: ShipStation after payment](#2026-11-04-shipping) | `4b5729f`, live | **Required**: stop calling `create-shipment-label`, show the order's totals, handle rate errors |
| [2026-11-04: graphics and the $35 fee](#2026-11-04) | `4b5729f`, live | **Required now**: until it's out, customized clothing pays no $35. Send the real graphic, show the API's fee, add Saved graphics |
| [2026-10-26: client decisions, first backend changes](#2026-10-26) | `8f53487` to `27de06f`, live | Read the notes; A31, A36, A37, A44, A45, B4, "$X+" cards, Delete account and Turnstile in the to-do list |
| [2026-10-16: supplier pricing removed, status markers, SAGE stock](#2026-10-16) | `aba0065` | **Required**: switch SAGE pricing to `price_tiers` |
| [2026-10-15: bug sweep](#2026-10-15) | `44141b0` | None required; read the notes |
| [2026-10-14: security release](#2026-10-14) | `335d27b` | Done (hashtag-next `7b3f110`) |

---

<a id="client-decisions"></a>
## Client decisions (26–27 Oct 2026): the shop's to-do list

The client answered the questions in `client-questions.md` on 26 October and the follow-ups on 27 October; Q numbers are that document's. The shop items are from its own list (`hashtag-next/docs/client-confirmation-questions.md`, A1–A46 and B1–B9) and its audit (`hashtag-next-audit.pdf`).

### Can start now

| Shop item | Q | Decision | What the shop does |
|---|---|---|---|
| A11 | 11, 18 | SAGE's markup is 49.25%, applied by the backend; shoppers mustn't see cost | Switch SAGE pricing to `price_tiers` ([2026-10-16](#2026-10-16)) and drop `SAGE_PRICE_MARKUP`. |
| A12 | 12 | No SAGE product has a setup charge | Remove the "Setup fee" line in `Sagequantitypricing.tsx`; the backend never sends one. |
| A5, A6 | 5, 6 | Hoodie Full Front and Full Back embroidery, and Full Front on T-shirts and polos, are "contact us", as before | Hoodies: show "Contact us" for Full Front and Full Back embroidery instead of adding them at $0, as for the oversized back. T-shirts and polos: keep Full Front off. The backend will refuse the hoodie ones once choices outside the price list are refused (Q10). |
| A22 | 24 | Size and colour must always be chosen; no "required" flag in the admin | On pre-made products, make the customer choose size and colour before adding to the cart: no "(optional)" on them and no preselected first variant. The API already needs a variant on every line, so it needs no change. |
| A23 | 25 | The customer chooses the add-on quantity | Let the customer set it; today it copies the product quantity. The API already takes any quantity. |
| A44 | 49 | Never show shoppers a stock number | Remove "Only N left in stock" (`ProductDetail.tsx`) and "(stock: N)" in the size list (`Productcustomizationpage.tsx`). The quantity can still stop at the stock without showing the number. |
| A34 | 38 | Customers see a confirmation page after ordering | After payment, show the confirmation page with the real order (number, items, totals) instead of going to the products page after 3 seconds. Drop the hard-coded `HB00000001` and the UPI and Cash on Delivery methods (audit C5), and the `page1` text on the PayPal success page (audit C4). |
| A39 | 58 | patrick@hashtagbillionaire.com everywhere | Use it in the footer (today the misspelled `patrick@hashtagbillioniare.net`), on the Support page, and in Terms, Privacy and Shipping & Returns. |
| A7, A9, A13, A14, A16, A20, A28, A30, A32, A38, A40, A41, A43 | 7, 9, 13, 14, 15, 17, 22, 33, 35, 40, 53, 55, 61 | Kept as they are, including the policy text (no 2-hour window added for now) and the generic grey mockups | No change. |

### Backend side is live

These go with the backend changes listed under [2026-10-26](#2026-10-26).

| Shop item | Q | Decision | What the shop does |
|---|---|---|---|
| A31 | 36 | Quantities of customized items can change in the cart, the customization can't; "−" stops at the minimum | Disable "−" when `can_decrease` is false and keep typed quantities at `min_quantity` or more; the API now refuses lower ones instead of removing the line. Removing stays on the Remove button. |
| — | 47 | Guests and signed-in customers see the same prices; SAGE cards show the lowest price with "+" | Show a card's `price` as "$X+" when `price_from` is true. The use-case grid now gets prices too. |
| A45 | 56 | The team manages the gallery in the admin | Load the gallery from `GET gallery` instead of the photos built into the site, once the team has added them in the admin. |
| A36 | 32 | US mainland only: the 48 contiguous states and Washington DC | Nothing required: the state list only has those 49. Show the API's message when an address is refused, and use `shippable` to keep older saved addresses outside them out of checkout. |
| A44 | 49 | Out-of-stock products aren't shown; a cart item that runs out shows as out of stock | Show the cart line's `stock_message` when `stock_status` isn't `AVAILABLE`; checkout refuses those lines. Drop the "In stock only" filter, which no longer changes anything. |
| — | 46 | A closed account is kept 30 days and restored by signing in | A "Delete account" option in profile settings that calls `DELETE user/deactivate` and says the account can be restored by signing in within 30 days. |
| — | 60 | Cloudflare Turnstile on the contact and sourcing forms | Add the Turnstile widget to both forms with the site key from the client's Cloudflare account, and send its token as `cf-turnstile-response` (the widget's own form field) or `turnstile_token`. On a `400`, reset the widget before letting the customer resubmit: a token works once. |
| A37 | 43 | Phone optional at sign-up; US numbers only | Make the sign-up phone optional; keep the 10-digit check when one is entered. |
| B4 | 42 | The shop's rule everywhere: 8+ characters with an uppercase letter, a number and a special character | Make sign-up enforce all four (today "Ab1!" passes, audit B8), and stop trimming the password on sign-up only (audit B8). |

### After later backend work

| Shop item | Q | Decision | What the shop will do |
|---|---|---|---|
| A1–A4, A15, B1 | 1–4, 10, 16 | Tiers and minimums per product, artwork and print method (the same artwork and method at two locations count together); price tables editable in the admin, choices outside them refused; the promo fallback minimum set in the admin | The $35 fee is in [2026-11-04](#2026-11-04). Stop pricing decorations in the browser: read the tables, the minimums and a quote from the API, remove both copies of the tables (`pricing.ts`, `Productcustomizationpage.tsx`) and the fallback of 100, and stop sending price fields to the cart. Offer only what the tables list. |
| A10, A17, A18 | 19, 20 | Each location can have its own artwork, size and thread colours; production wants the original files | Original files and a graphic per location: [2026-11-04](#2026-11-04). Later: placement and size per location; keep left and right sleeve apart. |
| A19, B7 | 21 | Changed on 4 Nov: any graphic format and dimensions, up to 100 MB per file | Remove the shop's file checks: [2026-11-04](#2026-11-04). |
| A21 | 23 | The team manages the fonts in the admin | Load the font list from the API. |
| A25, B2 | 27, 28 | Changed on 4 Nov: the label is bought automatically after payment; the customer pays the quoted rate | Remove the label purchase at "Continue to payment" (`CheckoutLayout.tsx`): [2026-11-04](#2026-11-04-shipping). |
| A27 | 29 | A flat 8.25% on products, not on shipping | Show only the API's tax; checkout estimates 8.25% itself today. |
| A29 | 34 | Cancel within 2 hours | A Cancel button on orders under 2 hours old, once the API's cancel works. |
| A33, B3 | 37 | Card, Google Pay, Cash App, PayPal and Apple Pay | Add Apple Pay; build the Google Pay and Cash App request with the order's real total (`amount: "1.00"` today, audit B1). |
| A35 | 39 | Tracking for signed-in customers; the admin picks ShipStation or manual updates | Show the order's status and tracking from the API, whichever way it's updated. |

**Waiting on the client:** A8, DTG with several locations (Q8, reworded); which font settings besides the font list (Q23). **Later, by the client's choice:** A24 pre-made products from suppliers (Q26), A42 price filter (Q54), A46 Back button (Q57), policy pages editable in the admin (Q61).

---

<a id="2026-11-04-shipping"></a>
## 2026-11-04: ShipStation after payment (live)

Live since 4 November (`4b5729f`). Nothing reaches ShipStation until the customer has paid: the backend then creates the order there and buys its label by itself. Today's checkout keeps working, but the shop still has to change.

### The flow

| Step | Call | What happens |
|---|---|---|
| Cart and its total | `GET product/cart/get` | No change |
| Shipping options | `POST order/shipping/rates` with `{ address_id }` | Live rates, and the address is checked here |
| Customer picks one, total is created | `POST order` with `{ address_id, selected_service_code }` | The backend prices the option itself and answers with the final figures |
| Payment | Square or PayPal, as today | No change |
| Label | None: the backend does it after payment | The order appears in ShipStation and the label is bought |
| Tracking | `GET order/:id` | Updates arrive by themselves |

### What changed in the API

- **`POST order/shipping/rates`** gains `carrier_id` on each option. Prices now include the carrier's surcharges, which the old quotes left out, so UPS costs noticeably more than before: UPS Ground for a 2.5 lb box to New York is $32.63, not $20.55. Only the box the team ships in is priced, not USPS's own flat rate packaging.
  - `400` when ShipStation can't verify the address. Today's empty list on any problem is gone.
  - `502` when ShipStation can't be reached, `503` when no carrier is set up.
- **`POST order`** takes `address_id` and `selected_service_code`. `shipping_amount` and `selected_carrier_code` are ignored: the backend asks ShipStation for the price again, because an amount from the browser could be anything. `409` when that option isn't offered any more. The same `400`, `502` and `503` as rates.
- **`POST address`** and **`PUT address`** no longer check the address with ShipStation, which isn't possible with the new key. A bad address now shows up at the rates step, and new addresses have `is_verified: false`.
- **`POST order/create-shipment-label`** buys nothing any more. It answers as before with the order's own figures, so today's shop doesn't break, and it goes away after the shop's release.
- **`shipment_status`** on an order, in `GET order` and `GET order/:id`: `PENDING`, then `LABEL_CREATED`, `IN_TRANSIT`, `EXCEPTION` and `DELIVERED`. `tracking_number` and `tracking_url` fill in a few seconds after payment.

### What the shop must do

1. **Remove the label purchase** at "Continue to payment" (`CheckoutLayout.tsx`): stop calling `POST order/create-shipment-label`.
2. **Show the totals from `POST order`:** `subtotal_amount`, `tax_amount`, `shipping_amount` and `total_amount`. They're what the customer pays, so don't work them out in the browser. Stop sending `shipping_amount`.
3. **Handle the rate errors:** on `400`, send the customer back to fix the address, showing the API's message. On `502` or `503`, show the message and offer to try again. On `409` from `POST order`, reload the rates and ask them to choose again.
4. **Don't expect the address to be rejected when it's saved.** Keep the form's own checks; the real check now comes with the rates.
5. **Don't wait for the label after payment.** Show the confirmation page straight away. Tracking can be empty at first, so reload it on the order page.
6. **Go by the status, not the tracking number.** Every paid order now gets a tracking number within seconds, before anything has left. Show "Shipped" only when `status` is `SHIPPED`. A `shipment_status` of `LABEL_CREATED` means the order is being prepared.
7. **Show `FAILED` as "Preparing your shipment".** It means the label needs the team's attention, not that anything is wrong for the customer. They've paid and the order stands.

---

<a id="2026-11-04"></a>
## 2026-11-04: graphics and the $35 fee (live)

Live since 4 November (`4b5729f`). **The shop's side is urgent.** Until the shop sends `graphic_id`, customized clothing pays no $35 and production gets no original file. Orders still go through.

### The rule

Decided on 4 November. It replaces the per-line $35 digitizing fee and the $20 for artwork that isn't vector, which was never charged.

- **$35 once per new graphic on clothing**, for every print type: embroidery, DTF, DTG and screen print.
- **Only when fewer than 12 pieces in the order carry that graphic.** All sizes, colours, products and print types count together.
- **A graphic is new until an order with it has been paid**, whether or not that order paid the fee. A first order of 20 pays nothing, and a reorder of 5 pays nothing either.
- Promo (SAGE) and pre-made products have no graphic fee, and neither does custom text with no graphic. The $35 handling charge on one supplier's tumblers (Q15) is a different charge and stays.

| Order | Fee |
|---|---|
| 5 embroidered tees, new graphic | $35 |
| 5 embroidered tees + 10 DTF hoodies, same new graphic | None: 15 pieces |
| 3 tees, one new graphic on the chest and another on the back | $70 |
| 3 tees, the same new graphic on the chest and the back | $35 |
| 5 tees, a graphic from an earlier paid order | None |

### What changed in the API

- **`POST graphics`** saves a graphic. Multipart, signed in, one file in the field `graphic`. Any format, any dimensions, up to 100 MB, stored exactly as uploaded. Uploading saves it: there's no separate save step.

  ```json
  {
    "id": 12,
    "file_url": "https://node.hashtagbillionaire.com/graphics/graphic-1793800000000-3fa9c1d27be4.ai",
    "original_name": "acme-logo.ai",
    "mime_type": "application/postscript",
    "file_size": 482113,
    "is_new": true,
    "created_at": "2026-11-04T10:12:00.000Z"
  }
  ```

  `201` on success, also when it's a file the customer already has: the answer is then their saved graphic, with the same `id`. `400` with no file or a file over 100 MB, `401` signed out. `is_new` is the rule's "new".
- **`GET graphics?page=1&limit=20`** lists the customer's saved graphics, newest first, the same fields as above: `{ data: [...], pagination: { total, page, limit, totalPages } }`. `limit` goes up to 100. Only their own. There's no delete yet.
- **`POST product/cart`** takes `graphic_id`, on the customization or per location. `400` if it isn't one of the customer's graphics.

  ```json
  {
    "customization": [
      {
        "print_method": "EMBROIDERY",
        "locations": [
          { "location": "LEFT_CHEST", "graphic_id": 12 },
          { "location": "FULL_BACK", "graphic_id": 13 }
        ],
        "sizes": [{ "variant_id": 501, "quantity": 5 }]
      }
    ]
  }
  ```

  With one graphic for the whole line, send `"graphic_id": 12` beside `print_method` instead. The first file in `images` stays the preview, as today: what the cart and order lists show as `logo_image` and `customized_image`. It can be any dimensions. It doesn't identify the graphic and production doesn't use it.
- **Cart lines** gain `graphics: [{ id, original_name, file_url }]`. The fee is on the first line that has the graphic: `pricing_snapshot.customization_price.setup_fee`, already included in that line's `total_price` and in `summary`. A line with two new graphics shows 70; the other lines with those graphics show 0.
- **Orders:** items in `GET order`, `GET order/:id` and `GET payment/history` gain the same `graphics`.
- **Pre-made products:** `customization_images` now takes any format, up to 100 MB, and saves it to the customer's graphics. In place of `image_index`, a customization item can send `graphic_id`.

**How a graphic is recognised**, per customer: the same file is always the same graphic, in any format. Pictures the server can read (PNG, JPG, WebP, GIF, TIFF, AVIF, SVG) are also compared by how they look, so a resized, re-saved or recoloured copy counts as the same design: it's saved as its own graphic, production gets that file, and it shares the fee status (`is_new`). On 50 test logos, 96–98% of ordinary copies were recognised, and 86–90% of very small or heavily compressed ones. Short logos a letter apart can be taken for each other (a round "HB" and "HD"). AI, EPS, PSD, CDR and PDF only match as the exact same file, so a customer reusing one should pick it from Saved graphics.

### What the shop must do

1. **Upload the customer's real file.** When they choose a file, send it to `POST graphics` as it is: no resizing, cropping or converting, and no 500 × 500 render in its place. Logos come in any dimensions, so keep their own proportions in the preview too.
2. **Remove the shop's file checks:** the file-type list, any dimension check, and the 5 MB and 10 MB limits. Any file up to 100 MB is accepted. Remove any vector or $20 wording.
3. **Send `graphic_id`** with the customization, or per location when the customer uses different graphics.
4. **Handle files a browser can't draw.** AI, EPS, PSD and CDR won't load in an `<img>` or a canvas, and the backend doesn't convert them. Show the file name and an icon instead of the mockup, and fall back the same way when an image fails to load. Opening `file_url` directly downloads the file.
5. **Add Saved graphics:** an account page listing `GET graphics`, and a "Choose from saved graphics" option in the customizer. Choosing one sends its `id` as `graphic_id`, with nothing uploaded again.
6. **Stop working out the fee in the browser:** remove the $35 from `pricing.ts` and `Productcustomizationpage.tsx`, and stop sending `digitizing_fee`. Show `setup_fee` from the cart, labelled as a one-time graphic setup fee.
7. **Warn before adding to the cart:** when `is_new` is true and fewer than 12 pieces carry the graphic, counting what's already in the cart, show that a one-time $35 applies. The cart's figure is the final one.
8. **Reload the whole cart after any change** (add, quantity, remove, move to wishlist). The fee can move to another line or disappear when a different line changes.
9. **Upload after sign-in.** `POST graphics` needs a signed-in customer, like `POST product/cart`. If guests can use the customizer, keep the file in the browser and upload it once they've signed in.

### Release order

1. **Backend:** live since 4 November.
2. **Shop:** the list above, as soon as it can.

Lines already in a cart when the backend went live have no graphic, so they lost their old $35 the next time the cart was read.

---

<a id="2026-10-26"></a>
## 2026-10-26: client decisions, first backend changes (live)

Commits `8f53487` to `27de06f`.

- **SAGE markup is 49.25%** (Q11), the rate the shop applies itself today. Once the backend's migration has run, SAGE prices in the cart and in `price_tiers` match what the product page shows.
- **Shipping quotes:** an item without a weight now counts as 1 lb instead of 0.5 lb (Q31), so some quotes go up, and a weight the team sets in the admin comes before the supplier's. Nothing changes in the request or the response.
- **Supplier updates** (Q51): prices and stock from all four suppliers now refresh on the 1st of each month, instead of the 5th, 10th, 15th and 25th. The SAGE stock change from [2026-10-16](#2026-10-16) lands on the first 1st after this release.
- **Password rule** (Q42): sign-up, the reset page and the signed-in password change now check the shop's own rule: 8 to 128 characters, with an uppercase letter, a number and a special character (anything that isn't a letter or a digit, so a space counts). It replaces "8+ characters, 2 digits, no spaces". A password that fails gets `400` with *"Password must be 8 to 128 characters long and include an uppercase letter, a number and a special character."* Existing passwords keep working; the rule applies when a password is set.
- **Unverified accounts** (Q40) are erased completely 2 hours after sign-up instead of hidden. For the shop nothing changes: the same email can register again, as before.
- **Shipping to the US mainland only** (Q32): orders ship to the 48 contiguous states and Washington DC.
  - `GET country/233` lists those 49 states only (66 today). The response shape is unchanged.
  - `POST address` and `PUT address` refuse a state outside them, and an address ShipStation matches to one (military APO/FPO addresses, for example), with `400` *"We only ship to the 48 contiguous US states and Washington DC."*
  - `GET address` adds `shippable` (true or false) to each saved address; an address saved before this release can be outside.
  - `POST order/shipping/rates` and `POST order` refuse an address that isn't `shippable` with `400` and the same message, plus *"Please choose another address."*
- **One price for everyone** (Q47): `product/guest/:id`, `product/:id` and `product/variant/:id` now price variants with the same code. Guests get the same fields as signed-in customers: `base_price` is a number (it was a string), `title` is decoded and `pricing_tiers_customer` is there too.
- **SAGE cards start at the lowest tier** (Q47): in `GET product`, `product/grand-category-products`, `product/product-by-brand` and `industry/use-case/products`, a SAGE product's `price` is its lowest tier price (the largest quantity's) and `price_from` is `true`; show it as "$2.59+". Other products have `price_from: false` and the price as before. `industry/use-case/products` had no prices before and now has them, the same fields as `GET product`.
- **Cart minimums** (Q36): `PUT product/cart/decrement` at a line's minimum, and `PUT product/cart` with a typed quantity below it (0 included), answer `400` *"The minimum for this item is N."* instead of removing the line. `DELETE product/cart/:id` removes a line. Cart lines carry `min_quantity`: the variant's minimum, SAGE's first price tier or 12 for screen print, whichever is highest; `can_decrease` uses it too.
- **Only products in stock** (Q49): the client doesn't want stock numbers shown, nor products that can't be bought.
  - `GET product`, `product/grand-category-products`, `product/product-by-brand` and `industry/use-case/products` leave out products with no variant in stock. Stock a supplier doesn't report (SAGE) counts as in stock. Prices and the size, colour and price filters use variants in stock only. `in_stock` is ignored, since it's now always on.
  - Cart lines: `stock_status` is `AVAILABLE`, `OUT_OF_STOCK` or `NOT_ENOUGH_STOCK` (fewer in stock than the line's quantity), with `stock_message` to show ("In stock", "Out of stock", "Not enough in stock for this quantity"). `FEW_LEFT` and "Only N left" are gone, and so is the `stock` number. `is_purchasable` is false unless the line is `AVAILABLE`.
  - Wishlist items: `stock_status` is `AVAILABLE` or `OUT_OF_STOCK`, without `stock`.
  - `PUT product/cart/increment` past the stock answers `400` *"There isn't enough in stock to add more."* (was "Only N left").
  - Product and variant pages still send `stock`, so the shop can stop a quantity at it; don't show the number.
- **Turnstile on the public forms** (Q60): `POST contactUs` and `POST sourcing-requests/create` take a Cloudflare Turnstile token as `cf-turnstile-response` or `turnstile_token`. The check starts only once the Turnstile secret key is set on the admin panel's Settings page, which happens after the shop's release, so the forms keep working meanwhile. Then a missing, used or refused token answers `400` *"We couldn't confirm this was sent by a person. Please try again."*, and a sourcing request's files are discarded.
- **Gallery** (Q56): `GET gallery` lists the photos the team manages in the admin, in their order: `[{ id, image_url, caption, sort_order }]`. Hidden photos aren't listed.
- **Emails look like the website** (Q59): every email shows the logo from the website's `/logo_header.png`, so keep that file at that path (or tell the backend if it moves).
- **Closing an account** (Q46): `DELETE user/deactivate` keeps working as before and now means:
  - The customer is signed out on every device.
  - Signing in with the same email and password within 30 days restores the account, with its orders, addresses, cart and wishlist. Sign-in answers as usual.
  - After 30 days the account is deleted: it can't sign in, and its photo, cart, wishlist and unused addresses are erased. Its orders and payments stay, with the name, email, phone and delivery address, for the client's accounting.
  - Registering again with the same email starts a new account; the closed one can then no longer be restored.
- **Sign-up phone** (Q43): `mobile` on `POST user/auth/register` is optional; leave it out or send it empty. When it's sent it must be a US number: 10 digits, with or without formatting or a leading +1, and it's stored as the 10 digits. Otherwise the answer is `400` *"Please enter a valid 10-digit US phone number, or leave it empty."* The missing-fields message no longer lists `mobile`.

---

<a id="2026-10-16"></a>
## 2026-10-16: supplier pricing removed, status markers, SAGE stock

### What changed

**1. Supplier cost no longer reaches the shop.** Every response that isn't for a signed-in admin is cleaned. These fields are removed wherever they appear: product and variant objects, `meta`, cart lines, order and payment snapshots.

| Removed field | What it held |
|---|---|
| `original_price`, `case_price`, `base_price`, `used_case_price` | the supplier's price (`base_price` on supplier cart lines too) |
| `markup_percent`, `markup_amount`, `supplier_markup` | the markup |
| `retail_price`, `sale_price`, `map_price`, `msrp`, `suggested_price`, `dozen_price`, `cost_price` | supplier reference prices |
| `actual_price`, `actual_product_price`, `supplier_price`, `list_price`, `net_price` | cost inside pricing snapshots and order breakdowns |
| `pricing_tiers`, `pricing_tiers_customer` | the old tier tables, replaced by `price_tiers` |
| in `meta`: `netTiers`, `priceTiers`, `minPrice`, `maxPrice`, `price_1`…`price_1296`, `raw_variant`, `raw_product`, `supplier_raw` | supplier tiers and raw supplier records |

`meta` is still sent, in the same format (text or object), minus those keys. The keys the shop uses stay: manual-product options and pricing, and SAGE's `qtyTiers`, `productionTime`, `themes` and `dimensions`.

**2. New: `price_tiers` on variants.** It's the selling price per quantity break, exactly what the cart charges. It's sent on `GET product/:id`, `GET product/guest/:id`, `GET product/variant/:id` and `POST product/get-variant`:

```json
"price_tiers": [
  { "min_qty": 1,   "max_qty": 11,   "unit_price": 64.16 },
  { "min_qty": 12,  "max_qty": 47,   "unit_price": 61.18 },
  { "min_qty": 480, "max_qty": null, "unit_price": 52.22 }
]
```

- SAGE variants have tiers; every other supplier gets `[]`.
- `max_qty: null` marks the last tier.
- Prices include the markup. Don't apply one in the shop.

**3. `price` is always the selling price.** That was already true everywhere except `POST product/get-variant`, which used to send the supplier's price.

**4. SAGE stock.** SAGE either reports stock or says nothing:
- **Reported** (including 0): `stock` is that number and `track_inventory` is `true`.
- **Not reported:** `stock` is `null` and `track_inventory` is `false`. Ordering isn't limited; show it as available, without a count.

Until now both cases came through as `stock: 999999`. They'll change at the next SAGE sync (the 5th of each month) or when a product is re-imported. The catalog's `in_stock=true` filter now counts untracked stock as in stock.

**5. Status markers on variants.** New fields, which the shop may use:
- `is_discontinued` (boolean) and `discontinued_at`: the supplier marks the variant discontinued. SAGE and SanMar keep such variants on sale, so you may want to show a badge.
- `restored_at`: a supplier sync brought back a variant that had been removed. This is mainly for the admin panel.

Products also have `restored_at`.

### What the shop must do

Today the shop prices SAGE products itself, from `meta.netTiers` and a hard-coded 49.25% markup. After this release those tiers are gone.

| File | Change |
|---|---|
| `components/product/customization/Sagequantitypricing.tsx` | Build the table from the variant's `price_tiers` instead of `parseSageMeta(meta)`. Drop `SAGE_PRICE_MARKUP`, `applySageMarkup`, `getSageUnitPrice` and `getSageUnitPriceWithMarkup`; the unit price for a quantity is the tier where `min_qty <= qty` (and `qty <= max_qty`, or `max_qty` is null). |
| `components/product/customization/Productcustomizationpage.tsx` | In `getPromoMinQty`, the SAGE minimum is `price_tiers[0].min_qty`; the manual-product branch is unchanged. Remove `case_price` and `original_price` from the variant type. |
| `components/product/Addproductconfigurationmodal/Addproductconfigurationmodal.tsx` | Same as above: price SAGE rows from `price_tiers`, take the minimum from `price_tiers[0]`, drop `original_price`. |
| `app/product/ProductDetail.tsx` | Replace `pricing_tiers_customer?.[0]?.net` with `price_tiers?.[0]?.unit_price`. Pass `price_tiers` (not `meta`) to the SAGE pricing component. |
| `components/cart/CartItem.tsx`, `CartItemsList.tsx`, `contexts/CartContext.tsx` | Stop using `base_price`. Use `price` (unit) and `total_price`. |
| `components/orders/OrderCard.tsx`, `components/PaymentHistoryCard/PaymentHistoryCard.tsx` | Remove `actual_product_price` and `supplier_markup` from the breakdown types; show `final_product_price`, `customization_price`, `final_price_per_item` and the totals. |
| Stock display | `track_inventory: false` means "available": no count, no "only N left". |

### Release order

1. **Backend first.** Deploy it with `EXPOSE_SUPPLIER_COST=true` in its `.env`. Responses then carry both the old fields and the new `price_tiers`, so today's shop keeps working.
2. **Shop.** Deploy the changes above.
3. **Backend again.** Remove `EXPOSE_SUPPLIER_COST` (or set it to `false`) and restart. The old fields disappear.

---

<a id="2026-10-15"></a>
## 2026-10-15: bug sweep

Nothing has to change in the shop, but these behave differently:

- **Error status codes.**
  - Errors that used to arrive as 500 with a useful message are now 400 or 404 with the same message, for example "Stock exceeded", "Cart is empty", "Minimum quantity for this product is 100", "Variant not found".
  - A real 500 in production now reads "Something went wrong on our side. Please try again (reference 1a2b3c4d)."
  - Show `message` as before.
- **CORS.** Only origins in the backend's `ACCESSDOMAINS` get API responses; others get 403. Images under `/images` and `/uploads` are served to any origin.
- **SAGE prices in the cart.** The $35 handling charge and the drinkware second-location fee now apply when an item is first added, not only after its quantity changes.
- **Register uploads.** The rate limit (5 per hour per IP) now runs before an uploaded profile image is saved, so a 429 can arrive without the file being stored.
- **Small fixes.**
  - `GET country/:id` returns the requested country (the shop asks for 233 and gets the same as before).
  - `GET product/grand-category-products` accepts `brand_id` as an extra filter.
  - A cart line with a damaged stored value no longer breaks the whole cart.
  - Deleted products still show in order history.

---

<a id="2026-10-14"></a>
## 2026-10-14: security release

Email links instead of codes for verification and password reset, 401 handling, rate limits and CORS. Full details: [frontend-security-changes.md](frontend-security-changes.md). The shop adopted it in hashtag-next `7b3f110`.
