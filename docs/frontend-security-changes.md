# Backend security update: changes for the customer website

**Applies to:** backend branch `fix/security`. **Payments are unchanged** in this release: checkout, Square, PayPal, payment history, orders and shipping work as before.

All API paths below are relative to `/api/v1`. Responses keep the usual shape:

```json
{ "success": true, "status": 200, "message": "…", "data": … }
{ "success": false, "status": 400, "message": "…", "data": "" }
```

---

## Must do before or with the release

1. **Replace the email OTP with a verification link.** (§1)
2. **Replace the forgot-password OTP with a reset link.** (§2)
3. **Add two pages:** `/verify-email` and `/reset-password`. (§1, §2)
4. **Treat 401 as "signed out".** (§3)
5. **Make sure the site's address is in the backend's `ACCESSDOMAINS`.** That includes every variant visitors use (`https://example.com` and `https://www.example.com`). Otherwise the browser blocks API calls. (§7)

---

## 1. Email verification: link instead of code

**Removed:** `POST /user/auth/otp` and `POST /user/auth/verify-otp`. The 4-digit code screen and its resend timer go away.

**Registration:** `POST /user/auth/register` works as before: same fields, multipart allowed for profile `images`. Response `201` with message *"Account created. Please check your email and click the verification link within 2 hours."*
- The account starts unverified.
- The backend emails a link: `https://<your site>/verify-email?token=<64 hex characters>`.
- **Accounts not verified within 2 hours are deleted automatically**, and the same email can then register again.

**New page `/verify-email`:**
- Read `token` from the query string.
- Call:
  ```
  POST /user/auth/verify-email
  { "token": "<token>" }
  ```
- `200`, `data: { email }`: verified. Show "Your email has been verified" and a sign-in button. You can prefill the email.
- `400`, *"This link is invalid or has expired…"* or *"This account no longer exists. Please register again."*: show the message, with a "send a new link" form.
- A link works once. Calling it twice returns 400, so don't call it twice (React StrictMode runs effects twice in development).

**Resend link:**
```
POST /user/auth/verify-email/resend
{ "email": "<email>" }
```
- Always `200` with *"If an account matches that email, we've sent a link to it."*, whether or not the email exists. Show that message as is.
- At most one email per minute per account (extra requests still answer 200).

**Signing in before verifying:** `POST /user/auth/login` now answers **`403`** with *"Please verify your email address first…"*. Show the message and a "resend verification email" action.

**Remove the login retry loop** after verification (the 4 × 0.9 s retries). With the link flow, a `200` from verify-email means the account is already verified.

## 2. Forgot password: link instead of code

**Removed:** the code step, and the token passed in the URL (base64).

**Step 1, forgot-password page:**
```
POST /user/auth/forgot-password
{ "email": "<email>" }
```
- Always `200` with the generic *"If an account matches that email…"* message.
- **Changed meaning:** this endpoint used to take `{ email, password, confirm_password, token }`. It now only sends the email.

**Step 2, new page `/reset-password`:**
- The email links to `https://<your site>/reset-password?token=<64 hex characters>`. Read `token` from the query string.
- Show "New password" and "Confirm password", then:
  ```
  POST /user/auth/forgot-password/reset
  { "token": "<token>", "password": "<new>", "confirm_password": "<new>" }
  ```
- `200`: *"Your password has been changed. Please sign in with your new password."* Send the user to sign-in.
- `400`, password rule or mismatch: the link is **not** used up. Let them try again.
- `400`, *"This link is invalid or has expired…"*: offer "request a new link".
- The link lasts **60 minutes** and works once.
- A reset **signs the customer out on every device.**

The same `/reset-password` page also serves customers whose account was created by an admin. They get a "Set your password" email with the same kind of link, valid 72 hours. One page covers both cases.

**Password rule enforced by the backend:** at least 8 characters, at least 2 digits, no spaces. The website's stricter rule (uppercase, number, special) is fine, since any password that passes it also passes the backend's, but the client hasn't confirmed the final rule yet.

## 3. Signed-in sessions

- **Token header:** keep sending `x-access-token`. `Authorization: Bearer <token>` also works.
- **The `role_id` header is no longer needed and is ignored.** Customer endpoints always use the customer role. The `timezone` header is optional; sign-in no longer fails without it.
- **401 means signed out.** A missing, invalid, expired or revoked token now always returns `401`. Before, it could be 400 ("Token Not Found"), 404 ("User Not Found") or 500. On any 401 from a signed-in call: clear the stored token, then send the user to sign-in.
- **Signed-in password change** (`POST /user/auth/reset-password`, unchanged body `{ old_password, new_password, confirm_password }`):
  - Signs out every other device.
  - The response `data.tokens.access.token` is the new token for this device. **Store it**; the old one stops working.
- **Existing customers stay signed in** after the release, as long as the backend's `JWT_SECRET` isn't changed. If it is changed (it must be at least 32 characters), every customer is signed out once.

## 4. Cart, wishlist and addresses

- **Cart and wishlist ids must belong to the signed-in customer.** Increment, decrement, update, remove and wishlist remove with someone else's id answer "Cart not found" / "Wishlist item not found". Nothing changes for normal use.
- **Quantities must be whole numbers greater than 0** when adding to cart and when setting a quantity. Otherwise `400`.
- **Address create/update only accept these fields:** `name, phone, address_line1, address_line2, postal_code, country_id, state_id, city_id, is_default` (plus `id` on update). Any other field is ignored.
- `raw_input` is no longer included in address responses.

## 5. File uploads

- **Files are accepted only on:**
  - `POST /user/auth/register` (`images`)
  - `POST /product/cart` (`images`, `customization_images`; sign-in required before the file is accepted)
  - `POST /sourcing-requests/create`
- Multipart requests with files to **any other endpoint get `400`** *"File uploads aren't accepted for this field or endpoint."* Multipart forms without files still work everywhere.
- **Limits:** 20 MB per file, 40 files per request. `customization_images`: SVG or AI only (unchanged).

## 6. Rate limits (new)

Over the limit, the API answers **`429`** with a message. Show the message; don't retry automatically.

| Action | Limit per IP address |
|---|---|
| Sign-in | 10 failed attempts per 15 minutes |
| Register, forgot password, resend verification | 5 per hour |
| Verify-email and reset-password submissions | 20 per 15 minutes |
| Contact form, sourcing request | 10 per hour |

## 7. CORS

- The backend only accepts browser calls from the origins listed in its `ACCESSDOMAINS` setting, as before.
- Unknown origins now get **`403`** instead of 500, and the backend log names the rejected origin (`CORS: rejected origin …`).
- If a page's API calls fail with a CORS error in the browser, the page's exact origin (scheme + host + port) is missing from `ACCESSDOMAINS`.

## 8. Unchanged

Product browsing, search, categories, customization options, add-ons, checkout, payments (Square, PayPal), payment history, orders, shipping rates and labels.
