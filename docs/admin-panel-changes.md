# Backend changes for the admin panel (Hashtag-Billionaire-Admin)

What each backend release changes for the admin panel, and what the panel has to do. Newest first. Paths are relative to `/api/v1`. Questions the panel raised are answered in its own `BACKEND_QUESTIONS.md`.

| Release | Backend commit | Panel action |
|---|---|---|
| [2026-11-27: clients get a password to share; clients from a CSV file; a client's orders](#2026-11-27-clients) | `56d96e1`, not deployed yet | Done in Hashtag-Billionaire-Admin `f5b0b6e` and `388ac0c` (not deployed yet): Users › Import CSV, Add User shows the password, the client page (Users › View). Deploy the backend first |
| [2026-11-27: a deleted customization's name can be used again](#2026-11-27-customization-names) | `bce1a15`, live since 27 Nov | Done in Hashtag-Billionaire-Admin `e99f2c1`, live since 27 Nov: an optional price on "Add a text or upload field". And `9e929e6`, live since 27 Nov: the Customizations page shows 100 per page |
| [2026-11-27: a customization can be added to a product without values](#2026-11-27-valueless-customizations) | `6b8dcf3`, live since 27 Nov | Done in Hashtag-Billionaire-Admin `71bf43f`, live since 27 Nov: the product's Customizations step lets you tick a customization that has no values |
| [2026-11-27: the Products list says how many the website shows](#2026-11-27-website-total) | `c393c12`, live since 27 Nov | Done in Hashtag-Billionaire-Admin `d85a7af`, live since 27 Nov: "239 products found · 238 shown on the website" and a "Not on website: out of stock" badge |
| [2026-11-26: SAGE colours come from SAGE's stock list](#2026-11-26-sage-colours) | `e204c30`, live since 26 Nov | Done in Hashtag-Billionaire-Admin `6661791`, live since 26 Nov: the SAGE product page shows the colours the import keeps, with no "No longer offered" |
| [2026-11-26: bags can be customized; decoration rows priced per location](#2026-11-26-bags) | live since 26 Nov | Done in Hashtag-Billionaire-Admin `f0d2a38`, live since 26 Nov: the Orders and Payments pages multiply DTF, screen print and DTG rows by their locations |
| [2026-11-25: print locations per garment](#2026-11-25-print-locations) | live since 25 Nov | None required |
| [2026-11-25: SAGE products are customized for free](#2026-11-25-sage-free) | `8b7b9fc`, live since 25 Nov | None required |
| [2026-11-25: a customization value's price is optional](#2026-11-25-optional-price) | `4888377`, live since 25 Nov | Done in Hashtag-Billionaire-Admin `6962059`, live since 25 Nov: the price is optional on the Customizations page |
| [2026-11-24: print options must be on the price list](#2026-11-24-print-options) | `fbc10dd`, live since 24 Nov | None required |
| [2026-11-24: page sizes on the lists the website also uses](#2026-11-24-list-limits) | `311e5ee`, live since 24 Nov | None: the panel's admin token keeps its page sizes (up to 500 today) and its whole search |
| [2026-11-24: each upload takes only its own files](#2026-11-24-uploads) | `739b58c`, live since 24 Nov | None |
| [2026-11-20: pricing templates from a CSV file](#2026-11-20-template-import) | `898c128`, live since 20 Nov | Done in Hashtag-Billionaire-Admin `c597d0d`, live since 20 Nov: Pricing Templates › Import from CSV |
| [2026-11-19: the Dashboard](#2026-11-19-dashboard) | `c1e6f1c`, live since 19 Nov | Done in Hashtag-Billionaire-Admin `5af5d20`, live since 19 Nov: the Dashboard page, and the Orders page takes its filters from the link |
| [2026-11-18: grand, parent and supplier category names](#2026-11-18-category-names) | `98cddea`, live since 18 Nov | Done in Hashtag-Billionaire-Admin `91fe6df`, live since 18 Nov: every label now says Grand / Parent / Supplier Category |
| [2026-11-17: products from a CSV file](#2026-11-17-csv-import) | `67d1c9d`, live since 17 Nov | Done in Hashtag-Billionaire-Admin `b28fa57` (the Import from CSV page), live since 17 Nov |
| [2026-11-16: the payments list pages by payment](#2026-11-16-payments) | `99bee9c`, live since 16 Nov | None needed. The Payments page can ask for one page at a time again (F30) |
| [2026-11-13: payments go-live](#2026-11-13-go-live) | `2634b76`, live since 16 Nov | Done in Hashtag-Billionaire-Admin `66757ce`, live since 16 Nov |
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

<a id="2026-11-27-clients"></a>
## 2026-11-27: clients get a password to share; clients from a CSV file; a client's orders (not deployed yet)

The client wants to add their existing clients, one at a time or from a CSV file, so their old orders can be uploaded next (a later release, from the client page). Each client gets their login details by email, or from the team by hand.

**Changed: `POST admin/user/createUser`** `{ name, email, mobile? }`
- Creates the account with a generated password and answers `201` `{ client: { id, name, email, mobile }, password, sign_in_url }`. The password follows the password rule (14 characters, no look-alike letters). It's returned this once: it's stored one-way.
- Nothing is emailed any more. It used to email a 72-hour "set your password" link (Q45); the client now wants passwords they can send.
- `mobile` is optional: a US number in any format, saved as its 10 digits, as sign-up saves it.
- `400` for a missing name, a bad email or mobile, or `x@y.com already has an account (Name).` An email whose account was deleted can be added again.
- The account counts as verified, as before, and `created_by` is the admin.

**New: `POST admin/user/sendLoginDetails/:id`** `{ password }`
- Emails the client, from support@, their email, that password and a link to the website's sign-in page. It suggests changing the password under My Account › Change Password.
- The password must be the account's current one. Otherwise `409`, and nothing is sent: it was changed since, or the account can't sign in (email not verified, blocked).
- `502` `The mail server didn't send it: …` with the mail server's reason. `503` when the website address or the mail server isn't set up (Settings).
- It has its own limit of 600 an hour, so an import of 500 can email them all.

**New: clients from a CSV file**, like the other imports: `GET admin/user/import/format`, then `POST admin/user/import/preview` and `POST admin/user/import` (multipart, field `file`, up to 2 MB).
- **Columns:** Name and Email are needed; Mobile is optional. Other headers read as these: Full name, Client name, Customer name; E-mail, Email address; Phone, Phone number, Cell. First name and Last name are joined when there's no Name column. Other columns are skipped with a warning.
- **Limit:** up to 500 clients per file. Each password takes about 50 ms to hash, and Cloudflare waits 100 s for an answer.
- **Problems, by spreadsheet row:** a missing name, a bad email or mobile, an email twice in the file, and an address at example.com (the example file's).
- **Existing accounts:** an email that already has one isn't a problem. It's listed in `already_clients` (`row, name, email, user_id, account_name, verified`) and left as it is.
- **Import:** creates every new client in one transaction, or none. `422` with the report when the file has problems; `409` when one of its emails got an account after the check.
- **Answer:** `201` `{ clients: [{ id, row, name, email, mobile, password }], already_clients, summary: { created, already_clients }, warnings, sign_in_url }`.
- **Emails:** the import sends none. The panel emails each client through `sendLoginDetails`.

**Changed: `GET order/admin`** takes `user_id`: that client's orders. Add `payment_status=ALL` for every one of them.

**Changed: `GET admin/user/getUserById?id=`** answers `404` `Client not found.` for an unknown id. It used to answer `500`.

**Done in the panel `f5b0b6e`** (and `388ac0c`, below):
- **Users:** an **Import CSV** button beside **Add User**, and a **View** button on each row.
- **Add User:** an optional Mobile field. After **Create User** the page shows the email and password with Copy buttons, plus:
  - **Email login details**;
  - **Copy for a message**: the sign-in link, email and password, ready to paste in a chat;
  - then **View client** or **Add another**.
- **Import clients from CSV** (`/users/import`):
  - Before: download the empty template or the example, read the rules and columns, then check the file. The check lists problems by row, the clients to add and those that already have an account.
  - "Email each new client their login details" is on by default.
  - After: every password with Copy, and each client's email status (Sent, or Not sent with the reason and Try again). **Copy all login details** copies everything. The passwords are shown only on that page.
- **Client page** (`/users/:id`):
  - The client's email, mobile, account status and join date, and **Set password**.
  - Their orders, with the Orders page's own list and order window. Every payment status shows at first; "No orders placed yet." when there are none.
- **Set password** (Users and the client page) can email the new password: **Email it to them**.

**With the backend before this release** (panel `388ac0c`): deploy the backend first. If the panel goes out first, nothing breaks:
- Add User falls back to the old emailed set-password link, and says so.
- The client page keeps only that client's orders (the old backend ignores `user_id`).
- The import page says the backend update is needed.

**The website:** no change. Clients sign in at `/login` with the emailed details.

<a id="2026-11-27-customization-names"></a>
## 2026-11-27: a deleted customization's name can be used again (live since 27 Nov)

Deleting a customization only hides it: old carts and orders still point at it. Until now its name stayed taken, so making one with the same name failed with "Customization option already exists", though the Customizations list didn't show it (27 Nov: "Test" on product 105889).

**Backend `bce1a15`:** only live customizations take a name.
- A name that a deleted customization has can be used again. The deleted one keeps its name, so old carts and orders still read it.
- Capitals and spaces at the end still don't count. The message is now `A customization called "Test" already exists`.
- Renaming onto another live customization's name is refused with the same message. It used to go through and leave two customizations with one name.
- Slugs stay unique, but nothing reads them. A taken slug now gets the next free one (`test-2`), and a deleted customization's slug is set aside (`test-deleted-57`). A taken slug used to fail with "Validation error": the model rebuilt the slug on every save, so a deleted customization kept its slug and a renamed one kept its old one.

**Panel `e99f2c1`:** **Add a text or upload field** takes an optional price, charged per piece (One price) or as one total (Fixed quantity).
- With a price, the field gets one value, "Yes", at that price, ticked for the product. On the website customers pick "Yes" to add the field and pay, then type or upload; the website needs no change for this.
- The price is shared by every product with the field. It's changed on the Customizations page.
- Without a price the field is free with no values, as before.
- An existing name with a price typed is refused ("… already exists with its own prices"), so a shared customization isn't changed from one product.

**Panel `9e929e6`, live since 27 Nov:** the Customizations page shows 100 per page (was 20), the most the backend sends.

<a id="2026-11-27-valueless-customizations"></a>
## 2026-11-27: a customization can be added to a product without values (live since 27 Nov)

A customization such as "Business card information" can have no values at all: the customer only types text or uploads an image. The product's Customizations step used to grey it out ("No values yet. Add them on the Customizations page.") and wouldn't save a ticked customization without a value.

**Done in the panel:** such a customization can be ticked. It reads "No values: customers type text or upload an image", saves with no value, and costs nothing extra. A customization that has values still needs at least one picked, as before.

**Also in the panel** (asked by the client; `8cd38d6`, live since 27 Nov): the product's Customizations step has **Add a text or upload field**. Type a name (e.g. "Business card information"), choose "Customer types text" and/or "Customer uploads a file", then **Add to this product**. It creates that customization (no values; it's in the Customizations library afterwards, for other products too) and ticks it for this product, so there's no need to leave the product. A name that already exists is ticked instead of created twice.

**Backend:** `POST customization-option/product/:productId/customizations` already accepted `value_ids: []`. The cart now accepts a line for such a customization with no `customization_option_value_id` (no extra charge; the text or artwork stays in the line). One that has values on the product still needs a value. The artwork approval page shows the typed text for it.

<a id="2026-11-27-website-total"></a>
## 2026-11-27: the Products list says how many the website shows (live since 27 Nov)

The panel's Products list counts every active product; the website lists only products with at least one colour or size in stock (client decision Q49). So the counts could differ with no sign why: T Shirts showed 239 in the panel and 238 on the website, the extra one being #148 Unisex Deluxe CVC Tee, whose 42 variants are all at 0.

`GET product/admin/get/all` now also returns:
- `website_total`: how many of `total` the website lists with the same filters (the same stock rule as the website's lists, `utils/stock.js`);
- `shown_on_website` on each product: false when it has nothing in stock, so the website hides it.

**Done in the panel:** the count reads "239 products found · 238 shown on the website (1 with nothing in stock)", and a hidden product carries a "Not on website: out of stock" badge under its style id. Nothing else changes: the panel still lists every product, and the website still hides the ones with nothing in stock. A hidden product comes back by itself when the supplier has stock again (supplier syncs run on the 1st).

<a id="2026-11-26-sage-colours"></a>
## 2026-11-26: SAGE colours come from SAGE's stock list (live since 26 Nov)

SAGE's colour text is cut at 1,000 characters and abbreviates long lists, so the import now takes a SAGE product's colours from SAGE's stock list (`skus`, the attribute with typeId 10), each with its own stock. What this means for the shop: [frontend-changes.md](frontend-changes.md#2026-11-26-sage-colours).

**`GET sage/product/:prodEId`** also returns `sageColors`: the colours an import or sync gives the product, built by `src/services/Common/sageColors.js`.
- `source`: `skus` (SAGE's stock list), `text` (no stock list, so the colour text) or `none` (a single "Default").
- `textCut`: true when the colour text reached SAGE's 1,000-character limit.
- `colors`: `[{ name, sageName, listedAs, status, match, stock, trackInventory }]`.
  - `name` is the shop's colour name; `sageName` is the stock list's spelling; `listedAs` is the colour text's.
  - `status`: `offered` (in SAGE's stock list), `text_only` (only the colour text names it: kept on sale with the product's total stock, as before), `text` or `default`.
  - `stock` is null when the stock isn't tracked: made to order, or no stock record.
- `dropped`: `[{ name, reason }]`, the entries not imported.
  - `cut_off`: the text's cut-off last entry.
  - `duplicate`: a colour already listed under another spelling.
  - `placeholder`: "Various" or "Unavailable" when real colours replace it.
  - `part`: a part or shape in the stock list's colour field, such as "Mylar", "Pinned Backs (C)" or "Gaming".
  - `other_item`: a colour only a stock list covering several sizes or models names (some suppliers send one list for a whole product line), so it may be another item's.

`GET sage/supplier-truth/:prodEId` lists the same colours, with `stock`, `trackInventory` and `status`.

**What changed for stored variants** (SAGE sync of 26 Nov: 567 products, 478 updated, none failed), as seen on Products, Variants and the SAGE page's Imported tab:
- **Renames:** 21 abbreviated colours are renamed in place, keeping their id ("Hot P" → "Hot Pink"). Their `sku` changes too, so a search for the old sku finds nothing. Past orders keep the old sku in `order_items.sku`.
- **New and returning colours:** about 595 new colours, and 41 removed ones come back.
- **Retirements:** 26 non-colours are retired as discontinued: cut-off "Wh", "Unavailable", repeated napkin colours.
- **Stock:** per colour. A colour SAGE reports at 0 shows "Out of stock".
- **Sync lock:** products locked by an edit on the panel (27 SAGE products) keep their colours. The sync skips them.

**Done in the panel** (`6661791`, live since 26 Nov):
- **Colour table:** the SAGE product page's "Variant Data — Color & Stock" table shows `sageColors`, in order: the colours the import keeps, then the entries it leaves out with the reason. The header counts the kept colours.
- **Spellings:** a colour shows a muted second line when SAGE spells it differently: `In colour text as "Hot P"` or `In stock list as "Blue/Grey Seg"`.
- **Labels:** "In SAGE's stock list", "Only in colour text", "Cut off — not imported", "Duplicate — not imported", "Not a colour — not imported", "Part or shape — not imported", "Other size or model — not imported". "No longer offered" is gone; it came from comparing the two lists' spellings letter for letter.
- **Older backend:** if the backend sends no `sageColors`, the table lists SAGE's stock list only and names the differently spelled text entries in one note, so no colour is listed twice.

**Known limits** (review of 26 Nov, left as they are):
- **Sizes added together:** where a stock list covers several sizes or models, a colour's stock adds up all of them.
- **Missing stock list:** if SAGE once leaves a product's stock list out, that save uses the colour text alone; the next full answer puts it back.
- **Skipped colour still expected:** a colour skipped because another product holds its sku would make the sync re-save that product every month. There are none today.

<a id="2026-11-26-bags"></a>
## 2026-11-26: bags can be customized; decoration rows priced per location (live since 26 Nov)

- Bags (the parent category Bags) take embroidery, DTF or screen print on their front (`FRONT`), at their own prices: embroidery and DTF $15 down to $5 a piece, screen print as on clothing ([frontend-changes.md](frontend-changes.md#2026-11-26-bags)). Their order items look like clothing items: `customization_config.print_method`, and `locations: [{ location: "FRONT" }]`. An embroidery row has `location: "FRONT"` and the bag price.
- `pricing_table` rows for screen print and DTG now carry `locations`: the number of locations `price_per_item` is charged for, as DTF rows always did. Drinkware rows keep `locations` as the list of codes.

**Done in the panel** (`f0d2a38`):
- The Orders page and the Payments page multiply a DTF, screen print or DTG row's `price_per_item` by its number of locations. A row without the count, from an older order, uses the line's own locations.
  - Before, a DTF line with 2 locations showed half its decoration, with a false "mismatch" caution.
  - The Orders page's decoration table shows the line's locations on these rows, and the price for all of them ("2 × $15.00" under it).
- Print methods show the same whatever their letter case: "embroidery" and "EMBROIDERY" both show "Embroidery". DTF and DTG stay in capitals; the Orders page showed them as "Dtf" and "Dtg".

**Also in this release (backend):** a new artwork approval groups the sizes of one design into one line whatever the letter case of its print method, locations or DTG style. Before, an older item saved in small letters made a separate line. Approvals made earlier keep their lines.

<a id="2026-11-25-print-locations"></a>
## 2026-11-25: print locations per garment (live since 25 Nov)

Audit point F08. The cart now refuses (400) print locations the product's garment doesn't offer: Full Front and the oversized back, hat spots on clothing and the reverse, `SLEEVE_LEFT` and `SLEEVE_RIGHT`, both back sizes, and a location twice (`SLEEVE` twice aside, until the shop offers one sleeve on T-shirts). The rules and messages: [frontend-changes.md](frontend-changes.md#2026-11-25-print-locations). For the order screens: old orders are never repriced and show as before; new items' `customization_config.locations` hold only their garment's codes, with `SLEEVE` as the only sleeve code.

**What the panel must do:** nothing.

<a id="2026-11-25-sage-free"></a>
## 2026-11-25: SAGE products are customized for free (live since 25 Nov)

Decided on 25 Nov. A SAGE order item's `pricing_snapshot` has no `pricing_table` and no customization price; the drinkware $8 back print is gone on SAGE.
- **Supplier cost:** still in `product_price` (`actual_price`, `supplier_markup`), and the tier is in `tier_quantity`.
- **Orders page:** the false cautions on SAGE items, "SAGE is priced at $0.00, confirm" and the "Decoration per item" mismatch, no longer appear on new orders.
- **Older orders** keep their snapshot as stored.

**What the panel must do:** nothing.

<a id="2026-11-25-optional-price"></a>
## 2026-11-25: a customization value's price is optional (live since 25 Nov)

Asked for on 25 Nov: a **One price** (`FIXED`) or **Fixed quantity** (`FIXED_QUANTITY`) value can be saved without a price. Left empty, it costs nothing extra: the cart and the shop count a missing price as $0, as they always have.

- **`POST customization-option/:optionId/value`** and **`PUT customization-option/customization-option-value/:id`** accept `fixed_price` left out, `null` or `""` for these two types and save `null`. On `PUT`, `null` or `""` clears a saved price and leaving it out keeps it. A price that is sent must still be 0 or more (`400` "fixed_price must be 0 or greater"). "fixed_price is required for … pricing" is gone.
- **Price by quantity** and **Set quantities** are unchanged: each of their rows still needs a price.
- **Reads** are unchanged: such a value comes back with `fixed_price: null`.

**What the panel does** (done in Hashtag-Billionaire-Admin): the price box is labelled "(optional)", an empty one saves `null` with no error, and the list and the product picker show such a value as ready, "No extra charge", so it can be attached to products.

<a id="2026-11-24-print-options"></a>
## 2026-11-24: print options must be on the price list (live since 24 Nov)

Audit points F05 and F04. The cart now refuses (400) print options that aren't on the price list instead of charging $0 for them, and charges drinkware's $8 second location on every supplier. What it means for the shop, with every message: [frontend-changes.md](frontend-changes.md#2026-11-24-print-options). For the order screens (`GET order/admin`, payments):
- Old orders are never repriced: their items show as before.
- New items never have `pricing_snapshot.inquiry_only: true` any more (embroidery on the oversized back, the one "request a quote" location, is refused before it reaches a cart), so the "Inquiry-only product" caution can only show on older orders.
- New items' `pricing_snapshot` has `print_options_checked: true`. The panel can ignore it.
- `customization_config` holds the print method, locations, colours and DTG print area as they were priced: in capitals, with `colors` only for screen print and `dtg_style` only for DTG. The shop already sends them that way.
- SAGE drinkware keeps its `pricing_table` row as it is (`type: "SAGE_DRINKWARE"`, no `price_per_item`), so the panel's "$0.00, confirm" caution and the "Decoration per item" mismatch on that row show as before.
- A drinkware product from another supplier gets a `type: "DRINKWARE"` row with the same fields plus `price_per_item` (8 with front and back, 0 with one location). The Orders page's checks add up on it, and the Payments page shows "5 × $8" for 5 pieces. The panel shows `print_method` for both rows.
- Embroidery on `SLEEVE_LEFT` and `SLEEVE_RIGHT` (the shop sends `SLEEVE` today) got a row each at the sleeve price. Refused since [print locations per garment](#2026-11-25-print-locations) (25 Nov).
- A SAGE product filed under "Apparel & Uniforms" (none today) gets the clothing rows (`EMBROIDERY`, `DTF`, `SCREEN_PRINT`, `DTG`) after its `SAGE` row.

**What the panel must do:** nothing.

<a id="2026-11-24-list-limits"></a>
## 2026-11-24: page sizes on the lists the website also uses (live since 24 Nov)

Audit point F18: the public lists now stop shoppers at 200 rows a page (1,000 for `brand/website-brands`) and search only the first 100 characters ([frontend-changes.md](frontend-changes.md#2026-11-24-forms-lists)). The panel needs no change: it sends its admin token on every request, and a valid admin token keeps its own sizes, up to 10,000 rows, and its whole search. Its biggest requests, `brand/website-brands` and `brand/ss` with `limit=500`, still get every brand.

- If the panel calls one of these lists without a valid token, as when a session has just expired, it gets at most 200 rows (1,000 brands) rather than an error. Its other calls answer `401` then, which signs the admin out.
- With the admin token, these lists now include the supplier fields shoppers never get (on products, `supplier_last_hash` and the supplier data kept in `meta`), as `get-grand-categories` already did. The panel doesn't read them.
- `GET size` now pages, 200 a page by default. The panel doesn't call it.
- The contact and sourcing forms' new checks (F16) don't change the Contact Us and Sourcing Requests pages. Rows saved from now on have trimmed text, and a contact row's subject is always one of the website's five.

<a id="2026-11-24-uploads"></a>
## 2026-11-24: each upload takes only its own files (live since 24 Nov)

Audit point F15. Each upload endpoint now takes only the fields the panel sends. A request with any other file is refused (`400`) and nothing it sent is kept.

| Endpoint | Files |
|---|---|
| `POST product/create-product` | `images`, up to 10 |
| `POST product/add-product-variants` | `variant_images`, up to 20 |
| `PUT product/manual/full`, `POST product/update` | `images` up to 10, `variant_images` up to 20 |
| `POST brand`, `POST brand/publish`, `POST brand/manual-brand`, `POST industry`, `PUT industry/:id`, `POST industry/use-case`, `PUT industry/use-case/:id`, `POST add-on/addon-product`, `PUT add-on/addon-product/:id`, `POST gallery`, `PUT gallery/:id` | one `images` |

- **Formats and size:** every image must be JPG, JPEG, PNG, WebP, AVIF or GIF with an image type, up to 20 MB, as `src/lib/uploads.ts` already checks. Videos, PDFs, audio and Word files are refused now; the panel never sends them. An image of exactly 20 MB is now taken: it was refused before, though the panel let it through.
- **Messages:**
  - `"x.pdf" can't be uploaded. Images must be JPG, PNG, WebP, AVIF or GIF files.`
  - `"photo.jpg" is over 20 MB. Images must each be 20 MB or smaller.`
  - "You can add up to 10 product images per save."
  - "You can add up to 20 variant images per save, across all variants."
  - "Send one image at a time." (gallery: "Send one image per gallery photo.")
  - "This form doesn't take that kind of file. Remove it and try again."
  - `PUT product/manual/full` and `POST product/update`, only for a hand-made request padded with empty file parts: "You can add up to 10 product images and 20 variant images per save."
- **Files nothing uses are deleted** once the request is answered: every file of a refused or failed request, and a variant image sent without a variant to take it. An image that a saved record points to stays, even when a later step of the same save is refused.
- **Unchanged:** the CSV imports, artwork approval previews, and replaced images (a brand's old logo still stays on disk).
- **Sourcing requests** can now have SVG logos. The thumbnails and the lightbox show them; opening the file's own link downloads it.

**Panel action:** none. Optional: the logo hint in `AllBrands.tsx:490` says "PNG, JPG, SVG", but the panel's picker and the API take JPG, PNG, WebP, AVIF or GIF.

<a id="2026-11-23-artwork-approval"></a>
## 2026-11-23: artwork approval (live since 24 Nov)

The panel's side is built in the same change: the **Artwork approval** page (`/orders/:id/approval`), the stamp button and badge on the Orders list, and two Dashboard counts. What the feature does and how it goes live: [deployment.md](deployment.md#artwork-approval).

**API** (all `requireAdmin`, under `order/admin/:id/approval`):

| Call | What it does |
|---|---|
| `GET` | The order, its approval (or `null` before it starts), its items to approve and the history. Before the start, the items are what the start will make: one per product and colour, with all its sizes together |
| `POST` | Start the approval |
| `POST lines/:lineId/proofs` | Add a preview: one file in `approval_proof`, PNG, JPG, JPEG or SVG, up to 20 MB |
| `DELETE files/:fileId` | Remove a preview that isn't sent yet |
| `POST lines/:lineId/copy` | Start a new version from an earlier version's images |
| `POST lines/:lineId/no-proof` | `{ no_proof: true/false }`: "No preview needed" |
| `POST send` | Email the customer from order@: the first email, an update or a reminder (20 an hour) |
| `POST hold` | The label question when the hold setting is on |
| `POST lock`, `POST unlock` | Lock for production, and undo that |
| `POST link` | Replace the customer's link, or switch it off or on |
| `POST seen` | Mark the customer's latest answers as seen |

**Elsewhere:**

- **Orders list:** each row of `GET order/admin` has `approval` (`{ status, hold_state, locked, unseen, sent }` or `null`), plus `actions.can_open_approval`.
- **Dashboard:** `GET admin/dashboard/activity` adds `approval_changes.count` (the customer rejected an item) and `approval_ready.count` (approved, waiting for the lock). Orders whose label waits for an approval are counted in `waiting_for_approval` and no longer in orders to ship.
- **Buy label:** on an order the customer is still reviewing, it needs `confirm: true`, which locks the approval.

24 Nov: the customer approves, rejects (note and pictures) or goes back to an earlier version, and can undo the last choice. The admin view's versions carry `status` (WAITING, APPROVED, REJECTED, REPLACED), `decided_at`, `went_back_to` and `note`; lines carry `last_choice`; history events carry `kind` and `newest_version`. Notes are rejections only (no `file_id`, no `after_approval`).

<a id="2026-11-20-template-import"></a>
## 2026-11-20: pricing templates from a CSV file (live since 20 Nov)

Admins can create or update many pricing templates at once from a CSV file, in either pricing style: Pricing Templates › Import from CSV (`/pricing-templates/import`). The panel's page is part of the same change. There's no migration: it saves into the `pricing_templates` table made on 12 Nov.

| Endpoint | What it does |
|---|---|
| `GET pricing-template/import/format` | The columns, each with whether it's per template or per row, which pricing style it's for, and its help text. Also the two styles, the limits, the number of templates that exist, an example file (as CSV and as rows) and an empty template. The page shows these, so the layout is defined in one place. |
| `POST pricing-template/import/preview` | Multipart: `file` (the CSV) and an optional `replace_existing` (`true`). Checks the whole file and returns a report. Saves nothing. |
| `POST pricing-template/import` | The same body. Checks the file again, then saves every template in one transaction, or none. Returns 201 with the saved templates, or 422 with the same report when the file has problems. |

The report lists each template with its style, its prices in words and whether it's new or updates an existing one. It also lists errors and warnings, sorted by spreadsheet row. Since the 20 Nov follow-up, `already_exist` names every template in the file whose name is already a template, with or without `replace_existing`, so the panel can ask about each one.

All three are admin-only. The file is read in memory: `.csv`, `.txt` or `.tsv`, up to 2 MB and 1,000 rows.

**The file:** one row per price. Rows with the same Template name, ignoring case and accents, make one template.

| Column | Needed | What to put |
|---|---|---|
| `Template name` | Yes, every row | Up to 100 characters. |
| `Pricing style` | Once per template | `Variable ranges` or `Fixed quantities` (also read: variable, ranges, tiered, fixed, quantities, packs). |
| `From`, `To`, `Price per item` | Variable ranges | One tier per row. Blank `To` on the last tier covers every larger order. The price is per item. |
| `Quantity`, `Total price` | Fixed quantities | One exact quantity per row, each listed once. The price is for the whole quantity. |

Other rules:
- **Prices** are in dollars, more than 0, with `$` and thousands separators allowed. Decimals are kept as given, with no rounding, as on the Pricing Templates page. A column called just `Price` is read as Price per item or Total price, whichever the template's style uses.
- **Tiers** can be listed in any order; they're sorted by From. Only the tier with the largest From can leave To blank, and tiers can't overlap. The same rules as the page apply, through `utils/pricing/pricingRows.js`.
- **Limits:** at most 50 rows per template.
- **Wrong-style columns:** filling a column of the other style, such as Quantity on a Variable ranges template, is a problem.
- **Existing names:** a name that's already a template (not deleted) is a problem ("“Patches” is already a template…"). With `replace_existing`, that template is updated with the file's style and prices and keeps its id, as an edit on the page does. Products that loaded it keep their own copy of its prices.
- **Warnings don't stop the import.** They cover:
  - a first tier that starts above 1;
  - a gap between tiers;
  - a last tier that has a To.

  In each case the cart refuses quantities no tier covers. Skipped columns and unreadable characters are warned about too.
- **Reading the file:** commas, semicolons or tabs. Quotes, a UTF-8 byte order mark and UTF-16 are all read.

**What gets saved** is what the Pricing Templates page saves: `name`, `pricing_mode` (`tiered` or `quantity_fixed`), the rows, and `created_by` set to the admin who imported. Two admins saving the same name at the same moment get a 409, and nothing from the file is saved.

**On the panel:**
- An **Import from CSV** button sits next to Add template.
- The page follows Import products from CSV:
  1. **Fill in the spreadsheet:** the example file, the empty template, the two styles side by side with the example's rows, the rules and every column.
  2. **Upload the file:** a drop zone. The file is checked as soon as it's chosen.
  3. **Check and import:** counts, problems by row, warnings, and each template with its prices and what happens to it ("New template" or "Updates “Patches”").
- **A name that's already a template** isn't changed unless the admin says so. The check asks, naming it: "“Patches” is already a template", with one button, "Update “Patches” with this file's prices". That checks the file again with `replace_existing`, and a "Don't update it" link undoes it. A newly chosen file never updates anything until asked. Until 20 Nov a "Templates that already exist" drop-down (Stop or Replace) did this up front; admins found it unclear.
- The parts both import pages share moved to `src/components/common/ImportBlocks.tsx` and `src/lib/csvFiles.ts`. The products page looks and works as before.

**Tested** on the commit's own code (HEAD plus this change only), against MariaDB 10.11 in strict mode with `pricing_templates` made by the 12 Nov migration. 61 checks passed:
- the example, the test file, import, a second import refused, and replace;
- 22 kinds of mistakes, each reported on its row;
- semicolons, other header names, UTF-16, accents;
- 950 rows imported in 0.2 s;
- a failure halfway, and another admin saving a name meanwhile, both leaving nothing behind;
- the HTTP routes: 401, 201, 422, a `.xlsx` file, no file, and over 2 MB.

The panel page was driven in headless Chrome against that backend: a file with mistakes, the test file, the same file again (refused, then replaced), the example (both styles), the products import page, and phone width. There were no console errors.

The 20 Nov follow-up was checked the same way:
- 61 backend checks with the new wording and `already_exist`.
- A browser run seeded like the live panel, with only "Patches". A file with new prices for Patches plus a new template, Caps:
  - the check asks about Patches by name, with no problems listed;
  - Update, then Don't update, then Update again;
  - the import gives "1 new template, 1 updated", with Patches at its new prices.

<a id="2026-11-19-dashboard"></a>
## 2026-11-19: the Dashboard (live since 19 Nov)

Five read-only endpoints for the panel's Dashboard page. All need an admin token. There's no migration: they only read existing tables.

**Rules every figure follows:**
- **A sale** is a paid order (`payment_status` SUCCESS) that isn't cancelled, counted on the day it was placed (`orders.created_at`).
- **Paid orders that were cancelled** are reported apart, as `cancelled_after_payment`, because cancelling doesn't refund.
- **Days, weeks and months** follow the store's clock, US Central (`America/Chicago`), for every viewer. Weeks start on Monday.
- **The comparison** is always the period of the same length just before the range.
- **Deleted rows** don't count.

**The range** (overview, trend, top, customers):
- `range` is one of `today`, `yesterday`, `last_7_days`, `last_30_days` (the default), `last_90_days`, `this_month`, `last_month`, `this_year`, `last_12_months`.
- Or send `from` and `to` as `YYYY-MM-DD`. Both days are included, up to 731 days. A `to` after the store's today counts as today.
- Every answer repeats the resolved `range`: `from`, `to`, `days`, `previous` {from, to}, `timezone`, and `includes_today` (today's figures are still growing).
- A bad `range`, date, interval, `by` or `sort` answers 400 with a message.

| Endpoint | Query | Answer (`data`) |
|---|---|---|
| `GET admin/dashboard/overview` | the range | `kpis`: `sales`, `orders`, `average_order_value`, `items_sold`, `customers` (buyers), `new_customers` (accounts created), each `{ value, previous, change }`; `change` is a fraction (0.25 = +25%), null when the previous period had nothing. `breakdown`: `product_sales`, `handling`, `tax`, `shipping`, `total` (they add up to `sales`), plus `shipping_labelled` and `label_cost` for the orders that have a label. `cancelled_after_payment` `{ orders, amount }`. `checkouts` `{ placed, paid, paid_rate }` for every order placed. `orders_by_status` `[{ status, orders, amount }]` (old PENDING counts as PENDING_PAYMENT). `payment_methods` `[{ method, label, orders, amount, share }]`. |
| `GET admin/dashboard/trend` | the range; `interval` = `hour`, `day`, `week` or `month` (left out: hour up to 2 days, day up to 62, week up to 210, month beyond); at most 400 points | `interval` and `buckets`: per point `label`, `from`, `to`, `sales`, `orders`, `items`, `average_order_value`, `new_customers`, `upcoming` (later today on an hourly chart), `partial` (under way now), and `previous`: the same figures for the same stretch of the previous period. |
| `GET admin/dashboard/top` | the range; `by` = `product` (default), `supplier` or `grand_category`; `sort` = `revenue` (default) or `units`; `limit` 1–50 (default 10) | `totals` `{ revenue, units }` of the order lines; `rows` `[{ id, name, units, revenue, orders, share }]`, products also with `supplier`, `supplier_label` and `image`. A product's `name` is its name today, as stored (supplier names can hold HTML entities), because an order line keeps only the variant's SKU as its name; `others`, the part beyond `limit`. Revenue is the lines' totals: products and decoration, before tax and shipping. **Grand categories:** a product counts in every grand category it's in today (supplier category › parent category › grand category, none deleted), and one in none counts under `id: null`. When a product is in several, `overlaps` is true and `others` is null. |
| `GET admin/dashboard/customers` | the range; `limit` 1–50 (default 8) | `summary`: `buyers`; `first_time` and `returning`, each `{ customers, orders, sales }`, where first-time means their first-ever sale is in the range; `returning_rate`; `registered_total`; `ordered_total`. `top`: the biggest spenders in the range, `[{ user_id, name, email, orders, spent, last_order_at, first_order_at, returning }]`. |
| `GET admin/dashboard/activity` | `limit` 1–25 (default 8). No range: these are now. | `to_ship` `{ orders, label_failed, oldest_at }`, the same rule as the Buy label button (paid, not cancelled, no label). `needs_attention` `{ orders }` with an `attention_note`. `unpaid_checkouts` `{ orders, amount, days: 7 }`. `sourcing_requests` `{ new, in_review }`. `messages` `{ new }` (Contact Us). `out_of_stock` `{ manual_products }`: Manual products the website hides because no option has stock. `recent_orders`: the latest paid orders, with `customer` `{ name, email }`, `items` and `total`. |

Answers carry `Cache-Control: no-store`. The code is in `src/services/Admin/dashboard.service.js` and `src/routes/v1/Admin/dashboard.route.js`.

**Tested** on a throwaway MariaDB 10.11 in strict mode, with 15 months of made-up data: 150 customers, 634 orders and every status. A script recomputed every figure from the raw rows in a different way, and 703 checks matched. They covered every preset; custom ranges across both daylight-saving changes; every interval; top products, suppliers and grand categories, including overlaps, a deleted grand category and a removed link; customers; activity; and the 400s. A browser walk-through on the same data had no console errors and no sideways scrolling on a phone; supplier names with entities showed decoded, and the dashboard's links opened the right order and filter on the Orders page.

**Checked on the live database** before deploying, read-only. Every report ran on the real tables for today, the last 30 days, this year and the last 12 months, and each answered in 1–20 ms. Totals matched plain SQL, and every chart interval added up to the totals. This check is how the SKU-as-name issue was found.

**In the panel** (Hashtag-Billionaire-Admin):
- **Dashboard page:** a date range with presets and a custom range, kept in the address (`?range=` or `?from=&to=`).
- **Figures:** five tiles that also pick what the chart shows.
- **Trend chart:** compared with the previous period, with a crosshair tooltip and arrow keys, plus a table view.
- **Cards:** needs your attention, where the money comes from, orders placed by status, payment methods, top products, sales by grand category or supplier, customers, and recent orders.
- **Orders page:** now reads `?status=`, `?payment_status=` and `?search=` from the link, plus `?open=` (an order number, opened once the list loads). The dashboard's links use these.
- **Status badges:** their looks moved to `src/lib/orderStatus.ts`, shared by both pages.

---

<a id="2026-11-18-category-names"></a>
## 2026-11-18: grand, parent and supplier category names (live since 18 Nov)

The team and the client now use the database names everywhere: **grand category** (the Category on the website menu), **parent category** (the group inside it) and **supplier category** (the category a product comes in with). The panel used Categories / Sub Categories / Categories before.

- The CSV import's `Sub-category` column is now `Parent category`. `Sub-category`, `Sub-categories` and `Subcategory` are still read as the same column, so older files work. Its messages say parent category too.
- API fields don't change: the import report still has `sub_categories` and `sub_category_links`.

---

<a id="2026-11-17-csv-import"></a>
## 2026-11-17: products from a CSV file (live since 17 Nov)

Admins can create many products at once from a CSV file: Products › Import CSV, or Catalog › Import from CSV in the sidebar. The panel's page is part of the same change. There's no migration: only existing tables are used.

| Endpoint | What it does |
|---|---|
| `GET product/import/format` | The columns, each with whether it's per product or per row, and its help text. Also an example file, an empty template, the pricing templates and the limits. The page shows these, so the layout is defined in one place. |
| `POST product/import/preview` | Multipart: `file` (the CSV) and an optional `default_pricing_template_id`. Checks the whole file and returns a report. Saves nothing. |
| `POST product/import` | The same body. Checks the file again, then creates every product in one transaction, or nothing. Returns 201 with the new products, or 422 with the same report when the file has problems. |

The report lists the products, options, new supplier categories and parent category links, plus errors and warnings, each with its spreadsheet row.

All three are admin-only. The file is read in memory: `.csv`, `.txt` or `.tsv`, up to 2 MB and 1,000 rows.

**The file:**
- **One row per option (variant).** Rows with the same product name, in any case, are one product. Product columns (name, description, brand, supplier category, parent category, option names and types) can be given once or repeated. Different values on two rows of one product are an error.
- **Options:** up to 3 (`Option N name`, `Option N type`, `Option N value`).
  - Types: Drop-down, Color, Buttons, Size, Checkboxes. A blank type means Color for an option named Color or Colour, Size for one named Size, and Drop-down otherwise.
  - `Color code` (#RRGGBB) belongs to the Color option.
- **Pricing:** each row needs exactly one of these:
  - `Price`: per piece, above 0;
  - `Pricing template`: a template's name, whose rows are copied in the way Load template does;
  - the default template chosen at upload.
- **Other columns:**
  - `Stock`: a whole number; blank means 0.
  - `SKU`: blank generates `MAN-<id>-001`. A given SKU must not be used by any product, deleted ones included.
  - `Case price`.
  - `Weight (lb)`: sets `admin_weight_lb`, up to 150.
- **Brand and categories:**
  - `Brand`: the name of a published brand.
  - `Supplier category`: the name of a Manual category, created if it doesn't exist. Separate several with `|`.
  - `Parent category`: must already exist. The supplier categories are placed in it, and a removed link is restored. With a parent category but no supplier category, a Manual category with the parent category's name is used. Until 18 Nov this column was called `Sub-category`; files with that header still work.
- **Reading the file:** commas, semicolons or tabs. Quotes, line breaks inside quotes, a UTF-8 byte order mark and UTF-16 are all read. Unknown columns are skipped with a warning.
- **Warnings don't stop the import.** They cover:
  - a product whose options all have stock 0, which won't show on the website;
  - a product with no parent category;
  - a name that already exists;
  - skipped columns.

**What gets saved** matches what Add Product saves:
- a MANUAL product with `meta.options`;
- one size row per option value;
- variants priced by `resolveVariantPricing`.

The products and variants share an `import_batch_id`, with a matching `import_batches` row named `CSV_PRODUCT_IMPORT <file name>`, so one import can be found later. The file carries no pictures; add them on each product's Edit page.

**Tested** against MariaDB 10.11 in strict mode:
- 59 service checks: the example file, 18 kinds of mistakes each reported on its row, semicolons, the default template, a removed link restored, and a failure halfway through leaving nothing behind;
- the HTTP routes: 401, wrong file type, over 2 MB, no file, 422 and 201;
- the panel page, in Chrome.

A 1,000-row file (500 products) imported in under a second.

**Checked on the live database** after the deploy:
- The example file checked clean: 3 products, 6 options, one new supplier category ("Tees") placed in T Shirts.
- A full import of it ran inside a transaction that was rolled back. It created the products as described, and afterwards every table count was what it was before.
- The rollback used product ids 105879 to 105881, so the next product id is higher.
- There were no pricing templates on the live site yet, so the example prices its business cards with Price.

---

<a id="2026-11-16-payments"></a>
## 2026-11-16: the payments list pages by payment (live since 16 Nov)

`GET payment/admin/all` now picks the page of payment ids first, then loads those payments with their orders and items, as `GET order/admin` does (`BACKEND_QUESTIONS.md` F30 and A4). The response is unchanged: `{ total, current_page, total_pages, payments }`.

- **Paging:** `page` and `limit` count payments. Before, they counted joined item rows: a page of 10 held as few as 2 payments, pages repeated payments, most payments never appeared, and some lost order items.
- **No upper limit:** the panel's current `limit=100000` still gets every payment in one answer, identical to today's. Once this is live, the page can ask for one page at a time again.
- **`page` and `limit`:** anything that isn't a positive whole number falls back to page 1 and 10 a page. Before, `limit=abc` or a negative limit returned an error.
- **`search`:** matches the customer's email or name and filters the payments, including payments from closed accounts. Before, any search returned an SQL error. The panel searches in the browser and doesn't send it.
- **`payment_status`:** unchanged, now with correct paging.

Tested against MariaDB 10.11 in strict mode, with 19 payments whose orders have 1 to 6 items:
- The old code showed 6 payments on page 1 of 10, and 8 of the 19 across all pages.
- The new code showed every payment once, with all of its items.

---

<a id="2026-11-13-go-live"></a>
## 2026-11-13: payments go-live (live since 16 Nov)

The panel's side was changed in the same release (`66757ce`). Run `migrations/2026-11-13_payments_go_live_before_deploy.sql` before deploying the backend.

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
