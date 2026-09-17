# Crew Connect — Admin Web API (v1)

For the **admin web console** (`CREW_CONNECT_ADMIN`) only. Mobile APIs live in [MOBILE_API.md](./MOBILE_API.md).

**Base URL:** `http://<host>:4000/api/v1`  
**Health (no prefix):** `GET http://<host>:4000/health`

Default port is `4000`. All JSON. Charset UTF-8.

---

## 1. Conventions

Same success/error envelope as the mobile API.

### Headers

| Header | When | Example |
|---|---|---|
| `Content-Type` | POST / PATCH with a body | `application/json` |
| `Authorization` | All `/admin/*` routes and `GET /auth/me` | `Bearer <accessToken>` |

Admin login, refresh, and logout **do not** require `X-App-Token`. That header is a mobile device handshake.

### Tokens

| Token | Lifetime (default) | Store | Used on |
|---|---|---|---|
| `accessToken` | 15 minutes | Memory | `Authorization: Bearer` |
| `refreshToken` | 30 days | `localStorage` / httpOnly cookie | Body of `/auth/refresh` and `/auth/logout` |

On **401** with an expired access token: call `POST /auth/refresh`, then retry.

List endpoints return `data` as an array and pagination in `meta`:

```json
{ "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
```

Query params: `page` (default 1), `limit` (default 20, max 100).

---

## 2. Auth

### `POST /auth/admin/login`

```json
{ "email": "admin@crewconnect.local", "password": "ChangeMe123!" }
```

**200:**

```json
{
  "id": 1,
  "email": "admin@crewconnect.local",
  "fullName": "Super Admin",
  "role": "super_admin",
  "tokens": {
    "accessToken": "…",
    "refreshToken": "…",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

`role`: `super_admin` | `ops_admin`.  
**401 `BAD_CREDENTIALS`** if the email/password is wrong or the account is inactive.

### `POST /auth/refresh`

```json
{ "refreshToken": "…" }
```

**200:** `{ "tokens": { "accessToken", "refreshToken", "tokenType", "expiresIn" } }`

### `POST /auth/logout`

```json
{ "refreshToken": "…" }
```

### `GET /auth/me`

Bearer token. Returns the signed-in admin (`id`, `email`, `fullName`, `role`, `isActive`, `type: "admin"`).

---

## 3. Screen → API map

| Screen | What to call |
|---|---|
| Login | `POST /auth/admin/login` |
| Session restore | `GET /auth/me` (refresh first if 401) |
| Dashboard | `GET /admin/dashboard` |
| Crew list / verification queue | `GET /admin/crew?verificationStatus=pending&ready=true` |
| Crew review | `GET /admin/crew/:id` then approve / reject / suspend |
| Edit requests | `GET /admin/edit-requests?status=pending` |
| Users | `GET /admin/users` |
| Bookings | `GET /admin/bookings` |
| Coupons | `GET /admin/coupons` then create / patch / delete |
| Crew rates | `GET /admin/rates` then `PATCH /admin/rates` |
| Rate change log | `GET /admin/rates/logs` |
| Audit | `GET /admin/audit-logs` |
| Team (super admin) | `GET /admin/admins` |

---

## 4. Dashboard

### `GET /admin/dashboard`

```json
{
  "users": { "total": 12 },
  "crew": { "total": 40, "pending": 6, "approved": 30, "rejected": 4, "online": 8 },
  "editRequests": { "pending": 2 },
  "bookings": { "total": 18, "byStatus": { "confirmed": 5, "completed": 10 } }
}
```

---

## 5. Crew

### `GET /admin/crew`

Query: `search`, `verificationStatus` (`pending` \| `approved` \| `rejected`), `primaryRole`, `isActive`, `isOnline`, `ready` (`true` = crew called `POST /crew/me/submit` after finishing signup; incomplete accounts are excluded).

### `GET /admin/crew/:id`

Full review payload. Identity numbers and bank account include both **masked** (last 4) and full decrypted values (`aadhaarNumber`, `panNumber`, `accountNumber`) so the console can reveal them. Document image URLs are included so the console can show KYC photos.

### `POST /admin/crew/:id/approve`

Sets `verificationStatus` to `approved`, stamps identity docs as verified, writes an audit row.

**400 `NOT_SUBMITTED`** if the crew never finished signup / submit.  
**409 `ALREADY_APPROVED`** if already approved.

### `POST /admin/crew/:id/reject`

```json
{ "reason": "Aadhaar photo is unreadable" }
```

**409 `ALREADY_APPROVED`** — deactivate an approved crew instead of rejecting.

### `PATCH /admin/crew/:id/active`

```json
{ "isActive": false }
```

Suspend / reactivate. Suspended crew cannot log in.

---

## 6. Profile edit requests

Approved crew submit field diffs via the mobile app (`changedFields`).

### `GET /admin/edit-requests`

Query: `status`, `crewId`.

### `GET /admin/edit-requests/:id`

### `POST /admin/edit-requests/:id/approve`

Applies `changedFields` onto the crew profile (personal, work, identity, bank). Encrypts Aadhaar / PAN / account number when those keys are present.

### `POST /admin/edit-requests/:id/reject`

```json
{ "reason": "Photo does not match previous KYC" }
```

**409 `ALREADY_REVIEWED`** if the request is no longer pending.

---

## 7. Users

### `GET /admin/users`

Query: `search`, `isActive`.

### `GET /admin/users/:id`

Includes addresses and booking / review counts.

### `PATCH /admin/users/:id/active`

```json
{ "isActive": false }
```

---

## 8. Bookings

Read-only in this release (assignment / payment actions come later).

### `GET /admin/bookings`

Query: `search` (reference, venue, organizer name/phone), `status`, `eventDateFrom`, `eventDateTo`.

### `GET /admin/bookings/:id`

Includes requirements, assignments, payments, refunds, and the applied `coupon` (`id`, `code`, `discountType`, `discountValue`) when present. Each requirement has `rate` (fixed per person for the event) and `amount` (`countRequired × rate`). `expectedDurationHours` is the shift length only.

---

## 8d. Coupons

Admin CRUD for offers shown on `GET /users/coupons` and applied on a cart via `POST /users/bookings/:id/coupon`.

| Field | Meaning |
|---|---|
| `discountType` | `flat` (₹ off subtotal) or `percentage` (% of subtotal) |
| `discountValue` | ₹ amount, or 0–100 for percentage |
| `minSpend` | Optional minimum subtotal |
| `maxDiscountAmount` | Optional cap (percentage “upto ₹X”; also caps a flat discount if set) |
| `maxUses` | Optional global redemption limit. `null` = unlimited. Counted on **placed** bookings (`status` ≠ `pending_payment`), including later cancellations |
| `maxUsesPerUser` | Optional per-organizer limit. `1` = one-time use per user |
| `usedCount` | How many placed bookings have redeemed this code |

### `GET /admin/coupons`

Query: `search` (code / description), `isActive`, `discountType`, `page`, `limit`.

### `GET /admin/coupons/:id`

**404 `COUPON_NOT_FOUND`**.

### `POST /admin/coupons` — **201**

```json
{
  "code": "CREW50",
  "description": "FLAT 50% OFF upto ₹1000",
  "discountType": "percentage",
  "discountValue": 50,
  "minSpend": 5000,
  "maxDiscountAmount": 1000,
  "maxUses": null,
  "maxUsesPerUser": 1,
  "validFrom": null,
  "validUntil": "2026-12-31T23:59:59.000Z",
  "isActive": true
}
```

`code` is stored uppercase (`A–Z`, `0–9`, `_`, `-`). **409 `COUPON_CODE_IN_USE`**. **400 `COUPON_VALUE_INVALID`** if a percentage is over 100. **400 `COUPON_DATES_INVALID`** if `validUntil` is before `validFrom`.

### `PATCH /admin/coupons/:id`

Any subset of the create fields, including `isActive: false` to take an offer off the Coupons screen without deleting it.

### `DELETE /admin/coupons/:id`

Hard-deletes only when no booking references the coupon. Otherwise **409 `COUPON_IN_USE`** — deactivate with `PATCH` instead.

---

## 8b. Crew event rates

Current waiter / supervisor / bouncer **fixed amounts per person per event** used when quoting a booking. Hours are collected on the booking for display only — they are not multiplied into the price. Edits write a row to `crew_rate_logs` and an admin audit entry (`rate_updated`). Already-placed bookings keep the rates snapshotted on their line items.

### `GET /admin/rates`

```json
{
  "rates": { "waiter": 800, "supervisor": 1000, "bouncer": 900 },
  "gstPercent": 18,
  "items": [
    {
      "id": 1,
      "role": "waiter",
      "rate": 800,
      "updatedAt": "2026-09-08T15:00:00.000Z",
      "updatedBy": { "id": 1, "fullName": "Super Admin", "email": "admin@crewconnect.local" }
    }
  ]
}
```

### `PATCH /admin/rates`

Send one or more roles. Unspecified roles are left unchanged. Same rate as current is skipped (no log row).

```json
{
  "waiter": 850,
  "supervisor": 1100,
  "bouncer": 950,
  "note": "Q3 rate card"
}
```

**400 `VALIDATION_ERROR`** if none of the three rates is sent. Each value must be between 1 and 100000.

Response is the same shape as `GET /admin/rates`.

### `GET /admin/rates/logs`

Paginated history, newest first. Query: `role` (`waiter` \| `supervisor` \| `bouncer`), `page`, `limit`.

```json
{
  "id": 3,
  "role": "waiter",
  "previousRate": 800,
  "newRate": 850,
  "note": "Q3 rate card",
  "createdAt": "2026-09-08T15:12:00.000Z",
  "changedBy": { "id": 1, "fullName": "Super Admin", "email": "admin@crewconnect.local" }
}
```

---

## 8c. Supervisor staffing ranges

Used by `GET /users/bookings/crew-suggestion`. Waiters = `ceil(guestCount / 20)`. That **waiter** count is matched to a range; the range’s `supervisorCount` is recommended **in addition to** the waiters. Bouncers are not in these ranges — organizers pick any number themselves. Waiter counts below the first range get **0** supervisors. `maxWaiters: null` means that floor and above.

Defaults after migrate/seed:

| Waiters | Supervisors |
|---|---|
| 5–10 | 1 |
| 11–19 | 2 |
| 20–29 | 3 |
| 30–39 | 4 |
| 40+ | 5 |

### `GET /admin/supervisor-ranges`

```json
{
  "data": [
    { "id": 1, "minWaiters": 5, "maxWaiters": 10, "supervisorCount": 1 },
    { "id": 2, "minWaiters": 11, "maxWaiters": 19, "supervisorCount": 2 },
    { "id": 3, "minWaiters": 20, "maxWaiters": 29, "supervisorCount": 3 },
    { "id": 4, "minWaiters": 30, "maxWaiters": 39, "supervisorCount": 4 },
    { "id": 5, "minWaiters": 40, "maxWaiters": null, "supervisorCount": 5 }
  ]
}
```

### `PUT /admin/supervisor-ranges`

**Replaces the full list.** Ranges must not overlap. Only the last row may omit `maxWaiters` (open-ended).

```json
{
  "ranges": [
    { "minWaiters": 5, "maxWaiters": 10, "supervisorCount": 1 },
    { "minWaiters": 11, "maxWaiters": 19, "supervisorCount": 2 },
    { "minWaiters": 20, "maxWaiters": 29, "supervisorCount": 3 },
    { "minWaiters": 30, "maxWaiters": 39, "supervisorCount": 4 },
    { "minWaiters": 40, "maxWaiters": null, "supervisorCount": 5 }
  ]
}
```

**400 `RANGE_OVERLAP`** / **400 `RANGE_INVALID`**. Response is the same array as GET. Writes `supervisor_ranges_updated` to the admin audit log.

---

## 9. Logs

### `GET /admin/audit-logs`

PostgreSQL admin actions. Query: `actionType`, `adminId`. `actionType` includes `rate_updated`, `supervisor_ranges_updated`, `coupon_created`, `coupon_updated`, and `coupon_deleted`.

### `GET /admin/activity-logs`

System activity stream (`activity_logs`). Query: `category`, `monthBucket` (`YYYY-MM`), `actorType`. IDs are integers.

---

## 10. Admin team (super_admin only)

**403 `FORBIDDEN_ROLE`** for `ops_admin`.

### `GET /admin/admins`

### `POST /admin/admins` — **201**

```json
{
  "email": "ops@crewconnect.local",
  "password": "AtLeast8chars",
  "fullName": "Ops Lead",
  "role": "ops_admin"
}
```

### `PATCH /admin/admins/:id`

```json
{ "fullName": "…", "role": "ops_admin", "isActive": true, "password": "optional-new" }
```

**400 `CANNOT_DEACTIVATE_SELF`** if you try to turn off your own account.

---

## 11. Seed login (dev)

From `prisma/seed.js` / `.env`:

| Field | Default |
|---|---|
| Email | `admin@crewconnect.local` |
| Password | `ChangeMe123!` |

```bash
npm run db:seed
```
