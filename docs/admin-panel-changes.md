# Backend changes for the admin panel (Hashtag-Billionaire-Admin)

What each backend release changes for the admin panel, and what the panel has to do. Newest first. Paths are relative to `/api/v1`. Questions the panel raised are answered in its own `BACKEND_QUESTIONS.md`.

| Release | Backend commit | Panel action |
|---|---|---|
| [2026-10-16: status markers, SAGE stock, supplier pricing](#2026-10-16) | `aba0065` | **Recommended**: show variant status, add a status filter |
| [2026-10-15: bug sweep](#2026-10-15) | `44141b0` | Optional: new endpoints and fields |
| [2026-10-14: security release](#2026-10-14) | `335d27b` | Done |

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
