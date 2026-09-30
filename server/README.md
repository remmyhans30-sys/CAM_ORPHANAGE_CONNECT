# CAM Orphanage Connect — Backend API

An Express + SQLite backend for the whole site: admin panel, partner portal,
public sign-up/login and the orphanage portal. It also serves the website pages
themselves, so everything runs from one address.

The quickest way to run everything is `start.bat` (or `node server/start.js`) in
the project folder — see the main `README.md`. The steps below are the manual way.

## Setup

Requires Node.js (LTS) installed and on your PATH — check with `node --version`.

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to any long random string (it signs login tokens).

## Seed the database

Creates `server/data.sqlite` (gitignored) with a default admin account and a few
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

Everything in `server/` (including `.env` and `data.sqlite`) is never served to
the browser.

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

### Orphanage portal (user token, orphanage accounts only)

| Method | Path                          | Description                                          |
|--------|-------------------------------|------------------------------------------------------|
| GET    | /api/my-orphanage             | `{ orphanage, needs }` for the signed-in orphanage   |
| PUT    | /api/my-orphanage             | Update name, location, foundedYear, childrenCount, contactName, contactPhone, story |
| POST   | /api/my-orphanage/needs       | `{ title, description, goal }` -> `{ need }`         |
| PUT    | /api/my-orphanage/needs/:id   | Edit an own need (goal can't go below raised)        |
| DELETE | /api/my-orphanage/needs/:id   | Remove an own need that has no donations yet         |
| GET    | /api/my-orphanage/pledges     | Pledges received by the signed-in orphanage          |

### Public and pledges

| Method | Path                    | Auth        | Description                                             |
|--------|-------------------------|-------------|---------------------------------------------------------|
| GET    | /api/public/orphanages  | none        | Verified orphanages and their open needs (donor page)   |
| POST   | /api/pledges            | donor token | `{ needId, amount, anonymous }` — records a pledge and adds it to the need |
| GET    | /api/pledges/mine       | donor token | The signed-in donor's pledges                           |

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
