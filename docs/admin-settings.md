# The Settings page: what the admin panel builds

**For:** the admin panel (Hashtag-Billionaire-Admin). **Backend:** branch `feature/client-decisions`, not released yet. Questions go in the panel's `BACKEND_QUESTIONS.md`, as before.

## What changes

Until now the backend read almost everything from its `.env` file: API keys, the mail server, the shipping sender, payment credentials, the website's addresses. All of that now lives in the database and is managed on the admin panel's Settings page, `/settings` (today the "Settings are coming soon" placeholder in `src/pages/AdminSettings.tsx`).

The server's `.env` keeps only what it needs to start: database credentials, `NODE_ENV`, `PORT`, the JWT secret and lifetime, role ids, the first Super Admin, a few server paths, and a new **settings key** (`SETTINGS_MASTER_KEY`). The settings key protects the page:

- **Reading:** every signed-in admin can open Settings. Secret values (API keys, passwords) show only their first and last 5 characters.
- **Edit mode:** to see secrets in full and change anything, the admin enters the settings key.
- **Saving:** the admin enters the settings key again to confirm.

The backend checks the key on both steps. The panel never stores it.

## API

Paths are relative to `API_BASE_URL` (`…/api/v1/`). The admin token is attached by `services/Api/interceptors.ts` as usual, and answers have the usual `{ success, status, message, data }` shape. Every answer carries `Cache-Control: no-store`.

| Request | Body | Success | Errors |
|---|---|---|---|
| `GET admin/settings` | none | `200`: the page, secrets masked | `401` |
| `POST admin/settings/unlock` | `{ "master_key": "…" }` | `200`: the page with every value in full and `revealed: true` | `403` wrong key; `429` too many wrong keys |
| `PUT admin/settings` | `{ "master_key": "…", "values": { "SMTP_HOST": "smtp.example.com", "EMAIL_BRAND_NAME": null } }` | `200`, message "Settings saved": the page (masked) plus `saved` and `removed` | `400` invalid values; `403`; `429` |
| `POST admin/settings/test-email` | none | `200`, `{ "sent_to": "<the admin's email>" }` | `503` mail server not set up; `502` the mail server refused, with its reason; `429` after 5 an hour |

### The page

Both `GET` and the other answers return this as `data`:

```ts
interface SettingsPage {
  revealed: boolean;          // true only in the unlock answer
  groups: SettingsGroup[];    // in display order
  from_env: string[];         // keys still read from the server's .env
  missing_required: string[]; // required keys with no value anywhere
  saved?: string[];           // PUT answer only: keys saved
  removed?: string[];         // PUT answer only: keys reset
}

interface SettingsGroup {
  key: string;                // "website", "email", "email_look", "shipping", "payments", "suppliers", "services", "shop"
  label: string;              // e.g. "Email sending"
  settings: Setting[];
}

interface Setting {
  key: string;                // e.g. "SMTP_HOST"; send it back as it is
  label: string;              // e.g. "Mail server"
  description: string | null; // help text for under the field
  type: "string" | "url" | "email" | "sender" | "integer" | "number"
      | "boolean" | "enum" | "color" | "code2" | "hosts";
  options?: string[];         // enum only
  min?: number;               // integer and number only
  max?: number;
  secret: boolean;
  required: boolean;
  value: string | null;       // the value in effect, as text; null when there is none
  default: string | null;     // what applies when nothing is saved; always null for secrets
  source: "admin" | "env" | "default" | "unset";
  missing: boolean;           // required, and no value anywhere
  updated_at: string | null;  // when it was saved on this page
  updated_by: { id: number; name: string | null } | null;
}
```

`value` is always text: numbers like `"587"`, booleans `"true"` or `"false"`, host lists comma-separated. For a secret outside edit mode it's masked:

| Secret's length | `value` |
|---|---|
| 20 characters or more | first 5 and last 5 characters around "…", e.g. `TEST_…z0123` |
| under 20 | `••••••••` only, since 10 characters would give most of it away |

`source` says where the value comes from:

| `source` | Meaning | Badge |
|---|---|---|
| `admin` | saved on this page | "Set here", with `updated_by.name` and the date |
| `env` | still read from the server's `.env` | "From .env" |
| `default` | nothing saved; the built-in default applies | "Default" |
| `unset` | no value anywhere | "Not set" (red when `required`) |

### Saving

- **Changed settings only:** send just those in `values`, keyed by their `key`.
- **Value types:** text for everything. Numbers and booleans may also be sent as JSON numbers and `true`/`false`.
- **Reset:** `null` or `""` removes the saved value, so `.env` or the default applies again. A required setting with neither can't be reset; that's a `400`.
- **All or nothing:** one invalid value and nothing is saved. Show each message under its field, after the label ("Mail server port must be a number"):

  ```json
  {
    "success": false,
    "status": 400,
    "message": "Some settings aren't valid, so nothing was saved.",
    "data": { "errors": { "SMTP_PORT": "must be a number", "CONTACT_INBOX": "must be an email address" } }
  }
  ```
- **No restart:** a saved value applies to the next request, email or supplier call.

### Wrong keys

- **One wrong key:** `403` *"That settings key isn't right."* The admin stays signed in, since the interceptor leaves `403` to the page. Show it in the key dialog.
- **Ten wrong keys** in 15 minutes from one IP: unlock and save answer `429` *"Too many wrong settings keys. Please try again in 15 minutes."* until the 15 minutes are up, even with the right key.
- **Logging:** the server logs every wrong key with the admin's id.

## The page

### Reading mode (the default)

- **Missing settings:** when `missing_required` isn't empty, a warning at the top listing their labels: "These need a value for the site to work fully: ShipStation API key, …".
- **Values still in `.env`:** when `from_env` isn't empty, a note: "N settings still come from the server's .env file. Saving them here moves them; the server's .env lines can then be removed." The list of labels can be collapsed.
- **Groups:** one section per group, in the order given, with a row per setting:
  - its label and the "Required" tag when `required`;
  - the value, monospace for secrets;
  - the source badge, with "Changed by <name> on <date>" for `admin`;
  - the description as help text.
- **Buttons:** "Edit settings" at the top, and "Send a test email" in the Email sending group.

### Edit mode

1. **Enter it:** "Edit settings" opens a dialog with one field, "Settings key" (a password field), and Continue, which sends `POST admin/settings/unlock`.
   - `200`: edit mode, using the answer's values.
   - `403` or `429`: the message stays in the dialog.
2. **Fields:** every setting is editable, prefilled with its full `value`, with `default` as the placeholder. The control follows `type` (table below).
3. **Secrets:** password fields with a show/hide toggle, hidden by default.
4. **Reset:** each setting with `source: "admin"` gets a Reset action, which sends `null` for it.
5. **Changes:** changed fields are highlighted, and Save stays disabled until something changed.
6. **Cancel:** leaves edit mode and drops the changes, asking first if there are any.
7. **Save:** opens a confirmation dialog listing the labels (not the values) of what changes, with an empty, required "Settings key" field. It then sends `PUT admin/settings`.
   - `200`: a "Settings saved" toast, and back to reading mode with the answer, which is masked.
   - `400`: close the dialog, stay in edit mode, and show the errors under their fields.
   - `403` or `429`: the message stays in the dialog.
8. **Leaving edit mode:** it ends and the revealed values are dropped when the admin leaves the page, signs out, or does nothing for 10 minutes. With unsaved changes, warn first.

Controls by `type`:

| `type` | Control |
|---|---|
| `string` | text |
| `url` | URL field (`https://…`) |
| `email` | email field |
| `sender` | text: an address, or `Name <address>` |
| `integer`, `number` | number field with `min` and `max`; step 1 for `integer` |
| `boolean` | switch, sent as `true`/`false` |
| `enum` | select of `options` |
| `color` | colour picker with the `#rrggbb` text beside it |
| `code2` | two characters, upper case (e.g. `TX`) |
| `hosts` | text, host names separated by commas (or a tag input) |
| any with `secret: true` | password field with show/hide |

### Test email

"Send a test email" sends `POST admin/settings/test-email` from reading mode. The email goes to the signed-in admin with the **saved** settings, so changes must be saved first.
- `200`: a toast with the answer's message ("Test email sent to …").
- `502` or `503`: show the message as it is. It says what's wrong, e.g. *"The mail server didn't send it: Invalid login: 535 Authentication failed"*.

## Keep the key and the secrets out of reach

- **Where they live:** the settings key and the revealed values stay in component state only. Never put them in `localStorage`, `sessionStorage`, the URL, a persisted query cache, logs, analytics or error reports.
- **How long:** drop both when edit mode ends, whether by save, cancel, leaving, the 10-minute timeout or signing out. Don't keep the key typed at unlock for the save; ask again.
- **Input attributes:**
  - the key: `type="password"`, `autoComplete="new-password"` (so browsers don't offer to save it) and `spellCheck={false}`;
  - secret fields: `type="password"` and `autoComplete="off"`.
- **Messages:** no toast or error message shows the key or a full secret.

## Elsewhere in the panel

- **New `503` answers:** any endpoint can now answer `503` *"<Label> isn't set up yet. An admin can set it in Settings, under <Group>."* when something it needs is missing, e.g. a SAGE import without the SAGE API key. Show the message; a link to Settings helps.
- **Menu:** Settings stays in the menu for every admin, since all admins have full access (client decision Q44). The key is what protects changes.

## The settings today

For orientation only: render the page from the API, since the list will grow.

| Group | Settings |
|---|---|
| Website and links | Website address, Admin panel address, API address |
| Email sending | Mail server, port, username, password (secret), Sender, Team inbox |
| How emails look | Name in emails, Logo, Button colour, Button text colour |
| Shipping | Sender name, phone, street address, city, state, ZIP code, country; Default weight per item; ShipStation API key (secret) |
| Payments | Square mode, application ID, location ID, access token (secret); PayPal mode, client ID, client secret (secret) |
| Suppliers | SAGE account number, login ID, API key (secret); S&S Activewear account number, API key (secret); OttoCap image hosts |
| Other services | Google Maps API key, OpenAI API key, Cloudflare Turnstile secret key (all secret) |
| Shop behaviour | Send supplier cost to the shop, Default page size |

## Before handing over, check

- [ ] Reading mode shows every group and setting from `GET admin/settings`, secrets as `abcde…vwxyz` or dots, each with its source badge.
- [ ] A wrong key shows the error in the dialog, and the admin is still signed in.
- [ ] The right key shows full values; Cancel drops them (after a reload the page is masked again).
- [ ] Saving asks for the key again and sends only the changed settings.
- [ ] An invalid value shows its message under the field, and nothing is saved.
- [ ] Reset sends `null`, and the badge turns to From .env or Default.
- [ ] The test email arrives, and a failure shows the mail server's reason.
- [ ] DevTools shows nothing in `localStorage` or `sessionStorage` after using edit mode.
- [ ] After 10 idle minutes in edit mode, the page is back in reading mode.

---

## Running it (server side)

- **The settings key:** `SETTINGS_MASTER_KEY` in `.env` is required, at least 32 characters, e.g. from `openssl rand -hex 32`. Give it only to whoever may change settings. It also encrypts the secret settings in the database, so a database dump doesn't give them away.
- **Moving values out of `.env`:**
  1. `npm run settings:import` copies every setting still in `.env` into the database, secrets encrypted. Settings already saved on the page are kept; `npm run settings:import -- --overwrite` replaces them.
  2. It prints a `sed` command that removes the moved lines from `.env`, keeping the old file as `.env.bak`. Run it, then restart.
  3. Until a setting is moved, its `.env` line keeps working, and the server logs at start which ones are still there.
- **Changing the settings key:**
  1. Put the new key in `SETTINGS_MASTER_KEY` and the old one in `SETTINGS_MASTER_KEY_OLD`.
  2. Run `npm run settings:rekey`.
  3. Remove `SETTINGS_MASTER_KEY_OLD` and restart.
- **A lost key:** the saved secrets can't be decrypted any more. Set a new key and restart; the server logs which secrets it couldn't read. Then enter those secrets again on the page.
- **What stays in `.env`:** `NODE_ENV`, `PORT`, `DEFAULT_TIMEZONE`, the `CENTRAL_MYSQL_*` database settings, `JWT_SECRET` and `JWT_ACCESS_EXPIRATION_DAYS`, the role ids, the `SUPER_ADMIN_*` details, `SETTINGS_MASTER_KEY`, and four server settings:
  - `STORAGE_DIR` and `LOG_DIR`: where files go on this server;
  - `TRUST_PROXY`: how the server sits behind nginx and Cloudflare;
  - `ACCESSDOMAINS`: the CORS origins. A wrong value saved from the panel would stop the panel itself from reaching the API, so it couldn't be fixed from there.
