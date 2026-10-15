# Audit progress

Tracks every finding in [AUDIT_REPORT.md](AUDIT_REPORT.md) (audit of 8 October 2026, commit `268b548`) and what has been done about it. Update this file in the same commit as the fix.

**Last updated:** 16 October 2026, at commit `aba0065` (branch `fix/bug-sweep`, not yet merged into `main`).

**Status:** ✅ done · ◐ partly done · ❌ open.

**Waiting on:**
- **Payments:** held for the payments phase.
- **Client:** needs the client's answer (see `docs/client-questions.md`).
- **DB:** needs an archive-first SQL change (see `migrations/README.md`).
- **Server:** a setting on the server, not code.

## Summary

| Severity | Findings | ✅ Done | ◐ Partly | ❌ Open |
|---|---|---|---|---|
| Critical | 11 | 4 | 5 | 2 |
| High | 26 | 13 | 7 | 6 |
| Medium | 41 | 24 | 3 | 14 |
| **Total** | **78** | **41** | **15** | **22** |

Found after the audit: N1 to N3 (bottom of this file).

## Releases

| Commit | Date | What | On `main` |
|---|---|---|---|
| `bd36431` | 13 Oct | Dead code, debug logs and duplicate logic removed; archive migration for unused columns | yes |
| `335d27b` | 14 Oct | Security: admin auth, emailed links instead of OTPs, access control, rate limits, uploads | yes |
| `24de211` | 15 Oct | Uploads, imports and logs moved to a storage folder; email templates in the repo | yes |
| `f7ecf00` | 15 Oct | Missing packages added; supplier image restore script | yes |
| `127e0e3`, `247b90e`, `e2f8366` | 15 Oct | Image recovery from the shop's cache; missing-image report | yes |
| `44141b0` | 15 Oct | Bug sweep: admin panel reports and audit items needing no client input | no |
| `aba0065` | 16 Oct | Supplier pricing hidden from shoppers; SAGE stock; supplier status markers; ESLint | no |

### Deploying `fix/bug-sweep`

1. **Before pulling:** run `migrations/2026-10-16_supplier_status_markers_before_deploy.sql`. The new code needs its columns.
2. **In `.env`:**
   - Check `CENTRAL_MYSQL_PORT`; it's now actually used.
   - Set `EXPOSE_SUPPLIER_COST=true` until the shop has switched to `price_tiers`.
   - Set `TRUST_PROXY` for Cloudflare (N1).
3. **Deploy:** `git pull`, then `npm install --omit=dev`, then `pm2 restart backend --update-env`.
4. **After the shop's release:** remove `EXPOSE_SUPPLIER_COST` and restart.

Changes the shop and the admin panel need: [docs/frontend-changes.md](docs/frontend-changes.md), [docs/admin-panel-changes.md](docs/admin-panel-changes.md).

---

## Critical

| # | Finding | Status | Commit | Remaining |
|---|---|---|---|---|
| C1 | Admin API had no authentication | ◐ | `335d27b` | Three payment admin routes still public. Payments |
| C2 | Admin account takeover | ✅ | `335d27b` | Confirm `JWT_SECRET` was changed at deploy. Server |
| C3 | Payment webhooks not verified | ❌ | | Payments |
| C4 | Customer-controlled prices | ◐ | `335d27b`, `44141b0` | Shipping amount from the client (Payments); decoration options not on the price list priced at $0 (Client); minimum quantity not checked when a quantity is typed in |
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
| H12 | Hard-coded personal data | ◐ | `335d27b`, `44141b0` | Ship-from address and contact-notification inbox (Client); PayPal return URLs (Payments) |
| H13 | SAGE handling charge missing at add-to-cart | ✅ | `44141b0` | |
| H14 | Tax fixed at 8.25% | ❌ | | Client |
| H15 | Decoration priced per size | ❌ | | Client |
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
| M28 | Quantity tiers used as a total | ❌ | | Client |
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
| N2 | The repository is public and contains the audit | ❌ | Make the GitHub repository private |
| N3 | Public uploads saved before the rate limit | ✅ | `44141b0` |

## Next

1. **Payments phase:** C3, C4 (shipping), C8, C10, C11, H7, H8, H16, H17, M9, M22, M23, M36, M38, the payment parts of C1/C6/H12, and the 4 lint errors.
2. **After the client answers:** H14, H15, M28, the C4 decoration list, and the H12 addresses.
3. **Database changes (archive-first SQL):** H4 purge, M1, M2, M4, M5, M8, M14.
4. **Remaining code:** H20 (products), H22 (the rest), H26, M31, M33, M37, M16, C4 minimum quantity.
5. **Tooling:** tests and CI in the repo, `npm audit fix`, declare `moment-timezone`, set `engines` to Node 18.
