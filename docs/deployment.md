# Deploying the backend

Every push to `main` goes live on the production server (`/var/www/backend`, PM2 app `backend`) a minute or two later. There's no `git pull` on the server any more.

## What a push does

1. **Check.** GitHub Actions ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) installs the packages and runs `npm run lint`. A lint error stops here: nothing reaches the server.
2. **Deploy.** Actions connects to the server over SSH with a deploy key that can only run [scripts/deploy.sh](../scripts/deploy.sh). The script:
   - stops, changing nothing, if files on the server differ from git or the push adds database migrations (see below);
   - moves the checkout forward to the pushed commit;
   - runs `npm install --omit=dev` if `package.json` or `package-lock.json` changed;
   - restarts the app with `pm2 restart backend`, unless only docs, migrations or deploy files changed;
   - waits up to a minute for `GET /api/healthcheck`. If the app doesn't answer, it puts the previous commit back, restarts that, and fails the run.

The run's log in the repository's **Actions** tab says which of these happened. The restart takes the API down for a few seconds, as the manual deploys did. A push made during a deploy waits for it.

A deploy never touches `.env`. When new code needs a new `.env` value, add it on the server before pushing: if a required one is missing the app won't start, and the deploy rolls back.

## When a deploy stops

| The run says | What to do |
|---|---|
| Lint failed | Fix the error and push again. |
| "files on the server differ from git" | Someone edited or uploaded a file on the server. Commit that change from your machine, or discard it on the server (`git checkout -- <file>`). Then **Actions → Deploy → Run workflow**. |
| "adds or changes the database migrations" | Back up, then run the `before deploy` migrations by hand ([migrations/README.md](../migrations/README.md)). Then **Actions → Deploy → Run workflow** with **migrations done** ticked, or on the server, as root, `bash scripts/deploy.sh <full commit id> --migrations-done`. Run any `after deploy` migrations once it's live. Until then, every later push stops the same way. |
| "npm install failed" | The code is back on the previous commit and the app wasn't restarted. Fix `package.json` or the lockfile and push again. If it adds "don't restart it", run `npm install --omit=dev` in `/var/www/backend` first. |
| "failed and was rolled back" | The new code didn't start; the site runs the previous commit. `pm2 logs backend` on the server shows why. Fix and push again. |
| "doesn't answer after going back" | The site is down. Check `pm2 logs backend` on the server now. |

## ShipStation

The backend uses ShipStation API V2 and nothing else: rates, orders, labels and tracking all go through it. The V1 key and secret on the same settings page aren't needed, because V1 is deprecated. The standalone API portal (`api-portal.shipstation.com`) is a separate product whose keys aren't for this: its accounts don't use the web app, which is where orders have to show.

**Setting it up:**

1. In ShipStation, connect the carriers and fund the balance of any that need it. Without funds, labels fail after payment.
2. Go to **Settings, Account, API Settings**, choose **V2 API** and click **Generate API Key**. It's shown once, and an account has one V2 key. API access depends on the ShipStation plan: if the page doesn't offer it, the plan doesn't include it.
3. Save the key on the admin panel's Settings page, under Shipping, with the sender's details.
4. On the server, run `npm run shipstation:setup` in `/var/www/backend`.

Step 4 loads that account's carriers, registers the tracking webhook and prints sample rates. It creates no orders and buys no labels. Run it again after changing the key or the connected carriers: carrier ids belong to the account, so after a new key the old ones can stop rates, and with them checkout.

**Testing:** a key from the web app has no sandbox, so every paid test order buys a real label. While Square and PayPal are in sandbox, switch off **Buy shipping labels automatically** on the Settings page (Shipping): paid orders then wait, and an admin buys a label only when one is wanted. If one is bought by mistake, void it in ShipStation straight after.

**Funds:** ShipStation's own carrier accounts (UPS, USPS, FedEx One Balance, DHL Express, SEKO) share one prepaid balance. Turn on auto-funding in ShipStation, sized for the dearest service the shop offers (UPS Next Day Air was about $69 for one small parcel in November), or labels fail with "Insufficient funds".

**When a label fails:** the payment stands and the order stays paid. The reason is on the order in the admin panel, and the panel can try again.

## An order's shipping address

Live since 24 November 2026 (audit F02, `6c6ec41`). `POST order` copies the saved address it prices the shipping for onto the order (`orders.ship_to_*`). The label, the order's pages and its emails use that copy, so editing or deleting a saved address on the Account page changes only later orders.

**Going live, in this order:**

1. **Back up** the database ([migrations/README.md](../migrations/README.md); `--max-allowed-packet=1G`).
2. **Migration, first run,** right before the push: `migrations/2026-11-24_order_ship_to_before_deploy.sql`. It adds the columns and gives each existing order a copy of its saved address. From now until step 4 is done, nobody presses Buy label: the old code still sends labels to the saved address.
3. **Push.** The deploy stops at the migration check: then **Actions → Deploy → Run workflow** with **migrations done** ticked ([above](#when-a-deploy-stops)).
4. **Migration, second run,** as soon as the run is green: the same file again. It copies the addresses of the orders the old code made in the meantime. `without_ship_to` should then be 0, unless an order's saved address row is gone.
5. **Labels:** only if the second run prints `labelled_address_changed` above 0, compare those orders with their labels in ShipStation (the query is in the file's header) and correct `ship_to_*` where they differ.

**Changing the address of a paid order.** The website's Shipping & Returns page tells customers to contact support to change their address before the order ships. The admin panel can't change an order's address yet: that's waiting on a decision. Until then, a developer changes it on the server, only for an order with no label that isn't cancelled:

```sql
UPDATE orders SET ship_to_name = ?, ship_to_phone = ?, ship_to_address_line1 = ?,
  ship_to_address_line2 = ?, ship_to_city = ?, ship_to_state = ?, ship_to_postal_code = ?,
  ship_to_country = 'US'
WHERE id = ? AND label_id IS NULL AND shipment_id IS NULL AND status <> 'CANCELLED';
```

- `ship_to_state` is the two-letter code of one of the 48 contiguous states or DC: the shop ships nowhere else.
- The customer paid for shipping to the old address. If the new one costs more, the shop pays the difference.
- If the order has a `shipment_id`, an earlier label attempt failed and the order is already in ShipStation, where **Try again** buys its label, to the address there. Change the address in ShipStation too, then run the UPDATE without `AND shipment_id IS NULL`.
- An unpaid order needs none of this: the customer checks out again with the other address.

## Taking real payments

Square and PayPal start in sandbox. To take real money, all of these on the same day:

1. **Square** (Settings page, Payments): mode `production`, with the production application ID, location ID and access token from the Square Developer Dashboard. On that production app, add a webhook subscription for `payment.created` and `payment.updated` to `https://node.hashtagbillionaire.com/api/v1/payment/webhook/square`. Customers' saved Square customer ids from sandbox are replaced by themselves on their next payment.
2. **PayPal** (Settings page, Payments): mode `production`, with the live client ID and secret. On the live PayPal app, add a webhook for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` and `PAYMENT.CAPTURE.DECLINED` to `https://node.hashtagbillionaire.com/api/v1/payment/paypal/webhook`.
3. **ShipStation**: balance funded and auto-funding on, then **Buy shipping labels automatically** on, if labels should be bought at payment. Leave it off to buy each label from the order page when the order is ready to ship.
4. **Website address** (Settings page, Website and links) is the live shop. PayPal sends customers back to it.
5. One real order end to end with each method: a card, Google Pay, PayPal, and Cash App from a US phone. Then refund them in Square and PayPal, and cancel the orders in the admin panel.

Both webhooks read every event back from Square or PayPal before acting, so neither needs a signing key. They're a backup: the order is marked paid when the charge or capture completes.

## Email addresses

Every email goes out through the one mail account on the Settings page (Email sending: Gmail, signed in as patrick@hashtagbillionaire.com). Since 20 November each kind of email to a customer comes from the address the client chose for it, and the customer's reply goes back to that address:

| From | Emails |
|---|---|
| order@hashtagbillionaire.com | Order confirmed (when it's paid), order cancelled by the team (paid orders, with the amount to be refunded), order shipped (with the tracking link), order delivered; artwork approval: artwork ready to review, updated artwork, reminders ([below](#artwork-approval)) |
| support@hashtagbillionaire.com | Sign-up verification, forgot password, "your password was changed" (after a reset or a change), account set up by an admin, admin password reset; the contact form's reply for support questions: Order Issue, Customization Help, Shipping & Delivery, Payment Issue |
| info@hashtagbillionaire.com | The contact form's reply for a General Inquiry |
| quotes@hashtagbillionaire.com | Sourcing requests ("can't find it"): received, and each status change |
| The Sender (`EMAIL_FROM`) | The team's copies of contact-form messages and sourcing requests, to the Team inbox, as before; replying answers the customer. A support question's subject now says so: "New support question: Order Issue" |

Each address is a setting under Email sending ("Order emails come from", and so on), so it can be changed without a deploy. Not built yet: reprint emails (the feature doesn't exist), and a new-order email to the team (client question 38).

**Setting it up:** the four addresses must be ones the mail account may send as. In that Gmail account (patrick@), **Settings → Accounts → Send mail as → Add another email address**, once for each of order@, support@, info@ and quotes@. If Gmail asks to confirm an address, its code goes to that address, which as an alias of this account lands in the same inbox. Until an address is added there, Gmail sends that email as patrick@: nothing fails, and replies still go to the right address. To check one, press **Send test email** beside it on the Settings page: the test comes from that address once Gmail allows it, and from patrick@ until then.

The client's list spelled the quotes address `quotes@hashtagbillioniaire.com`; the code uses `quotes@hashtagbillionaire.com`, like the other three.

## Artwork approval

Live since 24 November 2026. Before a customized order is made, the team shows the customer how each item will look:

1. **The team uploads previews.** On the order's **Artwork approval** page in the admin panel (Orders, the stamp button), they add an artwork preview of each item.
2. **order@ emails the customer a private link.**
3. **The customer reviews.** On that page they approve each item, or all at once, or reject it with a note and pictures, or go back to an earlier version. They can undo their last choice until the team presses **Lock for production**.

Both sides see the history.

- **The customer's page:** a separate static site, the `Hashtag_approval` repository, served at `https://hashtagbillionaire.com/approval/` by Apache, not by the shop's Next server. It needs no sign-in, has no links back to the shop, and tells search engines not to index it.
- **The link:** `<Artwork approval page address>#<key>`.
  - **The key:** 64 random characters. The database keeps only its hash and an encrypted copy, so the panel can show the link again.
  - **How it's sent:** the page passes the key in the `X-Approval-Token` header, so it doesn't reach web server logs.
  - **How long it works:** until the order ships or is cancelled, or the team locks it; then the page is read-only. The team can replace the link or switch it off.
- **Files:** previews and customers' pictures go in `approvals` in the storage folder, with random names, served at `/approvals` as downloads (like `/graphics`).
  - Previews: PNG, JPG, JPEG or SVG, up to 20 MB each.
  - Customers' pictures: up to 5 per rejection, 10 MB each, 40 per order (pictures of rejections undone with Undo count too).
- **Tables:** `order_approvals`, `order_approval_lines`, `order_approval_files` and `order_approval_events`. The last one is the history: rows are only ever added.
- **Settings:**
  - **Artwork approval page address** (Website and links). Default: the website address + `/approval`.
  - **Hold customized orders for an artwork approval decision** (Shipping). Off by default. When on, a paid customized order's label waits until the team decides on its approval page.
- **Rate limits:** 300 requests per 15 minutes on the customer's page, 30 rejections an hour, and 20 artwork emails an hour from the panel.

### Going live, in this order

1. **Back up** the database ([migrations/README.md](../migrations/README.md); `--max-allowed-packet=1G`).
2. **Migration:** run `migrations/2026-11-23_order_approvals_before_deploy.sql`. It only creates the four tables; its `.rollback.sql` renames them away.
3. **Backend:** push. The deploy stops at the migration check: then **Actions → Deploy → Run workflow** with **migrations done** ticked ([above](#when-a-deploy-stops)).
4. **Admin panel:** push its `main`.
5. **Server, once:** follow "One-time server setup" in the `Hashtag_approval` README:
   - a deploy user of its own, and `/var/www/approval`;
   - the Apache lines in the shop's site, with `ProxyPass /approval !` above its `ProxyPass /`;
   - then `apache2ctl configtest` before `systemctl reload apache2`.

   Read the shop's Apache site first: a mistake there takes the shop down.
6. **The approval site:** add its GitHub secrets and run its Deploy workflow. `https://hashtagbillionaire.com/approval/` should then say "This link isn't complete".
7. **Settings page:** check that **Artwork approval page address** is `https://hashtagbillionaire.com/approval`.
8. **One real run:** on a paid test order, start the approval, upload a preview, send it to yourself, approve it on a phone, and lock it.

Rate limits and the history use the visitor's own address: `TRUST_PROXY` on the server lists Cloudflare's ranges (N1 in [progress.md](../progress.md#found-after-the-audit)).

## Upload limits

Each upload endpoint takes only its own fields (F15, 24 Nov; `UPLOADS` in `src/config/multer.js`). Any other file is refused with `400`:

| Endpoint | Field: count, formats, size of each |
|---|---|
| `POST user/auth/register` | none |
| `POST sourcing-requests/create` | `images`: 10, PNG, JPG or SVG, 20 MB |
| `POST product/cart` | `images`: 1 design preview, PNG or JPG, 2 MB; `customization_images`: 10, PNG, JPG or SVG, 100 MB |
| `POST graphics` | `graphic`: 1, PNG, JPG or SVG, 100 MB |
| Admin product endpoints | `images`: 10 and `variant_images`: 20, JPG, PNG, WebP, AVIF or GIF, 20 MB |
| Admin brand, industry, use case, add-on and gallery endpoints | `images`: 1, the same formats, 20 MB |
| CSV imports | `file`: 1 CSV, 2 MB, read in memory |
| Artwork approval | `approval_proof`: 1, PNG, JPG or SVG, 20 MB; `approval_picture`: 5, PNG or JPG, 10 MB |

On the endpoints F15 changed, files a request didn't use are deleted once it has answered, and a request whose sender goes away before its upload finishes leaves nothing on disk. `POST graphics`, the CSV imports and the approval routes work as before.

Known gap, as before F15: on `POST graphics` and the two approval routes, an upload whose sender goes away part way still leaves its partial file in `graphics` or `approvals`, and keeps one file handle open until the app restarts (multer never calls back when the sender leaves). Only a signed-in customer, the team, or someone with an approval link can send these uploads.

Customers' graphics can be up to 100 MB each. They're stored in `graphics` in the storage folder, which the app creates at start, and served at `/graphics`. What sits in front of the app allows that (checked 4 November):

- **Apache:** `node.hashtagbillionaire.com.conf` passes everything to the app with `ProxyPass /`, `/graphics` included, and sets no `LimitRequestBody`.
- **Cloudflare:** a 95 MB request reaches the app and a 105 MB one is refused with `413`. The limit depends on the plan, so check again if the plan changes.

## Print options checked (audit F04, F05)

From this release the cart and checkout refuse print options that aren't on the price list ([frontend-changes.md](frontend-changes.md#2026-11-24-print-options)). It has no migration, so a push deploys it as usual. Lines already in carts stay, but one the new rules refuse can't be ordered: checkout answers 400 and names it. **Before pushing**, run these two read-only queries on the production database:

1. **Open cart lines.** Every row must say `ok`. A row that says `CHECK BY HAND` passes only if it's exactly what checkout accepts: no print method and no locations; or a print method of the product's family (Apparel & Uniforms: embroidery, DTF, screen print, DTG; a parent category containing "Drinkware": Color Imprint, Laser Engraving), with priced locations (embroidery: not Full Front, Full Back or Oversized Back; drinkware: only Front and Back), screen print with 1 to 6 colours, DTG with one of the four print areas, `inquiry_only` not true, and `decoration_per_piece` at least the table price at the line's quantity. On 24 Nov the 7 open lines were 6 embroidery lines on Left or Right Chest and 1 without a print method, which should all say `ok`.

   ```sql
   SELECT c.id AS cart_id, c.user_id, c.product_id, p.supplier, p.name, c.quantity,
          JSON_VALUE(c.customization_config, '$.print_method') AS print_method,
          JSON_EXTRACT(c.customization_config, '$.locations') AS locations,
          JSON_EXTRACT(c.customization_config, '$.colors') AS colors,
          JSON_VALUE(c.customization_config, '$.dtg_style') AS dtg_style,
          JSON_VALUE(c.pricing_snapshot, '$.customization_price.total_customization_price') AS decoration_per_piece,
          JSON_VALUE(c.pricing_snapshot, '$.inquiry_only') AS inquiry_only,
          GROUP_CONCAT(DISTINCT pc.title ORDER BY pc.title SEPARATOR ', ') AS parent_categories,
          GROUP_CONCAT(DISTINCT gc.title ORDER BY gc.title SEPARATOR ', ') AS grand_categories,
          CASE
            WHEN COALESCE(TRIM(JSON_VALUE(c.customization_config, '$.print_method')), '') = ''
                 AND COALESCE(JSON_LENGTH(c.customization_config, '$.locations'), 0) = 0
              THEN 'ok: no print options'
            WHEN UPPER(TRIM(JSON_VALUE(c.customization_config, '$.print_method'))) = 'EMBROIDERY'
                 AND JSON_LENGTH(c.customization_config, '$.locations') = 1
                 AND UPPER(TRIM(JSON_VALUE(c.customization_config, '$.locations[0].location'))) IN ('LEFT_CHEST', 'RIGHT_CHEST')
                 AND SUM(LOWER(TRIM(gc.title)) = 'apparel & uniforms') > 0
                 AND COALESCE(JSON_VALUE(c.pricing_snapshot, '$.inquiry_only'), 'false') <> 'true'
                 AND CAST(JSON_VALUE(c.pricing_snapshot, '$.customization_price.total_customization_price') AS DECIMAL(10,2)) + 0.005 >=
                     CASE WHEN c.quantity <= 11 THEN 12 WHEN c.quantity <= 23 THEN 11 WHEN c.quantity <= 35 THEN 10
                          WHEN c.quantity <= 71 THEN 9 WHEN c.quantity <= 95 THEN 8 WHEN c.quantity <= 143 THEN 7 ELSE 6 END
              THEN 'ok: chest embroidery at the table price'
            ELSE 'CHECK BY HAND'
          END AS verdict
   FROM cart c
   JOIN products p ON p.id = c.product_id
   LEFT JOIN product_category_mapping pcm ON pcm.product_id = c.product_id AND pcm.deleted_at IS NULL
   LEFT JOIN product_categories cat ON cat.id = pcm.product_category_id AND cat.deleted_at IS NULL
   LEFT JOIN parent_category_mapping pam ON pam.product_category_id = cat.id AND pam.deleted_at IS NULL
   LEFT JOIN parent_categories pc ON pc.id = pam.parent_category_id AND pc.deleted_at IS NULL
   LEFT JOIN grand_category_mapping gm ON gm.parent_category_id = pc.id AND gm.deleted_at IS NULL
   LEFT JOIN grand_categories gc ON gc.id = gm.grand_category_id AND gc.deleted_at IS NULL
   WHERE c.is_active = 1 AND c.deleted_at IS NULL
     AND COALESCE(JSON_VALUE(c.customization_config, '$.type'), '') <> 'MANUAL'
   GROUP BY c.id
   ORDER BY c.id;
   ```

2. **Unpaid orders with free printing.** Orders made before this release are paid at their own totals; this release doesn't change them. This lists the ones still waiting for payment that have a decorated item whose printing cost $0, or that is "request a quote". It should be empty. If it isn't, the team decides whether to cancel them. A drinkware item with one location is rightly $0: only a second location costs extra.

   ```sql
   SELECT o.id, o.order_number, o.user_id, o.status, o.total_amount, i.id AS item_id, i.product_id,
          JSON_VALUE(i.customization_config, '$.print_method') AS print_method,
          JSON_EXTRACT(i.customization_config, '$.locations') AS locations,
          JSON_VALUE(i.pricing_snapshot, '$.customization_price.total_customization_price') AS decoration_per_piece,
          JSON_VALUE(i.pricing_snapshot, '$.inquiry_only') AS inquiry_only
   FROM orders o
   JOIN order_items i ON i.order_id = o.id AND i.deleted_at IS NULL
   WHERE o.deleted_at IS NULL
     AND o.payment_status IN ('PENDING', 'REJECTED') AND o.status IN ('PENDING', 'PENDING_PAYMENT', 'FAILED')
     AND COALESCE(TRIM(JSON_VALUE(i.customization_config, '$.print_method')), '') <> ''
     AND (COALESCE(CAST(JSON_VALUE(i.pricing_snapshot, '$.customization_price.total_customization_price') AS DECIMAL(10,2)), 0) = 0
          OR JSON_VALUE(i.pricing_snapshot, '$.inquiry_only') = 'true')
   ORDER BY o.id, i.id;
   ```

If the first query shows a line that fails, stop and ask before pushing: that customer would be stopped at checkout with "The print options on … aren't available any more. Please remove it from your cart and add it again."

## Print locations per garment (audit F08)

Live since 25 Nov. The cart and checkout refuse print locations the product's garment doesn't offer ([frontend-changes.md](frontend-changes.md#2026-11-25-print-locations)). No migration. Lines already in carts stay, but one the new rule refuses can't be ordered: checkout answers 400 and names it ("The print options on … aren't available any more. Please remove it from your cart and add it again."). The shop has never sent a location this refuses, so only an edited request could have made such a line.

**Switching off SLEEVE twice.** The shop sends a T-shirt's left and right sleeve both as `SLEEVE`, so `SLEEVE` twice is the one repeated location accepted. Once the shop offers one sleeve on T-shirts and that is live, set `SLEEVE_TWICE_ACCEPTED` to `false` in `src/utils/pricing/buildPricingSnapshot.js` and push. Lines in carts with two sleeves are then refused at checkout, so check first that no open cart line has `SLEEVE` twice.

## Undoing a release

`git revert <commit>` and push. The server only moves forward along `main`: don't force-push it, the deploy refuses a commit that doesn't build on the one running.

## Known lint errors

[eslint-suppressions.json](../eslint-suppressions.json) lists 4 errors that were already in the code when the pipeline started, so that lint can still block new ones:

- `Op` is not defined in [checkout.service.js](../src/services/Common/checkout.service.js), in the admin payment list's search.
- `Payment` is not defined in [order.service.js](../src/services/Common/order.service.js), when an order is cancelled.

Both throw when that code runs. When you fix one, run `npx eslint . --prune-suppressions` and commit the updated file in the same commit; lint fails while the file lists errors that are gone.

## Setup

Done once, on 30 October 2026:

- **Server:** `/root/.ssh/authorized_keys` holds the deploy key, limited to the script:
  `command="/bin/bash /var/www/backend/scripts/deploy.sh",restrict ssh-ed25519 AAAA… github-actions-deploy`
- **GitHub:** the repository's Settings → Secrets and variables → Actions has:
  - `DEPLOY_HOST`: the server's IP address.
  - `DEPLOY_SSH_KEY`: the deploy key's private key.
- **Workflow:** `HOST_KEY` in [deploy.yml](../.github/workflows/deploy.yml) is the server's public host key (`/etc/ssh/ssh_host_ed25519_key.pub`), so the deploy refuses to talk to any other machine. If the server is rebuilt or moved, update it there.

To replace the key, make a new one (`ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f deploy_key`), swap the line in `authorized_keys`, and paste the new private key into `DEPLOY_SSH_KEY`.

Don't edit files on the server, including through an editor's SFTP "upload on save": the next deploy stops until those changes are committed or discarded.
