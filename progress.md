# Audit progress

Tracks every finding in [AUDIT_REPORT.md](AUDIT_REPORT.md) (audit of 8 October 2026, commit `268b548`) and what has been done about it. Update this file in the same commit as the fix.

**Last updated:** 27 October 2026, on branch `feature/client-decisions`. `fix/bug-sweep` was merged into `main` on 16 October and is live in production.

**Status:** ✅ done · ◐ partly done · ❌ open.

**Waiting on:**
- **Payments:** held for the payments phase.
- **Client:** the client answered on 26 and 27 October; what's still open is in [Client decisions](#client-decisions).
- **DB:** needs an archive-first SQL change (see `migrations/README.md`).
- **Server:** a setting on the server, not code.

## Summary

| Severity | Findings | ✅ Done | ◐ Partly | ❌ Open |
|---|---|---|---|---|
| Critical | 11 | 4 | 5 | 2 |
| High | 26 | 14 | 6 | 6 |
| Medium | 41 | 24 | 3 | 14 |
| **Total** | **78** | **42** | **14** | **22** |

Found after the audit: N1 to N3 (bottom of this file).

## Releases

| Commit | Date | What | On `main` |
|---|---|---|---|
| `bd36431` | 13 Oct | Dead code, debug logs and duplicate logic removed; archive migration for unused columns | yes |
| `335d27b` | 14 Oct | Security: admin auth, emailed links instead of OTPs, access control, rate limits, uploads | yes |
| `24de211` | 15 Oct | Uploads, imports and logs moved to a storage folder; email templates in the repo | yes |
| `f7ecf00` | 15 Oct | Missing packages added; supplier image restore script | yes |
| `127e0e3`, `247b90e`, `e2f8366` | 15 Oct | Image recovery from the shop's cache; missing-image report | yes |
| `44141b0` | 15 Oct | Bug sweep: admin panel reports and audit items needing no client input | yes |
| `aba0065` | 16 Oct | Supplier pricing hidden from shoppers; SAGE stock; supplier status markers; ESLint | yes |
| `8f53487` to `96d6432` | 26 Oct | Client decisions, first batch: markups, contact inbox, label sender and default weight, syncs on the 1st, one password rule, optional US phone, Super Admin management and set-password, unverified accounts erased, all-orders filter for the admin panel | no |

### Deploying `fix/bug-sweep`

**Status (26 Oct):** steps 1 to 3 are done; production answers with the new columns and still sends supplier cost to shoppers. Step 4 waits for the shop.

1. **Before pulling:** run `migrations/2026-10-16_supplier_status_markers_before_deploy.sql`. The new code needs its columns.
2. **In `.env`:**
   - Check `CENTRAL_MYSQL_PORT`; it's now actually used.
   - Set `EXPOSE_SUPPLIER_COST=true` until the shop has switched to `price_tiers`.
   - Set `TRUST_PROXY` for Cloudflare (N1).
3. **Deploy:** `git pull`, then `npm install --omit=dev`, then `pm2 restart backend --update-env`.
4. **After the shop's release:** remove `EXPOSE_SUPPLIER_COST` and restart.

### Deploying `feature/client-decisions` (not released)

1. **Any time:** run `migrations/2026-10-26_supplier_markups.sql`.
2. **In `.env`** (each one is required; the app won't start without it):
   - `CONTACT_INBOX=patrick@hashtagbillionaire.com`
   - `SHIP_FROM_NAME=HashtagBillionaire` (the client's spelling, Q30).
   - `SHIP_FROM_PHONE`, `SHIP_FROM_ADDRESS_LINE1`, `SHIP_FROM_CITY`, `SHIP_FROM_STATE`, `SHIP_FROM_POSTAL_CODE`: the phone and address the client confirmed, the ones hard-coded until now (`git show 11b645d:src/config/shipstation.js`).
   - Optional: `DEFAULT_PACKAGE_WEIGHT_LB` (1 when unset); the email look, `EMAIL_BRAND_NAME`, `EMAIL_LOGO_URL`, `EMAIL_BRAND_COLOR` and `EMAIL_BRAND_TEXT_COLOR` (the website's own when unset; quote the colours, see `.env.example`).
   - Leave `TURNSTILE_SECRET_KEY` empty until the shop shows the Turnstile widget (Q60); set it after the shop's release.
   - Sender name (Q59): put it in front of the address already in `EMAIL_FROM`, as `EMAIL_FROM="HashtagBillionaire <the same address>"`.
3. **Deploy:** `git pull`, then `npm install --omit=dev`, then `pm2 restart backend --update-env`.
4. **Within 15 minutes:** the account cleanup erases every account left unverified for 2 hours, including the ones hidden since 15 October, as the client asked (Q40). Take a database backup first if a copy should be kept.
5. **Tell the team:** the shop stops listing products with nothing in stock (Q49): 42 of the 1,488 listed on 27 October. Three are pre-made products with stock 0 that can't be bought today either (Chenille patch, Retractable Banners, Feather Flags); setting their stock in the admin brings them back.

Changes the shop and the admin panel need: [docs/frontend-changes.md](docs/frontend-changes.md), [docs/admin-panel-changes.md](docs/admin-panel-changes.md).

---

## Critical

| # | Finding | Status | Commit | Remaining |
|---|---|---|---|---|
| C1 | Admin API had no authentication | ◐ | `335d27b` | Three payment admin routes still public. Payments |
| C2 | Admin account takeover | ✅ | `335d27b` | Confirm `JWT_SECRET` was changed at deploy. Server |
| C3 | Payment webhooks not verified | ❌ | | Payments |
| C4 | Customer-controlled prices | ◐ | `335d27b`, `44141b0` | Shipping amount from the client (Payments); decoration options not on the price list priced at $0 (the client wants them refused, Q10); minimum quantity not checked when a quantity is typed in (Q36) |
| C5 | Image proxy fetched any URL | ✅ | `335d27b` | |
| C6 | Customer and business data exposed | ◐ | `335d27b`, `aba0065` | Supplier cost now hidden from shoppers. The payment admin list is still public (C1). Payments |
| C7 | Unauthenticated destructive operations | ✅ | `335d27b`, `44141b0` | |
| C8 | Customers could change others' data | ◐ | `335d27b` | Customers can buy shipping labels for their own unpaid orders. Payments |
| C9 | Repo couldn't start | ✅ | `24de211`, `f7ecf00` | |
| C10 | Order cancellation always fails | ❌ | | Payments |
| C11 | PayPal payments not recordable | ◐ | | The production database already accepts PAYPAL; the code's types don't. Payments |

## High

| # | Finding | Status | Commit | Remaining |
|---|---|---|---|---|
| H1 | Rate limiter never ran | ◐ | `335d27b` | Counts per Cloudflare server until `TRUST_PROXY` is set (N1). Server |
| H2 | Production ran as development | ✅ | `335d27b` | |
| H3 | Uploads everywhere, unlimited | ✅ | `335d27b`, `44141b0` | `.ai` artwork is checked by extension only |
| H4 | Token and password hash in addresses | ◐ | `335d27b` | Old rows still hold request bodies; purge needs SQL. DB |
| H5 | Weak customer password reset | ✅ | `335d27b` | |
| H6 | Login leaked account state | ✅ | `335d27b` | |
| H7 | Payment flow integrity | ❌ | | Payments |
| H8 | Orders, shipments, refunds out of step | ❌ | | Payments |
| H9 | Admin product endpoints failed | ✅ | `44141b0` | |
| H10 | Undefined names | ◐ | `335d27b`, `44141b0` | 4 left, all in payment code (`npm run lint`). Payments |
| H11 | Error handler closed connections | ✅ | `335d27b` | |
| H12 | Hard-coded personal data | ◐ | `335d27b`, `44141b0` | Contact inbox moved to `CONTACT_INBOX` (Q58) and the sender to `SHIP_FROM_*` (Q30). Left: PayPal return URLs (Payments) |
| H13 | SAGE handling charge missing at add-to-cart | ✅ | `44141b0` | |
| H14 | Tax fixed at 8.25% | ✅ | | The client keeps a flat 8.25% on products, not shipping (Q29), which is what the code does |
| H15 | Decoration priced per size | ❌ | | The client chose per product, artwork and print method (Q1) |
| H16 | Label purchase rewrites the total | ❌ | | Payments |
| H17 | Shipping webhook substring matching | ❌ | | Payments |
| H18 | Token lifetime misread | ✅ | `335d27b` | |
| H19 | Raw SQL in token saving | ✅ | `335d27b` | |
| H20 | Request bodies written into models | ◐ | `335d27b`, `44141b0` | Addresses, brands, industries, use cases and sizes done; product create and update open |
| H21 | Mail server usable for spam | ✅ | `335d27b`, `24de211` | |
| H22 | Supplier syncs corrupt data | ◐ | `aba0065` | Done: SAGE stock, SAGE colours retired (not erased), restores and status markers for all suppliers, monthly SAGE change check. Open: SanMar/S&S/OttoCap SKUs the supplier drops aren't deactivated; brand slug collisions across suppliers; failed imports clean up by batch id; OttoCap category 1461 hard-coded; OttoCap weight and quantity columns; SanMar image rows hit a unique key (logged, non-fatal) |
| H23 | Carrier sync couldn't work | ✅ | `44141b0` | |
| H24 | Every address validated as US | ✅ | `44141b0` | |
| H25 | Auth needed fragile headers | ✅ | `335d27b` | |
| H26 | Public endpoints easy to overload | ◐ | `335d27b` | Catalog filters and search unchanged |

## Medium

| # | Finding | Status | Commit | Remaining |
|---|---|---|---|---|
| M1 | Product image unique index never existed | ◐ | `bd36431` | Broken definition removed; decide whether the index is wanted. DB |
| M2 | Index on a TEXT column / missing column | ❌ | | DB |
| M3 | Email templates downloadable | ✅ | `24de211` | |
| M4 | Use-case overrides have no unique key | ❌ | | DB |
| M5 | No unique email on users or admins | ❌ | | DB |
| M6 | OTP expiry reset on every save | ✅ | `335d27b` | OTPs removed |
| M7 | Database port ignored | ✅ | `44141b0` | |
| M8 | Money stored as DOUBLE/FLOAT | ❌ | | DB |
| M9 | REFUNDED missing from status ENUMs | ❌ | | Payments, DB |
| M10 | `npm run migrate` altered the schema blindly | ✅ | `44141b0` | Script removed |
| M11 | Role middleware checked the wrong id | ✅ | `335d27b` | |
| M12 | Three CORS layers | ✅ | `44141b0` | |
| M13 | No crash handlers | ✅ | `44141b0` | |
| M14 | Import batch status and notes not in schema | ❌ | | DB |
| M15 | Cron jobs in the web process | ✅ | `bd36431`, `44141b0` | |
| M16 | Secrets and personal data in logs | ◐ | `bd36431` | 257 `console` calls not yet on the logger |
| M17 | Bad tokens returned 500 | ✅ | `335d27b` | |
| M18 | JWT algorithm option misspelled | ✅ | `335d27b` | |
| M19 | Weak generated passwords emailed | ✅ | `335d27b` | |
| M20 | Admin OTP check sent two responses | ✅ | `335d27b` | |
| M21 | Stripe webhook never answered | ✅ | `bd36431` | Stripe removed |
| M22 | Daily payment total joins strings | ❌ | | Payments |
| M23 | Payment lists return missing fields | ❌ | | Payments |
| M24 | Admin order list pages short | ✅ | `44141b0` | |
| M25 | Country by id ignored the id | ✅ | `44141b0` | |
| M26 | Size update ignored the URL id | ✅ | `44141b0` | |
| M27 | Grand category brand filter unreachable | ✅ | `44141b0` | |
| M28 | Quantity tiers used as a total | ❌ | | The client chose per product, artwork and print method (Q1) |
| M29 | SAGE tiers misaligned | ✅ | `44141b0` | |
| M30 | 0% markup read as unset | ✅ | `44141b0` | |
| M31 | Multi-step product writes without a transaction | ❌ | | |
| M32 | Deleted products vanish from order history | ✅ | `44141b0` | |
| M33 | Brand slugs change on every save | ❌ | | |
| M34 | Image downloader paths | ◐ | `24de211`, `44141b0` | Changed supplier images aren't re-downloaded |
| M35 | Account emails sent without checking delivery | ✅ | `335d27b` | |
| M36 | ShipStation errors swallowed | ❌ | | Payments |
| M37 | Raw supplier data grows on every sync | ❌ | | |
| M38 | Order numbers can collide | ❌ | | Payments |
| M39 | One bad JSON row breaks a list | ✅ | `44141b0` | |
| M40 | Timezone set after the app loads | ✅ | `44141b0` | |
| M41 | Backup script leaked the DB password | ✅ | `bd36431` | Script removed |

## Low, dead code, dependencies

| Item | Status | Notes |
|---|---|---|
| Dead files and unused functions | ✅ | `2aa61f1`, `bd36431` |
| Unused packages | ✅ | `bd36431` |
| Missing packages | ✅ | `f7ecf00` |
| ESLint in the repo | ✅ | `aba0065`: `npm run lint` (4 known errors, all in payment code) |
| Tests in the repo | ❌ | A 46-test integration suite exists outside the repo; add it with CI |
| Known vulnerable packages | ◐ | 24 left (54 at audit). `npm audit fix` not run yet; nodemailer and node-cron need major upgrades; xlsx has no fix |
| `moment-timezone` used but not declared | ❌ | Works only because Sequelize loads it |
| `engines` says Node 16 | ❌ | The code needs Node 18 or later |
| Typos, leftover roles, `sortSizes`, `decodeHtmlEntities` | ◐ | `sortSizes` fixed in `44141b0`; others open |

## Found after the audit

| # | Finding | Status | Remaining |
|---|---|---|---|
| N1 | Rate limits count per Cloudflare server, not per visitor | ❌ | Set `TRUST_PROXY` to `loopback` plus Cloudflare's ranges (see `.env.example`). Server |
| N2 | The repository is public and contains the audit | ❌ | Make the GitHub repository private. Still public on 26 October, as are hashtag-next and the admin panel |
| N3 | Public uploads saved before the rate limit | ✅ | `44141b0` |

## Client decisions

The client answered on 26 October and answered the follow-ups on 27 October; the questions are in `docs/client-questions.md` and Q numbers are theirs. This is the backend side. The shop's side is in [docs/frontend-changes.md](docs/frontend-changes.md#client-decisions), the admin panel's in [docs/admin-panel-changes.md](docs/admin-panel-changes.md#client-decisions).

| Q | Decision | Backend work | Status | Commit | Waiting on |
|---|---|---|---|---|---|
| 1, 2 | Fees, tiers and minimums per product, artwork and print method: the same artwork and method at two locations count together (50 chests + 30 backs = the 80-piece tier); one digitizing fee per artwork | Group cart lines by product, artwork and method; reprice the group when a line changes | ❌ | | |
| 3 | No setup fee for screen print, DTF or DTG; $20 once per artwork that isn't vector, for every method | Detect raster artwork and add the fee once per artwork | ❌ | | |
| 4, 5, 10 | Price tables are correct and editable in the admin; choices outside them are refused; hoodie Full Front and Full Back embroidery stay "contact us" | Tables in the database, admin endpoints, public read endpoint; refuse what isn't in them (C4) | ❌ | | |
| 6, 7, 9, 14, 15, 17, 22 | Keep as they are: Full Front off on T-shirts and polos, every method on every apparel product, one screen-print colour count for all locations, drinkware's $8 second location, the $35 handling charge, print products, grey mockups | None. Above 6 colours is refused with Q10 | ✅ | | |
| 8 | "Not sure what you mean" | | ❌ | | Client: the reworded DTG question |
| 11 | Markups: SAGE 49.25%; SanMar, S&S and OttoCap 66.67% | Set the rates (`migrations/2026-10-26_supplier_markups.sql`); 49.25% as the SAGE fallback | ✅ | `1693774` | |
| 12 | No setup charge for SAGE products | None: none is imported or charged; the shop removes its unused line | ✅ | | |
| 16 | The team sets the fallback minimum for promo products in the admin (the shop uses 100 today) | A setting with admin endpoints; each product's minimum in the API, checked in the cart | ❌ | | |
| 18 | Hide supplier cost from shoppers | Built in `aba0065`; remove `EXPOSE_SUPPLIER_COST` after the shop's release | ◐ | `aba0065` | Shop |
| 19, 20 | Original artwork files ("cdi" means CDR); artwork, size and colours can differ per location | One decoration per location on cart and order items; download in the admin | ❌ | | Client: reconfirm CDR |
| 21 | AI, PDF, EPS, JPG, SVG, PSD and PNG; 100 MB per file | Upload rules per field | ❌ | | |
| 23 | The team manages the fonts in the admin: "n number of fonts and other settings" | Font list with admin endpoints and a public list | ❌ | | Client: which other settings |
| 24, 25 | Size and colour must be chosen, with no admin flag; the customer picks the add-on quantity | None: every cart line already needs a variant, and the add-on quantity is already free | ✅ | | |
| 27, 28 | The team buys labels in ShipStation; the customer pays the quoted rate | C8, H8, H16 | ❌ | | Payments |
| 29 | A flat 8.25% on products, not on shipping | None: that's what the code does (H14) | ✅ | | |
| 30 | Ship-from: "HashtagBillionaire", at the same address and phone | Sender moved from the code to `SHIP_FROM_*` in `.env` (H12) | ✅ | `ea702b5` | |
| 31 | Default 1 lb; supplier weights; admins can set a weight | Done: default 1 lb (`DEFAULT_PACKAGE_WEIGHT_LB`, was 0.5). Open: weight on admin edits; OttoCap weight (H22) | ◐ | `ea702b5` | |
| 32 | US mainland only: the 48 contiguous states and DC; not Alaska, Hawaii, Puerto Rico, the territories or APO/FPO | `src/config/shippingRegions.js` lists the 49. The US state list offers only those; saving or moving an address elsewhere, shipping rates and order creation answer 400, including an address ShipStation matches to a military code; saved addresses carry `shippable` | ✅ | | |
| 34 | Cancel within 2 hours; refunds by hand in 5–7 days | C10, M9; mark the order for a manual refund | ❌ | | Payments |
| 35 | Keep the unpaid-order flow | H8 only | ❌ | | Payments |
| 36 | Quantities editable in the cart; "−" stops at the minimum | Refuse quantities below the minimum on every change | ❌ | | |
| 37 | Card, Google Pay, Cash App, PayPal and Apple Pay, on current APIs | C11, Apple Pay, upgrades | ❌ | | Payments |
| 38 | Every order email for customers, a confirmation page, and a new-order email to patrick@hashtagbillionaire.com | Order emails, once payment notices are verified (C3) so a forged one can't send them | ❌ | | Payments |
| 39 | Tracking for signed-in customers; the admin picks ShipStation or manual updates | Tracking mode per order; manual status endpoint | ❌ | | Payments |
| 40 | Erase unverified accounts completely, past ones too | The 2-hour cleanup erases the account with its profile, photo, tokens, cart, wishlist and addresses, including the accounts the old job only hid | ✅ | `ddb990d` | |
| 42 | The shop's password rule everywhere | `validatePassword` checks the shop's rule (8 to 128 characters, an uppercase letter, a number, a special character) wherever a customer or admin sets a password; one message for all of them; `password-validator` removed | ✅ | `16cca53` | |
| 43 | Phone optional at sign-up, US only | Sign-up takes no phone, or a US number (formatting and +1 allowed), stored as 10 digits | ✅ | `60a9d7a` | |
| 44 | Every admin has full access; Super Admins can add Super Admins | A Super Admin can create or promote Super Admins and delete other Super Admins; nobody can change their own role or delete themselves | ✅ | `9f41993` | |
| 45 | Admins can set a password to share; viewing isn't possible, and the client agreed | `PUT admin/user/setPassword/:id` (any admin) and `PUT admin/auth/setAdminPassword/:id` (Super Admin); the account's sessions and emailed links stop working | ✅ | `9f41993` | |
| 46 | A closed account is kept 30 days, restored by signing in, then deleted; orders and payments keep the name and contact details, for accounting | Closing marks the account as closed by its owner (`deleted_by` = its own id) and signs it out; signing in within `CLOSED_ACCOUNT_DAYS` (30) restores it; after that the account cleanup erases it, or, when it has orders or payments, keeps only the email, profile name and phone, and the addresses orders shipped to, and clears the password. The admin order and payment lists show closed customers | ✅ | | |
| 47 | Identical prices for guests and signed-in customers; SAGE cards show the lowest tier price | One pricing path; lowest price in the product list | ❌ | | |
| 48 | Zero stock can't be ordered | Built in `aba0065` | ✅ | `aba0065` | |
| 49 | No stock number shown to shoppers; out-of-stock products aren't shown; a cart item that runs out shows as out of stock | The shop's product lists leave out products without a variant in stock (`src/utils/stock.js`; stock a supplier doesn't report counts as in stock), and price and filter them on variants in stock. Cart and wishlist lines say `AVAILABLE`, `OUT_OF_STOCK` or `NOT_ENOUGH_STOCK` without a number, and no message gives a count. Product pages still send `stock`, which the shop uses to cap quantities | ✅ | | |
| 51 | All supplier syncs on the 1st | One cron at 2 AM New York time on the 1st runs SAGE, SanMar, S&S and OttoCap one after another (were the 5th, 10th, 15th and 25th) | ✅ | `0bd4ccd` | |
| 56 | The team manages the gallery in the admin | Gallery table, admin endpoints, public list | ❌ | | |
| 58 | patrick@hashtagbillionaire.com everywhere | Contact-form messages and new sourcing requests are emailed to `CONTACT_INBOX` (sourcing requests notified no one before) | ✅ | `e691cce` | |
| 59, 62 | Account emails with the website's logo, colours and name, set in `.env`; the site and admin addresses are already there | Every email has the website's header logo, its yellow on buttons and the name HashtagBillionaire, with the site and `CONTACT_INBOX` in the footer. `EMAIL_BRAND_NAME`, `EMAIL_LOGO_URL`, `EMAIL_BRAND_COLOR` and `EMAIL_BRAND_TEXT_COLOR` change them | ✅ | | |
| 60 | Cloudflare Turnstile on the contact and sourcing forms, not a CAPTCHA | `POST contactUs` and `POST sourcing-requests/create` check the token with Cloudflare (`src/middlewares/turnstile.js`) once `TURNSTILE_SECRET_KEY` is set; until then they work as before | ✅ | | Client: a Turnstile widget in their Cloudflare account; then the shop's widget, then the key |

Parked by the client, with no backend work for now: Q26 (pre-made products from suppliers), Q50, Q54, Q57 and Q61 (policy pages, admin editing).

## Next

1. **Payments phase:** C3, C4 (shipping), C8, C10, C11, H7, H8, H16, H17, M9, M22, M23, M36, M38, the payment parts of C1/C6/H12, and the 4 lint errors.
2. **Client decisions:** the rows above that wait on nothing.
3. **Database changes (archive-first SQL):** H4 purge, M1, M2, M4, M5, M8, M14.
4. **Remaining code:** H20 (products), H22 (the rest), H26, M31, M33, M37, M16, C4 minimum quantity.
5. **Tooling:** tests and CI in the repo, `npm audit fix`, declare `moment-timezone`, set `engines` to Node 18.
