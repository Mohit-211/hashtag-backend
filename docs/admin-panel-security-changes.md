# Backend security update: changes for the admin panel

**Applies to:** backend branch `fix/security`. **Payments are unchanged** in this release.

All API paths below are relative to `/api/v1`. Responses keep the usual shape:

```json
{ "success": true, "status": 200, "message": "…", "data": … }
{ "success": false, "status": 401, "message": "…", "data": "" }
```

---

## Must do before or with the release

1. **Send the admin token on every admin call.** About 120 endpoints used to be open and now require it. (§1)
2. **Handle 401 (sign in again) and 403 (not allowed).** (§2)
3. **Everyone signs in again after the release.** Old admin tokens stop working. (§2)
4. **Replace the forgot-password OTP with a reset link, and add a `/reset-password` page.** (§3)
5. **Admin and customer creation no longer handle passwords.** (§4)
6. **Make sure the admin panel's address is in the backend's `ACCESSDOMAINS`.** (§8)

---

## 1. The token is required on all admin endpoints

- **Header:** `x-access-token: <token>`. `Authorization: Bearer <token>` also works.
- **The token** is the `data.token` returned by `POST /admin/auth/login`.
- **Safest approach:** attach the header to **every** request the panel makes, for example in the shared API client or an interceptor.

**Endpoints that now require an admin token** (before, anyone could call them):

| Area | Endpoints |
|---|---|
| Products | `POST /product/create-product`, `/add-product-variants`, `/duplicate/:id`, `/update`, `/delete`, `/brand-assignment`; `PUT /product/manual/full`; `GET /product/get-brand-assignment`, `/admin/stats`, `/get/variant`, `/admin/get/all`, `/admin/:id`, `/pricing/markup`; `PUT /product/pricing/:id` |
| S&S | `GET /product/ss/styles/:brand`, `/product/ss/style/:styleId`; `POST /product/sync/ss/:styleId`; `DELETE /product/ss/delete/:styleId`; `GET /brand/sync/ss`, `/product-category/sync/ss` |
| SAGE | every `/sage/...` endpoint |
| SanMar | every `/sanmar/...` endpoint |
| OttoCap | every `/ottocap/...` endpoint **except** `GET /ottocap/otto-image` |
| Brands | `POST /brand/`, `/publish`, `/manual-brand`; `PUT`/`DELETE /brand/:id` |
| Categories | every `POST`, `PUT` and `DELETE` under `/product-category/...`, and `GET /product-category/unassigned` |
| Industries and use cases | every `POST`, `PUT` and `DELETE` under `/industry/...` |
| Tiers | every `POST`, `PUT`, `PATCH` and `DELETE` under `/tiers/...` |
| Customization options | every `POST`, `PUT` and `DELETE` under `/customization-option/...` |
| Add-ons | `POST`/`PUT`/`DELETE /add-on/addon-product...`; `POST /add-on/product/:productId/addons` |
| Sizes, FAQs | `POST /size/create`; `PUT`/`DELETE /size/:id`; `POST /faq/`; `PUT`/`DELETE /faq/:id` |
| Carriers | `POST /carrier/sync`, `/carrier/sync/services` |
| Orders | `GET /order/admin` |
| Contact us | `GET /contactUs/`; `PUT`/`DELETE /contactUs/:id` |
| Sourcing requests | `GET /sourcing-requests/admin`; `PUT /sourcing-requests/:id` |
| Customers | every `/admin/user/...` endpoint (`getUserById` and `deleteUser` were open) |
| Roles, departments | every `/role/...` and `/department/...` endpoint |

**Super Admin only** (other admins get `403`):
- `POST /admin/auth/register`, `PUT /admin/auth/updateAdmin/:id`, `POST /admin/auth/deleteAdmin`, `GET /admin/auth/getAllAdmins`, `GET /admin/auth/findAdminById/:id`
- `POST`, `PUT`, `DELETE` on `/role/...` and `/department/...` (reading them is open to any admin)

Hide or disable these screens for other roles. Use the role on the admin's profile (`GET /admin/auth/getProfile` → `admin_role.name`).

**Still public (unchanged):** catalog reads used by the storefront (`GET` products, categories, brands, sizes, industries, tiers, customization options, add-ons, FAQs), and **all `/payment/...` endpoints**. The payment admin endpoints (`/payment/admin/all`, `/payment/count`, `/payment/sum`) will require the admin token in the payments release. If the panel already sends the token on every call, it won't need another change then.

## 2. Sessions: 401 and 403

- **401: sign in again.** The token is missing, invalid or expired, the admin was deleted or deactivated, or their password changed. Clear the stored token and go to the sign-in screen.
- **403: not allowed.** The token is valid but the action needs a Super Admin, or it's a protected action (see §4). Show the message; don't sign out.
- **Every admin must sign in again after the release.** Tokens issued before it are rejected.
- Admin tokens last 5 days, as before. The admin's role is re-checked on every request, so a role change takes effect immediately.
- **Sign-in errors:** `POST /admin/auth/login` now answers the same message, *"Invalid email or password. Please try again."*, for an unknown email and for a wrong password.

## 3. Forgot password: link instead of code

**Removed:** `POST /admin/auth/otp` and `POST /admin/auth/verify-otp`.

**Step 1, forgot-password screen:**
```
POST /admin/auth/forgot-password
{ "email": "<email>" }
```
- Always `200` with *"If an account matches that email, we've sent a link to it."* Show it as is.
- **Changed meaning:** this endpoint used to take `{ email, password, confirm_password, token }`. It now only sends the email.

**Step 2, new page `/reset-password` on the admin panel:**
- The email links to `https://<admin panel>/reset-password?token=<64 hex characters>`. That address comes from the backend's `ADMIN_FRONTEND_URL` setting.
- Show "New password" and "Confirm password", then:
  ```
  POST /admin/auth/forgot-password/reset
  { "token": "<token>", "password": "<new>", "confirm_password": "<new>" }
  ```
- `200`: password changed. Go to sign-in.
- `400`, password rule or mismatch: the link isn't used up; let them retry.
- `400`, *"This link is invalid or has expired…"*: offer to request a new one.
- The link lasts **60 minutes** and works once.
- The reset signs that admin out everywhere.
- **Password rule:** at least 8 characters, at least 2 digits, no spaces.

**Signed-in change** (`POST /admin/auth/change-password`, body `{ old_password, new_password, confirm_password }`):
- Now returns **`data.token`**. Store it, because the admin's older tokens stop working.
- The new password must meet the rule above.

## 4. Creating and managing admins and customers

**New admin** (`POST /admin/auth/register`, Super Admin only):
- **Body:** `{ name, email, role_id, department_id }`. Remove any password field.
- The new admin receives an email with a "Set your password" link to the same `/reset-password` page, valid 72 hours. No password is generated or emailed.
- **Response:** `201`, *"Admin created. They will receive an email to set their password."*
- The Super Admin role can't be given from the panel (`403`).
- **Update the screen's wording:** it should no longer say a password was sent.

**Edit admin** (`PUT /admin/auth/updateAdmin/:id`, Super Admin only):
- Can change `name`, `email`, `role_id` and `department_id`.
- Not allowed:
  - changing your own role
  - assigning the Super Admin role (`403`)
  - an email already used by another admin (`400`)

**Delete admin** (`POST /admin/auth/deleteAdmin`, `{ admin_id }`, Super Admin only): you can't delete yourself (`400`) or a Super Admin (`403`).

**Admin lists:** `getAllAdmins`, `findAdminById` and `getProfile` return `id, name, email, role_id, department_id, is_active, created_at` and `admin_role`. They no longer include `password`, `otp` or `remember_token`.

**New customer** (`POST /admin/user/createUser`, body `{ name, email }`):
- The customer gets a "Set your password" email with a link to the customer website's `/reset-password` page.
- No password is generated or emailed. The account counts as verified.

**Customer details** (`GET /admin/user/getUserById`): no longer includes the password hash.

## 5. Uploads

Files are accepted only on these admin endpoints, and the token is checked **before** the file is stored:

`POST /product/create-product`, `POST /product/add-product-variants`, `PUT /product/manual/full`, `POST /product/update`, `POST /brand/`, `POST /brand/publish`, `POST /brand/manual-brand`, `POST /industry/`, `PUT /industry/:id`, `POST /industry/use-case`, `PUT /industry/use-case/:id`, `POST /add-on/addon-product`, `PUT /add-on/addon-product/:id`

- Files sent to any other endpoint get `400`. Multipart forms **without** files still work everywhere.
- **Limits:** 20 MB per file, 40 files per request.
- **Allowed types:** unchanged (`images`/`variant_images`: images, video, PDF, audio, Word; `customization_images`: SVG or AI).
- **Errors now return `400` with a readable message** (before, some were 500).
- **Filenames:** uploaded file names now end with a random suffix (`images-<time>-<random>.png`). Nothing should depend on the old pattern.

## 6. Other behavior changes visible in the panel

- **SAGE bulk delete** (`POST /sage/delete`) only ever deletes **SAGE** products, even when given a batch or supplier id from another supplier.
- **Markup:** `PUT /product/pricing/:id` requires an admin token.
- **Contact and sourcing-request lists** require the admin token. Customers can still submit both forms (10 per hour per IP).

## 7. Rate limits

| Action | Limit per IP address |
|---|---|
| Admin sign-in | 10 failed attempts per 15 minutes |
| Forgot password | 5 per hour |
| Reset-link submissions | 20 per 15 minutes |

The API answers **`429`** with a message. Show it; don't retry automatically. **Note:** staff behind one office connection share these limits.

## 8. CORS

- The backend only accepts browser calls from the origins in its `ACCESSDOMAINS` setting. The admin panel's exact origin must be listed (for example `https://admin.example.com`).
- Unknown origins now get **`403`** instead of 500, and the backend log names them (`CORS: rejected origin …`).

## 9. Unchanged

Product, category, brand, use-case, tier and customization screens work as before once the token is sent. Order and payment screens are unchanged.
