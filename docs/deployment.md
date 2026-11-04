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

**Testing:** a key from the web app has no sandbox, so every paid test order buys a real label. Use the cheapest service and void the label in ShipStation straight after.

**When a label fails:** the payment stands and the order stays paid. The reason is on the order in the admin panel, and the panel can try again.

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
