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

Customers' graphics can be up to 100 MB each. They're stored in `graphics` in the storage folder, which the app creates at start, and served at `/graphics`. What sits in front of the app allows that (checked 4 November):

- **Apache:** `node.hashtagbillionaire.com.conf` passes everything to the app with `ProxyPass /`, `/graphics` included, and sets no `LimitRequestBody`.
- **Cloudflare:** a 95 MB request reaches the app and a 105 MB one is refused with `413`. The limit depends on the plan, so check again if the plan changes.

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
