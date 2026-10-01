# CAM Orphanage Connect

A static donor/admin platform connecting donors to verified orphanages across Cameroon. Donors browse active funding needs and simulate donations; admins manage orphanages, children, needs, and incoming donation/visit-request activity.

This is a plain HTML/CSS/JS/Bootstrap prototype — no build step and no backend yet. `shared/data.js` stands in for a future API, and the admin pages fall back to `localStorage` to simulate persistence.

## Structure

- `index.html`, `script.js`, `styles.css` — public landing/donate page (repo root)
- `donor/` — the same donate experience, served from its own folder
- `admin/` — admin login, dashboard, and management pages (children, needs, incoming donations & visit requests)
- `login/` — donor/admin sign-in, registration, and forgot-password flows
- `stats/` — public impact statistics page
- `shared/data.js` — mock data contract (orphanages, needs, children, donations, visit requests)

## Running locally

```bash
npm install
npm start
```

Serves the site at `http://localhost:5500` via `live-server`.
