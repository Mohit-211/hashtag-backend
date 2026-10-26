# Backend changes for the customer website (hashtag-next)

What each backend release changes for the shop, and what the shop has to do. Newest first. Paths are relative to `/api/v1`.

The client's answers of 26 October, and what they mean for the shop, are in [Client decisions](#client-decisions) below the releases list.

| Release | Backend commit | Shop action |
|---|---|---|
| [2026-10-26: client decisions, first backend changes](#2026-10-26) | branch `feature/client-decisions`, not released | Read the notes; A37 and B4 in the to-do list |
| [2026-10-16: supplier pricing removed, status markers, SAGE stock](#2026-10-16) | `aba0065` | **Required**: switch SAGE pricing to `price_tiers` |
| [2026-10-15: bug sweep](#2026-10-15) | `44141b0` | None required; read the notes |
| [2026-10-14: security release](#2026-10-14) | `335d27b` | Done (hashtag-next `7b3f110`) |

---

<a id="client-decisions"></a>
## Client decisions (26 Oct 2026): the shop's to-do list

The client answered the questions in `client-questions.md` on 26 October; Q numbers are that document's. The shop items are from its own list (`hashtag-next/docs/client-confirmation-questions.md`, A1–A46 and B1–B9) and its audit (`hashtag-next-audit.pdf`).

### Can start now

| Shop item | Q | Decision | What the shop does |
|---|---|---|---|
| A11 | 11, 18 | SAGE's markup is 49.25%, applied by the backend; shoppers mustn't see cost | Switch SAGE pricing to `price_tiers` ([2026-10-16](#2026-10-16)) and drop `SAGE_PRICE_MARKUP`. |
| A12 | 12 | The backend never sends a SAGE setup charge | The "Setup fee" line in `Sagequantitypricing.tsx` never shows. Remove it, unless the client decides to charge SAGE setup fees. |
| A29, A40 | 34, 61 | Customers can cancel within 2 hours of ordering; refunds are made by hand within 5–7 business days | Add the 2-hour cancellation window to the Shipping & Returns and Terms pages. The 5–7 days are already there. |
| A31 | 36 | Quantities of customized items can change in the cart, the customization can't; "−" stops at the minimum | Disable "−" at the line's minimum instead of removing the item. |
| A34 | 38 | Customers see a confirmation page after ordering | After payment, show the confirmation page with the real order (number, items, totals) instead of going to the products page after 3 seconds. Drop the hard-coded `HB00000001` and the UPI and Cash on Delivery methods (audit C5), and the `page1` text on the PayPal success page (audit C4). |
| A39 | 58 | patrick@hashtagbillionaire.com everywhere | Use it in the footer (today the misspelled `patrick@hashtagbillioniare.net`), on the Support page, and in Terms, Privacy and Shipping & Returns. |
| A13, A28, A30, A38, A41, A43 | 13, 33, 35, 40, 53, 55 | Promo imprint included; account required; unpaid-order flow kept; verification by link; industry picker and Primary / Secondary / Budget kept | No change. |

### With the next backend release

These need the backend changes on branch `feature/client-decisions`, listed under [2026-10-26](#2026-10-26) once it is released.

| Shop item | Q | Decision | What the shop does |
|---|---|---|---|
| A37 | 43 | Phone optional at sign-up; US numbers only | Make the sign-up phone optional; keep the 10-digit check when one is entered. |
| B4 | 42 | The shop's rule everywhere: 8+ characters with an uppercase letter, a number and a special character | Make sign-up enforce all four (today "Ab1!" passes, audit B8), and stop trimming the password on sign-up only (audit B8). |

### After later backend work

| Shop item | Q | Decision | What the shop will do |
|---|---|---|---|
| A1–A5, B1 | 1–5 | Fees, tiers and minimums per artwork; no setup fees, but $20 for artwork that isn't vector; price tables editable in the admin; hoodie Full Front and Full Back embroidery allowed | Stop pricing decorations in the browser: read the tables and a quote from the API, remove both copies of the tables (`pricing.ts`, `Productcustomizationpage.tsx`), and stop sending price fields to the cart. |
| A10, A17, A18 | 19, 20 | Each location can have its own artwork, size and thread colours; production wants the original files | One artwork per location in the customizer; send the original file and its placement per location; keep left and right sleeve apart. |
| A19, B7 | 21 | AI, PDF, EPS, JPG, SVG and PSD (PNG and the size limit are being confirmed) | Accept the list the API publishes. |
| A25, B2 | 27, 28 | The team buys labels in ShipStation; the customer pays the quoted rate | Remove the label purchase at "Continue to payment" (`CheckoutLayout.tsx`), in the payments release. |
| A27 | 29 | A flat 8.25% | Show only the API's tax; checkout estimates 8.25% itself today. |
| A29 | 34 | Cancel within 2 hours | A Cancel button on orders under 2 hours old, once the API's cancel works. |
| A33, B3 | 37 | Card, Google Pay, Cash App, PayPal and Apple Pay | Add Apple Pay; build the Google Pay and Cash App request with the order's real total (`amount: "1.00"` today, audit B1). |
| A35 | 39 | Tracking for signed-in customers; the admin picks ShipStation or manual updates | Show the order's status and tracking from the API, whichever way it's updated. |
| A36 | 32 | US mainland only | Nothing: the states list will only contain those states. |
| A45 | 56 | The team manages the gallery in the admin | Load gallery photos and captions from the API. |
| — | 46 | A closed account is kept 30 days and restored by signing in | A "Delete account" option in profile settings that says so. |
| — | 47 | Guests and signed-in customers see the same prices; SAGE cards show the lowest price with "+" | Show "$X+" on SAGE product cards, from a field the product list will return. |

**Waiting on the client:** A44, "Only N left" (Q49). **Later, by the client's choice:** A42 price filter (Q54), A46 Back button (Q57). **Unanswered, no change for now:** A6, A7, A8, A9, A14, A15, A16, A20, A21, A22, A23, A24, A32.

---

<a id="2026-10-26"></a>
## 2026-10-26: client decisions, first backend changes (not released)

On branch `feature/client-decisions`. This section grows with each change until the branch is released.

- **SAGE markup is 49.25%** (Q11), the rate the shop applies itself today. Once the backend's migration has run, SAGE prices in the cart and in `price_tiers` match what the product page shows.
- **Shipping quotes:** an item without a weight now counts as 1 lb instead of 0.5 lb (Q31), so some quotes go up. Nothing changes in the request or the response.
- **Supplier updates** (Q51): prices and stock from all four suppliers now refresh on the 1st of each month, instead of the 5th, 10th, 15th and 25th. The SAGE stock change from [2026-10-16](#2026-10-16) lands on the first 1st after this release.
- **Password rule** (Q42): sign-up, the reset page and the signed-in password change now check the shop's own rule: 8 to 128 characters, with an uppercase letter, a number and a special character (anything that isn't a letter or a digit, so a space counts). It replaces "8+ characters, 2 digits, no spaces". A password that fails gets `400` with *"Password must be 8 to 128 characters long and include an uppercase letter, a number and a special character."* Existing passwords keep working; the rule applies when a password is set.

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
