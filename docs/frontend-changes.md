# Backend changes for the customer website (hashtag-next)

What each backend release changes for the shop, and what the shop has to do. Newest first. Paths are relative to `/api/v1`.

The client's answers of 26 and 27 October, and what they mean for the shop, are in [Client decisions](#client-decisions) below the releases list.

| Release | Backend commit | Shop action |
|---|---|---|
| [2026-11-27: orders whose payment failed stay in My Orders and Payment History](#2026-11-27-failed-orders) | `d5d7604`, not deployed yet | None: same responses. Failed orders simply stop disappearing |
| [2026-11-27: customizations without values (text or artwork only)](#2026-11-27-valueless-customizations) | `6b8dcf3`, live since 27 Nov | **To offer them:** show a customization that has no values with its text and image inputs, and send it without a value (below). Until then they simply don't show |
| [2026-11-26: SAGE colours come from SAGE's stock list; stock per colour](#2026-11-26-sage-colours) | `e204c30`, live since 26 Nov (SAGE sync run the same day) | None required. **Recommended:** show sold-out SAGE colours in the customizer (a colour at 0 is refused by the cart) |
| [2026-11-25: print locations per garment; one sleeve](#2026-11-25-print-locations) | live since 25 Nov | **Required:** one Sleeve spot on T-shirts (decided 24 Nov). Everything the shop sends today is still accepted |
| [2026-11-25: one add to cart adds all its lines or none](#2026-11-25-all-or-none) | live since 25 Nov | None required |
| [2026-11-26: bags can be customized: embroidery, DTF or screen print on the front](#2026-11-26-bags) | live since 26 Nov | **To offer it:** a bag customizer, front only (below). Nothing breaks meanwhile |
| [2026-11-25: quantity-based options are sold only at their listed quantities](#2026-11-25-quantity-options) | live since 25 Nov | None required: the product page already sells only those quantities, and the cart shows the API's message |
| [2026-11-25: customers can change their name and phone](#2026-11-25-profile) | live since 25 Nov | **To turn it on:** set `PROFILE_EDIT_ENABLED` to `true` in `ProfileSection.tsx` and deploy |
| [2026-11-25: graphics can also be WebP](#2026-11-25-webp) | `a149b35`, live since 25 Nov | None: the shop's pickers already offer WebP (`88dcfa1`, live) |
| [2026-11-25: SAGE products are customized for free](#2026-11-25-sage-free) | `8b7b9fc`, live since 25 Nov | Done in hashtag-next `46dd2c6`, live since 25 Nov |
| [2026-11-25: product cards show the lowest price per piece](#2026-11-25-card-price) | `94f3e84`, live since 25 Nov | None required |
| [2026-11-25: a customization value's price can be empty](#2026-11-25-optional-price) | `4888377`, live since 25 Nov | None required: the shop already counts a missing price as $0 |
| [2026-11-24: an order keeps the address it was priced for](#2026-11-24-ship-to) | `6c6ec41`, live since 24 Nov | None required |
| [2026-11-24: print options must be on the price list; one drinkware rule](#2026-11-24-print-options) | `fbc10dd`, live since 24 Nov | None required. Recommended: decide drinkware from `is_drinkware` |
| [2026-11-24: the contact and sourcing forms are checked on the server; page sizes on public lists](#2026-11-24-forms-lists) | `311e5ee`, live since 24 Nov | None required. Optional: limit the support form's email to 100 characters |
| [2026-11-24: each upload takes only what its form sends](#2026-11-24-uploads) | `739b58c`, live since 24 Nov | None required. Recommended: show the sourcing form's 20 MB limit, and cap pre-made products at 10 graphics in total |
| [2026-11-20: unpaid orders and one payment at a time](#2026-11-20-paying-order) | `f09c0b4`, live since 20 Nov | None required: the shop already shows the API's messages. Optional: see the note on 409 from `POST order` |
| [2026-11-20: graphics are PNG, JPG or SVG only](#2026-11-20-graphic-types) | `35ba84e`, live since 20 Nov | Done in hashtag-next `88dcfa1`, live: both graphic pickers limited to PNG, JPG, JPEG, SVG and WebP (WebP allowed since 25 Nov) |
| [2026-11-13: payments go-live](#2026-11-13-go-live) | `2634b76`, live since 16 Nov | Done in hashtag-next `744ba16` and `5d0fcff`, live |
| [2026-11-13: colours and sizes on product cards](#2026-11-13) | `630d20c`, live | Optional: show colour swatches and the size range on cards |
| [2026-11-12: the category list shows only categories with products](#2026-11-12) | `64c340f`, live | None required: read the notes |
| [2026-11-06: `FIXED_QUANTITY` customization pricing](#2026-11-06) | `a8cb702`, live | **Required before a product gets this type**: show `fixed_price` as a total and never multiply it by quantity |
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
| A5, A6 | 5, 6 | Hoodie Full Front and Full Back embroidery, and Full Front on T-shirts and polos, are "contact us", as before | Hoodies: show "Contact us" for Full Front and Full Back embroidery instead of adding them at $0, as for the oversized back. T-shirts and polos: keep Full Front off. The backend refuses Full Front, Full Back and oversized-back embroidery since [2026-11-24](#2026-11-24-print-options). |
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

<a id="2026-11-27-failed-orders"></a>
## 2026-11-27: orders whose payment failed stay in My Orders and Payment History (not deployed yet)

**Before:** only the order for the cart as it is now may be paid (audit F10). So every cart change (add, update, remove, move to the wishlist) and every new checkout removed the customer's unpaid orders, including those whose payment had failed. A declined order showed in My Orders as "Payment failed" until the customer's next cart change, then vanished. In Payment History its payment stayed, with `order: null` ("Order details unavailable for transaction …"). Bhavya's test account had four such payments on 27 Nov (ids 26 to 29).

**Now:** an unpaid order with a failed payment, or any payment attempt, is kept with its items.
- Nothing about it changes: `status` FAILED, `payment_status` REJECTED, so it reads "Payment failed" in both places, with its items and totals.
- It's closed instead (the order's `is_active` is false, which no response shows), so it can't be paid any more. Paying it answers `409` "Your cart changed after this order was made, so it can't be paid. Please go back and check out again.": the same answer a removed order gave.
- As before, the customer checks out again from the cart, which makes a new order.
- An order nobody tried to pay (made at checkout, then the customer went back) is still removed, as before. No history ever showed it.
- A declined order can still be paid again, with another card or PayPal, as long as the cart hasn't changed.

**The shop:** no change. The responses are the same; failed orders just stop disappearing.

**Orders removed before this release** stay removed until the team brings them back. Run this in the database **after** deploying: before that, the old code would remove them again, and they could be paid.

```sql
-- 1. Look first: unpaid orders that were removed although someone tried to pay them.
--    An order the team deleted on purpose (admin panel, Delete) shows here too: leave it out of step 2.
SELECT o.id, o.order_number, o.user_id, o.status, o.payment_status, o.total_amount, o.created_at, o.deleted_at
  FROM orders o
 WHERE o.deleted_at IS NOT NULL AND o.payment_status <> 'SUCCESS'
   AND (o.payment_status = 'REJECTED'
        OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.deleted_at IS NULL))
 ORDER BY o.deleted_at DESC;

-- 2. Bring them back closed, with the items removed with them (add AND o.id IN (...) to pick).
UPDATE order_items i JOIN orders o ON o.id = i.order_id
   SET i.deleted_at = NULL
 WHERE o.deleted_at IS NOT NULL AND o.payment_status <> 'SUCCESS'
   AND (o.payment_status = 'REJECTED'
        OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.deleted_at IS NULL))
   AND i.deleted_at IS NOT NULL AND ABS(TIMESTAMPDIFF(SECOND, i.deleted_at, o.deleted_at)) <= 5;

UPDATE orders o
   SET o.deleted_at = NULL, o.is_active = 0
 WHERE o.deleted_at IS NOT NULL AND o.payment_status <> 'SUCCESS'
   AND (o.payment_status = 'REJECTED'
        OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.deleted_at IS NULL));
```

<a id="2026-11-27-valueless-customizations"></a>
## 2026-11-27: customizations without values (text or artwork only) (live since 27 Nov)

The admin can now add a customization to a pre-made product without picking any values, e.g. "Business card information": the customer only types text or uploads artwork. `GET customization-option/product/:productId/customizations` returns it as usual, with `values: []` (and the option's `allow_text_input` / `allow_image_upload`).

**What the API accepts:** in `POST product/cart`, a customization line for such an option carries no `customization_option_value_id`: `{ "customization_option_id": 12, "text": "ACME Inc, 555-0100" }`, and `image_index` or `graphic_id` for artwork, as today. It costs nothing extra. An option that has values on the product still needs `customization_option_value_id` (400 "customization_option_id and customization_option_value_id are required").

**What the shop must do** to offer them (nothing breaks meanwhile: they just don't show):
- **Stop hiding it:** `ManualCustomizationPage.tsx:237` drops every customization with no values (`.filter((g) => g.values.length > 0)`). Keep those whose option has `allow_text_input` or `allow_image_upload`.
- **Show the inputs straight away:** for such a customization, show its text box and/or image upload directly. Today they appear only after a value is picked (`selectedValue && …`, line 614). There's no price.
- **Send it without a value:** in `manualCartPayload.ts`, send its line without `customization_option_value_id` (today every line has `valueId: number`), only when the customer typed text or added a file.

**A text or upload field with a price** (admin, not deployed yet) needs nothing new: it's an ordinary customization with one value, "Yes", priced per piece (`FIXED`) or as one total (`FIXED_QUANTITY`). The shop already shows it: the customer picks "Yes", then types or uploads.

<a id="2026-11-26-sage-colours"></a>
## 2026-11-26: SAGE colours come from SAGE's stock list; stock per colour (live since 26 Nov)

SAGE describes a product's colours twice. Its colour text is cut at 1,000 characters, so long lists come abbreviated ("Hot P" for Hot Pink) and cut mid-word ("Wh"); its stock list has every colour, spelled in full, with its own stock. The import used only the text. Example: 3/4" Ink Injected Wristbands (#94892) showed 69 colours, among them "Hot P", "Red/P Seg" and a colour called "Wh", and none of SAGE's swirl and glow bands. It now has SAGE's 119.

**What changes in the API** (live since the SAGE sync of 26 Nov; there are no new fields):
- **More colours:** about 595 new colour variants on SAGE products, and 41 that were removed come back. The five big wristband products go from 67–69 to 119–129 colours. New colours have higher variant ids, so they come after the existing ones.
- **Renamed in place:** 21 abbreviated colours keep their `variant_id` and get the full name, with a new `sku` and `color_code`: "Hot P" becomes "Hot Pink", "Red/P Seg" becomes "Red/Pink Seg", "White/Lime Green Se" becomes "White/Lime Green Seg". Carts, wishlists, orders and `?variant_id=` links keep working.
- **Removed (soft-deleted):** 26 variants that weren't real colours:
  - the cut-off fragments ("Wh", "Whi");
  - "Unavailable" on six drinkware products, which SAGE's real colours replace;
  - repeated colours on four napkin products ("Bermuda Blue" next to "Bermuda").

  None of them is in a cart, wishlist or order.
- **Stock is per colour:** SAGE's stock for that colour (added up over its sizes), no longer the product's total on every colour.
  - A colour SAGE reports at 0 is `stock: 0, track_inventory: true`. It drops off product cards and filters, and `POST product/cart` refuses it (400 "Not enough stock for variant N"). About 519 SAGE colours that can be ordered today are at 0. The other way round, colours on a product whose total SAGE showed as 0 or below (one oversold size) become orderable when SAGE has stock of that colour.
  - Made-to-order colours (SAGE marks them unlimited) are `stock: null, track_inventory: false`: no limit, as unreported stock is today.
  - Colours only SAGE's colour text names (no stock record) keep the product's total stock, as every colour had before.
- **Unchanged:** SAGE products still have one variant per colour (size "One Size", no `size_id`), and colour names are unique within a product. Colours SAGE's text and stock list both have keep the shop's current spelling ("Navy Blue" stays, though SAGE's stock list says "Navy").
- **Not added:** parts some suppliers keep in the stock list's colour field (custom buttons' "Mylar", "Pinned Backs"; mouse pads' "Gaming"), and colours that only a stock list covering several sizes or models names, as they may be another item's (11-inch-only balloon colours on the 17-inch balloons).

**What the shop must do:** nothing is required; every link and cart line keeps its `variant_id`.

**Recommended:** show sold-out SAGE colours before the customer designs one.
- The SAGE quantity stepper (`Sagequantitypricing.tsx:382`) treats `stock: 0` as "no limit". The customizer passes only `stock`, not `track_inventory` (`Productcustomizationpage.tsx:2675`).
- So a customer can pick a colour SAGE has none of, design it, and only then get the cart's error.
- Fix: use `isInStock` / `stockCeiling` from `src/lib/stock.ts` as the add-colours modal does, mark the colour sold out and block Add to cart with a clear message. On the product page, mark or disable colours with no stock (`ProductInfo.tsx` colour swatches).

**Optional:**
- **Long colour lists:** the product page draws every swatch, up to 129 on the wristbands. Consider about 30 and a "Show all N colors" button.
- **Image preloading:** `ProductDetail.tsx:337-355` preloads one image per colour when the page is idle. Limit it (e.g. the first 12) now that SAGE colours can have their own pictures.
- **Two-tone cart dot:** two-tone colour codes arrive as `"#0000FF,#808080"`, which `backgroundColor` ignores, so the cart's colour dot is blank (`CartItem.tsx:271-274`). Reuse `ColorSwatch`'s gradient.

<a id="2026-11-26-bags"></a>
## 2026-11-26: bags can be customized: embroidery, DTF or screen print on the front (live since 26 Nov)

Decided on 26 Nov. A bag is a product with a parent category whose title contains "bag". Today that is the parent category **Bags** (under Promo Products), with its subcategories Bags, Tote Bags and Duffel Bags: 89 products in the live catalog (75 SanMar, 9 SAGE, 5 S&S). Bags can now be customized with embroidery, DTF or screen print, on one spot: the front.

**How to tell a bag:** `GET product/:id` and `product/guest/:id` return `is_bag`, next to `is_drinkware`. On `GET product/variant/:id` it's `data.product.is_bag`.

**What to send** on `POST product/cart`, as for clothing:
- `print_method`: `EMBROIDERY`, `DTF` or `SCREEN_PRINT`;
- `locations`: `[{ "location": "FRONT" }]`, the only spot on a bag;
- `colors`: 1 to 6, for screen print only.

**Prices** a piece, by the line's quantity. Each bag pays once, so the line's decoration is the price × the quantity.

| Pieces | 1–11 | 12–23 | 24–35 | 36–71 | 72–95 | 96–143 | 144+ |
|---|---|---|---|---|---|---|---|
| Embroidery or DTF | $15 | $12 | $10 | $9 | $7 | $5 | $5 |

- Screen print uses the clothing screen-print table (`SP_PRICES` in `pricing.ts`), from 12 pieces.
- Bag embroidery is **not** the clothing embroidery table: it has the DTF numbers.
- Example: 5 bags with embroidery = 5 × $15 = $75 of decoration.

**The $35 graphic fee** applies to bags as to clothing: a new graphic on fewer than 12 pieces in the cart. **SAGE bags** are customized for free, as every SAGE product is.

**Refused (400):**
- DTG, Color Imprint or Laser Engraving on a bag: "This print method isn't available for this product. Please choose embroidery, DTF or screen print."
- Any spot but the front: "Bags can only be printed on the front. Please choose the front."
- The front twice: "Please choose each print location only once."
- Screen print under 12 pieces, or outside 1 to 6 colors: the same messages as on clothing.

**A bag that is also clothing** (the 50L Utility Duffel Bag, also under Workwear) takes either the front at bag prices, or the garment's spots at clothing prices as today, not both on one line. What the shop sends for it today keeps working.

**Also in this release:**
- Screen print and DTG rows in `pricing_table` carry `locations`: how many locations `price_per_item` is charged for, as DTF rows always have.
- The $35 fee reads the print method in any letter case, so a line saved as "embroidery" pays it as "EMBROIDERY" does.
- Screen print takes 12 pieces on SAGE products too, SAGE bags included: 400 "Screen print requires minimum quantity of 12". The decoration stays free. The minimum was lifted by mistake with the free SAGE customization on 25 Nov, while the cart's own minimum still said 12.

**What the shop must do:** nothing breaks meanwhile, because bags still go into the cart without a print method, as today. To offer bag printing:
1. When `is_bag` is true, offer Embroidery, DTF and Screen print (no DTG) on one spot, Front, and send `locations: [{ "location": "FRONT" }]`.
2. Price it with the table above. Embroidery and DTF share the numbers; screen print uses `SP_PRICES`, from 12 pieces.
3. Show the $35 notice as on clothing. On SAGE bags (`supplier` "SAGE"), show "Customization included", as on other SAGE products.

<a id="2026-11-25-print-locations"></a>
## 2026-11-25: print locations per garment; one sleeve (live since 25 Nov)

Audit F08; decided on 24 Nov that one sleeve is enough and `SLEEVE` stays the only sleeve code. `POST product/cart`, the cart's quantity changes and `POST order` (for lines already in a cart) now accept only the print locations the product's garment offers on the website:

| Garment (from a parent category's title, the shop's `garmentType` rule) | Locations |
|---|---|
| Hoodie ("hoodie" or "sweatshirt") | `LEFT_CHEST`, `RIGHT_CHEST`, `FULL_BACK`, `SLEEVE` |
| Hat ("hat", "cap" or "headwear") | `HAT_FRONT`, `HAT_BACK_ARCH`, `HAT_SIDE` |
| Polo ("polo") | `LEFT_CHEST`, `RIGHT_CHEST`, `FULL_BACK_STANDARD`, `FULL_BACK_LARGE`, `SLEEVE` |
| T-shirt (any other title) | `LEFT_CHEST`, `RIGHT_CHEST`, `FULL_BACK_STANDARD`, `FULL_BACK_LARGE`, `SLEEVE` |

A product under several parent categories can use the list of any one of its garments (one list per line), since the shop takes the garment from whichever parent category comes first. Codes are read in any letter case, as before.

Refused with 400:
- `FULL_FRONT` and `OVERSIZED_BACK`, with any print method: "Full Front is by quote only. Please choose another print location or contact us for a quote." (or "Oversized Back ...").
- A location the garment doesn't have, a made-up code, and `SLEEVE_LEFT` or `SLEEVE_RIGHT`: "This print location isn't available for this product. Please choose another one."
- Both back sizes on one line: "Please choose Full Back (Standard) or Full Back (Large), not both."
- A location twice: "Please choose each print location only once." **`SLEEVE` twice is still accepted**, because the shop sends a T-shirt's two sleeves both as `SLEEVE`.
- Hoodie Full Back embroidery stays by quote only, as before.

Everything the shop sends today is accepted and priced as before. All 1,632 combinations of garment, locations, print method and quantity the customizer can send were checked against the previous release.

**What the shop must do (required):** give T-shirts a single "Sleeve" spot, like hoodies and polos, so a T-shirt sends `SLEEVE` at most once. In `Productcustomizationpage.tsx`, replace the `SLEEVE_LEFT` and `SLEEVE_RIGHT` views of the `tshirt` entry in `GARMENT_VIEWS` with one sleeve view. Keep sending `SLEEVE`, and in `pricing.ts` (`decorationRequestFields`) drop a repeated location, so a design saved before the change can't send two sleeves. Tell the backend team once it's live: `SLEEVE` twice will then be refused too.

<a id="2026-11-25-all-or-none"></a>
## 2026-11-25: one add to cart adds all its lines or none (live since 25 Nov)

Audit F07. `POST product/cart` adds a line for each size (and for each variant of a pre-made product). It used to save them one at a time, so when a later size was refused (out of stock, under the screen-print minimum of 12, a variant that doesn't exist), the sizes before it stayed in the cart and the request still answered with an error.

Now every line is checked and priced first, and the lines are saved together, or none of them. The error is the same as before. The preview image (`images`) is kept only when lines were added. A graphic uploaded in the same request for a pre-made product (`customization_images`) stays in the customer's saved graphics either way, as with `POST graphics`.

**What the shop must do:** nothing. After an error, the cart no longer holds part of the request, so there is nothing to clean up.

<a id="2026-11-25-quantity-options"></a>
## 2026-11-25: quantity-based options are sold only at their listed quantities (live since 25 Nov)

Decided on 24 Nov (audit F03). A customization value with `pricing_type: "QUANTITY_BASED"` has a price for set quantities, for example 25 pieces for $50 and 50 pieces for $90. The API now prices it only when the line's quantity is one of those, as the product page does. Before, it charged the highest row at or below the quantity, so a customer who typed 49 in the cart paid the 25-piece price.

- **`POST product/cart`, and the cart's quantity changes (`PUT product/cart`, `PUT product/cart/increment`, `PUT product/cart/decrement`):** any other quantity is refused with 400, naming the quantities: `The "Velcro" option is sold in 25 or 50 pieces. Please choose one of those quantities.` With one quantity: `... is sold in 100 pieces. Please choose that quantity.`
- **`POST order`:** a pre-made line added earlier at another quantity is refused with 400: `An option on <product> isn't sold in the quantity in your cart. Please change the quantity or remove it.` (several products: `Options on A and B aren't sold in the quantities in your cart. ...`).
- The listed quantities cost the same as before. The other pricing types (`FIXED`, `TIERED`, `FIXED_QUANTITY`) are unchanged.

**What the shop must do:** nothing. The product page already sells only the listed quantities, and the cart shows the API's message. Optional: on a line with such an option, let + and − step between the listed quantities, since + on a 25-piece line asks for 26, which is refused.

<a id="2026-11-25-profile"></a>
## 2026-11-25: customers can change their name and phone (live since 25 Nov)

New: `POST user/profile` (signed in, JSON) saves the customer's name and phone. Before this there was no such route, so the profile's Save button couldn't save anything (audit F11).

- **Body:** `{ "name": "Jane Doe", "mobile": "8325550123" }`.
- **`name`:** required, 2 to 80 characters after trimming, as on the website. Runs of spaces and line breaks become one space. Otherwise 400 "Please enter your full name (2 to 80 characters)."
- **`mobile`:** the sign-up rule. Optional; when given, a US number in any usual format, stored as its 10 digits. `""` or `null` removes the phone, and leaving `mobile` out keeps the saved one. Otherwise 400 "Please enter a valid 10-digit US phone number, or leave it empty."
- **The email can't be changed.** A request with an `email` field (any value, even the current one) is refused with 400 "Your email can't be changed." and nothing is saved.
- Any other field is ignored.
- **Answer (200):** the profile in the same shape as `GET user/profile`, with the message "Profile updated."

**What the shop must do:** set `PROFILE_EDIT_ENABLED` to `true` in `src/components/account/ProfileSection.tsx` and deploy. The Save code from `f21ac29` already sends `{ name, mobile }` with `mobile: ""` when the phone is empty, which matches. Keep the email out of the request.

<a id="2026-11-25-webp"></a>
## 2026-11-25: graphics can also be WebP (live since 25 Nov)

Asked for on 25 Nov, because the shop's artwork pickers offer WebP (hashtag-next `88dcfa1`). Customers' graphics are now PNG, JPG/JPEG, SVG or WebP, on `POST graphics` (field `graphic`) and on `POST product/cart` for pre-made products (`customization_images`). This updates [2026-11-20](#2026-11-20-graphic-types).

- **Name and type:** a `.webp` name must come with the type `image/webp`, or a generic one.
- **Contents:** the file itself must be a real WebP, PNG or JPEG under any of those picture names (a WebP saved as `.png` is fine). An SVG name must hold an SVG. A ZIP renamed `.webp` is refused.
- **Refusal (400):** "Graphics must be PNG, JPG, JPEG, SVG or WebP files. ZIP, PDF and other files can't be uploaded."
- **Unchanged:** the team's artwork previews for an approval, the approval page's pictures and the sourcing form take no WebP, as before.

**What the shop must do:** nothing. The pickers already accept WebP; it no longer fails at upload.

<a id="2026-11-25-sage-free"></a>
## 2026-11-25: SAGE products are customized for free (live since 25 Nov)

Decided on 25 Nov: a SAGE product can be customized (custom text, a graphic, a print method and its locations, whatever its category) at no extra cost. No print price, no drinkware back print ($8), no $35 graphic fee (SAGE lines never paid it). The customer pays the product price only.

**What the API does now:**
- **Cart lines and orders for SAGE products:** `pricing_snapshot.customization_price` is `{ total_customization_price: 0, setup_fee: 0 }`, `final_price_per_item` is the product price, and there is **no `pricing_table`**. Its one `"SAGE"` row was what the cart showed as "Sage +$0.00". The SAGE tier the quantity is priced at moved to `pricing_snapshot.tier_quantity`.
- **SAGE lines already in a cart** lose any customization price and their `pricing_table` the next time the cart is opened or checked out, so no SAGE order is charged one.
- **The print options are still checked.** A print method or location the product doesn't offer is still refused with 400, as before, because production reads them.
- **`drinkware_second_location_price`** on `GET product/:id`, `product/guest/:id` and `product/variant/:id` is `0` for SAGE drinkware. It stays 8 for drinkware from other suppliers, which still pay the back print.

**Done in hashtag-next `46dd2c6`, live since 25 Nov.** What the shop had to do:
1. **Cart:** nothing. `CartItem.tsx` reads `pricing_snapshot?.pricing_table ?? []`, so the "Sage" line disappears on its own.
2. **Customizer, required:** on a SAGE product (the variant's `supplier` is `"SAGE"`, already read in `Productcustomizationpage.tsx` around line 1166), show no customization price.
   - `drinkwareLocationFee` (about line 1271) is 0. Better: use `drinkware_second_location_price` from the product.
   - The note "each additional location adds $8 per product" (about line 2802) is hidden.
   - Any print price or $35 estimate shows as free.
   Until then, the page shows a higher price than the cart charges.
3. Optional: show "Customization included" on SAGE products.


<a id="2026-11-25-card-price"></a>
## 2026-11-25: product cards show the lowest price per piece (live since 25 Nov)

Asked for by the client on 25 Nov ("lowest price on card per piece"). On every product list (`GET product`, grand-category, brand, use-case and tier products, search), a manual product priced by quantity now gets the lowest price per piece in `price`, with `price_from: true` when smaller quantities cost more per piece. The shop already shows that as "$1.15+", as for SAGE products.

- **Set quantities** (`pricing_mode: "quantity_fixed"`): each row is the total for that exact quantity, so the price per piece is total ÷ quantity and the card shows the cheapest. Hard Enamel Pin: 5,000 for $5,757.06, so "$1.15+" (it was $147.76, the price of 1 pin).
- **Variable ranges** (`pricing_mode: "tiered"`): each row is already a price per piece, so the card shows the cheapest row. PVC Patches: "$2.94+" (was $11.76).
- Rounded to the nearest cent: Glossy Business Cards (10,000 for $202.74) show "$0.02+".
- **Unchanged:** one-price products (T-shirts, hoodies and the other manual products with a fixed price), SAGE (already the lowest tier per piece), S&S, SanMar and OTTOCAP. The product page and the cart are unchanged.
- The list's price filter (`min_price`, `max_price`) uses the same price, so it matches the cards.

On 25 Nov this changed 17 cards: 14 with set quantities and 3 with ranges.

**What the shop must do:** nothing.

<a id="2026-11-25-optional-price"></a>
## 2026-11-25: a customization value's price can be empty (live since 25 Nov)

A **One price** (`FIXED`) or **Fixed quantity** (`FIXED_QUANTITY`) value can now be saved in the admin panel without a price, so `GET customization-option/product/:productId/customizations` can return it with `fixed_price: null`. It costs nothing extra, and the cart charges it as $0.

**What the shop must do:** nothing. `getCustomizationPrice` in `pricing.ts` already reads a missing `fixed_price` as 0. Optional: show such a value without a price, rather than "+$0.00".

<a id="2026-11-24-ship-to"></a>
## 2026-11-24: an order keeps the address it was priced for (live since 24 Nov)

Audit point F02. **What `GET order/:id` returns:** `address` is now the order's own copy of the address its shipping was priced for, which is also where its label goes. Editing or deleting that saved address on the Account page no longer changes it. The fields are the same as before (`name`, `phone`, `address_line1`, `city`, `state`, `postal_code`, `country`), plus `address_line2`, which is `""` or `null` when there's none. It's still `null` for an order without an address. Nothing else changes in `GET order/:id` or in `GET order` (the list).

**What the shop must do:** nothing.

<a id="2026-11-24-print-options"></a>
## 2026-11-24: print options must be on the price list; one drinkware rule (live since 24 Nov)

Audit points F05 and F04. `POST product/cart` charged $0 for any decoration it had no price for: a print method it didn't know (even `embroidery` in small letters), 7 screen-print colours, DTG without a print area, embroidery on a location with no price (hoodie Full Front and Full Back, the oversized back), or a decorated line with no location. The garment was charged, the printing was free, the $35 graphic fee was skipped, and production still got the instructions. Drinkware's $8 for the second location was charged only on SAGE products under a parent category named exactly "Drinkware", and only for Color Imprint and Laser Engraving.

The shop never sends any of these, so nothing changes for it.

**Which print methods a product takes.** The API decides from the product's categories, the way the shop does:
- Apparel (a grand category "Apparel & Uniforms"): `EMBROIDERY`, `DTF`, `SCREEN_PRINT`, `DTG`, on every supplier.
- Drinkware (a parent category whose title contains "drinkware", on every supplier): `COLOR_IMPRINT`, `LASER_ENGRAVING`.
- Every other product (pre-made and other promo products): none.
- A product filed under both takes the methods of each, whatever order its categories come in.
- A line with no `print_method` and no `locations` is accepted on every product, as before: plain and pre-made adds, promo products with a logo (`graphic_id`), wishlist to cart.

**Refused now, with 400** (the API's `message`):

| The request has | Message |
|---|---|
| A print method the product doesn't take, or an unknown one such as `PUFF` | Apparel: "This print method isn't available for this product. Please choose embroidery, DTF, screen print or DTG."<br>Drinkware: "This print method isn't available for this product. Please choose Color Imprint or Laser Engraving."<br>A product that takes both: "This print method isn't available for this product. Please choose another one."<br>Other products: "Print methods can't be chosen for this product. Please add it without one." |
| A print method with no location, or a location that isn't `{ "location": "…" }` | "Please choose at least one print location." |
| Locations without a print method | "Please choose a print method for your print locations." |
| Screen print without `colors`, or `colors` that isn't a whole number from 1 to 6 | "Please choose between 1 and 6 colors for screen printing." |
| DTG without `dtg_style`, or one other than `FRONT_REGULAR`, `OVERSIZED`, `FRONT_AND_BACK_REGULAR`, `FRONT_AND_BACK_OVERSIZED` | "Please choose a print area for DTG printing." |
| Embroidery on `FULL_FRONT`, `FULL_BACK` or `OVERSIZED_BACK` | "Full Front embroidery is by quote only. Please remove it, choose another print method, or contact us for a quote." (Full Back and Oversized Back the same) |
| Embroidery on any other location without an embroidery price | "This print location isn't available for embroidery. Please choose another one." |
| Drinkware on a location other than `FRONT` or `BACK` (`"FRONT AND BACK"` included) | "This product can only be printed on the front, the back, or both. Please choose one of those." |

"This print option isn't available. Please choose another one." is the last line of defence, for a price the tables don't have; the checks above come first.

As with the other refusals there (stock, minimums), the elements of the same request before the refused one have already been added, and the customer's unpaid orders have already been removed ([2026-11-20](#2026-11-20-paying-order)). Making a request all or nothing is a separate audit point (F07).

**Accepted and priced now** (they were $0):
- A print method or DTG print area in small letters (`"embroidery"`, `"front_regular"`). The line is saved in capitals.
- `SLEEVE_LEFT` and `SLEEVE_RIGHT` under embroidery, at the sleeve price. They're saved as sent. Refused since [print locations per garment](#2026-11-25-print-locations) (25 Nov): `SLEEVE` is the only sleeve code.
- Embroidery on a location written with a space, such as `"left chest"`. It's saved as `LEFT_CHEST`.

**Saved in the price tables' spelling, at the same price as before:** location codes such as `"left-chest"` (saved as `LEFT_CHEST`), and `colors` sent as text (`"3"`, saved as `3`). The saved line keeps `colors` only for screen print and `dtg_style` only for DTG.

**Still accepted until the client answers about the sleeves (audit F08):** `SLEEVE` twice; Full Front under DTF, screen print and DTG; both back sizes together, and a location twice; hat locations on T-shirts; any location code under DTF, screen print and DTG, `OVERSIZED_BACK` included (only embroidery on it is refused).

**Drinkware:**
- The second location (front and back) adds $8 a piece on every supplier, not only SAGE, and under any parent category whose title contains "drinkware".
- SAGE lines keep the `pricing_table` row they have today: `type: "SAGE_DRINKWARE"`, with no `price_per_item`, so the cart's breakdown still shows "+$0.00" on it.
- A drinkware product from another supplier gets a row with `type: "DRINKWARE"` and `price_per_item` (8 with front and back, 0 with one location), so the cart shows "Drinkware +$8.00".
- On both, the $8 is in `customization_price.total_customization_price` and `final_price_per_item`.

**Clothing on SAGE.** A SAGE product filed under "Apparel & Uniforms" takes the four clothing methods at the same table prices, added to the SAGE price (none is filed there today). The $35 graphic fee still skips SAGE lines.

**New snapshot key** `print_options_checked: true` on every line priced from now on (new lines and quantity changes). The shop can ignore it.

**Lines already in a cart** show as before. A line whose print options are refused now was made with an edited request before this release, or is on a product that has since moved to other categories. For such a line:
- a quantity change (+, −, typed) answers 400 "This item's print options aren't available any more. Please remove it from your cart and add it again."
- `POST order` answers 400 "The print options on {product} aren't available any more. Please remove it from your cart and add it again." With several such lines it names them all ("A and B", "A, B and C") and says "them". It answers the same for a "request a quote" line, and for a line priced before this release whose decoration was saved for less than it costs now. Nothing is created or charged, and checkout shows the message.

**New fields `is_drinkware` and `drinkware_second_location_price`** on the product: in `data` for `GET product/:id` and `GET product/guest/:id`, and in `data.product` for `GET product/variant/:id`. `is_drinkware` is true when one of the product's parent categories has "drinkware" in its title, whatever the supplier: the rule the cart charges the $8 by. `drinkware_second_location_price` is that fee a piece (8), or `null` when the product isn't drinkware.

**What the shop must do:** nothing required. Recommended, so the page and the cart decide drinkware the same way: in `Productcustomizationpage.tsx` (`isDrinkware`, line 824 at `11c00f8`), use the flag instead of matching the first parent category's title, and show the API's fee instead of `DRINKWARE_SECOND_LOCATION_FEE` (`pricing.ts`):

```ts
const isDrinkware = isPromo && (product?.product?.is_drinkware ?? parentCategory.includes("drinkware"));
```

Add `is_drinkware?: boolean` and `drinkware_second_location_price?: number | null` to the page's product type, and keep the fallback until this release is live. With the flag, a product whose drinkware category isn't its first one also gets the drinkware options: today that's the Campfire Kit (product 105868).

Tested on 24 Nov on a throwaway MariaDB 10.11 built from production's schema, with real products from the public catalog, the code before this change (`91017fa`) and after it side by side, and Square, PayPal, ShipStation and email faked. 156 cases and 632 checks passed, twice:
- Every request the shop sends gave the same answer, prices and saved lines before and after: clothing with each print method, drinkware, promo and pre-made products, wishlist to cart, +, − and typed quantities, and checkout. That includes 44 more real products, one or two per parent category and supplier. The only addition is `print_options_checked`.
- Every request in the table above was refused with its message. The code before this change accepted each one, most of them at $0.
- Lines already in carts: refused ones get the messages above, and checkout stops before shipping is priced; the others order as before.

The shop's own request-building code at both `7590672` and `11c00f8` was also run for every decoration the customization page can produce, at each price-tier boundary from 1 to 1,000 pieces: 47,410 priced combinations. Each was accepted at the price the page shows, and clothing and SAGE drinkware at the same price as before.

The shop's rule and the API's were also compared over all 1,290 listed products, in every order their categories can come back in: the API never refuses a print method the shop offers. They differ on two products, and on both the shop offers no printing: the 50L Utility Duffel Bag (381, also under Workwear) and the Campfire Kit (105868, also under Drinkware).

<a id="2026-11-24-forms-lists"></a>
## 2026-11-24: the contact and sourcing forms are checked on the server; page sizes on public lists (live since 24 Nov)

Audit points F16 and F18:
- **F16:** the support form's and the sourcing form's rules were checked only in the browser. Anyone could make the shop send its "We've received your message" email from support@, info@ or quotes@ to any address, or to several at once (`a@x.com, b@y.com`), with their own text in it. A long name or company gave a server error.
- **F18:** the public lists took any page size. `GET product?limit=100000` loaded and priced the whole catalog in one request; `limit=-1`, a huge `page` or a repeated `search` gave a server error.

**What the shop must do:** nothing required. Every request the shop sends, in the live version (`7590672`) and in `main` (`11c00f8`), gets the same answer as before:
- The forms already apply the same rules in the browser. The one difference is the support form's email, below.
- Lists: products 16 a page, and 200 for the sitemap; brands 1,000 on the categories page, and the default 20 for the sitemap; grand categories 50, and 100 for the sitemap; industries 20, 50 and 100; use-case products 16. The header's search box stops at 100 characters.

**Optional:** limit the support form's email to 100 characters, with `maxLength={100}` on its email input (`SupportContactForm.tsx:108`) and `.max(100)` on its email rule (`supportFormSchema`, `SupportContactForm.tsx:25`). The server now refuses a longer address with "Email must be 100 characters or fewer.", and the form shows that message; before, such an address gave a server error. The sourcing form keeps 254.

**What changed in the API:**

`POST contactUs` and `POST sourcing-requests/create` are checked before anything is saved or emailed. A refusal is a `400` whose message names the field, and the forms show it like any other `400`:

| Form | Field | Rule | Message when refused |
|---|---|---|---|
| Contact | `name` | 2 to 80 characters | "Full name is required." / "Full name must be 2 to 80 characters." |
| Sourcing | `name` | 2 to 80 characters | "Name is required." / "Name must be 2 to 80 characters." |
| Both | `email` | exactly one address, by the forms' own rule | "Email is required." / "Enter a single valid email address." |
| Contact | `email` | 100 characters at most | "Email must be 100 characters or fewer." |
| Sourcing | `email` | 254 characters at most | "Email must be 254 characters or fewer." |
| Contact | `reason` | one of the five subjects in `src/data/supportData.ts`, as written there | "Choose a subject from the list." |
| Contact | `message` | 10 to 2,000 characters | "Message is required." / "Message must be 10 to 2,000 characters." |
| Sourcing | `company` | optional, 120 characters at most | "Company must be 120 characters or fewer." |
| Sourcing | `requested_name` | 2 to 200 characters | "Brand or product name is required." / "Brand or product name must be 2 to 200 characters." |
| Sourcing | `details` | optional, 2,000 characters at most | "Details must be 2,000 characters or fewer." |

- Fields are checked in the forms' order, so the first message is the one the form itself would show.
- Text is counted the way the forms count it: after trimming, with a line break counted once (browsers send a textarea's line breaks as two characters).
- What's saved is the checked text: trimmed, with line breaks as one character. The sourcing email is still saved in lower case.
- **Subjects:** if the shop renames or adds a subject in `supportData.ts`, the backend's list (`src/helpers/publicForms.js`) must change first, or that subject is refused.
- Unchanged: 10 posts an hour per connection, Turnstile when it's switched on, and who each email comes from (support@ for Order Issue, Customization Help, Shipping & Delivery and Payment Issue; info@ for General Inquiry; quotes@ for sourcing).

Lists anyone can call: `GET product`, `product/grand-category-products`, `product/product-by-brand`, `brand/website-brands`, `brand`, `brand/ss`, `product-category`, `product-category/get-parent-categories`, `product-category/get-grand-categories`, `industry`, `industry/use-case`, `industry/use-case/products`, `industry/use-case/:id/products`, `tiers/:id/products`, `add-on/addon-product`, `customization-option`, `size`, `country`, `state` and `city`:
- `limit` above 200 is answered as 200, and below 1 as 1. `brand/website-brands` goes up to 1,000, because the categories page loads 1,000 brands at once. Add-ons and customization options keep their own 100. Not a number, or 0: the list's default.
- The lists that page say which size they used: `pagination.limit` (`pagination.per_page` on `industry` and `industry/use-case`, and `limit` at the top of the answer on `brand/website-brands`). `size`, `country`, `state` and `city` answer a plain list.
- `page` below 1 is page 1, and above 1,000,000 is page 1,000,000 (an empty page).
- `limit` and `page` are read as whole numbers, as most lists already read them: `limit=16abc` is 16 and `limit=1e3` is 1, also on the few lists that used to read `1e3` as 1,000. The shop sends plain numbers, which are unchanged.
- A `search` longer than 100 characters, not counting spaces around it, searches its first 100. A search sent twice (`?search=a&search=b`) is refused: `400` "Enter a single search." `size`, `country`, `state` and `city` have no search and ignore it, as before.
- `GET size` now answers one page of up to 200 sizes, oldest first (`?page=2` for the next). It used to return all of them at once. Neither the shop nor the admin panel calls it.
- Requests with a valid admin token (the admin panel) keep their own sizes, up to 10,000 rows, and their whole search.

**Not in this change:** the filters on `GET product` (size, colour, price, and `use_case_id` with `tier`) and `use_case_ids` on `industry/use-case/products` have no limits of their own yet, and `limit` doesn't bound the work they do. Limiting them is a separate decision, to be checked against the shop's own requests first.

Tested on 24 Nov against a throwaway MariaDB 10.11 with production's schema and strict mode, with the old code (`78f5232`) and the new side by side, and email faked:
- 92 requests that the shop or the admin panel sends, or that are within the limits, got exactly the same answers as before, emails included. Among them: the categories page's 1,000 brands out of 1,250.
- 58 crafted requests, the audit's own among them, were refused with a message that names the field or the search. None of them saved a row, sent an email or left a file. 62 more were brought within the limits.
- 120,000 random forms went through the shop's own rules and the server's. Every form the shop accepts passes the server, except contact emails of 101 to 254 characters.

<a id="2026-11-24-uploads"></a>
## 2026-11-24: each upload takes only what its form sends (live since 24 Nov)

Audit point F15, and the preview half of F12:
- The sourcing form says "PNG, JPG, or SVG", but the server refused SVG, so the whole request failed and the lead was lost. It also took PDF, video and Word files the form doesn't offer.
- Sign-up, the sourcing form and add to cart each took up to 40 files (20 MB each, 100 MB on the cart). Most were never used and never deleted, and a request cut off mid-upload left its partial file behind.
- The cart's preview picture could be any of those types, up to 100 MB. It becomes the line's `logo_image`, which orders, the admin and the approval page show as the design.

**What changed in the API.** A refused request gets `400` with one of the messages below, and nothing it sent is kept.

| Endpoint | Files it takes |
|---|---|
| `POST user/auth/register` | None. |
| `POST sourcing-requests/create` | `images`: up to 10, PNG, JPG/JPEG or SVG, 20 MB each. The whole request must also stay under about 100 MB, Cloudflare's limit. |
| `POST product/cart` | `images`: one design preview, PNG or JPG, up to 2 MB. `customization_images`: as before, up to 10 graphics in one add to cart across all options, PNG, JPG/JPEG or SVG, 100 MB each. |

- After saving, the server reads each sourcing image: an `.svg` must be a real SVG, and a `.png`, `.jpg` or `.jpeg` a real picture. A WebP, AVIF, HEIC or GIF photo saved under a `.jpg` or `.png` name is still taken, as before; a ZIP, PDF, video or web page under such a name isn't. The preview must really be a PNG or JPEG.
- A sourcing image of exactly 20 MB and a cart graphic of exactly 100 MB are now taken. They were refused before, although the messages say "or smaller".

Messages (the file's own name is shown in quotes):
- Sign-up with any file: "Sign-up doesn't take files. Remove the file and try again."
- Sourcing form:
  - another format: `"brief.pdf" can't be uploaded. Logo and reference images must be PNG, JPG or SVG files.`
  - a file that isn't what its name says: `"logo.png" isn't a real PNG or JPG file. Logo and reference images must be PNG, JPG or SVG files.` For an `.svg` name: `"logo.svg" isn't a real SVG file. Logo and reference images must be PNG, JPG or SVG files.`
  - an 11th image: "You can upload up to 10 images."
  - over 20 MB: `"IMG_2041.jpg" is over 20 MB. Logo and reference images must each be 20 MB or smaller.`
- Cart:
  - a preview that isn't a PNG or JPG: "The design preview must be a PNG or JPG picture."
  - a preview that isn't what its name says: `"customization.png" isn't a real PNG or JPG file. The design preview must be a PNG or JPG picture.`
  - a second preview: "Send only one design preview."
  - a preview over 2 MB: `"customization.png" is over 2 MB. The design preview must be 2 MB or smaller.`
  - an 11th graphic: "You can upload up to 10 graphics in one add to cart, across all options." (was "File uploads aren't accepted for this field or endpoint.")
  - a graphic of another format, a renamed one or one over 100 MB: F21's messages, unchanged.
- Sourcing form or cart, a file in any other field: "This form doesn't take that kind of file. Remove it and try again."
- Cart, only for a hand-made request padded with empty file parts: "Send one design preview and up to 10 graphics in one add to cart." The sourcing form answers such a request with "You can upload up to 10 images."

Other changes:
- An SVG sent with the sourcing form is kept as sent. Its link downloads it, like a graphic's; `<img>` shows it as usual.
- Files a request doesn't use are deleted once it's answered: a graphic sent with a supplier line, a file no option points to, and every file of a refused request, except a graphic already saved to the customer's Saved graphics and a preview already on a cart line written before the refusal. So is what was sent before the customer left mid-upload.
- A refused request is answered once the server has read the rest of it, so a big upload always gets its message instead of a cut connection.
- Unchanged: `POST graphics`, F21's rules for `customization_images`, the approval page, and every other endpoint (files are refused there, as before).

**What the shop must do: nothing.** The live site (`7590672`) and `main` (`11c00f8`) send only what's still accepted:
- sign-up sends text only (`RegisterForm.tsx:62-70`);
- the sourcing form sends at most 10 `images`, of the types it allows (`Conciergesourcingsection.tsx:24-26`, `:78-83`, `:132`);
- the customizer sends one 500×500 `customization.png` (`AddToCartModal.tsx:294-296`) or none. The largest a 500×500 canvas can make is about 1 MB;
- pre-made products send only `customization_images` (`manualCartPayload.ts:102`).

Recommended, not required:
1. **Sourcing form:** show "PNG, JPG or SVG — up to 10 images, 20 MB each" at `Conciergesourcingsection.tsx:359`, and in `handleFilesSelected` (`:74`) skip files over 20 MB with a toast, the way it already skips other formats, so one big photo doesn't stop the whole request.
2. **Pre-made products:** `IMAGE_MAX_COUNT` (5) is per option, and nothing caps the total. With three or more options that take uploads, a customer can pick 11 to 15 files, and the add to cart is refused, as it is today. Cap the total at 10 in `handleFiles` (`ManualCustomizationPage.tsx:298` on `main`, `:293` live) with "You can upload up to 10 graphics in one add to cart."

If the shop changes what it sends, it has to stay inside the table above: a bigger or different preview must still be one PNG or JPG of 2 MB at most, sign-up can't attach a file (a profile photo needs a backend change first), and the sourcing form can't offer PDF, WebP, HEIC or other formats by name.

Tested on 24 Nov against production's schema in strict SQL mode, the live code and this change side by side, 119 requests. The requests the website and the admin panel send get the same answers as before, except that the sourcing form now takes an SVG. 31 crafted requests are refused with the messages above, and no request to the three endpoints above leaves a file that nothing points to.

---

<a id="2026-11-20-paying-order"></a>
## 2026-11-20: unpaid orders and one payment at a time (live since 20 Nov)

Audit points F01 and F10:
- **F01:** a cart change removed the customer's unpaid order even while its Square payment was still going through. Cash App or Google Pay can take a moment, and a second tab can change the cart at any time. Square then took the money for an order that was gone: never confirmed, never shipped, not in My Orders, and nobody was told.
- **F10:** any old unpaid order could still be paid, failed ones included, and every "Back" and every declined card left one behind. Square and PayPal also didn't check each other, so an order could be paid twice.

The rules now, in `src/services/Common/unpaidOrders.service.js`:
- Only the order made from the cart as it is now can be paid.
- Every cart change, and every new order made at checkout, removes the customer's other unpaid orders: waiting for payment, or declined.
- An order whose payment is still going through is never removed; the change is refused instead.
- Only one payment per order can be going through at a time, by Square or PayPal.

**What changed in the API:**
- **Cart changes** (`POST product/cart`, plus, minus, typed quantity, remove, and now move to wishlist):
  - They remove all the customer's unpaid orders, including declined ones. Before, only the newest waiting order was removed, and move to wishlist removed none.
  - Refused with **409** while a payment for one of them is still going through: "Your payment for order HB-… is still going through, so your cart can't change yet. Check My Orders in a minute, then try again."
- **Square is asked first.** If the payment has already completed, the order is confirmed and the cart emptied as usual, and the change gets 409: "Your order HB-… has just been paid, and your cart was emptied. You'll find the order in My Orders." If the payment failed, the change goes through.
- **`POST order`** removes the customer's earlier unpaid orders first. While one of them is being paid it answers **409**: "Your payment for order HB-… is still going through, so a new order can't be made yet. …"
- **Paying an order that was removed.** `POST payment/square/create-payment`, `POST payment/paypal/create-order` and `POST payment/paypal/capture-order` answer **409**: "Your cart changed after this order was made, so it can't be paid. Please go back and check out again." Nothing is charged. Before, this was "Order not found" (404), or a 500 in the split second before a charge.
- **One payment at a time:**
  - PayPal create and capture answer 409 "A payment for this order is already being processed. Check My Orders in a minute." while a Square charge is still going through.
  - A card charge gets the same answer while PayPal is still reviewing a capture.
  - The capture now locks the order and records the PayPal payment, so the cart and the admin see it as in progress too.
- **A payment that still arrives for a removed order** brings the order back with its items, paid and confirmed, with an attention note for the team. This covers Square's and PayPal's webhooks; PayPal's ignored such an order before. It doesn't empty the customer's current cart or buy the label automatically.
- **Declined orders** no longer pile up in My Orders: one goes away with the next cart change or checkout.

**What the shop must do:** nothing. The shop already shows the API's message for every refused request, and checkout and the PayPal pages show it inline.

Optional: `CheckoutLayout.tsx` treats any 409 from `POST order` as "the chosen shipping option has gone" and reloads the rates. With the new "still going through" 409 it shows the message and also reloads the rates. That's harmless, but it could check the message first.

Tested on 20 Nov with the real cart, order, checkout and payment code against a throwaway MariaDB, with Square and PayPal faked. 31 checks passed, twice. The same test against the code before these changes failed 25 of them, including:
- a charge Square accepted for an order that was gone;
- PayPal taking a second payment while Cash App was still going through.

---

<a id="2026-11-20-graphic-types"></a>
## 2026-11-20: graphics are PNG, JPG or SVG only (live since 20 Nov)

Decided 20 Nov: customers' graphics can only be PNG, JPG/JPEG or SVG. ZIP, PDF, AI, EPS, PSD, WebP and every other format are refused. This replaces "any format" from [2026-11-04](#2026-11-04) (Q21). The 100 MB limit stays.

**What changed in the API**, in both places a graphic is uploaded: `POST graphics` (field `graphic`) and `POST product/cart` (field `customization_images`):
- The file name must end in .png, .jpg, .jpeg or .svg, in any case, and the type the browser reports must match or be generic. Otherwise 400: "Graphics must be PNG, JPG, JPEG or SVG files. ZIP, PDF and other files can't be uploaded."
- The server then reads the file itself. A .png, .jpg or .jpeg must really be a PNG or JPEG picture, and an .svg must really be an SVG. A renamed file is refused with 400: `"logo.png" isn't a real PNG or JPG file.` followed by the sentence above.
- A refused request saves nothing: every file in it is deleted and no cart line is added.
- A saved graphic's `mime_type` is now its real type: `image/png`, `image/jpeg` or `image/svg+xml`.
- Graphics saved before this keep working through `graphic_id`, whatever their format.
- Unchanged: the cart's preview picture (`images`, `customization.png`) and every other upload field.

**What the shop must do**, before this is deployed, so customers aren't surprised by the refusal:
1. Limit both pickers with `accept=".png,.jpg,.jpeg,.svg"`: the file input in `Productcustomizationpage.tsx:3365` and in `ManualCustomizationPage.tsx:964`.
2. Replace "Any file type" (`Productcustomizationpage.tsx:3406`, `ManualCustomizationPage.tsx:1006`) and "Any format, up to 100 MB" (`ProductAccordion.tsx:78`) with "PNG, JPG or SVG, up to 100 MB".
3. Show the API's message when an upload is refused.

Tested on 20 Nov with the real upload middleware, multer settings and error handler (auth stubbed, no database), 24 checks:
- 6 files were accepted, including an Illustrator SVG export and an SVG sent with no type.
- 11 were refused, including a ZIP and a PDF renamed to .png or .jpg, and an HTML page renamed to .svg.
- Refused requests left no files behind.

---

<a id="2026-11-13-go-live"></a>
## 2026-11-13: payments go-live (backend live since 16 Nov)

The release that lets the shop take real money. The shop's side was changed in hashtag-next in the same release (`744ba16` decoration pricing, `5d0fcff` checkout), so this section is the reference for what the API now does. A database migration runs first: `migrations/2026-11-13_payments_go_live_before_deploy.sql`.

### Statuses: one meaning everywhere

| Field | Values |
|---|---|
| `status` | `PENDING_PAYMENT` (not paid yet) · `FAILED` (the last payment attempt failed; it can still be paid) · `CONFIRMED` (paid) · `SHIPPED` (tracking: in transit) · `DELIVERED` · `CANCELLED` (by an admin). `PENDING` is an old value: show it as awaiting payment. |
| `payment_status` | `PENDING` · `SUCCESS` · `REJECTED` (last attempt failed). There's no `FAILED` or `REFUNDED`: refunds are done by hand in Square or PayPal. |
| `shipment_status` | `PENDING` (no label yet) · `LABEL_CREATED` (`SUCCESS` on older orders means the same) · `FAILED` (buying the label failed; don't alarm the shopper) · `IN_TRANSIT` · `DELIVERED` · `EXCEPTION` · `CANCELLED`. `OUT_FOR_DELIVERY` and `RETURNED` are allowed but not set today. |

### Money on an order
`total_amount` = `subtotal_amount` + `handling_amount` + `tax_amount` + `shipping_amount`. Tax is still a flat 8.25% (question 29, open) and now covers products plus the handling fee, as the old per-line tumbler charge it replaces was taxed. `pricing_breakdown` repeats them as `{ subtotal, handling, tax, shipping, total }` on `POST order`, `GET order`, `GET order/:id` and `GET payment/history`.

### The order handling fee (question 15)
The client answered: once per order. An order pays the fee once if any product in it matches the rule an admin sets on the Settings page (Order fees). Today's rule is the old one: $35, SAGE category "Tumblers", SAGE supplier 51093.
- `GET product/cart/get` → `summary` adds `handling_fee` (0 when none) and `handling_fee_label`; `grand_total` = `items_total` + `handling_fee`. Line totals never include it. Old cart lines that still carried $35 each have it taken out.
- `GET product/:id` and `GET product/guest/:id` add `order_handling_fee`: `{ amount, label }` when the product triggers the fee, else `null`.
- `POST order` stores it in `handling_amount`.

### Decoration in `POST product/cart`
- Each `customization` element carries its own `print_method`, `locations`, `colors` (screen print, 1–6) and `dtg_style` (`FRONT_REGULAR`, `OVERSIZED`, `FRONT_AND_BACK_REGULAR`, `FRONT_AND_BACK_OVERSIZED`). Colours set up with different decorations go in separate elements. Checked since [2026-11-24](#2026-11-24-print-options).
- DTG is charged per location: style price × locations × quantity (client's answer to question 8).
- Before this, the shop never sent the DTG style (DTG was charged $0) or the colour count (screen print was charged as 1 colour), and sent the last-chosen method for every colour.

### Payments
- `POST payment/square/create-payment` marks the order paid **as soon as Square completes the charge** and answers `payment_status`: `SUCCESS` (go to the confirmation), `PENDING` (poll `payment/square/payment-status`) or `REJECTED`. Declines come back as `400` with a sentence to show. `409` means already paid, a payment is already being processed, or the order was cancelled. One charge at a time per order, and a retried token never charges twice.
- `POST payment/square/payment-status` checks a still-pending charge with Square before answering `PENDING`, `SUCCESS` or `REJECTED`.
- `POST payment/paypal/capture-order` marks the order paid as soon as PayPal completes the capture, and answers `payment_status` (`SUCCESS` or `PENDING`). Refreshing the return page is safe. A PayPal order made for another order is refused.
- Google Pay and Cash App must ask for the order's real total. They asked for $1.00 before.
- Square's and PayPal's webhooks no longer trust the event: each reads the payment back from Square or PayPal (audit item C3). They're now a backup: the order is normally paid before they arrive.
- A charge that lands after an admin cancelled the order, or a second charge for a paid order, is recorded and flagged for the team. Neither revives the order nor charges twice.

### Other
- `GET order?page=&limit=` now honours paging (before, every page was page 1). Each order adds `status` and `handling_amount`.
- `GET order/:id` adds `tax_rate`, `tax_amount`, `handling_amount`, `pricing_breakdown` and `cancelled_at`.
- `PATCH order/:id` (customer cancel) answers `403` "Orders can't be cancelled online yet. Please contact us." Customer cancelling is open question 34; the old code crashed.
- PayPal's return links come from the Settings page's Website address (`FRONTEND_URL`) + `/checkout/paypal/success` and `/cancel`.

<a id="2026-11-13"></a>
## 2026-11-13: colours and sizes on product cards (live)

Live since 13 November (`630d20c`). `GET product` and `GET industry/use-case/products` add two fields to every product, for cards with colour swatches and a size range. Everything else in the answer is unchanged.

```json
{
  "id": 2486,
  "name": "A4 AirFlex Short Sleeve Tee A4N3531",
  "variants": [
    {
      "variant_id": 45699,
      "color_name": "Black",
      "color_code": "#000000",
      "image": "https://node.hashtagbillionaire.com/uploads/suppliers/sanmar/A4N3531/sanmar-2889101-variant-0.jpg"
    }
  ],
  "size_range": "XS - 4XL"
}
```

- **`variants`:** one entry per colour, in the supplier's order. Every colour is listed, so a card that shows the first few can add "+N" for the rest: OttoCap hats have up to 135, SAGE wristbands about 60.
  - `variant_id` is that colour's smallest size that has a picture. Open the product page on it to preselect the colour.
  - `image` is the colour's front picture. It's `null` when the supplier has none for that colour, which happens for about a quarter of SAGE colours: keep the product's own image then.
  - `color_code` can hold two codes for two-tone colours: `"#000000,#008000"`.
  - Only colours with something in stock are listed, as with the list's prices.
  - It's empty when there's no colour to choose: business cards, flyers, banners, and SAGE products whose only colour is "Various". Show no swatches then.
- **`size_range`:** the sizes as one text to show as it is, or `null` when there are none (hats, coasters, mugs, most promotional products). Examples: `"XS - 4XL"`, `"LT - 4XLT"`, `"XS - 4XL, LT - 4XLT"` when there are regular and tall sizes, `"OSFA"`, `"Adjustable"`, `"One Size"` (many SAGE products), `"3030 - 4832"` (waist and inseam), and for products the team adds, the size-like option: `"4\" × 6\" - 11\" × 17\""` (flyers), `"1.5\" - 4\""` (patches).

---

<a id="2026-11-12"></a>
## 2026-11-12: the category list shows only categories with products (live)

Live since 12 November (`64c340f`). For the website, `GET product-category/get-grand-categories` now leaves out every parent category with nothing to buy, and every grand category left with none. Nothing in the shop has to change: the answer has the same shape, with fewer entries. On 12 November that hides 9 of the 39 parent categories, and Office & Stationery, none of whose 3 parent categories has a product.

- **Parent categories kept:** those where `GET product?category_id=<parent id>` would list at least one product (active, not discontinued, in stock), so a customer browsing the menu never opens an empty category.
- **Grand categories:** listed only when at least one of their parent categories is kept, and `total` and `totalPages` count only those. A grand category with no parent categories isn't listed either, so the fallback in `buildFilterParams` that sends the grand category's own id as `category_id` is no longer reached from this list.
- **Order:** as before: grand categories by title, parent categories by id.
- **Timing:** the list is worked out at most once a minute, so a category that gets its first product, or loses its last, shows up or goes within about a minute.
- **Sitemap:** `app/sitemap.ts` reads this list, so empty categories leave the sitemap too.
- **Who gets everything:** requests with a valid admin token, which is the admin panel. A customer's token, or no token, gets the list above.

---

<a id="2026-11-06"></a>
## 2026-11-06: `FIXED_QUANTITY` customization pricing (live)

Live since 6 November (`a8cb702`). A new customization pricing type, **Fixed quantity** in the admin panel. Its `fixed_price` is one total for the cart line, whatever the quantity. `FIXED` (**One price** in the panel) doesn't change: its `fixed_price` is still per item. The two look the same in the API until you read `pricing_type`, so the shop has to check it everywhere it shows or adds up a customization's price.

### The rule

| `pricing_type` | `fixed_price` | Quantity 1 | Quantity 100 | Quantity 1,000 |
|---|---|---|---|---|
| `FIXED_QUANTITY` | `"100.00"`, the total | $100.00 | $100.00 | $100.00 |
| `FIXED` | `"10.00"`, per item | $10.00 | $1,000.00 | $10,000.00 |

It's charged once per cart line. Each variant is its own cart line, so a customer who orders three colours with a $100.00 value pays $300.00.

It isn't the variant `pricing_mode` called `quantity_fixed`, which has a price for each exact quantity of a product.

### What changed in the API

- **`GET customization-option/product/:productId/customizations`** can return a value of this type. It has no pricing rows, and `fixed_price` is a string, as for `FIXED`:

  ```json
  {
    "id": 4,
    "name": "Rush",
    "pricing_type": "FIXED_QUANTITY",
    "fixed_price": "100.00",
    "pricing": []
  }
  ```

- **`POST product/cart`:** nothing changes in the request. The customer's choice is sent as for any other value.
- **Cart lines and orders:** in `pricing_snapshot.customization.items[]`, a line of this type has `unit_price: null` and no `pricing_tier`, and `total` is the amount. This is a $5.00 product at quantity 3, in `GET product/cart/get`, `GET order` and `GET order/:id`, and in the answers of `PUT product/cart`, `PUT product/cart/increment` and `PUT product/cart/decrement`:

  ```json
  {
    "pricing_type": "FIXED_QUANTITY",
    "unit_price": null,
    "quantity": 3,
    "total": 100
  }
  ```

  The line's `total_price` is 115. Its `price` (`final_price_per_item`) is that total divided by the quantity and rounded, here 38.33, so it changes with the quantity and `price × quantity` can be a cent out.
- **Quantity changes:** the amount stays the same when the quantity changes. The product total and any `FIXED` or `TIERED` customization on the line move as they always have.
- **Fixed for every type:** changing the quantity of a line used to answer `400`, "Customization value … is not available for this product", when the value had been added to the product in a later save. It now works.

### What the shop must do

1. **Check `pricing_type` wherever the shop works out a customization's price,** the price preview included. For `FIXED_QUANTITY`, add `Number(fixed_price)` to the line once. Never multiply it by quantity, and keep it the same when the customer changes the quantity. `FIXED` stays `fixed_price × quantity`.
2. **Show it as a total:** "$100.00 total", never "each" or "per item".
3. **Add it once per line:** when a customer orders several variants, add it for each variant that has it.
4. **On cart, checkout and order screens, show the item's `total`.** `unit_price` is null, so don't work the amount out from it.
5. **Show the line's `total_price`,** not `price × quantity`. If the shop shows a per-item price, it falls as the quantity rises.
6. **After a quantity change, show the figures in the API's answer** instead of scaling the old ones.

Checked against hashtag-next `main` at `a1121af`: only 1 and 2 need code, in `src/components/product/customization/pricing.ts` and `src/components/product/ManualCustomizationPage.tsx`. 3 to 6 already work. The exact edits are on [Website changes: Fixed quantity pricing](https://claude.ai/artifact/UhqaZBn24PFxZ8U3ikLyEQ).

### Release order

1. **Backend:** done. Shoppers see no change until a product has a value of this type.
2. **Shop:** the changes above.
3. **Team:** add `FIXED_QUANTITY` values to real products only after the shop's release. Before it, the shop shows such a value as "N/A for N pcs" and won't add it to the cart.

To test before the release, use the product named `test` (id 105857). It costs $10.00 and has two values under Engraving: `Test`, a `FIXED_QUANTITY` value at $100.00, and `Logo Engraving`, a `FIXED` value at $5.50. At quantity 3 the line total is $130.00 with `Test` and $46.50 with `Logo Engraving`.

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

- **`POST graphics`** saves a graphic. Multipart, signed in, one file in the field `graphic`. Any format (PNG, JPG/JPEG or SVG only since [20 Nov](#2026-11-20-graphic-types)), any dimensions, up to 100 MB, stored exactly as uploaded. Uploading saves it: there's no separate save step.

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
- **Pre-made products:** `customization_images` now takes any format (PNG, JPG/JPEG or SVG only since [20 Nov](#2026-11-20-graphic-types)), up to 100 MB, and saves it to the customer's graphics. In place of `image_index`, a customization item can send `graphic_id`.

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
