# Crew Connect — Mobile API (v1)

For the **user** (organizer) and **crew** Android apps only. Admin web APIs are not listed here.

**Base URL:** `http://<host>:4000/api/v1`  
**Health (no prefix):** `GET http://<host>:4000/health`

Default port is `4000`. All JSON. Charset UTF-8.

---

## 1. Conventions

### Headers

| Header | When | Example |
|---|---|---|
| `X-App-Token` | **All pre-login requests** (before the user has an access token) | `X-App-Token: <temp_access_token>` |
| `Content-Type` | All POST/PUT/PATCH/DELETE with body | `application/json` |
| `Authorization` | Authenticated routes | `Bearer <accessToken>` |

> **`X-App-Token` is mandatory on mobile pre-login calls** — OTP request/verify, Google sign-in, token refresh, and logout. Obtain this token once per device install by calling `POST /auth/app/register` on first launch (see §3 below). Store it in **Android Keystore / iOS Keychain** — never in plain shared preferences. Requests without a valid token are rejected with **401 `NO_APP_TOKEN`** or **401 `INVALID_APP_TOKEN`**.
>
> The **admin web console** uses email/password (`POST /auth/admin/login`) and does **not** send `X-App-Token`. See [ADMIN_API.md](./ADMIN_API.md).
>
> After the user logs in, use the `Authorization: Bearer <accessToken>` header for authenticated routes **instead** of `X-App-Token`.

### Success envelope

```json
{
  "success": true,
  "message": "optional human message",
  "data": { }
}
```

`POST /crew/me/time-off`, `POST /crew/me/edit-requests`, `POST /users/me/addresses`, `POST /uploads`, and **create** via `PUT /users/bookings/summary` return **201**. Everything else successful is **200**.

### Error envelope

```json
{
  "success": false,
  "error": {
    "message": "Incorrect OTP",
    "code": "OTP_INVALID",
    "details": []
  }
}
```

| HTTP | Typical `error.code` |
|---|---|
| 400 | `VALIDATION_ERROR`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_NOT_FOUND`, `PROFILE_INCOMPLETE`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `FILE_REQUIRED`, `EVENT_DATE_INVALID`, `CREW_REQUIRED`, `COUPON_INVALID`, `COUPON_MIN_SPEND`, `COUPON_LIMIT_REACHED`, `COUPON_USER_LIMIT`, `BOOKING_INCOMPLETE`, `SHIFT_OTP_INVALID`, `VENUE_LOCATION_REQUIRED`, `VENUE_OUT_OF_RANGE` |
| 401 | `NO_APP_TOKEN` (missing X-App-Token), `INVALID_APP_TOKEN` (bad/unknown token), `APP_TOKEN_EXPIRED` (re-register device), `APP_TOKEN_REVOKED` (device banned), `NO_TOKEN`, `INVALID_TOKEN` |
| 403 | `FORBIDDEN_TYPE`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`, `NOT_APPROVED` |
| 404 | `ROUTE_NOT_FOUND`, `CREW_NOT_FOUND`, `USER_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `BOOKING_NOT_FOUND` |
| 409 | `PROFILE_LOCKED`, `ALREADY_APPROVED`, `NOT_APPROVED`, `UNIQUE_CONSTRAINT`, `PHONE_IN_USE`, `BOOKING_NOT_EDITABLE`, `BOOKING_NOT_CANCELLABLE`, `REVIEW_NOT_ALLOWED`, `REVIEW_ALREADY_EXISTS`, `JOB_NOT_AVAILABLE`, `JOB_FULL`, `JOB_ALREADY_ACCEPTED`, `JOB_ALREADY_REJECTED`, `DATE_BLOCKED`, `SHIFT_NOT_STARTABLE`, `SHIFT_NOT_COMPLETABLE`, `BOOKING_CANCELLED`, `CREW_SHORTAGE` |
| 429 | `OTP_RATE_LIMITED`, `OTP_LOCKED`, `PLACES_RATE_LIMITED` |
| 500 | `PLACES_NOT_CONFIGURED` (server has no `GOOGLE_PLACES_API_KEY`) |
| 502 | `PLACES_UPSTREAM_ERROR` (Google Places timed out or rejected the request) |

Validation errors include `details`: `[{ "path": "phoneNumber", "message": "…" }]`.

### IDs and dates

- Table IDs are **integers** (`1`, `2`, `3`).
- Dates: `YYYY-MM-DD`. Date-times: ISO-8601.
- Times: `HH:mm` 24-hour (`"18:00"`).
- Money: decimal strings / numbers in **INR**.
- OTP: **4 digits**. TTL **300 seconds**. Max **5** wrong attempts, then request a new OTP.
  In development, **crew** (`subjectType: "crew"`) may enter any 4-digit code after requesting an OTP. Production always checks the real code.

### Tokens

| Token | Lifetime (default) | Store | Header |
|---|---|---|---|
| `temp_access_token` | 90 days | Android Keystore / iOS Keychain | `X-App-Token` (pre-login only) |
| `accessToken` | 15 minutes | Memory / secure prefs | `Authorization: Bearer` (authenticated routes) |
| `refreshToken` | 30 days | Android Keystore / iOS Keychain | Body of `/auth/refresh` and `/auth/logout` only |

On **401** with expired access token: call `POST /auth/refresh`, then retry the original request.

On **401 `APP_TOKEN_EXPIRED`**: call `POST /auth/app/register` again with the same `mid` — the endpoint rotates the token and resets the expiry.

---

## 2. Screen → API map (crew app)

Use this to wire screens that already exist in design.

| Screen | What to call |
|---|---|
| App launch (first time / reinstall) | `POST /auth/app/register` — store `temp_access_token` in Keystore/Keychain |
| Welcome / Get OTP | `POST /auth/otp/request` with `subjectType: "crew"` + `X-App-Token` header |
| OTP verify | `POST /auth/otp/verify` |
| After login | `POST /auth/devices` (register `mid` + `pnid`) |
| Routing after login | If `isNew === true` **or** `verificationStatus !== "approved"` → Complete Account. If `pending` after submit → Verification in Progress. If `approved` → Home. |
| Complete Account — Personal Information | `POST /uploads` (`purpose=profile_photo`) then `PATCH /crew/me/personal` with `profilePhotoUrl` |
| Complete Account — Work Profile | `PUT /crew/me/work-profile` |
| Complete Account — Identity Verification | `POST /uploads` for each doc, then `PUT /crew/me/identity-documents` with the returned URLs |
| Complete Account — Bank | `PUT /crew/me/bank-details` |
| Create Profile / finish onboarding | `POST /crew/me/submit` |
| Verification in Progress | `GET /crew/me` — poll `verificationStatus` |
| Home — Online / Offline | `PATCH /crew/me/online` then `GET /crew/home` |
| Home — Today's Performance + New Job Requests | `GET /crew/home` |
| Detail Order | `GET /crew/bookings/:id` |
| Accept Job | `POST /crew/bookings/:id/accept` |
| Reject | `POST /crew/bookings/:id/reject` |
| Order Accepted / Start Shift | `GET /crew/bookings/:id` then OTP screen |
| Shift OTP | `POST /crew/bookings/:id/start` with `{ "code" }`. Resend → `POST /crew/bookings/:id/otp/resend` |
| Shift In Progress | `GET /crew/bookings/:id` (poll). Complete → `POST /crew/bookings/:id/complete` |
| Shift Completed | `GET /crew/bookings/:id` (`status: "completed"`) |
| Mark dates off / vacation | `GET/POST/DELETE /crew/me/time-off` |
| Account / Profile | `GET /crew/me` |
| Edit Profile (while pending/rejected) | Same PATCH/PUT as onboarding |
| Request Changes (after approved) | `POST /crew/me/edit-requests` |
| Logout | `POST /auth/logout` |

### Not in this API yet (do not block UI mock; backend next)

These crew screens **cannot** be fully wired yet:

- Dashboard, All Earnings
- SOS / Emergency contacts
- In-app notification inbox
- Support / Complain tickets

User (organizer) app: **login + Google + profile + addresses + settings + bookings**. Notification inbox and home catalog are not implemented yet.

---

## 2b. Screen → API map (user / organizer app)

| Screen | What to call |
|---|---|
| App launch (first time / reinstall) | `POST /auth/app/register` — store `temp_access_token` in Keystore/Keychain |
| Login — Send Code | `POST /auth/otp/request` with `subjectType: "user"` + `X-App-Token` |
| Verification — Verify & Continue | `POST /auth/otp/verify` |
| Continue with Google | `POST /auth/google` |
| After login | `POST /auth/devices` (register `mid` + `pnid`) |
| Routing after login | If `isNew === true` **or** `profileComplete === false` → Create Account (or Skip). If no `defaultAddress` → Location. Else Home. |
| Create Account | `PATCH /users/me` with `fullName` + optional `email`. Photo: `POST /uploads` (`purpose=profile_photo`) then PATCH `profilePhotoUrl`. **Skip For Now** is client-only. |
| Create Account — phone (Google) | `POST /auth/otp/request` then `POST /users/me/phone/verify`. OTP users already have a verified phone — do not send it on PATCH. |
| Enable Location Access | `PATCH /users/me` `{ "locationAccessEnabled": true }` then either map confirm or Add Address |
| Confirm Location / Add Address | `GET /users/places/search?q=` then `POST /users/me/addresses` with `latitude` / `longitude` (and `pincode` from `postalCode`) |
| Change saved address | `GET` / `PATCH` / `DELETE /users/me/addresses` |
| Account | `GET /users/me` |
| Account details / Edit Profile | `PATCH /users/me` |
| Settings | `PATCH /users/me` for `locationAccessEnabled`, `pushNotificationsEnabled`, `marketingOptIn` |
| Coupons | `GET /users/coupons` |
| Help & Support | `GET /users/support` |
| Tell Us About Your Event / Choose Your Crew | `GET /users/bookings/options` then `GET /users/bookings/crew-suggestion` |
| Confirm Your Booking | `GET /users/places/search?q=` to pick a venue, then `PUT /users/bookings/summary` (creates the cart draft + pricing) |
| Cart | `GET /users/cart`. Edit → same `PUT /users/bookings/summary` with `id`. Apply/remove offer → coupon endpoints |
| Proceed To Pay / Confirm Booking | `POST /users/bookings/:id/place` (**temporary**, no payment gateway yet) |
| My Bookings | `GET /users/bookings?tab=current` or `tab=past` |
| Order Details | `GET /users/bookings/:id` |
| Cancel Booking | `POST /users/bookings/:id/cancel` |
| Rate & Review | `POST /users/bookings/:id/review` |
| Logout | `POST /auth/logout` |
| Delete Account | `DELETE /users/me` |

### Not in this API yet (do not block UI mock; backend next)

- Home — flash sale, search, Choose Your Crew catalog, Most Popular
- Payment gateway (Razorpay/etc.). Use `POST /users/bookings/:id/place` until that lands
- Notification inbox
- CMS for About / FAQ / Privacy / Terms (deep-link static URLs)

---

## 3. Auth

### `POST /auth/app/register` ← **Call this first, on every fresh install**

Register the device and receive a `temp_access_token`. This token is required on all pre-login endpoints via the `X-App-Token` header.

**No auth required.** Rate-limited: 20 / minute.

**Body**

```json
{
  "mid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "platform": "android",
  "appVersion": "1.0.0"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `mid` | string | **yes** | Mobile Install ID — a UUID generated on first install and persisted in secure storage. Never changes for the same install. |
| `platform` | string | no | `"android"` or `"ios"` |
| `appVersion` | string | no | Your app's version string |

**201**

```json
{
  "success": true,
  "message": "Device registered",
  "data": {
    "temp_access_token": "3f8a…96d",
    "expiresAt": "2026-12-02T15:45:00.000Z"
  }
}
```

Store `temp_access_token` in **Android Keystore / iOS Keychain**. Attach it as `X-App-Token: <temp_access_token>` on every pre-login request.

**When to call this:**
- ✅ On **first app launch** (token not yet in storage)
- ✅ On **app reinstall** (storage is cleared → generate a new `mid` → re-register)
- ✅ When you receive **401 `APP_TOKEN_EXPIRED`** — re-register with the same `mid` to rotate the token

---

### `POST /auth/otp/request`

Send a 4-digit OTP to the phone. Max **5 requests per minute**.

**Body**

```json
{
  "phoneNumber": "+919876543210",
  "subjectType": "crew"
}
```

`subjectType`: `"user"` | `"crew"`.

**200**

```json
{
  "success": true,
  "message": "OTP sent",
  "data": {
    "phoneNumber": "+919876543210",
    "expiresInSeconds": 300,
    "devOtp": "1846"
  }
}
```

`devOtp` is **only in development**. Production will not include it — wait for SMS.

In **development**, crew login (`subjectType: "crew"`) also accepts **any 4-digit code** after a successful OTP request. User OTP is still checked. This bypass is off when `NODE_ENV=production`.

---

### `POST /auth/otp/verify`

Creates the account on first success (`isNew: true`).

**Body**

```json
{
  "phoneNumber": "+919876543210",
  "subjectType": "crew",
  "code": "1846"
}
```

**200 — crew**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "id": 12,
    "phoneNumber": "+919876543210",
    "fullName": null,
    "verificationStatus": "pending",
    "isNew": true,
    "tokens": {
      "accessToken": "eyJ…",
      "refreshToken": "eyJ…",
      "tokenType": "Bearer",
      "expiresIn": 900
    }
  }
}
```

**200 — user** (no `verificationStatus`)

```json
{
  "data": {
    "id": 5,
    "phoneNumber": "+919876543210",
    "fullName": null,
    "isNew": true,
    "tokens": { }
  }
}
```

`verificationStatus`: `"pending"` | `"approved"` | `"rejected"`.

| `error.code` | Meaning |
|---|---|
| `OTP_NOT_FOUND` | Request OTP first |
| `OTP_EXPIRED` | Ask user to resend |
| `OTP_INVALID` | Wrong digits |
| `OTP_LOCKED` | Too many tries — request a new OTP |
| `ACCOUNT_SUSPENDED` / `ACCOUNT_DELETED` | Show blocked state |

---

### `POST /auth/google`

**User app only.** Google ID token from Play Services.

```json
{ "idToken": "<Google ID token>" }
```

**200:** `id`, `email`, `fullName`, `profilePhotoUrl`, `phoneNumber` (null until a real number is linked), `phoneVerified`, `isNew`, `tokens`.

Route `isNew === true` to Create Account. If `phoneVerified === false`, collect a phone and call `POST /users/me/phone/verify` after `POST /auth/otp/request`.

`GOOGLE_NOT_CONFIGURED` (500) if the server has no `GOOGLE_CLIENT_ID`.

---

### `POST /auth/refresh`

```json
{ "refreshToken": "<refreshToken>" }
```

**200**

```json
{
  "data": {
    "tokens": {
      "accessToken": "eyJ…",
      "refreshToken": "eyJ…",
      "tokenType": "Bearer",
      "expiresIn": 900
    }
  }
}
```

The old refresh token is **revoked**. Persist the **new** pair.

---

### `POST /auth/logout`

```json
{ "refreshToken": "<refreshToken>" }
```

No Bearer required. Clears that refresh token.

---

### `GET /auth/me`

Requires Bearer.

```json
{
  "data": {
    "sub": 12,
    "type": "crew"
  }
}
```

`type`: `"user"` | `"crew"`.

---

## 4. Register device (`mid` / `pnid`)

Call **once after login** (and again when the FCM token refreshes). Not shown as its own screen.

### `POST /auth/devices`

```json
{
  "mid": "install-or-member-id",
  "pnid": "fcm-or-onesignal-token",
  "platform": "android",
  "deviceName": "Pixel 8",
  "osVersion": "14",
  "appVersion": "1.0.0"
}
```

Or `"pnids": ["token1", "token2"]` instead of `pnid`.

**200** — `{ id, mid, pnid, platform, deviceName, lastSeenAt, … }`

---

## 5. File upload

Upload profile photos and KYC images, then put the returned `url` on the profile endpoints.

**`POST /uploads`** — multipart, Bearer (user or crew). **201**

| Form field | Type | Required | Values |
|---|---|---|---|
| `file` | image | yes | JPEG, PNG, or WebP. Max **5 MB**. Field name must be `file`. |
| `purpose` | text | yes | `profile_photo` \| `aadhaar_front` \| `aadhaar_back` \| `pan_card` \| `other` |

Headers: `Authorization: Bearer …` and `Content-Type: multipart/form-data` (the HTTP client sets the boundary).

**201**

```json
{
  "success": true,
  "message": "File uploaded",
  "data": {
    "id": 8,
    "purpose": "profile_photo",
    "url": "http://localhost:4000/uploads/crew/12/1725123456789-abCDef12ghij.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 184320
  }
}
```

Then:

- User profile photo → `PATCH /users/me` `{ "profilePhotoUrl": "<url>" }`
- Crew profile photo → `PATCH /crew/me/personal` `{ "profilePhotoUrl": "<url>" }`
- Aadhaar / PAN images → `PUT /crew/me/identity-documents` with `aadhaarFrontUrl` / `aadhaarBackUrl` / `panCardUrl`

On a **physical phone** talking to your PC, set `PUBLIC_BASE_URL` on the server to a LAN IP (`http://192.168.x.x:4000`). Android emulator: `http://10.0.2.2:4000`.

Images are served at `GET /uploads/...` (no auth). Filenames are random.

| `error.code` | Meaning |
|---|---|
| `FILE_REQUIRED` | Missing `file` field |
| `INVALID_FILE_TYPE` | Not jpeg/png/webp |
| `FILE_TOO_LARGE` | Over 5 MB |
| `INVALID_PURPOSE` | Unknown purpose |
| `UPLOAD_RATE_LIMITED` | More than 20 uploads / minute |

---

## 5b. User profile, addresses, settings

All routes: Bearer + token `type` must be `"user"`. Otherwise `403 FORBIDDEN_TYPE`.

There is **no admin verification** for organizers. **Skip For Now** is client-only — the account already exists after OTP / Google.

### `GET /users/me`

Account screen payload.

```json
{
  "data": {
    "id": 5,
    "type": "user",
    "fullName": "John Doe",
    "email": "john@example.com",
    "phoneNumber": "+919876543210",
    "phoneVerified": true,
    "profilePhotoUrl": null,
    "locationAccessEnabled": false,
    "pushNotificationsEnabled": true,
    "marketingOptIn": false,
    "profileComplete": true,
    "defaultAddress": {
      "id": 1,
      "houseFlatNumber": "24",
      "pincode": "500049",
      "apartmentBuilding": "Manjeera Trinity",
      "contactNumber": "+919875698747",
      "floorNumber": "5",
      "landmark": "Beside Lulu Mall",
      "addressType": "home",
      "latitude": 17.4932,
      "longitude": 78.3915,
      "isDefault": true
    }
  }
}
```

`phoneVerified` is `false` (and `phoneNumber` is `null`) for Google accounts that still have the `google:<id>` placeholder.

### `PATCH /users/me`

Create Account, Edit Profile, and Settings. Phone is **not** accepted here.

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "profilePhotoUrl": "http://localhost:4000/uploads/user/5/photo.jpg",
  "locationAccessEnabled": true,
  "pushNotificationsEnabled": true,
  "marketingOptIn": false
}
```

At least one field required. Empty `email` / `profilePhotoUrl` clears the value. Duplicate email → **409 `UNIQUE_CONSTRAINT`**.

**200** — same shape as `GET /users/me`.

### `POST /users/me/phone/verify`

Google users attaching a real phone. Request OTP first with `POST /auth/otp/request` `{ "phoneNumber", "subjectType": "user" }`.

```json
{ "phoneNumber": "+919876543210", "code": "1846" }
```

**200** — updated profile. **409 `PHONE_IN_USE`** if another account already has that number. Same OTP error codes as `/auth/otp/verify`.

### `GET /users/me/addresses`

Array of saved addresses, default first.

### `POST /users/me/addresses` — **201**

Confirm Location or Add Address. Prefer `GET /users/places/search` first, then send `latitude` / `longitude` and `pincode` from the selected row.

```json
{
  "houseFlatNumber": "24",
  "pincode": "500049",
  "apartmentBuilding": "Manjeera Trinity",
  "contactNumber": "+919875698747",
  "floorNumber": "5",
  "landmark": "Beside Lulu Mall",
  "addressType": "home",
  "latitude": 17.4932,
  "longitude": 78.3915,
  "isDefault": true
}
```

`addressType`: `"home"` \| `"work"` \| `"other"` (defaults to `"home"`). The first address, or any create/update with `isDefault: true`, becomes the Home header location and clears the previous default.

### `PATCH /users/me/addresses/:id`

Same fields as create (partial).

### `DELETE /users/me/addresses/:id`

If the deleted row was default, another address is promoted. **404 `ADDRESS_NOT_FOUND`**.

### `DELETE /users/me`

Soft-deletes the account and revokes all refresh tokens. Later logins return **403 `ACCOUNT_DELETED`**.

### `GET /users/coupons`

Active, in-date coupons for the Coupons screen. Codes that have hit `maxUses`, or that this user has already redeemed up to `maxUsesPerUser`, are omitted. `maxDiscountAmount` is the percentage (or flat) cap; `null` means no cap. `maxUses` / `maxUsesPerUser` of `null` mean unlimited.

```json
{
  "data": [
    {
      "id": 1,
      "code": "CREW50",
      "description": "FLAT 50% OFF upto ₹1000",
      "discountType": "percentage",
      "discountValue": 50,
      "minSpend": 5000,
      "maxDiscountAmount": 1000,
      "maxUses": null,
      "maxUsesPerUser": 1,
      "validFrom": null,
      "validUntil": "2026-12-31T23:59:59.000Z"
    }
  ]
}
```

### `GET /users/support`

Static Help & Support contacts (`SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP`).

```json
{
  "data": {
    "email": "support@crewconnect.com",
    "phone": "+919515665550",
    "whatsapp": "+919997775555"
  }
}
```

### `GET /users/places/search`

Venue / address typeahead. Proxies Google Places Text Search with a Hyderabad `locationBias` (the existing `SERVICE_CENTER_*` / `SERVICE_RADIUS_KM` circle). The Places API key stays on the server — do not put it in the app.

**Auth:** Bearer, `type` must be `"user"`. Rate-limited: **30 / minute**.

Query:

| Param | Required | Notes |
|---|---|---|
| `q` | yes | Search string, 2–200 characters |
| `limit` | no | 1–10, default **8** |

```
GET /users/places/search?q=hitech%20city
```

```json
{
  "success": true,
  "data": [
    {
      "placeId": "ChIJ...",
      "name": "Taj Convention Centre",
      "address": "Hitech City Road, Madhapur, Hyderabad, Telangana 500081",
      "latitude": 17.4483,
      "longitude": 78.3915,
      "postalCode": "500081",
      "inServiceArea": true
    }
  ]
}
```

No matches → **200** with `data: []`. Results without coordinates are dropped.

Copy a selected row into:

- **Add Address** — `POST /users/me/addresses` `latitude`, `longitude`, `pincode` ← `postalCode`
- **Confirm Booking** — `PUT /users/bookings/summary` `venueName` ← `name`, `venueAddress` ← `address`, `venueLatitude` ← `latitude`, `venueLongitude` ← `longitude`

`inServiceArea` is a preview of the Hyderabad 50 km booking rule. Bookings still reject out-of-range venues with **400 `VENUE_OUT_OF_RANGE`**. Grey out or warn on `inServiceArea: false` before submit.

| HTTP | `error.code` |
|---|---|
| 400 | `VALIDATION_ERROR` (`q` too short / missing) |
| 429 | `PLACES_RATE_LIMITED` |
| 500 | `PLACES_NOT_CONFIGURED` — server has no `GOOGLE_PLACES_API_KEY` |
| 502 | `PLACES_UPSTREAM_ERROR` — Google timed out or rejected the request |

---

## 5c. Bookings (user / organizer)

All routes: Bearer + token `type` must be `"user"`.

The cart holds **one** `pending_payment` draft per user. Completing the three booking steps calls summary; Cart reads that draft. Payment is not integrated yet — `POST /users/bookings/:id/place` marks the draft `confirmed`, generates a 4-digit shift OTP, and moves it into My Bookings.

Pricing is computed on the server (do not send rates or totals):

- Line = `count × rate` (fixed amount per person for the event — hours are **not** multiplied)
- GST **18%** on subtotal (before discount)
- Coupon discount (flat amount, or `%` of subtotal) subtracted after GST. Percentage discounts are capped at `maxDiscountAmount` when that field is set (e.g. 50% upto ₹1000)
- `estimatedTotal` = `subtotal + gstAmount - discountAmount`

`expectedDurationHours` is an input (1–24). It is stored and shown to crew on the order; it does not change the price. `GET /users/bookings/options` still returns `durations` as optional UI shortcuts (6 / 8 / 12).

Fixed rates come from the admin rate card (`GET /admin/rates`). Defaults after seed: waiter **₹800**, supervisor **₹1000**, bouncer **₹900** per person per event. Rates are snapshotted onto the booking at quote time, so later admin edits do not change existing bookings.

Cancellation: allowed while `confirmed` or `crew_assigned`. Within **24 hours** of event start → **50% fee** (50% refund). Otherwise **0% fee**.

### `GET /users/bookings/options`

Dropdowns and rate card for steps 1–2. `rates` are the fixed per-person event amounts (not hourly). `durations` are optional hour shortcuts — the client may send any `expectedDurationHours` from 1 to 24.

```json
{
  "data": {
    "eventTypes": ["Wedding Reception", "Wedding", "Birthday Party", "Corporate Event", "Private Party", "Engagement", "Housewarming", "Festival", "Other"],
    "foodServiceTypes": ["Plated Dining", "Buffet", "Cocktail", "Family Style", "Live Counter"],
    "durations": [
      { "hours": 6, "label": "6 Hours" },
      { "hours": 8, "label": "8 Hours" },
      { "hours": 12, "label": "Full Day" }
    ],
    "rates": { "waiter": 800, "supervisor": 1000, "bouncer": 900 },
    "gstPercent": 18,
    "coverRatio": 20,
    "supervisorRanges": [
      { "id": 1, "minWaiters": 5, "maxWaiters": 10, "supervisorCount": 1 },
      { "id": 2, "minWaiters": 11, "maxWaiters": 19, "supervisorCount": 2 },
      { "id": 3, "minWaiters": 20, "maxWaiters": 29, "supervisorCount": 3 },
      { "id": 4, "minWaiters": 30, "maxWaiters": 39, "supervisorCount": 4 },
      { "id": 5, "minWaiters": 40, "maxWaiters": null, "supervisorCount": 5 }
    ]
  }
}
```

### `GET /users/bookings/crew-suggestion`

Smart Suggestion overlay (before save). Query: `guestCount` (required), `foodItemsCount` (optional).

Waiters = `ceil(guestCount / coverRatio)` (min 1). Supervisor count is looked up from admin **waiter ranges** (`PUT /admin/supervisor-ranges`): match waiter count against `minWaiters`–`maxWaiters` (`maxWaiters: null` = that count and above). Supervisors are **added on top of** waiters, not taken from them. Bouncers are not auto-suggested — the organizer can add as many as they want (default 0). Below the first range, supervisors are 0.

```json
{
  "data": {
    "guestCount": 100,
    "foodItemsCount": 5,
    "coverRatio": "1:20",
    "totalPersonnel": 6,
    "recommended": { "waiter": 5, "supervisor": 1, "bouncer": 0 },
    "message": "Based on 100 guests and 5 food items, we recommend at least 5 Waiters and 1 Supervisor."
  }
}
```

### `PUT /users/bookings/summary`

Create or update the cart draft. **201** when a new booking is created, **200** when an existing draft is updated.

- Omit `id`: update the user’s existing `pending_payment` row, or create one. Extra drafts for the same user are removed so the cart stays a single booking.
- With `id`: that booking must be owned and still `pending_payment`. **409 `BOOKING_NOT_EDITABLE`** otherwise.

```json
{
  "id": 12,
  "eventType": "Wedding Reception",
  "guestCount": 100,
  "foodServiceType": "Plated Dining",
  "foodItemsCount": 5,
  "eventDate": "2026-10-24",
  "eventStartTime": "18:00",
  "expectedDurationHours": 6,
  "crew": { "waiter": 5, "supervisor": 1, "bouncer": 0 },
  "venueName": "The Grand Palace",
  "venueAddress": "Hyderabad",
  "venueLatitude": 17.385,
  "venueLongitude": 78.4867,
  "additionalInstructions": "Use the banquet hall entrance"
}
```

`expectedDurationHours` is a number from **1 to 24** (one decimal allowed). It is **not** used in the quote. `eventDate` is `YYYY-MM-DD` (not in the past). `eventStartTime` is `HH:mm`. At least one crew count must be greater than 0.

When the API has a service-area center configured, `venueLatitude` and `venueLongitude` are required. The venue must be within **50 km** of Hyderabad. **400 `VENUE_LOCATION_REQUIRED`** if either coordinate is missing. **400 `VENUE_OUT_OF_RANGE`** if Haversine distance is greater than the radius (`details.distanceKm`, `details.maxKm`). The same check runs on `POST /users/bookings/:id/place`. Prefer `GET /users/places/search` so the app sends a real place name and coordinates instead of free-typed text.

Supervisor count is raised to the admin waiter-range minimum for the submitted waiter count (`GET /users/bookings/options` → `supervisorRanges`). If the organizer sends a **higher** supervisor count, that value is kept. The saved draft, quote, and `data.crew` use the **server** counts — the app should display those, not the request body.

The success envelope `message` (also on `data.message`) is meant for an in-app notice. If supervisors were raised: `"Supervisor count was updated to 1 Supervisor for 5 Waiters. Your booking now includes 5 Waiters and 1 Supervisor."` Otherwise: `"Your booking includes 5 Waiters and 1 Supervisor."`

Response (same shape as Cart). `rates` are the snapshotted per-person event amounts. Each line is `count × rate`:

```json
{
  "success": true,
  "message": "Supervisor count was updated to 1 Supervisor for 5 Waiters. Your booking now includes 5 Waiters and 1 Supervisor.",
  "data": {
    "id": 12,
    "bookingReference": "PC-96891",
    "status": "pending_payment",
    "eventType": "Wedding Reception",
    "guestCount": 100,
    "foodServiceType": "Plated Dining",
    "foodItemsCount": 5,
    "eventDate": "2026-10-24",
    "eventStartTime": "18:00",
    "expectedDurationHours": 6,
    "venueName": "The Grand Palace",
    "venueAddress": "Hyderabad",
    "venueLatitude": 17.385,
    "venueLongitude": 78.4867,
    "additionalInstructions": "Use the banquet hall entrance",
    "crew": { "waiter": 5, "supervisor": 1, "bouncer": 0 },
    "staffCount": 6,
    "message": "Supervisor count was updated to 1 Supervisor for 5 Waiters. Your booking now includes 5 Waiters and 1 Supervisor.",
    "rates": { "waiter": 800, "supervisor": 1000 },
    "lineItems": [
      {
        "role": "waiter",
        "label": "5 Waiters",
        "count": 5,
        "rate": 800,
        "amount": 4000,
        "description": "5 x ₹800"
      },
      {
        "role": "supervisor",
        "label": "1 Supervisor",
        "count": 1,
        "rate": 1000,
        "amount": 1000,
        "description": "1 x ₹1000"
      }
    ],
    "subtotal": 5000,
    "gstPercent": 18,
    "gstAmount": 900,
    "discountAmount": 0,
    "estimatedTotal": 5900,
    "coupon": null,
    "createdAt": "2026-09-07T17:00:00.000Z",
    "updatedAt": "2026-09-07T17:00:00.000Z"
  }
}
```

### `GET /users/cart`

Latest `pending_payment` booking, or `data: null` if the cart is empty.

### `POST /users/bookings/:id/coupon`

Body `{ "code": "LUXURYLAUNCH" }`. Only `pending_payment`. Recalculates discount, GST, and total.

**400** `COUPON_INVALID` (unknown / inactive / expired), `COUPON_MIN_SPEND`, `COUPON_LIMIT_REACHED` (global `maxUses` exhausted), `COUPON_USER_LIMIT` (`maxUsesPerUser`, including one-time-use). `POST /users/bookings/:id/place` re-checks the same rules before confirming.

### `DELETE /users/bookings/:id/coupon`

Removes the offer and recalculates totals.

### `POST /users/bookings/:id/place`

**Temporary stand-in for the payment gateway.** Sets status to `confirmed`, stores `confirmedAt`, generates a 4-digit `shiftOtp`. No `Payment` row is written. **409 `BOOKING_NOT_EDITABLE`** if not `pending_payment`. Re-checks the Hyderabad 50 km venue rule (**400 `VENUE_LOCATION_REQUIRED`** / **400 `VENUE_OUT_OF_RANGE`**).

Before confirming, the API counts **approved, active** crew for each required role who are free on the event date (not already assigned to another event, not on time off). Unfilled slots on other **confirmed / crew_assigned / in_progress** bookings for that date also reserve capacity, even if nobody has accepted yet. If any role is short, it returns **409 `CREW_SHORTAGE`** and does not place the order.

```json
{
  "success": false,
  "error": {
    "message": "1 Waiter shortage, 2 Bouncers shortage",
    "code": "CREW_SHORTAGE",
    "details": {
      "shortages": [
        { "role": "waiter", "label": "Waiter", "required": 5, "available": 4, "shortage": 1 },
        { "role": "bouncer", "label": "Bouncers", "required": 3, "available": 1, "shortage": 2 }
      ]
    }
  }
}
```

### `GET /users/bookings`

My Bookings list. Query:

| Param | Notes |
|---|---|
| `tab` | `current` (default) = `confirmed`, `crew_assigned`, `in_progress`. `past` = `completed`, `cancelled` |
| `page` / `limit` | Pagination (default 1 / 20, max 100) |
| `latitude` / `longitude` | Optional pair; when both sent, `distanceKm` is Haversine vs venue |

`data` is an array; `meta` is `{ page, limit, total, totalPages }`.

Each item includes `crew` counts, `primaryRole` (highest crew count), `staffCount`, `expectedDurationHours`, `estimatedTotal`, `canCancel`, `canReview`, `reviewSubmitted`, `distanceKm` (or `null`).

### `GET /users/bookings/:id`

Order Details. Same summary fields (`expectedDurationHours`, snapshotted `rates`, `lineItems` as `count × rate`) plus:

- `shiftOtp` — 4 digits while status is `confirmed`, `crew_assigned`, or `in_progress`; otherwise `null`
- `timeline` — `{ key, label, at, done }` for order placed, confirmed, crew assigned, completed (and cancelled if applicable)
- `cancellation` — `{ allowed, within24Hours, feePct, refundPct, feeAmount, refundAmount, hoursUntilEvent }`
- `assignedCrew` — `{ id, fullName, profilePhotoUrl, role, status }[]`
- `review` — submitted review or `null`

**404 `BOOKING_NOT_FOUND`** if it is not this user’s booking.

### `POST /users/bookings/:id/cancel`

Body optional `{ "reason": "…" }`. Allowed on `confirmed` and `crew_assigned` only (**409 `BOOKING_NOT_CANCELLABLE`**). Records a pending refund snapshot (no gateway).

### `POST /users/bookings/:id/review`

Only `completed`, once per booking.

```json
{
  "rating": 5,
  "wouldRecommend": true,
  "reviewText": "Great crew, on time."
}
```

`rating` 1–5. **409 `REVIEW_NOT_ALLOWED`** / **409 `REVIEW_ALREADY_EXISTS`**.

---

## 6. Crew profile & onboarding

All routes: Bearer + token `type` must be `"crew"`. Otherwise `403 FORBIDDEN_TYPE`.

### Routing after login

1. `GET /crew/me`
2. If `verificationStatus === "approved"` → Home (`GET /crew/home`).
3. If `"pending"` and profile looks complete → Verification in Progress.
4. Else → Complete Account (save steps, then `POST /crew/me/submit`).

While status is `pending` or `rejected`, step endpoints write **directly**.  
After `approved`, those endpoints return **409 `PROFILE_LOCKED`**. Use **Request Changes**.

### `GET /crew/me`

```json
{
  "data": {
    "id": 12,
    "phoneNumber": "+919876543210",
    "email": "maxwell@example.com",
    "fullName": "Maxwell",
    "profilePhotoUrl": "https://…",
    "dateOfBirth": "1994-03-12",
    "gender": "male",
    "city": "Hyderabad",
    "currentAddress": "…",
    "primaryRole": "waiter",
    "yearsOfExperience": 5,
    "verificationStatus": "pending",
    "rejectionReason": null,
    "ratingAvg": "0",
    "isActive": true,
    "isOnline": false,
    "languages": ["English", "Hindi"],
    "skills": ["Fine Dining", "Banquet"],
    "identityDocuments": {
      "hasAadhaar": true,
      "aadhaarFrontUrl": "https://…",
      "aadhaarBackUrl": "https://…",
      "hasPan": false,
      "panCardUrl": null,
      "verifiedAt": null
    },
    "bankDetails": {
      "accountHolderName": "Maxwell",
      "accountNumberMasked": "********9012",
      "ifscCode": "HDFC0001234",
      "upiId": "maxwell@okhdfc"
    },
    "timeOff": [
      { "id": 3, "startDate": "2026-12-24", "endDate": "2026-12-26", "reason": "Christmas Break" }
    ]
  }
}
```

Aadhaar / PAN / full account number are **never** returned.

`primaryRole`: `"waiter"` | `"supervisor"` | `"bouncer"`.  
`gender`: `"male"` | `"female"` | `"other"`.

---

### `PATCH /crew/me/personal` — Step 1

Send any subset (at least one field).

```json
{
  "fullName": "Maxwell",
  "email": "maxwell@example.com",
  "profilePhotoUrl": "https://cdn.example.com/photo.jpg",
  "dateOfBirth": "1994-03-12",
  "gender": "male",
  "city": "Hyderabad",
  "currentAddress": "Street, apartment, etc."
}
```

**200** — full profile (same as `GET /crew/me`).

Upload the image first (`POST /uploads` with `purpose=profile_photo`), then send that `url` as `profilePhotoUrl`.

---

### `PUT /crew/me/work-profile` — Step 2

```json
{
  "primaryRole": "waiter",
  "yearsOfExperience": 5,
  "languages": ["English", "Telugu", "Hindi"],
  "skills": ["Fine Dining", "Banquet", "POS Experience"]
}
```

`languages` / `skills` **replace** the full list when sent.

---

### `PUT /crew/me/identity-documents` — Step 3

```json
{
  "aadhaarNumber": "123412341234",
  "aadhaarFrontUrl": "https://…/aadhaar-front.jpg",
  "aadhaarBackUrl": "https://…/aadhaar-back.jpg",
  "panNumber": "ABCDE1234F",
  "panCardUrl": "https://…/pan.jpg"
}
```

- Aadhaar: **12 digits** (required to submit).
- PAN: optional, format `ABCDE1234F`.
- Image fields: URLs from `POST /uploads` (`purpose` = `aadhaar_front` / `aadhaar_back` / `pan_card`).

---

### `PUT /crew/me/bank-details`

```json
{
  "accountHolderName": "Maxwell",
  "accountNumber": "123456789012",
  "ifscCode": "HDFC0001234",
  "upiId": "maxwell@okhdfc"
}
```

`upiId` optional. IFSC: 11 chars (`AAAA0XXXXXX`). Account number: 6–20 digits.

---

### `POST /crew/me/submit`

No body. Sets status back to `pending` (including after a rejection).

Must already have: `fullName`, `dateOfBirth`, `gender`, `city`, `primaryRole`, Aadhaar, bank account.

**400 `PROFILE_INCOMPLETE`**

```json
{
  "error": {
    "code": "PROFILE_INCOMPLETE",
    "details": { "missing": ["dateOfBirth", "identityDocuments"] }
  }
}
```

Highlight those steps in the UI.

**200:** `{ "verificationStatus": "pending", "submitted": true }`

Then show **Verification in Progress**. Refresh with `GET /crew/me` until `approved` or `rejected` (`rejectionReason` may be set).

---

## 7. Time off, online

Weekly availability is **not stored**. Open jobs appear unless the crew member is on time off or already booked that date. Online/offline is stored (`PATCH /crew/me/online`) but does **not** filter the job list.

### Time off (vacation / special dates)

**`GET /crew/me/time-off`** — list.

**`POST /crew/me/time-off`** — **201**

```json
{
  "startDate": "2026-12-24",
  "endDate": "2026-12-26",
  "reason": "Christmas Break"
}
```

**`DELETE /crew/me/time-off/:id`** — `id` is the integer from the list.

---

### `PATCH /crew/me/online` — Home toggle

```json
{
  "isOnline": true,
  "latitude": 17.4933,
  "longitude": 78.3915
}
```

`latitude` / `longitude` optional but recommended when going online (job distance).

**200:** `{ "isOnline": true }`

---

## 7b. Crew jobs (home, accept, shift)

All routes: Bearer + token `type` must be `"crew"`. Profile must be **approved** (`403 NOT_APPROVED` otherwise).

After an organizer confirms a booking (`POST /users/bookings/:id/place`), it is broadcast to **approved** crew whose `primaryRole` still has an open slot. Pay is **this crew member’s** fixed event rate from the admin rate card (snapshotted on the booking), not hours × rate and not the organizer’s `estimatedTotal`. Hours are shown on the order for the shift length only.

Crew-facing `status` values: `new_request` → `accepted` → `in_progress` → `completed` (or `cancelled`).

The 4-digit **shift OTP** is generated when the organizer places the booking and is shown on **`GET /users/bookings/:id`** (`shiftOtp`). The crew member enters that code at the venue to start the shift. It is never returned on crew APIs.

### `GET /crew/home`

Home screen. `requests` lists open jobs regardless of online/offline. `isOnline` is still returned for the toggle UI. If a shift is already running, `activeShift` is the in-progress detail payload (else `null`).

Optional query: `latitude` + `longitude` together (otherwise stored location from `PATCH /crew/me/online` is used for `distanceKm`).

```json
{
  "data": {
    "isOnline": true,
    "today": { "earnings": 1800, "jobs": 2, "hours": 10 },
    "requests": [
      {
        "id": 12,
        "bookingReference": "PC-12345",
        "orderId": "PC-12345",
        "status": "new_request",
        "bookingStatus": "confirmed",
        "eventType": "Wedding Reception",
        "role": "waiter",
        "roleLabel": "Waiter",
        "venueName": "Taj Convention Center",
        "venueAddress": "Hitech City Road, Madhapur, Hyderabad",
        "eventDate": "2026-07-25",
        "eventDateLabel": "Today",
        "eventStartTime": "18:00",
        "eventEndTime": "23:00",
        "expectedDurationHours": 6,
        "durationLabel": "6 Hours",
        "staffCount": 20,
        "roleStaffNeeded": 20,
        "staffNeededLabel": "20 Staff",
        "roleStaffLabel": "20 Waiters",
        "distanceKm": 3.5,
        "estimatedEarnings": 800,
        "pay": {
          "rate": 800,
          "hours": 6,
          "basePay": 800,
          "total": 800
        }
      }
    ],
    "activeShift": null
  }
}
```

`eventDateLabel` is `"Today"`, `"Tomorrow"`, or `null` (format the date in the UI).

### `GET /crew/bookings`

Paginated list. Query:

| Param | Notes |
|---|---|
| `tab` | `requests` (default, Home feed), `upcoming` (accepted, not started), `active` (in progress), `completed` |
| `page` / `limit` | Pagination (default 1 / 20, max 100) |
| `latitude` / `longitude` | Optional pair for `distanceKm` |

`data` is an array of the same card shape as `requests` above. `meta` is `{ page, limit, total, totalPages }`.

Offline `tab=requests` returns an empty list.

### `GET /crew/bookings/:id`

Detail Order / Order Accepted / Shift In Progress / Shift Completed. Same card fields plus venue, contact, dress-code requirements, payment breakdown, assigned crew avatars, shift timer, payout, and `actions`.

```json
{
  "data": {
    "id": 12,
    "orderId": "PC-12345",
    "status": "new_request",
    "requestStatusLabel": "NEW REQUEST",
    "estimatedEarnings": 800,
    "briefingInstructions": "Please ensure you are at the designated briefing area before starting.",
    "venue": {
      "name": "Taj Convention Center",
      "address": "Hitech City Road, Madhapur, Hyderabad, Telangana 500081",
      "latitude": 17.4483,
      "longitude": 78.3915,
      "imageUrl": null,
      "mapsUrl": "https://www.google.com/maps/search/?api=1&query=17.4483,78.3915"
    },
    "contact": {
      "name": "Rahul Sharma",
      "phoneNumber": "+919997770000",
      "profilePhotoUrl": "https://…",
      "rating": null
    },
    "requirements": [
      { "title": "White long-sleeve shirt", "description": "Crisp, ironed, and tucked in." },
      { "title": "Black trousers", "description": "Formal dress pants only. No jeans." },
      { "title": "Black polished shoes", "description": "Formal leather shoes with black socks." },
      { "title": "Clean-shaven appearance", "description": "Groomed hair and professional demeanor." }
    ],
    "payment": {
      "rate": 800,
      "hours": 6,
      "basePay": 800,
      "total": 800
    },
    "assignedCrew": [],
    "shift": {
      "startedAt": null,
      "completedAt": null,
      "scheduledEndAt": null,
      "elapsedSeconds": 0,
      "remainingSeconds": 0,
      "progressPercent": 0,
      "expectedDurationSeconds": 21600
    },
    "payout": null,
    "performance": null,
    "actions": {
      "canAccept": true,
      "canReject": true,
      "canStartShift": false,
      "canVerifyStart": false,
      "canComplete": false,
      "canResendOtp": false
    },
    "serverNow": "2026-09-08T15:30:00.000Z"
  }
}
```

Drive the footer from `actions`. After accept, `canStartShift` is true — open the OTP screen (no extra API). After verify, poll this endpoint for the timer (`elapsedSeconds` / `remainingSeconds` / `progressPercent`); prefer a client timer from `shift.startedAt` + `expectedDurationSeconds`, using `serverNow` to sync.

On **completed**, `payout` and `performance` are filled (rating comes from the organizer’s review when present).

**404 `BOOKING_NOT_FOUND`** if it is not an open job for this crew’s role and they have no assignment on it.

### `POST /crew/bookings/:id/accept`

No body. Creates a `self_assigned` assignment, blocks that event date, and fills the role slot. When every role is filled the booking becomes `crew_assigned`.

**409** `JOB_FULL` / `JOB_NOT_AVAILABLE` / `JOB_ALREADY_ACCEPTED` / `JOB_ALREADY_REJECTED` / `DATE_BLOCKED` / `BOOKING_CANCELLED`.

Response is the same detail payload (`status: "accepted"`).

### `POST /crew/bookings/:id/reject`

No body. Hides the job from this crew’s feed. **409 `JOB_ALREADY_ACCEPTED`** if they already took it.

```json
{ "data": { "id": 12, "rejected": true } }
```

### `POST /crew/bookings/:id/start`

Start Shift — verify the 4-digit venue code.

```json
{ "code": "1846" }
```

**400 `SHIFT_OTP_INVALID`**. **409 `SHIFT_NOT_STARTABLE`** if the job is not accepted. Response is the detail payload (`status: "in_progress"`).

### `POST /crew/bookings/:id/otp/resend`

Regenerates the booking OTP and SMS-stubs it to the **organizer** (dev: logged to the server console). The crew app does not receive the code. **200:** `{ "sent": true }`.

### `POST /crew/bookings/:id/complete`

Marks this crew’s shift complete and records earnings. When every assigned crew has finished, the booking becomes `completed`. Response is the Shift Completed payload (`payout`, `performance`).

**409 `SHIFT_NOT_COMPLETABLE`** if the shift has not been started.

---

## 8. Request Changes (approved crew only)

### `POST /crew/me/edit-requests` — **201**

```json
{
  "changedFields": {
    "fullName": "Maxwell D.",
    "city": "Hyderabad"
  }
}
```

**409 `NOT_APPROVED`** if the profile is still pending.

### `GET /crew/me/edit-requests`

```json
{
  "data": [
    {
      "id": 1,
      "status": "pending",
      "changedFields": { "city": "Hyderabad" },
      "reviewedAt": null,
      "createdAt": "2026-08-29T12:00:00.000Z"
    }
  ]
}
```

`status`: `"pending"` | `"approved"` | `"rejected"`.

---

## 9. Suggested client flow (crew)

```
Launch
  → if no temp_access_token in Keystore → POST /auth/app/register { mid, platform, appVersion }
       → save temp_access_token + expiresAt to Keystore
  → if no refreshToken → Welcome (Get OTP)
  → if refreshToken → POST /auth/refresh  [X-App-Token header required]
       fail → Welcome
       ok → GET /crew/me

GET OTP → POST /auth/otp/request  [X-App-Token header required]
Enter 4-digit OTP → POST /auth/otp/verify  [X-App-Token header required]
  → save accessToken + refreshToken
  → POST /auth/devices { mid, pnid }  [Authorization: Bearer header]

GET /crew/me
  isNew or incomplete → Complete Account (steps 1–3)
    POST /uploads (photo) → PATCH personal
    PUT work-profile
    POST /uploads (aadhaar/pan) → PUT identity
    PUT bank
    POST /crew/me/submit → Verification in Progress
  verificationStatus pending → Verification in Progress (poll GET /crew/me)
  rejected → show rejectionReason, allow edit + submit again
  approved → Home
    toggle → PATCH /crew/me/online then GET /crew/home
    New Job Requests → GET /crew/home (or GET /crew/bookings?tab=requests)
    Detail Order → GET /crew/bookings/:id
    Accept / Reject → POST /crew/bookings/:id/accept | reject
    Start Shift OTP → POST /crew/bookings/:id/start { code }
    Resend code → POST /crew/bookings/:id/otp/resend
    Shift In Progress / Complete → GET /crew/bookings/:id ; POST /crew/bookings/:id/complete
    Time off → GET/POST/DELETE /crew/me/time-off
    Account → GET /crew/me
    Logout → POST /auth/logout
```

---

## 9b. Suggested client flow (user)

```
Launch
  → if no temp_access_token in Keystore → POST /auth/app/register { mid, platform, appVersion }
  → if no refreshToken → Login
  → if refreshToken → POST /auth/refresh → GET /users/me

Login
  Send Code → POST /auth/otp/request { phoneNumber, subjectType: "user" }
  Verify & Continue → POST /auth/otp/verify
  Continue with Google → POST /auth/google
  → save tokens → POST /auth/devices { mid, pnid }

GET /users/me  (or login payload)
  isNew or !profileComplete → Create Account
    PATCH /users/me { fullName, email }
    optional photo: POST /uploads → PATCH profilePhotoUrl
    Google + !phoneVerified → POST /auth/otp/request then POST /users/me/phone/verify
    Skip For Now → continue without PATCH
  no defaultAddress → Location Access
    PATCH /users/me { locationAccessEnabled: true }
    GET /users/places/search?q=  (pick a match)
    POST /users/me/addresses  (map confirm or manual form; lat/lng from Places)
  else → Home

Account → GET /users/me
Edit Profile → PATCH /users/me
Addresses → GET/POST/PATCH/DELETE /users/me/addresses
Settings → PATCH /users/me { locationAccessEnabled, pushNotificationsEnabled, marketingOptIn }
Coupons → GET /users/coupons
Help → GET /users/support
Book event → GET /users/bookings/options + GET /users/bookings/crew-suggestion
  → GET /users/places/search?q=  (venue)
  → PUT /users/bookings/summary  (venueName, venueAddress, venueLatitude, venueLongitude from Places)
Cart → GET /users/cart  (edit: PUT /users/bookings/summary; coupon: POST/DELETE /users/bookings/:id/coupon)
Pay / confirm → POST /users/bookings/:id/place   (until payment gateway)
My Bookings → GET /users/bookings?tab=current|past
Order Details → GET /users/bookings/:id
Cancel → POST /users/bookings/:id/cancel
Review → POST /users/bookings/:id/review
Logout → POST /auth/logout
Delete Account → DELETE /users/me
```

---

## 10. Rate limits

| Endpoint | Limit |
|---|---|
| `POST /auth/app/register` | 20 / minute |
| `POST /auth/otp/request` | 5 / minute |
| Login / verify / refresh / Google | 20 / minute |
| `POST /uploads` | 20 / minute |
| `GET /users/places/search` | 30 / minute |

---

## 11. Quick checklist for Android

- [ ] Phone field includes country code (`+91…`)
- [ ] `subjectType` is `"crew"` on the crew app, `"user"` on the organizer app
- [ ] OTP boxes are **4** digits
- [ ] Persist `accessToken` + `refreshToken`; attach Bearer on all `/users/*`, `/crew/*`, and `/auth/devices` / `/auth/me`
- [ ] Refresh on 401, then retry
- [ ] After login, register `mid` + `pnid`
- [ ] User app: route `isNew` / `!profileComplete` to Create Account; missing `defaultAddress` to Location
- [ ] Google users: if `phoneVerified === false`, verify a real phone via OTP before treating the number as set
- [ ] Crew app: gate Home on `verificationStatus === "approved"`
- [ ] Treat `409 PROFILE_LOCKED` as “use Request Changes”
- [ ] Document images and profile photo: `POST /uploads` then save the returned `url` on the profile
- [ ] For emulator, point `PUBLIC_BASE_URL` at `http://10.0.2.2:4000` so image URLs load
- [ ] Do not display full Aadhaar / account number (API will not return them)
- [ ] Booking cart is a single `pending_payment` draft; `PUT /users/bookings/summary` both creates and edits it
- [ ] Venue picker: `GET /users/places/search?q=` then copy `name` / `address` / `latitude` / `longitude` into summary. Warn if `inServiceArea` is false
- [ ] `POST /users/bookings/:id/place` is the stand-in until the payment gateway exists
- [ ] Crew Home: `GET /crew/home` shows `requests` whether the crew member is online or offline. `PATCH /crew/me/online` only updates stored status.
- [ ] Crew job `id` is the integer booking id; `orderId` / `bookingReference` is the human code on the header
- [ ] Accept / Reject / Start / Complete use `POST /crew/bookings/:id/…`. Shift OTP is the organizer’s 4-digit `shiftOtp`, not the login OTP
- [ ] Drive Accept / Reject / Start / Complete buttons from `actions` on `GET /crew/bookings/:id`

Questions: backend owner (Pavanesh), `CREW_CONNECT_API`.
