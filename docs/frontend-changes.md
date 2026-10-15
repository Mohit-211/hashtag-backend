# Backend changes for the customer website (hashtag-next)

What each backend release changes for the shop, and what the shop has to do. Newest first. Paths are relative to `/api/v1`.

| Release | Backend commit | Shop action |
|---|---|---|
| [2026-10-16: supplier pricing removed, status markers, SAGE stock](#2026-10-16) | `aba0065` | **Required**: switch SAGE pricing to `price_tiers` |
| [2026-10-15: bug sweep](#2026-10-15) | `44141b0` | None required; read the notes |
| [2026-10-14: security release](#2026-10-14) | `335d27b` | Done (hashtag-next `7b3f110`) |

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
