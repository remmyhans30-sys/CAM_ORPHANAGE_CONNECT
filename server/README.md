# CAM Orphanage Connect — Backend API

An Express + MySQL backend for the whole site: admin panel, partner portal,
public sign-up/login and the orphanage portal. It also serves the website pages
themselves, so everything runs from one address.

The quickest way to run everything is `start.bat` (or `node server/start.js`) in
the project folder — see the main `README.md`. The steps below are the manual way.

## Setup

Requires Node.js 18 or newer on your PATH (check with `node --version`) and a running MySQL Server 8.0.16 or newer.

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to any long random string (it signs login tokens), and `DB_USER` / `DB_PASSWORD` to the MySQL account you use in MySQL Workbench. The site creates the database (`DB_NAME`, default `cam_orphanage_connect`) and all its tables by itself on first start, from `../database/cam_orphanage_connect.sql`. It never changes a database that already has tables.

## Seed the database

Creates the database if it is missing, then adds a default admin account and a few
sample orphanages:

```bash
npm run seed
```

Default login after seeding:
- Email: `admin@camorphanage.org`
- Password: `ChangeMe123!`

(There's no "change password" endpoint yet — for now, change it by editing the
seed script and re-seeding into a fresh database, or wait for that endpoint.)

## Run the server

```bash
npm start
```

Open `http://localhost:4000` for the website; the API is under `/api`. Keep the
port at 4000 — the pages call the API at `http://localhost:4000/api`.

Everything in `server/` (including `.env`) is never served to the browser.

### How the code is organised

`src/repo/` holds the database code, one module per area (orphanages, donors, partners, needs, donations, support threads, admin data). Each turns table rows into the JSON the pages use, and applies saves back to the right tables. `src/routes/` holds the Express routes, which only validate and call the repositories. `src/db.js` is the MySQL connection (all queries are parameterised) and the first-run setup. The database itself also enforces the main rules (see `../database/README.md`), so a mistake in the code cannot, for example, over-fill a need.

## API

All routes except `/api/health` and `/api/auth/login` require:
```
Authorization: Bearer <token>
```
(the token comes back from a successful login).

| Method | Path                  | Description                          |
|--------|-----------------------|---------------------------------------|
| GET    | /api/health           | Liveness check, no auth needed        |
| POST   | /api/auth/login       | `{ email, password }` -> `{ token, admin }` |
| GET    | /api/auth/me          | Current admin from the token          |
| GET    | /api/orphanages       | List all orphanages                   |
| GET    | /api/orphanages/:id   | Get one orphanage                     |
| POST   | /api/orphanages       | Create an orphanage                   |
| PUT    | /api/orphanages/:id   | Update an orphanage (partial fields)  |
| DELETE | /api/orphanages/:id   | Delete an orphanage                   |

### Public accounts (login pages)

Donor and orphanage accounts used by `login/`. These tokens are separate from
admin tokens and do not work on the admin routes above.

| Method | Path                       | Description                                   |
|--------|----------------------------|-----------------------------------------------|
| POST   | /api/users/register        | `{ fullname, email, password, role }` -> `{ token, user }` |
| POST   | /api/users/login           | `{ email, password }` -> `{ token, user }`    |
| POST   | /api/users/forgot-password | `{ email }` -> generic message (no email sent yet) |
| GET    | /api/users/me              | Current user from the token (`Bearer` header) |

Signing up with role `volunteer` (orphanage) also creates a `pending` orphanage
record linked to the account, so it appears in the admin verification queue.

All three logins (`/api/auth/login`, `/api/users/login`, `/api/partner-auth/login`)
go through `src/loginGuard.js`. Within `LOGIN_LOCK_MINUTES` (15) it answers 429 after
`LOGIN_MAX_ATTEMPTS` (5) wrong passwords for one email from one address (only that
address waits), `LOGIN_MAX_PER_EMAIL` (50) for one email from all addresses, or
`LOGIN_MAX_PER_ADDRESS` (100) from one address for any emails. Unknown emails count
the same way. A correct password clears that address's counts for the email; a
password reset clears all of them.

### Orphanage portal (user token, orphanage accounts only)

| Method | Path                          | Description                                          |
|--------|-------------------------------|------------------------------------------------------|
| GET    | /api/my-orphanage             | `{ orphanage, needs }` for the signed-in orphanage   |
| PUT    | /api/my-orphanage             | Update name, location, foundedYear, childrenCount, contactName, contactPhone, story |
| POST   | /api/my-orphanage/needs       | `{ title, description, goal }` -> `{ need }`         |
| PUT    | /api/my-orphanage/needs/:id   | Edit an own need (goal can't go below raised)        |
| DELETE | /api/my-orphanage/needs/:id   | Remove an own need that has no donations yet         |
| GET    | /api/my-orphanage/pledges     | Pledges received by the signed-in orphanage          |

### Profiles, documents and photos

Documents and photos are uploaded as JSON `{ filename, data }` where `data` is the
file in base64. The type is checked from the file's contents (PDF, JPG, PNG; photos
also WebP), the limit is 3 MB, and files are stored in `server/uploads/` (never served
directly).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/my-orphanage/documents | orphanage | Upload a verification document |
| DELETE | /api/my-orphanage/documents/:id | orphanage | Remove one |
| POST | /api/my-orphanage/photo, /cover | orphanage | Profile / cover photo |
| POST | /api/my-orphanage/submit | orphanage | Submit for verification (`draft` or `needs-info` becomes `pending`) |
| GET, PUT | /api/my-donor | donor | Donor profile |
| POST | /api/my-donor/photo | donor | Donor photo |
| POST | /api/partner-auth/register | none | Partner sign-up `{ name, email, password }`, starts as `draft` |
| GET, PUT | /api/partner-auth/me | partner | Partner profile |
| POST | /api/partner-auth/me/documents, /me/logo, /me/submit | partner | Upload, logo, submit |
| GET | /api/files/photo/:id | none | A public photo or logo |
| GET | /api/files/document/:id | admin, or the owner | A private document |

### Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/my-messages/overview | donor, orphanage, partner | Conversation list: the team thread plus direct chats (does not mark anything read) |
| GET | /api/my-messages/team | donor, orphanage, partner | The thread with the CAM team (marks it read) |
| POST | /api/my-messages/team/reply | donor, orphanage, partner | `{ text }` write to the team (allowed even before approval) |
| GET | /api/my-messages/chats/:key | donor, orphanage, partner | One direct chat (`do-<id>` donor and orphanage, `po-<id>` partner and orphanage) |
| POST | /api/my-messages/chats/:key/messages | donor, orphanage, partner | `{ text }` |
| POST | /api/my-messages/chats | donor, orphanage, partner | `{ withType, withId, text }` start a chat |
| GET | /api/my-messages/contacts | donor, orphanage, partner | Who this person may start a chat with |
| GET | /api/my-messages/unread | donor, orphanage, partner | Unread count for the badge |
| GET | /api/conversations, /:key | admin | Every direct chat (read) |
| POST | /api/conversations/:key/reply | admin | Step in as the team |
| DELETE | /api/conversations/:key/messages/:index | admin | Remove a message |

Rules: both sides must be approved, orphanages can only start chats with verified
partners and donors who gave under their own name, text is limited to 2,000
characters, and 15 messages per minute per person.

### Stories, videos and social links

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/my-orphanage/posts | orphanage | The home's own posts, its social links and the limits |
| POST | /api/my-orphanage/posts | verified orphanage | `{ type: 'story' or 'update' or 'gift', title, text, photo: { filename, data } }` |
| POST | /api/my-orphanage/posts/:id/video | verified orphanage | The raw MP4 or WebM file as the body, with `Content-Type` and `X-Filename` headers |
| DELETE | /api/my-orphanage/posts/:id/video, /posts/:id | orphanage | Remove a video, or a whole post with its files |
| GET, PUT | /api/my-orphanage/social | orphanage | `{ links: { facebook, instagram, youtube, tiktok, x, whatsapp, website } }` (empty removes) |
| GET | /api/browse/orphanages/:id/updates | approved donor | Posts and social links of a verified orphanage |
| GET | /api/partner-auth/orphanages/:id/updates | verified partner | The same, for partners |
| GET | /api/partner-auth/orphanages/:id | verified partner | One home's full profile (`partner/orphanage-view.html`), the same as donors get from `/api/browse/orphanages/:id` (built by `src/repo/profiles.js`) |
| GET | /api/orphanages/:id/posts/:postId/video-link | admin | A short-lived link to watch a video |
| GET | /api/files/video/:id?t=... | signed link | Plays a video (supports seeking). Without a valid signature it is refused |

Video limits: `VIDEO_MAX_MB` (default 15, at most 20) per video and `ORPHANAGE_VIDEO_QUOTA_MB` (default 60) in total per orphanage.

### Visit requests, password reset and email confirmation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/visits | approved donor, verified partner | `{ orphanageId, preferredDate, visitorsCount, message }` ask to visit a verified orphanage |
| GET | /api/visits/mine | donor, partner | The person's own requests with the home's answer |
| POST | /api/visits/:id/cancel | donor, partner | Cancel a request that is still waiting |
| GET | /api/my-orphanage/visits | orphanage | Requests for this home (visitor email only after approval) |
| POST | /api/my-orphanage/visits/:id/respond | orphanage | `{ decision: 'approved' or 'declined', note }` (a note is required to decline) |
| GET | /api/visit-requests | admin | Every request, read-only |
| POST | /api/users/forgot-password | none | `{ email }` emails a reset link (same answer for every address) |
| POST | /api/users/reset-password | none | `{ token, password }` choose a new password with the emailed link |
| POST | /api/account/confirm-email | none | `{ token }` confirms the email address with the link sent at sign-up (`src/emailConfirmation.js`) |
| POST | /api/account/confirm-email/resend | donor, orphanage, partner | Sends a new confirmation link (at most 3 an hour) |

Email is sent with the `SMTP_*` settings in `.env` (see `.env.example`). Without them a local run prints the reset and confirmation links in the server window, and the live site (`NODE_ENV=production`) tells people to contact the team and does not ask for email confirmation. Until an account's address is confirmed, approving the donor or verifying the orphanage or partner is refused (`EMAIL_CONFIRMATION=off` turns this off).

### Public website data

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/site/stats | none | Totals for the home page: verified orphanages, open needs, total pledged, approved donors, verified partners |
| GET | /api/site/info | none | The organization's name, email, phone, address and description from the admin Settings page |

### Public and pledges

| Method | Path                    | Auth        | Description                                             |
|--------|-------------------------|-------------|---------------------------------------------------------|
| GET    | /api/browse/orphanages  | approved donor | Verified orphanages and their open needs (donor page). Others get 401/403 with a `code` (`sign-in`, `pending`, `rejected`, `flagged`, `donors-only`) |
| GET    | /api/browse/orphanages/:id | approved donor | One home's full profile (`donor/orphanage.html`): story, facts, registration number, contact person, verified date, open and fully pledged needs, and its record (`totalPledged`, `supporters`, `itemGifts`). Never its phone, email, payment account or documents |
| POST   | /api/pledges            | approved donor | `{ needId, amount, anonymous }` — records a pledge and adds it to the need. Returns `pledge: { reference, payTo }`: where to send the gift (the home's confirmed account, or null until an admin confirms it) |
| GET    | /api/pledges/mine       | donor token | The signed-in donor's pledges, each with `reference`, `received` and, while not received, `payTo` |
| POST   | /api/my-orphanage/pledges/:id/received | orphanage | `{ received: true or false }` — the home confirms a pledged gift arrived (or takes it back) |

Donors are `pending` until an admin sets their status to `active` (Donors page), and
partners must be `verified`; partner routes for orphanages, donations and placement
cases answer 403 `not-verified` until then.

Donors and partners only ever see *listed* orphanages: verified and not flagged
(`orphanages.listed()` / `getListed()`). A flagged home is left out of the lists, its
profile and updates answer 404, and pledges, partner gifts, visit requests and new chats
to it are refused until an admin removes the flag. Existing chats carry on.

A pledge is a promise to give: no money is charged. Pledges start at 500 XAF and
can't exceed what the need still requires.

### Live-site settings

See `DEPLOY.md` in the project folder. On the live site set `NODE_ENV=production`,
a long `JWT_SECRET`, `ADMIN_EMAIL` / `ADMIN_PASSWORD` (creates the first admin on
first start), `SEED_SAMPLE_DATA=false`, and optionally `SUPPORT_EMAIL`.

Orphanage JSON fields match the shape already used by `admin/verification.js`
(`name`, `location`, `story`, `status`, `contactPhone`, `documents`, `activityLog`,
etc.) so wiring the frontend to this API later is a drop-in swap for the
`localStorage` calls, not a rewrite.

## Quick test once it's running

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@camorphanage.org\",\"password\":\"ChangeMe123!\"}"
```

Copy the `token` from the response, then:

```bash
curl http://localhost:4000/api/orphanages -H "Authorization: Bearer <token>"
```
