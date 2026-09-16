# CAM Orphanage Connect — Backend API

A small Express + SQLite backend for the admin panel, covering **admin login** and
**orphanages** (the first slice — donors, partners, needs, etc. are not built yet).

This runs standalone; the admin panel's HTML/JS pages still use `localStorage` and
are not wired to this API yet. That's the next step once this is confirmed working.

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

Runs on `http://localhost:4000` by default (override with `PORT` in `.env`).

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
