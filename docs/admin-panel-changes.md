# Backend changes for the admin panel (Hashtag-Billionaire-Admin)

What each backend release changes for the admin panel, and what the panel has to do. Newest first. Paths are relative to `/api/v1`. Questions the panel raised are answered in its own `BACKEND_QUESTIONS.md`.

| Release | Backend commit | Panel action |
|---|---|---|
| [2026-10-26: client decisions, first backend changes](#2026-10-26) | branch `feature/client-decisions`, not released | Read the notes; Q31, Q42, Q44, Q45 and Q56 in the to-do list |
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

### With the next backend release

These need the backend changes on branch `feature/client-decisions`, listed under [2026-10-26](#2026-10-26) once it is released.

| Q | Decision | What the panel does |
|---|---|---|
| 42 | One password rule everywhere: 8+ characters with an uppercase letter, a number and a special character | Update the form check, which mirrors the old backend rule (2 digits, no spaces). |
| 44 | Every admin has full access; Super Admins can add more Super Admins | Offer the Super Admin role when a Super Admin creates or edits an admin, and allow deleting another Super Admin (never yourself or the last one). |
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

<a id="2026-10-26"></a>
## 2026-10-26: client decisions, first backend changes (not released)

On branch `feature/client-decisions`. This section grows with each change until the branch is released.

- **Markups** (Q11): once `migrations/2026-10-26_supplier_markups.sql` has run, `GET product/pricing/markup` lists SAGE at 49.25% and SANMAR, SS and OTTOCAP at 66.67%. Any of the four rows that didn't exist is created, so each one can be edited from the Pricing page.
- **Supplier syncs** (Q51): all four run on the 1st of each month at 2 AM New York time, one after another, instead of the 5th, 10th, 15th and 25th. The SAGE stock change from [2026-10-16](#2026-10-16) lands on the first 1st after this release.
- **Password rule** (Q42): the reset and set-password page and `POST admin/auth/change-password` now check: 8 to 128 characters, with an uppercase letter, a number and a special character (anything that isn't a letter or a digit, so a space counts). It replaces "8 to 100 characters, 2 digits, no spaces, not `Passw0rd` or `Password123`", which the panel's form mirrors today. A password that fails gets `400` with *"Password must be 8 to 128 characters long and include an uppercase letter, a number and a special character."* Existing passwords keep working.
- **Super Admins** (Q44): `POST admin/auth/register` and `PUT admin/auth/updateAdmin/:id` accept the Super Admin role (until now they answered `403`), and `POST admin/auth/deleteAdmin` can delete another Super Admin. Still refused with `400`: changing your own role and deleting yourself, so the Super Admin doing it always remains. These routes stay Super Admin only.
- **Set a password** (Q45). Both take `{ password, confirm_password }` and the password rule above:
  - `PUT admin/user/setPassword/:id`, any admin: a customer's password. The customer is signed out everywhere, and any emailed reset or set-password link stops working. A customer who hasn't verified their email yet still has to.
  - `PUT admin/auth/setAdminPassword/:id`, Super Admin only: another admin's password. Their sessions end (`401`, then they sign in with the new password). For your own password use `change-password`; this one answers `400`.
  - `200` on success, `400` for the rule or a mismatch, `404` for an unknown or deleted account. The password isn't returned or emailed, so show the admin what they typed (or generated) before sending, for them to share.
- **Closed customer accounts** (Q46): a customer who closes their account can restore it by signing in within 30 days; after that it's deleted, but its orders and payments stay. `GET order/admin` and the payments list now show the email and name on those orders and payments (until now they came back without a customer). Closed accounts stay out of the customer list, as before.
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
