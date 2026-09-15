# Crew Connect API

Backend for **Crew Connect** — a service marketplace connecting event organizers with staffing crew (waiters, supervisors, bouncers). This API serves three clients:

- **User mobile app** (Android) — event organizers book crew
- **Crew mobile app** (Android) — crew manage availability, assignments, earnings
- **Admin web app** (React) — platform management, verification, oversight

## Architecture

Hybrid two-database design:

- **PostgreSQL** (via Prisma) — relational, transactional core: users, crew, bookings, payments, wallet, admin, audit.
- **MongoDB** (via Mongoose) — high-volume, append-heavy data: activity logs (month-bucketed), notifications, SOS contacts.

```
src/
├── config/          # env loading, Prisma + Mongo connections
├── routes/          # route definitions (index + per-domain route files)
├── controllers/     # thin HTTP handlers (parse request → call service → respond)
├── services/        # business logic (auth, tokens, crew, activity logging, SMS)
├── validations/     # Joi request schemas
├── middlewares/     # auth, validation, rate limiting, error handling
├── db/mongo/models/ # Mongoose models (activity_logs, notifications, sos)
├── utils/           # errors, responses, jwt, otp, crypto, logger, helpers
├── app.js           # Express app wiring
└── server.js        # bootstrap: connect DBs, start listening, graceful shutdown
```

Layered by responsibility: **routes** wire URLs to **controllers**, controllers delegate to **services** (all DB/business logic), and **validations** guard inputs before they reach controllers.

Each route/controller/service is a **class** exported as a singleton instance. `routes/`, `controllers/`, and `services/` each expose a barrel `index.js`; cross-layer imports go **through the barrel** (e.g. controllers `import { crewService } from '../services/index.js'`), keeping wiring centralized.

PostgreSQL table IDs are **auto-increment integers** (`SERIAL`). JWT `sub` is the string form of that integer and is parsed back to a number in auth middleware. Human-facing booking codes stay on `bookings.booking_reference` (e.g. `PC-88291`). Mongo documents store related ids as strings.

## Tech stack

Node.js (>=18, **ES modules**) · Express · Prisma (PostgreSQL) · Mongoose (MongoDB) · JWT · Joi · bcryptjs · google-auth-library

> **Note:** This repo requires **Node 18+** and uses native ESM (`"type": "module"`). If you use `nvm`: `nvm use 20`. Relative imports include explicit `.js` extensions as ESM requires.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env      # then edit DATABASE_URL, MONGO_URI, JWT secrets
# Generate secrets:
#   openssl rand -hex 32   # for JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   openssl rand -hex 32   # for ENCRYPTION_KEY (required to store crew PII/bank data)

# 3. Generate the Prisma client
npm run prisma:generate

# 4. Create the database schema (dev)
npm run prisma:migrate    # creates tables from prisma/schema.prisma

# 5. Seed an initial super admin
npm run db:seed

# 6. Run
npm run dev               # nodemon
# or
npm start
```

Health check: `GET /health`. API base path: `/api/v1`.

**Mobile developers:** full request/response docs and screen-to-API mapping are in [docs/MOBILE_API.md](docs/MOBILE_API.md).  
**Admin web:** console APIs are in [docs/ADMIN_API.md](docs/ADMIN_API.md). The React app lives in the sibling repo `CREW_CONNECT_ADMIN`.

## Authentication

Access tokens (short-lived) + refresh tokens (rotated, revocable, stored hashed). Every token carries a `type` (`user` | `crew` | `admin`) so one middleware protects all three clients.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/otp/request` | Send phone OTP (`subjectType`: `user` \| `crew`) |
| POST | `/api/v1/auth/otp/verify` | Verify OTP → tokens (find-or-create account) |
| POST | `/api/v1/auth/google` | Google Sign-In (user app) → tokens |
| POST | `/api/v1/auth/admin/login` | Admin email + password → tokens |
| POST | `/api/v1/auth/refresh` | Rotate refresh token → new pair |
| POST | `/api/v1/auth/logout` | Revoke a refresh token |
| GET | `/api/v1/auth/me` | Return the authenticated principal (Bearer token) |
| POST | `/api/v1/auth/devices` | Register/update this phone (`mid` + `pnid`) after login |

Admin login does not use `X-App-Token`. Refresh/logout accept an optional `X-App-Token` so the web console can rotate tokens with only a refresh token.

## Admin console

All `/api/v1/admin/*` routes require an **admin** access token. Creating/updating admin users is **super_admin** only.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/admin/me` | Signed-in admin profile |
| GET | `/api/v1/admin/dashboard` | Counts for the home screen |
| GET | `/api/v1/admin/crew` | List / filter crew (verification queue) |
| GET | `/api/v1/admin/crew/:id` | Full crew review (KYC images, masked PII) |
| POST | `/api/v1/admin/crew/:id/approve` | Approve a pending profile |
| POST | `/api/v1/admin/crew/:id/reject` | Reject with a reason |
| PATCH | `/api/v1/admin/crew/:id/active` | Suspend / reactivate |
| GET/POST | `/api/v1/admin/edit-requests` | Review post-approval profile edits |
| GET | `/api/v1/admin/users` | Organizer accounts |
| GET | `/api/v1/admin/bookings` | Bookings (read-only in this release) |
| GET/POST | `/api/v1/admin/coupons` | List / create coupons |
| GET/PATCH/DELETE | `/api/v1/admin/coupons/:id` | Coupon detail, update, or delete |
| GET | `/api/v1/admin/rates` | Current waiter / supervisor / bouncer event rates |
| PATCH | `/api/v1/admin/rates` | Update rates (writes change logs) |
| GET | `/api/v1/admin/rates/logs` | Rate change history |
| GET | `/api/v1/admin/supervisor-ranges` | Waiter count → supervisor count ranges |
| PUT | `/api/v1/admin/supervisor-ranges` | Replace supervisor staffing ranges |
| GET | `/api/v1/admin/audit-logs` | Admin action audit |
| GET/POST/PATCH | `/api/v1/admin/admins` | Team management (`super_admin`) |

### Try it (dev)

```bash
# Request an OTP (dev returns the code in the response body)
curl -sX POST localhost:4000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"+919876543210","subjectType":"user"}'

# Verify it
curl -sX POST localhost:4000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"+919876543210","subjectType":"user","code":"123456"}'
```

## Crew module (onboarding + jobs)

All routes require a **crew** access token (`Authorization: Bearer …`) and act on the caller's own record.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/crew/me` | Full profile (sensitive fields masked) |
| PATCH | `/api/v1/crew/me/personal` | Step 1 — personal info |
| PUT | `/api/v1/crew/me/work-profile` | Step 2 — role, experience, languages, skills |
| PUT | `/api/v1/crew/me/identity-documents` | Step 3 — Aadhaar/PAN (encrypted at rest) |
| PUT | `/api/v1/crew/me/bank-details` | Bank details (account no. encrypted at rest) |
| POST | `/api/v1/crew/me/submit` | Submit completed profile for admin verification |
| GET/PUT | `/api/v1/crew/me/availability` | Weekly availability (full-week replace) |
| GET/POST | `/api/v1/crew/me/time-off` | List / add time-off (vacation, special dates off) |
| DELETE | `/api/v1/crew/me/time-off/:id` | Remove a time-off entry |
| PATCH | `/api/v1/crew/me/online` | Online/offline toggle (+ optional location) |
| POST/GET | `/api/v1/crew/me/edit-requests` | Post-approval "Request Changes" flow |
| GET | `/api/v1/crew/home` | Home: today's stats + job requests + active shift |
| GET | `/api/v1/crew/bookings` | Job list (`tab=requests\|upcoming\|active\|completed`) |
| GET | `/api/v1/crew/bookings/:id` | Job details (new request → completed) |
| POST | `/api/v1/crew/bookings/:id/accept` | Accept a broadcast job |
| POST | `/api/v1/crew/bookings/:id/reject` | Hide a job from this crew's feed |
| POST | `/api/v1/crew/bookings/:id/start` | Verify 4-digit venue OTP and start shift |
| POST | `/api/v1/crew/bookings/:id/otp/resend` | Regenerate shift OTP (sent to organizer) |
| POST | `/api/v1/crew/bookings/:id/complete` | Complete shift and record earnings |

**Onboarding vs. edits:** while `verification_status` is `pending`/`rejected`, the step endpoints write directly. Once an admin sets it to `approved`, those endpoints return `409 PROFILE_LOCKED` and changes must go through `POST /crew/me/edit-requests` (backed by `crew_profile_edit_requests`) for re-review.

**Encryption:** Aadhaar, PAN, and bank account numbers are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before storage and never returned in the clear — reads expose only masked hints (e.g. `********9012`).

## User module (organizer profile + addresses)

All routes require a **user** access token and act on the caller's own record. First OTP / Google success already creates the account — these endpoints complete Create Account, Location, and Settings.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/users/me` | Profile, prefs, `phoneVerified`, default address |
| PATCH | `/api/v1/users/me` | Name, email, photo, location / push / marketing toggles |
| POST | `/api/v1/users/me/phone/verify` | Attach a real phone after OTP (Google accounts) |
| GET/POST | `/api/v1/users/me/addresses` | List / add addresses |
| PATCH/DELETE | `/api/v1/users/me/addresses/:id` | Update / remove an address |
| DELETE | `/api/v1/users/me` | Soft-delete account + revoke tokens |
| GET | `/api/v1/users/coupons` | Active coupons (hides exhausted / already-used codes) |
| GET | `/api/v1/users/support` | Help & Support contacts |

There is no admin verification for organizers. **Skip For Now** is client-only.

## Response envelope

Success:

```json
{ "success": true, "message": "…", "data": { }, "meta": { } }
```

Error:

```json
{ "success": false, "error": { "message": "…", "code": "OTP_EXPIRED", "details": [] } }
```

## Notes on v1 scope

- **Phone OTP** is the primary auth for both mobile apps; **Google Sign-In** is user-app only.
- **SMS is stubbed** in development (`src/services/sms.service.js` logs the OTP). Wire a real provider (MSG91/Twilio/Gupshup) before production.
- **Crew OTP bypass** in development: after `POST /auth/otp/request`, any 4-digit code is accepted for `subjectType: "crew"`. Production always verifies the real OTP.
- **Crew login** creates a minimal record on first OTP verify; onboarding + admin verification (`verification_status`) gate full access.
- **User login** also find-or-creates the organizer on first OTP / Google success; `GET/PATCH /users/me` and addresses complete Create Account. There is no admin approval for users.
- Two auth-support tables (`otp_verifications`, `refresh_tokens`) were added on top of the original schema doc to back the OTP flow and refresh-token rotation.
- All logins are recorded to the MongoDB `activity_logs` collection with a `month_bucket` for month-wise querying.

## Roadmap (next modules)

Admin fills remaining crew shortages, payments/wallet/penalties, SOS contacts, and in-app notifications — each as a module under `src/`. Organizer bookings, crew onboarding, and crew accept/start/complete already ship.
